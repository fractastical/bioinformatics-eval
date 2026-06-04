// Multi-agent paper evaluation pipeline
// Agent A → Agent B → Agent C → Agent D (critic)

import { anthropic } from "@workspace/integrations-anthropic-ai";
import { extractAccessions, resolveAccessions, type ResolvedAccession } from "./accessionResolver";
import { fetchGithubRepoSignals } from "./githubSignals";

// Rubric version stamped onto every evaluation scored by this pipeline.
// Bump when the dimension set, weights, or scoring guideposts change so that
// scores produced under different rubrics remain distinguishable/comparable.
// History:
//   1.x — 4 dimensions (data source, dataset, reproducibility, citation)
//   2.x — 6 dimensions (added simulation clarity + repro package quality)
//   3.0.0 — 7 dimensions (added Information-Theoretic Rigor) + rebalanced weights
//           (18/14/14/18/18/8/10)
// Convention: bump MAJOR when dimensions change, MINOR when weights change,
// PATCH when only guidepost wording/calibration changes.
export const RUBRIC_VERSION = "3.0.0";

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
  informationTheoryScore: number;
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
  rubricVersion: string;
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
  resolvedAccessions: ResolvedAccession[],
  repoSignals: string | null
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

${repoSignals ? `Verified code repository signals (fetched live from the GitHub API — treat as authoritative ground truth, more reliable than prose claims):
${repoSignals}

Use these repository signals as the PRIMARY evidence for Code Availability and Reproducibility Package scoring. Differentiate repos by these concrete facts (license, releases, README size, dependency manifests, tests, CI, recency) rather than defaulting to a single "public repo" value.
` : "No code repository signals available (no GitHub repo detected)."}

EVALUATION CONTEXT:
- Today's date is ${new Date().toISOString().slice(0, 10)}. Do NOT treat a paper's publication, preprint, or deposit date as a defect because it is recent or slightly in the future — preprints and versioned archives legitimately carry such dates. NEVER list a "future date" as a reproducibility gap.
- DOIs are registered through different agencies: journal articles via Crossref, data/software deposits (Zenodo, figshare, Dryad) via DataCite. A DOI absent from Crossref is NOT a defect — the resolution results above already query BOTH registries. NEVER penalize a Zenodo DOI for "not resolving in Crossref"; that is a category error.

EVIDENCE DISCIPLINE (avoid infohazards — false negatives erode trust):
- Only report gaps you have POSITIVELY verified from the evidence above. If you could not check something, OMIT it — do not present an unchecked item as a deficiency. Silence is not a finding.
- Specifically forbidden unless the evidence positively shows the problem: claiming a repository is "not confirmed accessible", that an archive's contents are "unverified", or that a Zenodo↔GitHub cross-reference is unconfirmed. If repo signals are present, the repo IS confirmed accessible.
- When source-file scan results or repo signals show datasets/accessions ARE declared in the code, CREDIT Data Disclosure and Dataset Resolvability — do NOT write "no accessions/datasets provided" when they appear in the repository.

WHAT 100% LOOKS LIKE (calibration anchor):
- A 100% package: every dataset listed with a resolvable accession/DOI + version + access method; all identifiers resolve with metadata matching the paper; code public + versioned (tagged release or pinned commit) + archived with a DOI + license + dependency manifest with pinned versions + tests + CI; every data-loading step and parameter value traceable to a cited source; a one-command reproducible environment with example data and checksums. Deduct from 100 ONLY for specific, verified missing elements — and say which element is missing.

Score the paper on these 7 dimensions. Each score is a CONTINUOUS integer 0-100.

CRITICAL SCORING INSTRUCTIONS:
- The numbered levels below are GUIDEPOSTS, not the only allowed values. Do NOT snap to them.
- Interpolate to any integer between guideposts based on the specific evidence. Two repos that both "lack a release" can still differ by 20+ points if one has a pinned commit, CI, tests, and a thorough README while the other is a bare dump.
- Reserve round numbers (0, 25, 50, 67, 75, 100) only when the evidence genuinely sits exactly on a guidepost. Otherwise pick the precise value the evidence warrants (e.g. 58, 72, 81).
- Differentiate aggressively: if two papers feel similar, find the concrete factors (README depth, license, commit pinning, parameter sourcing, dependency manifests, seeds, test data) that separate them and let the scores reflect that.

