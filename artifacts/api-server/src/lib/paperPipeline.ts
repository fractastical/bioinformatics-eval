// Multi-agent paper evaluation pipeline
// Agent A → Agent B → Agent C → Agent D (critic)

import { anthropic } from "@workspace/integrations-anthropic-ai";
import { extractAccessions, resolveAccessions, type ResolvedAccession } from "./accessionResolver";

export interface EvidenceItem {
  claim: string;
  evidenceType: "positive" | "missing" | "partial";
  section: string;
  span: string;
  identifier?: string;
  issue?: string;
  confidence: "high" | "medium" | "low";
}

export interface PaperEvidenceExtraction {
  codeRepoUrl: string | null;
  accessionCandidates: string[];
  evidenceItems: EvidenceItem[];
}

export interface PaperScores {
  overallScore: number;
  dataSourceScore: number;
  datasetScore: number;
  reproducibilityScore: number;
  citationScore: number;
  simulationClarityScore: number;
  reproPackageScore: number;
  summary: string;
  dataSourcesFound: number;
  datasetsFound: number;
  citationsFound: number;
  findings: string;
  gaps: string;
  recommendations: string;
}

export interface PipelineResult {
  scores: PaperScores;
  accessions: ResolvedAccession[];
  evidenceItems: EvidenceItem[];
  codeRepoUrl: string | null;
}

function parseJSON<T>(text: string): T {
  const cleaned = text.trim().replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(cleaned) as T;
}

// Agent A: Extract structured evidence from paper text
async function agentExtractEvidence(paperText: string): Promise<PaperEvidenceExtraction> {
  const prompt = `You are extracting structured evidence from a bioinformatics paper for reproducibility evaluation.

Paper content:
${paperText.slice(0, 35000)}

Return ONLY a valid JSON object with this exact structure:
{
  "codeRepoUrl": "<URL of code repository if mentioned, or null>",
  "accessionCandidates": ["<any dataset accession IDs mentioned, e.g. GSE123, SRP456, PRJNA789>"],
  "evidenceItems": [
    {
      "claim": "<exact factual claim about data/code availability>",
      "evidenceType": "<positive|missing|partial>",
      "section": "<paper section name>",
      "span": "<exact or paraphrased quote from the paper>",
      "identifier": "<accession/DOI if applicable, or omit>",
      "issue": "<description of problem if evidenceType is missing or partial, or omit>",
      "confidence": "<high|medium|low>"
    }
  ]
}

Extract evidence for:
- Data Availability Statements
- Code/Software Availability Statements  
- Dataset accession numbers and repository links
- Simulation parameter sources (cited, estimated, assumed, hard-coded)
- Missing dataset declarations (mention data but no accession/link)
- Missing code availability (describes analysis but no repo)
- Conflicting information (sample counts, dataset descriptions)
- Supplementary data mentions

For evidenceType:
- positive: paper explicitly states something (e.g., data deposited at GEO GSE123)
- missing: something should be stated but is absent (e.g., uses patient data but no access info)
- partial: partially stated but incomplete (e.g., mentions GitHub but no commit/release)

Be exhaustive. Extract 5-15 evidence items.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected AI response type");

  try {
    return parseJSON<PaperEvidenceExtraction>(block.text);
  } catch {
    return { codeRepoUrl: null, accessionCandidates: [], evidenceItems: [] };
  }
}

// Agent C: Score the paper using the 6-dimension rubric, informed by evidence + resolved accessions
async function agentScorePaper(
  paperText: string,
  evidenceItems: EvidenceItem[],
  resolvedAccessions: ResolvedAccession[]
): Promise<PaperScores> {
  const resolvedSummary = resolvedAccessions.map(a =>
    `${a.identifier} (${a.repository}): ${a.resolved ? "RESOLVED" : "UNRESOLVED"} — ${a.accessStatus}${a.problems.length ? " — " + a.problems.join("; ") : ""}`
  ).join("\n");

  const evidenceSummary = evidenceItems.map(e =>
    `[${e.evidenceType.toUpperCase()}] ${e.section}: ${e.claim}`
  ).join("\n");

  const prompt = `You are a rigorous bioinformatics peer reviewer scoring a paper on data transparency and reproducibility using a structured rubric.

Paper content (first 20000 chars):
${paperText.slice(0, 20000)}

Pre-extracted evidence:
${evidenceSummary || "No structured evidence extracted."}

Dataset accession resolution results:
${resolvedSummary || "No accessions identified."}

Score the paper on these 6 dimensions using the exact rubric below. Each score is 0-100 (normalized from the rubric points shown).

RUBRIC:
1. dataSourceScore [Data Disclosure, 20pts]: 100=all datasets listed with repo+accession+version+access+role; 75=most listed but some versions unclear; 50=Data Availability Statement exists but vague; 25=mentions data in prose only; 0=no disclosure
2. datasetScore [Dataset Resolvability, 15pts]: 100=all identifiers resolve and metadata match paper; 67=most resolve with minor mismatches; 33=some resolve but key datasets inaccessible; 0=identifiers missing/broken/private
3. reproducibilityScore [Code Availability & Versioning, 15pts]: 100=code public+versioned+archived+documented; 67=code public but no release/commit/archive; 33=code exists but incomplete or stale; 0=no code or private
4. citationScore [Code-to-Data Traceability, 20pts]: 100=every data-loading step maps to declared datasets; 75=main paths traceable, minor gaps; 50=some traceability but important preprocessing unexplained; 25=code loads undeclared files; 0=cannot connect code to data
5. simulationClarityScore [Simulation Derivation Clarity, 20pts]: 100=every parameter, distribution, seed traceable; 75=main parameters traceable, some constants unclear; 50=some parameters explained, calibration incomplete; 25=many hard-coded unexplained values; 0=simulation behavior untraceable
6. reproPackageScore [Reproducibility Package Quality, 10pts]: 100=environment+workflow+test data+instructions+checksums present; 70=mostly runnable with minor gaps; 40=significant manual reconstruction required; 0=not practically runnable

Return ONLY a valid JSON object:
{
  "overallScore": <weighted average: dim1*0.20 + dim2*0.15 + dim3*0.15 + dim4*0.20 + dim5*0.20 + dim6*0.10>,
  "dataSourceScore": <0-100>,
  "datasetScore": <0-100>,
  "reproducibilityScore": <0-100>,
  "citationScore": <0-100>,
  "simulationClarityScore": <0-100>,
  "reproPackageScore": <0-100>,
  "summary": "<3-4 sentence overall assessment referencing specific evidence>",
  "dataSourcesFound": <integer>,
  "datasetsFound": <integer>,
  "citationsFound": <integer>,
  "findings": "<bullet list of positive findings, each on new line starting with '- '>",
  "gaps": "<bullet list of reproducibility gaps, each on new line starting with '- '>",
  "recommendations": "<bullet list of specific improvements, each on new line starting with '- '>"
}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected AI response type");

  const result = parseJSON<PaperScores>(block.text);
  return result;
}

