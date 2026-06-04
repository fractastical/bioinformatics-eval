import { Router } from "express";
import { db, evaluationsTable, codeAnalysesTable } from "@workspace/db";
import { eq, desc, avg, count } from "drizzle-orm";
import { z } from "zod";
import multer from "multer";
import fs from "fs/promises";
import { runPaperPipeline } from "../lib/paperPipeline";
import { extractPdfText, looksLikePdf } from "../lib/pdfExtract";
import { safeFetch } from "../lib/urlSafety";

const router = Router();

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB
const MAX_REMOTE_PDF_BYTES = 30 * 1024 * 1024; // 30MB

const upload = multer({
  dest: "/tmp/uploads/",
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const okMime =
      file.mimetype === "application/pdf" || file.mimetype === "application/octet-stream";
    const okExt = file.originalname.toLowerCase().endsWith(".pdf");
    if (okMime && okExt) cb(null, true);
    else cb(new Error("Only PDF files are accepted"));
  },
});

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Mark an evaluation as failed with a human-readable reason (surfaced in the report summary).
// Clears any prior scores/results so a failed rerun can't leave stale success data behind.
async function markEvalError(id: number, message: string) {
  await db
    .update(evaluationsTable)
    .set({
      status: "error",
      summary: message.slice(0, 1000),
      overallScore: null,
      dataSourceScore: null,
      datasetScore: null,
      reproducibilityScore: null,
      citationScore: null,
      simulationClarityScore: null,
      reproPackageScore: null,
      informationTheoryScore: null,
      rubricVersion: null,
      dataSourcesFound: null,
      datasetsFound: null,
      citationsFound: null,
      findings: null,
      gaps: null,
      recommendations: null,
      accessions: null,
      evidenceItems: null,
      updatedAt: new Date(),
    })
    .where(eq(evaluationsTable.id, id));
}