RUBRIC GUIDEPOSTS:
1. dataSourceScore [Data Disclosure, 18pts]: 100=all datasets listed with repo+accession+version+access+role; 75=most listed but some versions unclear; 50=Data Availability Statement exists but vague; 25=mentions data in prose only; 0=no disclosure. For simulation papers with no external datasets, score how completely the GENERATIVE inputs (rules, parameters, initial conditions, config files) are disclosed instead of penalizing for absent accessions.
2. datasetScore [Dataset Resolvability, 14pts]: 100=all identifiers resolve and metadata match paper; 67=most resolve with minor mismatches; 33=some resolve but key datasets inaccessible; 0=identifiers missing/broken/private. IMPORTANT: For rule-based/agent simulations that legitimately use NO external datasets, do not floor this at 0 for lacking accessions — instead judge resolvability of the synthetic-data definition: are the generative rules, parameter tables, and config fully specified and reconstructable (high) vs. described only in prose (low)?
3. reproducibilityScore [Code Availability & Versioning, 14pts]: 100=code public+versioned+archived (DOI/Zenodo)+documented; 67=code public but no release/commit/archive; 33=code exists but incomplete or stale; 0=no code or private. Interpolate within "public" based on: pinned commit/tag, license present, README depth, dependency manifest (requirements/package.json/Cargo.toml), tests/CI, issue activity. A bare public repo with no README ≈ 45-55; a public repo with pinned deps + thorough README + license but no archive ≈ 78-85.
4. citationScore [Code-to-Data Traceability, 18pts]: 100=every data-loading/input step maps to declared sources; 75=main paths traceable, minor gaps; 50=some traceability but important preprocessing unexplained; 25=code loads undeclared files; 0=cannot connect code to inputs
5. simulationClarityScore [Simulation Derivation Clarity, 18pts]: 100=every parameter, distribution, seed traceable; 75=main parameters traceable, some constants unclear; 50=some parameters explained, calibration incomplete; 25=many hard-coded unexplained values; 0=simulation behavior untraceable
6. reproPackageScore [Reproducibility Package Quality, 8pts]: 100=environment+workflow+test data+instructions+checksums present; 70=mostly runnable with minor gaps; 40=significant manual reconstruction required; 0=not practically runnable
7. informationTheoryScore [Information-Theoretic Rigor, 10pts]: How rigorously does the paper FORMALIZE AND QUANTIFY the information content of the system it models? This measures scientific-content rigor, NOT transparency — score it independently of data/code availability. Many of these papers model communication/coordination systems (ant/ACO pheromone stigmergy, bee waggle-dance signaling, firefly/Kuramoto synchronization, termite stigmergic construction, flocking/swarming) where information flow IS the phenomenon. Guideposts: 100=defines and quantifies the relevant information-theoretic measures with derivations or measurements — e.g. Shannon entropy of agent state/signal distributions, mutual information or transfer entropy between agents (directed information flow), channel capacity / communication bit rate of the signaling mechanism (bits per pheromone deposit, bits per dance, bits/sec), and how these scale with colony/population size or signal-to-noise; 75=quantifies at least one such measure rigorously but leaves others informal; 50=discusses information flow / communication capacity conceptually but never quantifies it; 25=communication or coordination is central yet treated purely mechanistically with no information-theoretic framing where it would clearly apply; 0=no information-theoretic content and the system does not plausibly call for it. IMPORTANT CALIBRATION: do NOT penalize a paper whose subject genuinely has no information-theoretic dimension (e.g. a pure phylogenetics or sequence-alignment pipeline) — for those, this dimension is not applicable and should be scored at a neutral midpoint (≈50) rather than 0, so a non-applicable topic neither rewards nor punishes. Reserve low scores for papers where information/communication is clearly central but left unquantified, and high scores for papers that actually do the information-theoretic math.

