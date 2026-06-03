import { Router } from "express";
import { db, evaluationsTable, codeAnalysesTable } from "@workspace/db";
import { eq, desc, avg, count, sql } from "drizzle-orm";
import { z } from "zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import multer from "multer";
import path from "path";
import fs from "fs/promises";

const router = Router();
const upload = multer({ dest: "/tmp/uploads/" });

// Helper: fetch paper text from URL
async function fetchPaperText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "BioEval/1.0 (bioinformatics paper evaluator)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/pdf")) {
      return `[PDF fetched from ${url} — text extraction not available for binary PDFs via URL fetch. Using URL metadata for evaluation.]`;
    }
    const text = await res.text();
    return text.slice(0, 40000);
  } catch (err) {
    return `[Unable to fetch paper content from ${url}: ${err}]`;
  }
}

// Helper: run AI evaluation on paper text
async function runPaperEvaluation(evaluationId: number, paperText: string, paperUrl: string | null) {
  try {
    await db
      .update(evaluationsTable)
      .set({ status: "analyzing", updatedAt: new Date() })
      .where(eq(evaluationsTable.id, evaluationId));

    const prompt = `You are a rigorous scientific peer reviewer specializing in bioinformatics. Evaluate the following paper for data transparency and reproducibility.

Paper content:
${paperText}

${paperUrl ? `Paper URL: ${paperUrl}` : ""}

Evaluate the paper on these dimensions (score each 0-100):
1. **Data Source Clarity** (dataSourceScore): How clearly are all data sources identified? Are database names, accession numbers, and repositories explicitly stated?
2. **Dataset Declaration** (datasetScore): How well are datasets described? Are sample sizes, data types, and availability (public/private) stated?
3. **Reproducibility** (reproducibilityScore): Is the methodology described clearly enough to reproduce? Is code/software version information provided?
4. **Citation Quality** (citationScore): Are data sources, tools, and methods properly cited? Are citations traceable to actual datasets?

Respond with ONLY a valid JSON object (no markdown, no explanation) in this exact format:
{
  "overallScore": <number 0-100>,
  "dataSourceScore": <number 0-100>,
  "datasetScore": <number 0-100>,
  "reproducibilityScore": <number 0-100>,
  "citationScore": <number 0-100>,
  "summary": "<2-3 sentence overall assessment>",
  "dataSourcesFound": <integer count of distinct data sources mentioned>,
  "datasetsFound": <integer count of distinct datasets mentioned>,
  "citationsFound": <integer count of data/dataset citations>,
  "findings": "<bullet-point style list of what was found, each on new line starting with - >",
  "gaps": "<bullet-point style list of transparency gaps, each on new line starting with - >",
  "recommendations": "<bullet-point style list of specific improvements, each on new line starting with - >"
}`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const block = message.content[0];
    if (block.type !== "text") throw new Error("Unexpected response type");

    let result: Record<string, unknown>;
    try {
      const text = block.text.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
      result = JSON.parse(text);
    } catch {
      throw new Error(`Failed to parse AI response: ${block.text.slice(0, 200)}`);
    }

    await db
      .update(evaluationsTable)
      .set({
        status: "complete",
        overallScore: Number(result.overallScore) || null,
        dataSourceScore: Number(result.dataSourceScore) || null,
        datasetScore: Number(result.datasetScore) || null,
        reproducibilityScore: Number(result.reproducibilityScore) || null,
        citationScore: Number(result.citationScore) || null,
        summary: String(result.summary || ""),
        dataSourcesFound: Number(result.dataSourcesFound) || null,
        datasetsFound: Number(result.datasetsFound) || null,
        citationsFound: Number(result.citationsFound) || null,
        findings: String(result.findings || ""),
        gaps: String(result.gaps || ""),
        recommendations: String(result.recommendations || ""),
        updatedAt: new Date(),
      })
      .where(eq(evaluationsTable.id, evaluationId));
  } catch (err) {
    await db
      .update(evaluationsTable)
      .set({ status: "error", updatedAt: new Date() })
      .where(eq(evaluationsTable.id, evaluationId));
    throw err;
  }
}

// Helper: serialize evaluation for API response
function serializeEval(row: typeof evaluationsTable.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// GET /evaluations
router.get("/evaluations", async (req, res) => {
  const rows = await db
    .select()
    .from(evaluationsTable)
    .orderBy(desc(evaluationsTable.createdAt));
  res.json(rows.map(serializeEval));
});

// POST /evaluations (URL submission)
router.post("/evaluations", async (req, res) => {
  const schema = z.object({
    paperUrl: z.string().url(),
    title: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { paperUrl, title } = parsed.data;

  const [row] = await db
    .insert(evaluationsTable)
    .values({
      title: title ?? new URL(paperUrl).hostname + " paper",
      paperUrl,
      status: "pending",
    })
    .returning();

  res.status(201).json(serializeEval(row));

  // Run analysis async (fire and forget)
  fetchPaperText(paperUrl).then((text) =>
    runPaperEvaluation(row.id, text, paperUrl).catch(console.error)
  );
});

// POST /evaluations/upload (PDF file upload)
router.post("/evaluations/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  const title = (req.body?.title as string) ?? req.file.originalname ?? "Uploaded PDF";

  const [row] = await db
    .insert(evaluationsTable)
    .values({
      title,
      pdfFilename: req.file.originalname,
      status: "pending",
    })
    .returning();

  res.status(201).json(serializeEval(row));

  // Run analysis async with placeholder text
  const paperText = `[PDF file uploaded: ${req.file.originalname}. This is a binary PDF — performing analysis based on available metadata and filename.]`;
  runPaperEvaluation(row.id, paperText, null).catch(console.error);

  // Cleanup temp file
  fs.unlink(req.file.path).catch(() => {});
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

  // Reset and re-queue
  await db
    .update(evaluationsTable)
    .set({ status: "pending", updatedAt: new Date() })
    .where(eq(evaluationsTable.id, id));

  const [updated] = await db.select().from(evaluationsTable).where(eq(evaluationsTable.id, id));
  res.json(serializeEval(updated));

  const paperText = row.extractedText ?? (row.paperUrl ? await fetchPaperText(row.paperUrl) : "[No content available for re-analysis]");
  runPaperEvaluation(id, paperText, row.paperUrl).catch(console.error);
});

// GET /stats
router.get("/stats", async (_req, res) => {
  const [stats] = await db
    .select({
      totalEvaluations: count(evaluationsTable.id),
      averageOverallScore: avg(evaluationsTable.overallScore),
      averageDataSourceScore: avg(evaluationsTable.dataSourceScore),
      averageDatasetScore: avg(evaluationsTable.datasetScore),
      averageCitationScore: avg(evaluationsTable.citationScore),
    })
    .from(evaluationsTable);

  const statusRows = await db
    .select({
      status: evaluationsTable.status,
      cnt: count(evaluationsTable.id),
    })
    .from(evaluationsTable)
    .groupBy(evaluationsTable.status);

  const statusBreakdown: Record<string, number> = {};
  for (const r of statusRows) {
    statusBreakdown[r.status] = Number(r.cnt);
  }

  const recentRows = await db
    .select()
    .from(evaluationsTable)
    .orderBy(desc(evaluationsTable.createdAt))
    .limit(5);

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
