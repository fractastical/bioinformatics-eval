import { Router } from "express";
import { db, evaluationsTable, codeAnalysesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router = Router({ mergeParams: true });

// 9-class parameter source taxonomy from the spec
const PARAM_SOURCE_TAXONOMY = `
Classify the parameter source using exactly one of these labels:
- empirical_estimate: value derived from raw data in a declared dataset
- literature_value: value copied from a cited paper/table/supplement
- calibrated_value: value estimated by optimization, MCMC, ABC, fitting, or calibration
- synthetic_assumption: value explicitly stated as assumed or hypothetical
- default_software_value: default value from a named software package
- hard_coded_unexplained: value present in code with no paper/citation/comment support
- derived_empirical: intermediate file generated from a declared dataset
- undisclosed_external: loads/downloads data not mentioned in the paper
- unresolvable_reference: cites a source but exact dataset/version cannot be identified
`;

function serializeAnalysis(row: typeof codeAnalysesTable.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parseJSON<T>(text: string): T {
  const cleaned = text.trim().replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(cleaned) as T;
}

async function runCodeAnalysisPipeline(
  analysisId: number,
  codeSnippet: string,
  language: string,
  paperContext: string,
  resolvedAccessions: string
) {
  try {
    await db
      .update(codeAnalysesTable)
      .set({ status: "analyzing", updatedAt: new Date() })
      .where(eq(codeAnalysesTable.id, analysisId));

    // Agent D: Code Decomposer with parameter classification
    const decompositionPrompt = `You are a bioinformatics reproducibility auditor decomposing simulation code.

Paper context:
${paperContext}

Resolved dataset accessions from the paper:
${resolvedAccessions || "None identified"}

Code language: ${language}
Code to analyze:
\`\`\`${language}
${codeSnippet}
\`\`\`

${PARAM_SOURCE_TAXONOMY}

Break the code into logical segments (functions, blocks, config sections).
For each segment identify ALL of the following:

Return ONLY valid JSON:
{
  "overallTraceability": <0-100, how completely this code traces back to declared data/citations>,
  "summary": "<3-4 sentence assessment of traceability — be specific about what is and isn't traceable>",
  "segments": [
    {
      "label": "<short descriptive name>",
      "role": "<data_download|preprocessing|parameter_estimation|simulation|analysis|plotting|config|utility>",
      "code": "<the relevant code lines, max 300 chars>",
      "filesRead": ["<filename or pattern>"],
      "filesWritten": ["<filename or pattern>"],
      "hardCodedParams": [
        {"name": "<param name>", "value": "<value>", "line": <line number or null>}
      ],
      "dataSource": "<name of dataset or 'Unknown'>",
      "citation": "<paper citation, supplement reference, or 'No citation found'>",
      "paramSource": "<one of the 9 taxonomy labels above>",
      "confidence": "<high|medium|low>",
      "issues": ["<specific reproducibility issue>"]
    }
  ]
}`;

    const decompMsg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: decompositionPrompt }],
    });

    const decompBlock = decompMsg.content[0];
    if (decompBlock.type !== "text") throw new Error("Unexpected response type");

    let decompResult: {
      overallTraceability: number;
      summary: string;
      segments: Array<{
        label: string;
        role: string;
        code: string;
        filesRead?: string[];
        filesWritten?: string[];
        hardCodedParams?: Array<{ name: string; value: string; line: number | null }>;
        dataSource: string;
        citation: string;
        paramSource: string;
        confidence: string;
        issues?: string[];
      }>;
    };

    try {
      decompResult = parseJSON(decompBlock.text);
    } catch {
      throw new Error(`Failed to parse decomposition response: ${decompBlock.text.slice(0, 200)}`);
    }

    // Agent E: Critic — challenges weak links and unexplained params
    const hardCodedCount = decompResult.segments.reduce((acc, s) =>
      acc + (s.hardCodedParams?.length ?? 0), 0);
    const unexplainedSegments = decompResult.segments.filter(s =>
      s.paramSource === "hard_coded_unexplained" || s.paramSource === "undisclosed_external");

    let criticNotes: string[] = [];
    if (unexplainedSegments.length > 0 || hardCodedCount > 0) {
      const criticPrompt = `You are auditing bioinformatics code provenance for overclaiming.

Decomposed segments summary:
${decompResult.segments.map(s =>
  `- ${s.label} [${s.paramSource}]: ${s.dataSource} / ${s.citation}`
).join("\n")}

Hard-coded parameters found: ${hardCodedCount}
Segments with unexplained sources: ${unexplainedSegments.map(s => s.label).join(", ") || "none"}

Identify the most critical reproducibility risks. Be concise and specific.
Return ONLY valid JSON: { "criticNotes": ["<specific critical issue>"] }`;

      try {
        const criticMsg = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          messages: [{ role: "user", content: criticPrompt }],
        });
        const criticBlock = criticMsg.content[0];
        if (criticBlock.type === "text") {
          const criticResult = parseJSON<{ criticNotes: string[] }>(criticBlock.text);
          criticNotes = criticResult.criticNotes ?? [];
        }
      } catch {
        // Critic failure is non-fatal
      }
    }

    // Build traceability matrix
    const traceabilityMatrix = decompResult.segments.map(s => ({
      codeUnit: s.label,
      role: s.role,
      inputOrParam: s.filesRead?.join(", ") || s.hardCodedParams?.map(p => `${p.name}=${p.value}`).join(", ") || "—",
      claimedSource: s.dataSource,
      evidence: s.citation,
      paramSource: s.paramSource,
      confidence: s.confidence,
      status: deriveStatus(s.paramSource, s.confidence, s.issues ?? []),
      issues: [...(s.issues ?? []), ...(s.label === unexplainedSegments[0]?.label ? criticNotes : [])],
    }));

    await db
      .update(codeAnalysesTable)
      .set({
        status: "complete",
        overallTraceability: Number(decompResult.overallTraceability) || null,
        summary: decompResult.summary ?? "",
        segments: JSON.stringify(decompResult.segments),
        traceabilityMatrix: JSON.stringify(traceabilityMatrix),
        updatedAt: new Date(),
      })
      .where(eq(codeAnalysesTable.id, analysisId));
  } catch (err) {
    await db
      .update(codeAnalysesTable)
      .set({ status: "error", updatedAt: new Date() })
      .where(eq(codeAnalysesTable.id, analysisId));
    console.error("Code analysis pipeline failed:", err);
  }
}