Return ONLY a valid JSON object:
{
  "overallScore": <weighted average: dim1*0.18 + dim2*0.14 + dim3*0.14 + dim4*0.18 + dim5*0.18 + dim6*0.08 + dim7*0.10>,
  "dataSourceScore": <0-100>,
  "datasetScore": <0-100>,
  "reproducibilityScore": <0-100>,
  "citationScore": <0-100>,
  "simulationClarityScore": <0-100>,
  "reproPackageScore": <0-100>,
  "informationTheoryScore": <0-100>,
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
  resolvedAccessions: ResolvedAccession[],
  repoSignals: string | null
): Promise<{ challengedItems: EvidenceItem[]; additionalGaps: string[] }> {
  const unresolvedAccessions = resolvedAccessions.filter(a => !a.resolved);
  const positiveItems = evidenceItems.filter(e => e.evidenceType === "positive");

  if (positiveItems.length === 0 && unresolvedAccessions.length === 0) {
    return { challengedItems: [], additionalGaps: [] };
  }

  const prompt = `You are auditing a bioinformatics paper's provenance claims for overclaiming and weak evidence.

Positive evidence claims:
${positiveItems.map(e => `- [${e.confidence}] ${e.claim} (span: "${e.span}")`).join("\n") || "None"}

Already-verified identifiers (these RESOLVED to a public record — do NOT question their existence or speculate they "may not resolve / may not be real"):
${resolvedAccessions.filter(a => a.resolved).map(a => `- ${a.identifier} (${a.repository})`).join("\n") || "None"}

Unresolved accessions (note: "rate-limited" entries were simply not checked this run — treat them as UNKNOWN, not as defects):
${unresolvedAccessions.map(a => `- ${a.identifier} (${a.repository}): ${a.problems.join("; ")}`).join("\n") || "None"}

${repoSignals ? `Verified code repository signals (fetched live from the GitHub API — authoritative ground truth):
${repoSignals}
` : "No code repository signals available."}

EVIDENCE DISCIPLINE — read before challenging anything:
- Only raise an issue you can POSITIVELY justify from the evidence above. If something simply was not checked, OMIT it — never present an unchecked item as a gap. False negatives destroy trust.
- FORBIDDEN unless the evidence positively shows a problem: claiming a repository is "not confirmed accessible", that a tag/release/archive is "not independently verified to exist", that a Zenodo↔GitHub cross-reference is "unconfirmed", that a license/hash is "not independently verified", or that no re-execution was performed. If repo signals are present, the repo IS confirmed accessible — do not challenge its accessibility.
- A DOI absent from Crossref is NOT a defect: Zenodo/figshare/Dryad are DataCite DOIs and are resolved separately. Do not flag a resolved DataCite DOI, and do not treat formatting artifacts in extracted IDs as evidence of "broken markup" in the deposit.
- Do not invent generic reproducibility caveats. Only challenge a SPECIFIC claim that the paper itself overstates relative to the cited span.

For each weak positive claim, determine if the evidence is actually direct, indirect, or overclaimed.
Identify any additional gaps not previously captured (subject to the discipline above).

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

  // Fetch live GitHub repo signals FIRST (prefer extracted repo URL, fall back to a
  // GitHub paperUrl). This also surfaces accession IDs declared inside source code,
  // which we then feed into resolution — so the review reflects the code, not just the PDF.
  const repoUrl = extraction.codeRepoUrl ?? (paperUrl && paperUrl.includes("github.com") ? paperUrl : null);
  const repoSignals = await fetchGithubRepoSignals(repoUrl);

  // Agent B: Resolve accessions (deterministic + API calls)
  const paperAccessions = extractAccessions(paperText);
  const allCandidateIds = [
    ...extraction.accessionCandidates,
    ...paperAccessions.map(a => a.identifier),
    ...(repoSignals?.accessions ?? []),
  ];
  // Deduplicate
  const uniqueIds = [...new Set(allCandidateIds)];
  const candidateObjects = uniqueIds.map(id => {
    const found = paperAccessions.find(a => a.identifier === id);
    return found ?? { identifier: id, repository: "Unknown (from repo source)", type: "unknown" };
  });

  const resolvedAccessions = await resolveAccessions(candidateObjects);

  // Agent D: Critic review (in parallel with Agent C)
  const [scores, criticResult] = await Promise.all([
    agentScorePaper(paperText, extraction.evidenceItems, resolvedAccessions, repoSignals?.text ?? null),
    agentCriticReview(extraction.evidenceItems, resolvedAccessions, repoSignals?.text ?? null),
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
    rubricVersion: RUBRIC_VERSION,
  };
}
