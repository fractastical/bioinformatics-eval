import { Router } from "express";
import { db, evaluationsTable, codeAnalysesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router = Router({ mergeParams: true });

function serializeAnalysis(row: typeof codeAnalysesTable.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function runCodeAnalysis(analysisId: number, codeSnippet: string, language: string, paperContext: string) {
  try {
    await db
      .update(codeAnalysesTable)
      .set({ status: "analyzing", updatedAt: new Date() })
      .where(eq(codeAnalysesTable.id, analysisId));

    const prompt = `You are a bioinformatics reproducibility expert. Analyze the following simulation/analysis code and trace each component back to the underlying data sources and citations from the paper.

Paper context:
${paperContext}

Code language: ${language}
Code to analyze:
\`\`\`${language}
${codeSnippet}
\`\`\`

Break down the code into logical segments and for each segment:
1. Identify what data source or dataset it uses or depends on
2. Find the corresponding citation or reference from the paper
3. Assess whether the connection is clear (confidence: high/medium/low)

Respond with ONLY a valid JSON object (no markdown) in this exact format:
{
  "overallTraceability": <number 0-100, how well the code traces back to cited data>,
  "summary": "<2-3 sentence assessment of how well the code maps to the paper's data sources>",
  "segments": [
    {
      "label": "<short descriptive label for this code segment>",
      "code": "<the relevant code lines>",
      "dataSource": "<name of the data source or dataset this segment uses, or 'Unknown' if not traceable>",
      "citation": "<the paper citation or reference number, or 'No citation found'>",
      "confidence": "<high|medium|low>"
    }
  ]
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
      .update(codeAnalysesTable)
      .set({
        status: "complete",
        overallTraceability: Number(result.overallTraceability) || null,
        summary: String(result.summary || ""),
        segments: JSON.stringify(result.segments || []),
        updatedAt: new Date(),
      })
      .where(eq(codeAnalysesTable.id, analysisId));
  } catch (err) {
    await db
      .update(codeAnalysesTable)
      .set({ status: "error", updatedAt: new Date() })
      .where(eq(codeAnalysesTable.id, analysisId));
    throw err;
  }
}

// GET /evaluations/:id/code-analyses
router.get("/", async (req, res) => {
  const evalId = Number(req.params.id);
  if (isNaN(evalId)) { res.status(400).json({ error: "Invalid evaluation id" }); return; }

  const rows = await db
    .select()
    .from(codeAnalysesTable)
    .where(eq(codeAnalysesTable.evaluationId, evalId))
    .orderBy(desc(codeAnalysesTable.createdAt));

  res.json(rows.map(serializeAnalysis));
});

// POST /evaluations/:id/code-analyses
router.post("/", async (req, res) => {
  const evalId = Number(req.params.id);
  if (isNaN(evalId)) { res.status(400).json({ error: "Invalid evaluation id" }); return; }

  const schema = z.object({
    title: z.string().optional(),
    codeSnippet: z.string().min(1),
    language: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  // Get the evaluation for paper context
  const [evalRow] = await db.select().from(evaluationsTable).where(eq(evaluationsTable.id, evalId));
  if (!evalRow) { res.status(404).json({ error: "Evaluation not found" }); return; }

  const { codeSnippet, language = "python", title = "Code Analysis" } = parsed.data;

  const [row] = await db
    .insert(codeAnalysesTable)
    .values({
      evaluationId: evalId,
      title,
      codeSnippet,
      language,
      status: "pending",
    })
    .returning();

  res.status(201).json(serializeAnalysis(row));

  // Build paper context for AI
  const paperContext = [
    evalRow.title,
    evalRow.paperUrl ? `URL: ${evalRow.paperUrl}` : "",
    evalRow.summary ?? "",
    evalRow.findings ?? "",
  ].filter(Boolean).join("\n\n");

  runCodeAnalysis(row.id, codeSnippet, language, paperContext).catch(console.error);
});

// GET /evaluations/:id/code-analyses/:analysisId
router.get("/:analysisId", async (req, res) => {
  const evalId = Number(req.params.id);
  const analysisId = Number(req.params.analysisId);
  if (isNaN(evalId) || isNaN(analysisId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select()
    .from(codeAnalysesTable)
    .where(and(eq(codeAnalysesTable.id, analysisId), eq(codeAnalysesTable.evaluationId, evalId)));

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeAnalysis(row));
});

export default router;