// Agent D: Critic — challenges weak evidence links
async function agentCriticReview(
  evidenceItems: EvidenceItem[],
  resolvedAccessions: ResolvedAccession[]
): Promise<{ challengedItems: EvidenceItem[]; additionalGaps: string[] }> {
  const unresolvedAccessions = resolvedAccessions.filter(a => !a.resolved);
  const positiveItems = evidenceItems.filter(e => e.evidenceType === "positive");

  if (positiveItems.length === 0 && unresolvedAccessions.length === 0) {
    return { challengedItems: [], additionalGaps: [] };
  }

  const prompt = `You are auditing a bioinformatics paper's provenance claims for overclaiming and weak evidence.

Positive evidence claims:
${positiveItems.map(e => `- [${e.confidence}] ${e.claim} (span: "${e.span}")`).join("\n") || "None"}

Unresolved accessions:
${unresolvedAccessions.map(a => `- ${a.identifier} (${a.repository}): ${a.problems.join("; ")}`).join("\n") || "None"}

For each weak positive claim, determine if the evidence is actually direct, indirect, or overclaimed.
Identify any additional gaps not previously captured.

Return ONLY valid JSON:
{
  "challengedItems": [
    {
      "originalClaim": "<claim being challenged>",
      "issue": "<why this claim is weak or overclaiming>",
      "confidence": "low"
    }
  ],
  "additionalGaps": ["<gap not captured in original evidence>"]
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const block = message.content[0];
    if (block.type !== "text") return { challengedItems: [], additionalGaps: [] };
    const result = parseJSON<{ challengedItems: Array<{ originalClaim: string; issue: string; confidence: "low" }>; additionalGaps: string[] }>(block.text);

    // Convert challenged items back to EvidenceItem format
    const challenged: EvidenceItem[] = result.challengedItems.map(c => ({
      claim: c.originalClaim,
      evidenceType: "partial" as const,
      section: "Critic Review",
      span: "",
      issue: c.issue,
      confidence: "low" as const,
    }));

    return { challengedItems: challenged, additionalGaps: result.additionalGaps ?? [] };
  } catch {
    return { challengedItems: [], additionalGaps: [] };
  }
}

// Main pipeline function
export async function runPaperPipeline(paperText: string, paperUrl: string | null): Promise<PipelineResult> {
  // Agent A: Extract structured evidence
  const extraction = await agentExtractEvidence(paperText);

  // Agent B: Resolve accessions (deterministic + API calls, in parallel with nothing)
  const allCandidateIds = [
    ...extraction.accessionCandidates,
    ...extractAccessions(paperText).map(a => a.identifier),
  ];
  // Deduplicate
  const uniqueIds = [...new Set(allCandidateIds)];
  const candidateObjects = uniqueIds.map(id => {
    const found = extractAccessions(paperText).find(a => a.identifier === id);
    return found ?? { identifier: id, repository: "Unknown", type: "unknown" };
  });

  // Run accession resolution + Agent C scoring in sequence (C needs B's results)
  const resolvedAccessions = await resolveAccessions(candidateObjects);

  // Agent D: Critic review (in parallel with Agent C)
  const [scores, criticResult] = await Promise.all([
    agentScorePaper(paperText, extraction.evidenceItems, resolvedAccessions),
    agentCriticReview(extraction.evidenceItems, resolvedAccessions),
  ]);

  // Merge critic findings into evidence items
  const mergedEvidenceItems: EvidenceItem[] = [
    ...extraction.evidenceItems,
    ...criticResult.challengedItems,
  ];

  // Append additional gaps to findings
  if (criticResult.additionalGaps.length > 0) {
    scores.gaps = (scores.gaps ? scores.gaps + "\n" : "") +
      criticResult.additionalGaps.map(g => `- [Critic] ${g}`).join("\n");
  }

  return {
    scores,
    accessions: resolvedAccessions,
    evidenceItems: mergedEvidenceItems,
    codeRepoUrl: extraction.codeRepoUrl,
  };
}
