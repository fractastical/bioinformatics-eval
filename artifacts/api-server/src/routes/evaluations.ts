import { Router } from "express";
import { db, evaluationsTable, codeAnalysesTable } from "@workspace/db";
import { eq, desc, avg, count } from "drizzle-orm";
import { z } from "zod";
import multer from "multer";
import fs from "fs/promises";
import { runPaperPipeline } from "../lib/paperPipeline";

const router = Router();
const upload = multer({ dest: "/tmp/uploads/" });

// Fetch and clean paper text from URL
async function fetchPaperText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "BioEval/1.0 (bioinformatics provenance evaluator)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/pdf")) {
      return `[Binary PDF at ${url} — text extraction unavailable. Analysis based on URL metadata only.]`;
    }
    const html = await res.text();
    // Strip HTML tags for cleaner text
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    return text.slice(0, 50000);
  } catch (err) {
    return `[Unable to fetch paper from ${url}: ${err}]`;
  }
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
    await db
      .update(evaluationsTable)
      .set({ status: "error", updatedAt: new Date() })
      .where(eq(evaluationsTable.id, evaluationId));
    console.error("Evaluation pipeline failed:", err);
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

  fetchPaperText(paperUrl).then((text) =>
    runEvaluation(row.id, text, paperUrl)
  );
});

// POST /evaluations/upload (PDF)
router.post("/evaluations/upload", upload.single("file"), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
  const title = (req.body?.title as string) ?? req.file.originalname ?? "Uploaded PDF";

  const [row] = await db
    .insert(evaluationsTable)
    .values({ title, pdfFilename: req.file.originalname, status: "pending" })
    .returning();

  res.status(201).json(serializeEval(row));

  const paperText = `[PDF uploaded: ${req.file.originalname}. Binary PDF — analysis based on filename and any extractable metadata.]`;
  runEvaluation(row.id, paperText, null);
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

  await db.update(evaluationsTable).set({ status: "pending", updatedAt: new Date() }).where(eq(evaluationsTable.id, id));
  const [updated] = await db.select().from(evaluationsTable).where(eq(evaluationsTable.id, id));
  res.json(serializeEval(updated));

  const paperText = row.extractedText ?? (row.paperUrl ? await fetchPaperText(row.paperUrl) : "[No content]");
  runEvaluation(id, paperText, row.paperUrl);
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