// Read a response body into a Uint8Array, aborting if it exceeds `cap` bytes.
async function readCappedBytes(res: Response, cap: number, label: string): Promise<Uint8Array> {
  const declared = res.headers.get("content-length");
  if (declared && Number(declared) > cap) throw new Error(`${label} is too large to process.`);

  const reader = res.body?.getReader();
  if (!reader) {
    const ab = await res.arrayBuffer();
    if (ab.byteLength > cap) throw new Error(`${label} is too large to process.`);
    return new Uint8Array(ab);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > cap) {
        await reader.cancel().catch(() => {});
        throw new Error(`${label} is too large to process.`);
      }
      chunks.push(value);
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

// Extract PMC ID from a PMC article URL, e.g. /pmc/articles/PMC3530905/
function extractPmcId(url: string): string | null {
  const m = url.match(/pmc\/articles\/PMC(\d+)/i);
  return m ? m[1] : null;
}

// Fetch text for a PMC article via NCBI E-utilities (bypasses browser checks / reCAPTCHA).
// Strategy: fetch PMC XML (has full text for open-access papers); if the body is thin
// (publisher restricts full text), also pull the PubMed abstract via the PMID embedded
// in the same XML and append it.
async function fetchPmcText(pmcId: string): Promise<string> {
  const headers = { "User-Agent": "BioEval/1.0 (bioinformatics provenance evaluator)" };

  // Step 1: PMC efetch XML — may contain full text or just metadata
  const pmcRes = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${pmcId}&retmode=xml`,
    { headers }
  );
  if (!pmcRes.ok) throw new Error(`PMC efetch HTTP ${pmcRes.status}`);
  const xml = await pmcRes.text();

  const pmcText = xml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Step 2: If the PMC XML is short (publisher restricts full text), enrich with PubMed abstract.
  // Extract PMID from XML — it appears as a bare number inside <article-id pub-id-type="pmid">
  let enriched = pmcText;
  if (pmcText.length < 5000) {
    const pmidMatch = xml.match(/<article-id[^>]+pub-id-type="pmid"[^>]*>(\d+)<\/article-id>/i)
      ?? xml.match(/pub-id-type="pmid"[^>]*>(\d+)</i);
    if (pmidMatch) {
      const pmid = pmidMatch[1];
      try {
        const absRes = await fetch(
          `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&rettype=abstract&retmode=text`,
          { headers }
        );
        if (absRes.ok) {
          const absText = (await absRes.text()).trim();
          enriched = `${pmcText}\n\n--- PubMed Abstract ---\n${absText}`;
        }
      } catch {
        // abstract fetch failed — use metadata-only text
      }
    }
  }

  return enriched.slice(0, 50000);
}

// Fetch and clean paper text from URL. Throws on unrecoverable failures (blocked URL,
// HTTP error, unreadable PDF) so the caller can mark the evaluation as "error" rather than
// scoring placeholder text.
async function fetchPaperText(url: string): Promise<string> {
  // Use NCBI E-utilities for PMC URLs to bypass browser checks / reCAPTCHA (fixed NCBI host).
  const pmcId = extractPmcId(url);
  if (pmcId) return await fetchPmcText(pmcId);

  // SSRF-safe fetch: validates the URL and every redirect hop, with a request timeout.
  const res = await safeFetch(url, {
    headers: { "User-Agent": "BioEval/1.0 (bioinformatics provenance evaluator)" },
  });
  if (!res.ok) throw new Error(`Could not fetch paper (HTTP ${res.status})`);

  const finalUrl = new URL(res.url || url);
  const contentType = res.headers.get("content-type") ?? "";
  const isPdf =
    contentType.includes("application/pdf") || finalUrl.pathname.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    const bytes = await readCappedBytes(res, MAX_REMOTE_PDF_BYTES, "Linked PDF");
    if (!looksLikePdf(bytes)) throw new Error("Linked file is not a valid PDF.");
    const { text } = await extractPdfText(bytes);
    if (text.length < 200) {
      throw new Error(
        "Could not extract readable text from the linked PDF (it may be scanned images without OCR).",
      );
    }
    return text.slice(0, 50000);
  }

  const bytes = await readCappedBytes(res, MAX_REMOTE_PDF_BYTES, "Linked page");
  const html = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  // Strip HTML tags for cleaner text
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (text.length < 50) throw new Error("Fetched page contained no readable text.");
  return text.slice(0, 50000);
}

// Run the full multi-agent pipeline and persist results
async function runEvaluation(evaluationId: number, paperText: string, paperUrl: string | null) {
  try {
    await db
      .update(evaluationsTable)
      .set({ status: "analyzing", extractedText: paperText.slice(0, 50000), updatedAt: new Date() })
      .where(eq(evaluationsTable.id, evaluationId));

    const result = await runPaperPipeline(paperText, paperUrl);
    const { scores, accessions, evidenceItems, codeRepoUrl } = result;

    await db
      .update(evaluationsTable)
      .set({
        status: "complete",
        overallScore: scores.overallScore ?? null,
        dataSourceScore: scores.dataSourceScore ?? null,
        datasetScore: scores.datasetScore ?? null,
        reproducibilityScore: scores.reproducibilityScore ?? null,
        citationScore: scores.citationScore ?? null,
        simulationClarityScore: scores.simulationClarityScore ?? null,
        reproPackageScore: scores.reproPackageScore ?? null,
        informationTheoryScore: scores.informationTheoryScore ?? null,
        rubricVersion: result.rubricVersion,
        summary: scores.summary ?? "",
        dataSourcesFound: scores.dataSourcesFound ?? null,
        datasetsFound: scores.datasetsFound ?? null,
        citationsFound: scores.citationsFound ?? null,
        findings: scores.findings ?? "",
        gaps: scores.gaps ?? "",
        recommendations: scores.recommendations ?? "",
        accessions: JSON.stringify(accessions),
        evidenceItems: JSON.stringify(evidenceItems),
        codeRepoUrl: codeRepoUrl ?? null,
        updatedAt: new Date(),
      })
      .where(eq(evaluationsTable.id, evaluationId));
  } catch (err) {
    await markEvalError(evaluationId, `Evaluation failed: ${errMessage(err)}`);
  }
}

function serializeEval(row: typeof evaluationsTable.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// GET /evaluations
router.get("/evaluations", async (_req, res) => {
  const rows = await db.select().from(evaluationsTable).orderBy(desc(evaluationsTable.createdAt));
  res.json(rows.map(serializeEval));
});

// POST /evaluations (URL)
router.post("/evaluations", async (req, res) => {
  const schema = z.object({
    paperUrl: z.string().url(),
    title: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const { paperUrl, title } = parsed.data;

  const [row] = await db
    .insert(evaluationsTable)
    .values({ title: title ?? new URL(paperUrl).hostname + " paper", paperUrl, status: "pending" })
    .returning();

  res.status(201).json(serializeEval(row));

  void (async () => {
    try {
      const text = await fetchPaperText(paperUrl);
      await runEvaluation(row.id, text, paperUrl);
    } catch (err) {
      await markEvalError(row.id, errMessage(err));
    }
  })();
});

// POST /evaluations/upload (PDF)
router.post("/evaluations/upload", upload.single("file"), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
  const filePath = req.file.path;
  const originalname = req.file.originalname;
  const title = ((req.body?.title as string) ?? "").trim() || originalname || "Uploaded PDF";

  // Read the uploaded bytes and verify the PDF magic header before accepting the file.
  let buf: Buffer;
  try {
    buf = await fs.readFile(filePath);
  } catch {
    await fs.unlink(filePath).catch(() => {});
    res.status(400).json({ error: "Could not read uploaded file" });
    return;
  }
  if (!looksLikePdf(new Uint8Array(buf))) {
    await fs.unlink(filePath).catch(() => {});
    res.status(400).json({ error: "Uploaded file is not a valid PDF" });
    return;
  }

  const [row] = await db
    .insert(evaluationsTable)
    .values({ title, pdfFilename: originalname, status: "pending" })
    .returning();

  res.status(201).json(serializeEval(row));

  void (async () => {
    try {
      const { text } = await extractPdfText(new Uint8Array(buf));
      if (text.length < 200) {
        throw new Error(
          "Could not extract readable text from this PDF (it may be scanned images without OCR).",
        );
      }
      await runEvaluation(row.id, text, null);
    } catch (err) {
      await markEvalError(row.id, `PDF extraction failed: ${errMessage(err)}`);
    } finally {
      await fs.unlink(filePath).catch(() => {});
    }
  })();
});

// GET /evaluations/:id
router.get("/evaluations/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(evaluationsTable).where(eq(evaluationsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeEval(row));
});

// DELETE /evaluations/:id
router.delete("/evaluations/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(evaluationsTable).where(eq(evaluationsTable.id, id));
  res.status(204).end();
});

// POST /evaluations/:id/rerun
router.post("/evaluations/:id/rerun", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(evaluationsTable).where(eq(evaluationsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  await db.update(evaluationsTable).set({ status: "pending", updatedAt: new Date() }).where(eq(evaluationsTable.id, id));
  const [updated] = await db.select().from(evaluationsTable).where(eq(evaluationsTable.id, id));
  res.json(serializeEval(updated));

  void (async () => {
    try {
      // Always re-fetch from the URL to pick up any fetcher improvements (e.g. PMC E-utilities fix).
      // Uploaded PDFs have no URL — reuse the previously extracted text.
      const paperText = row.paperUrl ? await fetchPaperText(row.paperUrl) : (row.extractedText ?? "");
      if (!paperText || paperText.trim().length < 50) {
        throw new Error("No paper content available to re-evaluate.");
      }
      await runEvaluation(id, paperText, row.paperUrl);
    } catch (err) {
      await markEvalError(id, errMessage(err));
    }
  })();
});

// GET /stats
router.get("/stats", async (_req, res) => {
  const [stats] = await db.select({
    totalEvaluations: count(evaluationsTable.id),
    averageOverallScore: avg(evaluationsTable.overallScore),
    averageDataSourceScore: avg(evaluationsTable.dataSourceScore),
    averageDatasetScore: avg(evaluationsTable.datasetScore),
    averageCitationScore: avg(evaluationsTable.citationScore),
  }).from(evaluationsTable);

  const statusRows = await db
    .select({ status: evaluationsTable.status, cnt: count(evaluationsTable.id) })
    .from(evaluationsTable)
    .groupBy(evaluationsTable.status);

  const statusBreakdown: Record<string, number> = {};
  for (const r of statusRows) statusBreakdown[r.status] = Number(r.cnt);

  const recentRows = await db
    .select().from(evaluationsTable).orderBy(desc(evaluationsTable.createdAt)).limit(5);

  res.json({
    totalEvaluations: Number(stats.totalEvaluations) || 0,
    averageOverallScore: Number(stats.averageOverallScore) || 0,
    averageDataSourceScore: Number(stats.averageDataSourceScore) || 0,
    averageDatasetScore: Number(stats.averageDatasetScore) || 0,
    averageCitationScore: Number(stats.averageCitationScore) || 0,
    statusBreakdown,
    recentEvaluations: recentRows.map(serializeEval),
  });
});

export default router;