function deriveStatus(
  paramSource: string,
  confidence: string,
  issues: string[]
): "traceable" | "weak" | "unexplained" | "undisclosed" {
  if (paramSource === "hard_coded_unexplained") return "unexplained";
  if (paramSource === "undisclosed_external") return "undisclosed";
  if (paramSource === "unresolvable_reference") return "weak";
  if (confidence === "low" || issues.length > 0) return "weak";
  if (confidence === "high") return "traceable";
  return "weak";
}

// GET /evaluations/:id/code-analyses
router.get("/", async (req, res) => {
  const evalId = Number((req.params as Record<string, string>).id);
  if (isNaN(evalId)) { res.status(400).json({ error: "Invalid evaluation id" }); return; }
  const rows = await db
    .select().from(codeAnalysesTable)
    .where(eq(codeAnalysesTable.evaluationId, evalId))
    .orderBy(desc(codeAnalysesTable.createdAt));
  res.json(rows.map(serializeAnalysis));
});

// POST /evaluations/:id/code-analyses
router.post("/", async (req, res) => {
  const evalId = Number((req.params as Record<string, string>).id);
  if (isNaN(evalId)) { res.status(400).json({ error: "Invalid evaluation id" }); return; }

  const schema = z.object({
    title: z.string().optional(),
    codeSnippet: z.string().min(1),
    language: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const [evalRow] = await db.select().from(evaluationsTable).where(eq(evaluationsTable.id, evalId));
  if (!evalRow) { res.status(404).json({ error: "Evaluation not found" }); return; }

  const { codeSnippet, language = "python", title = "Code Analysis" } = parsed.data;

  const [row] = await db
    .insert(codeAnalysesTable)
    .values({ evaluationId: evalId, title, codeSnippet, language, status: "pending" })
    .returning();

  res.status(201).json(serializeAnalysis(row));

  // Build rich paper context from evaluation results
  const paperContext = [
    `Title: ${evalRow.title}`,
    evalRow.paperUrl ? `URL: ${evalRow.paperUrl}` : "",
    evalRow.summary ? `Summary: ${evalRow.summary}` : "",
    evalRow.findings ? `Findings:\n${evalRow.findings}` : "",
  ].filter(Boolean).join("\n\n");

  // Pass resolved accessions for cross-referencing
  const resolvedAccessions = evalRow.accessions
    ? JSON.parse(evalRow.accessions)
        .map((a: { identifier: string; repository: string; resolved: boolean; problems: string[] }) =>
          `${a.identifier} (${a.repository}): ${a.resolved ? "resolved" : "unresolved"}${a.problems.length ? " — " + a.problems[0] : ""}`)
        .join("\n")
    : "";

  runCodeAnalysisPipeline(row.id, codeSnippet, language, paperContext, resolvedAccessions);
});

// GET /evaluations/:id/code-analyses/:analysisId
router.get("/:analysisId", async (req, res) => {
  const evalId = Number((req.params as Record<string, string>).id);
  const analysisId = Number((req.params as Record<string, string>).analysisId);
  if (isNaN(evalId) || isNaN(analysisId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select().from(codeAnalysesTable)
    .where(and(eq(codeAnalysesTable.id, analysisId), eq(codeAnalysesTable.evaluationId, evalId)));

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeAnalysis(row));
});

export default router;
