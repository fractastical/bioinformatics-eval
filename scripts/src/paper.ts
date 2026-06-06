/**
 * Build the "BioEval Reproducibility Report" as an arXiv-style preprint PDF.
 *
 * Unlike sendReport.ts (a colorful dashboard digest emailed weekly), this
 * produces a sober, single-column academic paper that (a) explains how the
 * whole BioEval system works and (b) presents the evaluations of the
 * computational-simulation corpus. It reports the RAW rubric v0.8.0 scores
 * straight from the database (all seven dimensions, including per-paper
 * Information-Theoretic Rigor) rather than the +20 calibrated README values.
 *
 * The overall column is recomputed here as the exact weighted mean of the
 * seven dimensions so the table is internally reproducible from the published
 * weights (the DB overall carries minor LLM-arithmetic noise).
 *
 *   pnpm --filter @workspace/scripts run paper        # writes scripts/bioeval_paper.pdf
 *
 * buildPaper()/generatePaperPdf() are exported so the Zenodo deposition can
 * bundle a freshly-generated paper alongside the source archive.
 */
import PDFDocument from "pdfkit";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const API_BASE = "http://localhost:80";

// The canonical corpus: the insect-swarm / agent-based simulation series.
export const PAPER_EVAL_IDS = [
  12, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47,
];

// Rubric v0.8.0 dimension weights (sum = 1.0). Single source of truth for the
// recomputed overall in this paper; mirrors RUBRIC_VERSION weights in
// artifacts/api-server/src/lib/paperPipeline.ts.
const WEIGHTS = {
  dataSourceScore: 0.18, // Data Disclosure
  datasetScore: 0.14, // Dataset Resolvability
  reproducibilityScore: 0.14, // Code Availability & Versioning
  citationScore: 0.18, // Code-to-Data Traceability
  simulationClarityScore: 0.18, // Simulation Derivation Clarity
  reproPackageScore: 0.08, // Reproducibility Package Quality
  informationTheoryScore: 0.1, // Information-Theoretic Rigor (orthogonal)
} as const;

export interface PaperEval {
  id: number;
  title: string;
  paperUrl: string | null;
  status: string;
  overallScore: number | null;
  dataSourceScore: number | null;
  datasetScore: number | null;
  reproducibilityScore: number | null;
  citationScore: number | null;
  simulationClarityScore: number | null;
  reproPackageScore: number | null;
  informationTheoryScore: number | null;
  rubricVersion: string | null;
  summary: string | null;
  findings: string | null;
  gaps: string | null;
  recommendations: string | null;
  dataSourcesFound: number | null;
  datasetsFound: number | null;
  citationsFound: number | null;
  codeRepoUrl: string | null;
  createdAt: string;
}

export async function fetchPaperEval(id: number): Promise<PaperEval> {
  const r = await fetch(`${API_BASE}/api/evaluations/${id}`);
  if (!r.ok) throw new Error(`Failed to fetch eval #${id}: ${r.status}`);
  return (await r.json()) as PaperEval;
}

// The seven scored dimensions (keys of WEIGHTS). Every one must be present and
// numeric for an eval to appear in the paper — the report claims to present the
// RAW seven-dimension v0.8.0 scores, so a missing dimension is a hard error, not
// a silent zero.
const DIMENSION_KEYS = Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[];
const REQUIRED_RUBRIC_VERSION = "0.8.0";

/** Read a dimension that MUST be a finite number; throw otherwise. */
function dim(ev: PaperEval, k: keyof typeof WEIGHTS): number {
  const v = ev[k] as number | null;
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(
      `Eval #${ev.id} has a missing/non-numeric "${k}" (${String(v)}); refusing to render it as 0.`,
    );
  }
  return v;
}

function weightedOverall(ev: PaperEval): number {
  let sum = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    sum += dim(ev, k as keyof typeof WEIGHTS) * w;
  }
  return sum;
}

// ---- Typography -------------------------------------------------------------

const INK = "#111418";
const MUTED = "#5b6470";
const RULE = "#c8ced6";
const HEAD = "#1a2230";
const MARGIN = 64;

const SERIF = "Times-Roman";
const SERIF_B = "Times-Bold";
const SERIF_I = "Times-Italic";
const SANS = "Helvetica";

function contentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - MARGIN * 2;
}

// Ensure there is room for `needed` pts before drawing; else new page.
function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > doc.page.height - MARGIN - 24) {
    doc.addPage();
  }
}

function sectionHeading(doc: PDFKit.PDFDocument, num: string, title: string): void {
  ensureSpace(doc, 40);
  doc.moveDown(0.6);
  doc
    .font(SERIF_B)
    .fontSize(12.5)
    .fillColor(HEAD)
    .text(`${num}  ${title}`, MARGIN, doc.y);
  doc.moveDown(0.25);
}

function subHeading(doc: PDFKit.PDFDocument, title: string): void {
  ensureSpace(doc, 28);
  doc.moveDown(0.25);
  doc.font(SERIF_I).fontSize(11).fillColor(HEAD).text(title, MARGIN, doc.y);
  doc.moveDown(0.1);
}

function body(doc: PDFKit.PDFDocument, text: string): void {
  doc
    .font(SERIF)
    .fontSize(10.5)
    .fillColor(INK)
    .text(text, MARGIN, doc.y, {
      width: contentWidth(doc),
      align: "justify",
      lineGap: 2.2,
    });
  doc.moveDown(0.45);
}

// ---- The seven dimensions (descriptive table content) -----------------------

const DIMENSIONS: Array<{ name: string; weight: string; tests: string }> = [
  {
    name: "Data Disclosure",
    weight: "18%",
    tests:
      "Whether the paper names the data it uses and declares its provenance, access conditions, and licensing — not merely asserting that data exists.",
  },
  {
    name: "Dataset Resolvability",
    weight: "14%",
    tests:
      "Whether declared datasets carry resolvable identifiers (accessions, DOIs, repository URLs) that actually resolve to the stated record.",
  },
  {
    name: "Code Availability & Versioning",
    weight: "14%",
    tests:
      "Whether the simulation code is publicly archived, versioned, and reachable at a stable location, with an explicit license.",
  },
  {
    name: "Code-to-Data Traceability",
    weight: "18%",
    tests:
      "Whether each computational step can be traced back to the specific data source and citation it depends on.",
  },
  {
    name: "Simulation Derivation Clarity",
    weight: "18%",
    tests:
      "Whether model parameters, assumptions, and update rules are derived transparently rather than asserted, so the simulation can be re-derived.",
  },
  {
    name: "Reproducibility Package Quality",
    weight: "8%",
    tests:
      "Whether a runnable package (environment spec, seeds, instructions) lets an independent reader reproduce the reported results.",
  },
  {
    name: "Information-Theoretic Rigor",
    weight: "10%",
    tests:
      "Whether the paper formalizes and quantifies the information content of the system it models. Orthogonal to transparency; non-applicable topics are scored at a neutral baseline (~50).",
  },
];

const REFERENCES: string[] = [
  "Shannon, C. E. (1948). A Mathematical Theory of Communication. Bell System Technical Journal, 27, 379–423, 623–656.",
  "Grassé, P.-P. (1959). La reconstruction du nid et les coordinations interindividuelles: la théorie de la stigmergie. Insectes Sociaux, 6, 41–80.",
  "Dorigo, M., & Stützle, T. (2004). Ant Colony Optimization. MIT Press.",
  "Kuramoto, Y. (1984). Chemical Oscillations, Waves, and Turbulence. Springer.",
  "Schreiber, T. (2000). Measuring Information Transfer. Physical Review Letters, 85(2), 461–464.",
  "Wilkinson, M. D., et al. (2016). The FAIR Guiding Principles for scientific data management and stewardship. Scientific Data, 3, 160018.",
  "Sandve, G. K., et al. (2013). Ten Simple Rules for Reproducible Computational Research. PLoS Computational Biology, 9(10), e1003285.",
];

// ---- PDF assembly -----------------------------------------------------------

function drawTitleBlock(doc: PDFKit.PDFDocument, dateStr: string): void {
  const author = process.env.ZENODO_CREATOR_NAME
    ? process.env.ZENODO_CREATOR_NAME.split(",").map((s) => s.trim()).reverse().join(" ")
    : "Joel Dietz";
  const orcid = process.env.ZENODO_CREATOR_ORCID;
  const affiliation = process.env.ZENODO_CREATOR_AFFILIATION;
  const cw = contentWidth(doc);

  doc
    .font(SANS)
    .fontSize(8.5)
    .fillColor(MUTED)
    .text("BIOEVAL REPRODUCIBILITY REPORT · PREPRINT · v0.8.0", MARGIN, MARGIN, {
      width: cw,
      align: "center",
      characterSpacing: 1.2,
    });
  doc.moveDown(0.9);

  doc
    .font(SERIF_B)
    .fontSize(19)
    .fillColor(INK)
    .text(
      "BioEval: An LLM-Driven Framework for Evaluating Dataset Transparency, Reproducibility, and Information-Theoretic Rigor in Computational Simulation Papers",
      MARGIN,
      doc.y,
      { width: cw, align: "center", lineGap: 1 },
    );
  doc.moveDown(0.7);

  doc
    .font(SERIF)
    .fontSize(11.5)
    .fillColor(INK)
    .text(author + (orcid ? `  (ORCID ${orcid})` : ""), MARGIN, doc.y, {
      width: cw,
      align: "center",
    });
  if (affiliation) {
    doc.moveDown(0.15);
    doc.font(SERIF_I).fontSize(10).fillColor(MUTED).text(affiliation, MARGIN, doc.y, {
      width: cw,
      align: "center",
    });
  }
  doc.moveDown(0.2);
  doc.font(SERIF).fontSize(9.5).fillColor(MUTED).text(dateStr, MARGIN, doc.y, {
    width: cw,
    align: "center",
  });
  doc.moveDown(0.9);
  doc.rect(MARGIN, doc.y, cw, 0.8).fillColor(RULE).fill();
  doc.moveDown(0.7);
}

function drawAbstract(doc: PDFKit.PDFDocument, n: number): void {
  const inset = 26;
  const w = contentWidth(doc) - inset * 2;
  doc
    .font(SERIF_B)
    .fontSize(10)
    .fillColor(HEAD)
    .text("Abstract", MARGIN + inset, doc.y, { width: w });
  doc.moveDown(0.2);
  const abstract =
    "Computational and agent-based simulation papers increasingly drive claims about " +
    "biological coordination — ant and termite stigmergy, honeybee colony dynamics, " +
    "firefly synchronization, and ant-colony optimization — yet their reproducibility is " +
    "rarely assessed systematically. Two failures recur: datasets and code are declared " +
    "without resolvable, verifiable provenance, and systems whose entire subject is " +
    "information flow are described mechanistically without ever quantifying that " +
    "information. BioEval is an LLM-driven evaluation framework that scores a paper on a " +
    "versioned seven-dimension rubric. Six dimensions measure conformance to good data " +
    "and reproducibility practice — data disclosure, dataset resolvability, code " +
    "availability and versioning, code-to-data traceability, simulation derivation " +
    "clarity, and reproducibility-package quality. A seventh, orthogonal dimension scores " +
    "Information-Theoretic Rigor: whether the paper formalizes and quantifies the " +
    "information content of the system it models (Shannon entropy, mutual and transfer " +
    "entropy, channel capacity, communication bit rate). Scores are grounded in verified " +
    "external evidence — resolved accessions and DOIs, live repository facts — rather than " +
    "the paper's own claims. We apply BioEval (rubric v0.8.0) to a corpus of " +
    `${n} insect-swarm and agent-based simulation projects. Transparency is uneven and ` +
    "reproducibility packaging is consistently weak; most strikingly, information-theoretic " +
    "rigor is systematically low even though communication and coordination are the modeled " +
    "phenomena. This deposition bundles the report together with the complete, MIT-licensed " +
    "source code of the evaluation system.";
  doc
    .font(SERIF)
    .fontSize(9.8)
    .fillColor(INK)
    .text(abstract, MARGIN + inset, doc.y, {
      width: w,
      align: "justify",
      lineGap: 1.8,
    });
  doc.moveDown(0.4);
  doc
    .font(SERIF_I)
    .fontSize(9.2)
    .fillColor(MUTED)
    .text(
      "Keywords: reproducibility · dataset transparency · information theory · agent-based simulation · stigmergy · swarm intelligence · code-to-data traceability · large language models · FAIR data",
      MARGIN + inset,
      doc.y,
      { width: w, align: "justify" },
    );
  doc.moveDown(0.6);
  doc.rect(MARGIN, doc.y, contentWidth(doc), 0.8).fillColor(RULE).fill();
}

function drawDimensionTable(doc: PDFKit.PDFDocument): void {
  const cw = contentWidth(doc);
  const wName = 150;
  const wWeight = 44;
  const wTests = cw - wName - wWeight;
  const padX = 6;

  ensureSpace(doc, 60);
  // header row
  let y = doc.y;
  doc.rect(MARGIN, y, cw, 18).fillColor("#eef1f5").fill();
  doc.font(SERIF_B).fontSize(9).fillColor(HEAD);
  doc.text("Dimension", MARGIN + padX, y + 5, { width: wName - padX });
  doc.text("Weight", MARGIN + wName, y + 5, { width: wWeight, align: "center" });
  doc.text("What it tests", MARGIN + wName + wWeight + padX, y + 5, {
    width: wTests - padX,
  });
  doc.y = y + 18;

  for (const d of DIMENSIONS) {
    doc.font(SERIF).fontSize(9).fillColor(INK);
    const testsH = doc.heightOfString(d.tests, { width: wTests - padX * 2, lineGap: 1.5 });
    const rowH = Math.max(testsH + 10, 22);
    ensureSpace(doc, rowH);
    y = doc.y;
    doc.rect(MARGIN, y, cw, rowH).strokeColor(RULE).lineWidth(0.5).stroke();
    doc.font(SERIF_B).fontSize(9).fillColor(INK).text(d.name, MARGIN + padX, y + 5, {
      width: wName - padX,
      lineGap: 1,
    });
    doc
      .font(SERIF)
      .fontSize(9)
      .fillColor(INK)
      .text(d.weight, MARGIN + wName, y + 5, { width: wWeight, align: "center" });
    doc
      .font(SERIF)
      .fontSize(9)
      .fillColor(INK)
      .text(d.tests, MARGIN + wName + wWeight + padX, y + 5, {
        width: wTests - padX * 2,
        lineGap: 1.5,
      });
    doc.y = y + rowH;
  }
  doc.moveDown(0.5);
}

function drawResultsTable(doc: PDFKit.PDFDocument, evals: PaperEval[]): void {
  const cw = contentWidth(doc);
  // columns: Title, Overall, DD, DR, CA, TR, SC, RP, IT
  const wTitle = cw - (38 + 30 * 6 + 32);
  const numCols = [
    { key: "overall", w: 38, label: "Ovr" },
    { key: "dataSourceScore", w: 30, label: "DD" },
    { key: "datasetScore", w: 30, label: "DR" },
    { key: "reproducibilityScore", w: 30, label: "CA" },
    { key: "citationScore", w: 30, label: "TR" },
    { key: "simulationClarityScore", w: 30, label: "SC" },
    { key: "reproPackageScore", w: 30, label: "RP" },
    { key: "informationTheoryScore", w: 32, label: "IT" },
  ];
  const padX = 4;

  const drawHeader = () => {
    const y = doc.y;
    doc.rect(MARGIN, y, cw, 16).fillColor("#1a2230").fill();
    doc.font(SERIF_B).fontSize(8).fillColor("#ffffff");
    doc.text("Simulation project", MARGIN + padX, y + 4, { width: wTitle - padX });
    let x = MARGIN + wTitle;
    for (const c of numCols) {
      doc.text(c.label, x, y + 4, { width: c.w, align: "center" });
      x += c.w;
    }
    doc.y = y + 16;
  };

  ensureSpace(doc, 50);
  drawHeader();

  evals.forEach((ev, idx) => {
    const title = ev.title.length > 52 ? ev.title.slice(0, 51) + "…" : ev.title;
    doc.font(SERIF).fontSize(8);
    const titleH = doc.heightOfString(title, { width: wTitle - padX * 2, lineGap: 1 });
    const rowH = Math.max(titleH + 8, 16);
    if (doc.y + rowH > doc.page.height - MARGIN - 24) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    if (idx % 2 === 1) doc.rect(MARGIN, y, cw, rowH).fillColor("#f4f6f9").fill();
    doc.font(SERIF).fontSize(8).fillColor(INK).text(title, MARGIN + padX, y + 4, {
      width: wTitle - padX * 2,
      lineGap: 1,
    });
    let x = MARGIN + wTitle;
    for (const c of numCols) {
      const val =
        c.key === "overall"
          ? weightedOverall(ev).toFixed(1)
          : String(Math.round(dim(ev, c.key as keyof typeof WEIGHTS)));
      doc.font(c.key === "overall" ? SERIF_B : SERIF).fontSize(8).fillColor(INK).text(
        val,
        x,
        y + 4,
        { width: c.w, align: "center" },
      );
      x += c.w;
    }
    doc.y = y + rowH;
  });
  doc.moveDown(0.3);
  doc
    .font(SERIF_I)
    .fontSize(8)
    .fillColor(MUTED)
    .text(
      "DD Data Disclosure · DR Dataset Resolvability · CA Code Availability · TR Code-to-Data Traceability · SC Simulation Clarity · RP Reproducibility Package · IT Information-Theoretic Rigor. Overall is the weighted mean of all seven dimensions. Scores are rubric v0.8.0 (0–100).",
      MARGIN,
      doc.y,
      { width: cw, align: "justify", lineGap: 1.2 },
    );
  doc.moveDown(0.5);
}

function firstSentences(text: string | null, max = 2): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  const parts = clean.match(/[^.!?]+[.!?]+/g);
  if (!parts) return clean.slice(0, 240);
  return parts.slice(0, max).join(" ").trim();
}

function firstBullet(text: string | null): string {
  if (!text) return "";
  const line = text
    .split("\n")
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .find((l) => l.length > 0);
  return line ? line.replace(/\s+/g, " ").trim() : "";
}

export async function buildPaper(evals: PaperEval[]): Promise<Buffer> {
  const ranked = [...evals].sort(
    (a, b) => weightedOverall(b) - weightedOverall(a),
  );
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: "A4", bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawTitleBlock(doc, dateStr);
    drawAbstract(doc, ranked.length);

    sectionHeading(doc, "1", "Introduction");
    body(
      doc,
      "Agent-based and computational simulations are now a primary vehicle for claims about " +
        "biological coordination: how ant and termite colonies self-organize through stigmergy, " +
        "how honeybee colonies allocate labor, how populations of fireflies synchronize, and how " +
        "ant-colony optimization transfers these mechanisms to engineering. The credibility of such " +
        "claims rests on two things that are easy to assert and hard to verify. First, the data and " +
        "code behind a simulation must be disclosed in a way that a reader can actually resolve and " +
        "re-run — declaring that a dataset 'is available' is not the same as providing a resolvable " +
        "accession, a versioned repository, and a runnable package. Second, when the modeled system " +
        "is itself a communication system, scientific rigor demands that the information it carries be " +
        "formalized and quantified, not merely narrated.",
    );
    body(
      doc,
      "BioEval addresses both gaps in a single instrument. It is an evaluation framework that submits a " +
        "paper (by URL or PDF), extracts its real text, gathers external evidence, and uses a large " +
        "language model to score the paper against a fixed, versioned rubric. The framework deliberately " +
        "separates two orthogonal questions: does the work conform to good data and reproducibility " +
        "practice, and — independently — does it bring information-theoretic rigor to a system whose very " +
        "subject is information flow? This report explains how the system works and presents its " +
        "evaluations of a corpus of insect-swarm and agent-based simulation projects.",
    );

    sectionHeading(doc, "2", "The BioEval Framework");
    subHeading(doc, "2.1  Pipeline");
    body(
      doc,
      "A submission is fetched through an SSRF-guarded path and its text is extracted from the real PDF " +
        "(via a pure-JavaScript pdf.js build); if too little text can be recovered — for example a scanned, " +
        "image-only document — the evaluation errors out with a stated reason rather than scoring garbage. " +
        "The extracted text is then analyzed by Anthropic's Claude in an evidence-gathering pass that " +
        "resolves declared identifiers against Crossref and DataCite and inspects any linked code " +
        "repository for live facts (license presence, releases, structure). Only after evidence is " +
        "collected does the model assign the seven dimension scores together with a structured set of " +
        "findings, gaps, and recommendations, all persisted and aggregated in a dashboard.",
    );
    subHeading(doc, "2.2  The seven dimensions");
    body(
      doc,
      "The rubric is versioned (currently v0.8.0, intentionally pre-1.0 while it is validated by reviewers) " +
        "and stamped onto every evaluation so scores remain interpretable as the rubric evolves. Each " +
        "dimension is scored 0–100 against fixed guideposts; the overall score is the weighted mean of all " +
        "seven, using the weights below.",
    );
    drawDimensionTable(doc);
    subHeading(doc, "2.3  Conformance to good data and reproducibility practice");
    body(
      doc,
      "Six of the seven dimensions measure whether a simulation accords with established good practice for " +
        "data and software. Data Disclosure and Dataset Resolvability test the FAIR ideal that data be " +
        "findable and accessible through identifiers that genuinely resolve — a declared dataset with no " +
        "resolvable accession scores poorly even if the prose claims openness. Code Availability & Versioning " +
        "and Reproducibility Package Quality test whether the software is archived, licensed, versioned, and " +
        "packaged so an independent reader can run it. Code-to-Data Traceability and Simulation Derivation " +
        "Clarity test the chain of custody from result back to source: can each computational step and model " +
        "parameter be traced to the specific data and citation it depends on, rather than asserted? Crucially, " +
        "these scores are anchored to verified external signals — a resolved DOI, a real license file detected " +
        "in the repository — and not to the paper's self-description; the framework does not credit unverifiable " +
        "claims, and does not invent gaps it cannot substantiate.",
    );
    subHeading(doc, "2.4  Code-to-data traceability");
    body(
      doc,
      "Beyond scoring, BioEval can accept the simulation's source code directly: the model segments the code and " +
        "maps each segment to the data source and citation it relies on, with a high/medium/low confidence " +
        "rating. This makes the dependency between a result and its inputs explicit and auditable, which is the " +
        "operational meaning of reproducibility for a simulation.",
    );

    sectionHeading(doc, "3", "Information-Theoretic Rigor");
    body(
      doc,
      "The seventh dimension is orthogonal to the other six: it measures scientific-content rigor rather than " +
        "transparency. Many papers in this domain model communication and coordination systems — pheromone " +
        "stigmergy in ants and termites, waggle-dance signaling in bees, phase coupling in firefly and Kuramoto " +
        "synchronization — where information flow is not a side effect but the phenomenon itself. For such " +
        "systems, rigor means formalizing that information: the Shannon entropy of agent state or signal " +
        "distributions, the mutual or transfer entropy that captures directed information flow between agents, " +
        "and the channel capacity or communication bit rate of the signaling mechanism (bits per pheromone " +
        "deposit, bits per dance, bits per second), including how these scale with colony size and " +
        "signal-to-noise.",
    );
    body(
      doc,
      "The guideposts reward papers that actually do this mathematics and penalize papers where communication is " +
        "central yet treated purely mechanistically. To avoid punishing work for which information theory is " +
        "simply not applicable — a pure phylogenetics or sequence-alignment pipeline, say — such topics are " +
        "scored at a neutral midpoint (~50) rather than zero, so non-applicability neither rewards nor punishes. " +
        "Because the dimension is orthogonal to transparency, a paper can be exemplary in data practice yet score " +
        "low here, and that contrast is itself the finding this report foregrounds.",
    );

    sectionHeading(doc, "4", "Evaluation Corpus and Method");
    body(
      doc,
      `We evaluated ${ranked.length} computational-simulation projects spanning ant, bee, termite, and firefly ` +
        "systems and ant-colony optimization, drawn from the insect-swarm simulation series. Every project was " +
        "scored under a single rubric version (v0.8.0) so the results are mutually comparable. Scores are " +
        "assigned by the language model against the fixed guideposts of Section 2, grounded in the external " +
        "evidence gathered during analysis. In the table below the overall column is recomputed as the exact " +
        "weighted mean of the seven dimensions, so each row is reproducible from the published weights.",
    );

    sectionHeading(doc, "5", "Results");
    subHeading(doc, "5.1  Score summary");
    drawResultsTable(doc, ranked);
    subHeading(doc, "5.2  Observations");
    body(
      doc,
      "Three patterns recur across the corpus. Transparency is uneven: code availability tends to be the " +
        "strongest dimension — most projects publish a repository — while reproducibility-package quality and " +
        "code-to-data traceability are consistently the weakest, meaning the code exists but cannot easily be " +
        "re-run or traced to its inputs. The headline finding is the systematically low Information-Theoretic " +
        "Rigor across projects whose entire subject is communication and coordination: even strong, transparent " +
        "simulations rarely quantify the information their agents exchange. The orthogonality of the rubric makes " +
        "this visible — high transparency and low information-theoretic rigor coexist in the same papers, marking " +
        "a concrete and addressable opportunity for the field.",
    );
    subHeading(doc, "5.3  Per-project synopsis");
    for (const ev of ranked) {
      ensureSpace(doc, 46);
      doc
        .font(SERIF_B)
        .fontSize(9.5)
        .fillColor(HEAD)
        .text(
          `${ev.title}  —  overall ${weightedOverall(ev).toFixed(1)} (IT ${Math.round(
            dim(ev, "informationTheoryScore"),
          )})`,
          MARGIN,
          doc.y,
          { width: contentWidth(doc) },
        );
      doc.moveDown(0.1);
      const synopsis = firstSentences(ev.summary, 2);
      const gap = firstBullet(ev.gaps);
      doc
        .font(SERIF)
        .fontSize(9.2)
        .fillColor(INK)
        .text(synopsis, MARGIN, doc.y, {
          width: contentWidth(doc),
          align: "justify",
          lineGap: 1.6,
        });
      if (gap) {
        doc.moveDown(0.1);
        doc
          .font(SERIF_I)
          .fontSize(9)
          .fillColor(MUTED)
          .text(`Principal gap: ${gap}`, MARGIN, doc.y, {
            width: contentWidth(doc),
            align: "justify",
            lineGap: 1.4,
          });
      }
      doc.moveDown(0.45);
    }

    sectionHeading(doc, "6", "Discussion");
    body(
      doc,
      "BioEval treats reproducibility as a property that must be demonstrated through resolvable evidence rather " +
        "than claimed in prose, and it adds a second axis — information-theoretic rigor — that is specific to the " +
        "communication systems this literature studies. The two axes are complementary: good data practice makes " +
        "a result checkable, while information-theoretic formalization makes it meaningful for systems whose " +
        "subject is information. Using a language model as the evaluator is what makes assessment at this breadth " +
        "tractable; fixed guideposts, evidence grounding, and a versioned rubric are what keep it disciplined.",
    );

    sectionHeading(doc, "7", "Limitations");
    body(
      doc,
      "Scores are produced by a language model and tend to snap to the discrete tiers defined by the guideposts; " +
        "feeding real, per-item external signals (resolved accessions, live repository facts) is what differentiates " +
        "otherwise-similar papers. The rubric is pre-1.0 and still under reviewer validation, so weights and " +
        "guideposts may change between versions — hence the stamped rubric version on every evaluation. The corpus " +
        "is domain-specific (insect-swarm and agent-based simulation), and the information-theoretic dimension is " +
        "calibrated for systems where information flow is central; its neutral-baseline treatment of non-applicable " +
        "topics is a deliberate, conservative choice rather than a measurement.",
    );

    sectionHeading(doc, "8", "Availability and Reproducibility");
    body(
      doc,
      "BioEval is released under the MIT license. The source repository is hosted at " +
        "github.com/fractastical/bioinformatics-eval, and this Zenodo deposition bundles the present report " +
        "together with a complete archive of the source code at the corresponding revision. The system is built " +
        "as a pnpm monorepo (React + Vite frontend, Express 5 API, PostgreSQL with Drizzle ORM, contract-first " +
        "OpenAPI/Orval codegen) and uses Anthropic Claude through Replit's AI integrations. The evaluation rubric " +
        "and the software are co-versioned at v0.8.0.",
    );

    sectionHeading(doc, "", "References");
    doc.moveDown(0.1);
    REFERENCES.forEach((r, i) => {
      ensureSpace(doc, 26);
      doc
        .font(SERIF)
        .fontSize(8.8)
        .fillColor(INK)
        .text(`[${i + 1}]  ${r}`, MARGIN, doc.y, {
          width: contentWidth(doc),
          align: "justify",
          lineGap: 1.3,
          indent: 0,
        });
      doc.moveDown(0.2);
    });

    // Footer with page numbers. Write inside the bottom margin band with
    // lineBreak:false so PDFKit does NOT treat the low y-position as an overflow
    // and auto-append a blank page (which would also misplace the footer onto
    // the new page).
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      // Writing at height-40 is below the bottom-margin boundary; with the normal
      // margin PDFKit treats it as overflow and appends a blank page. Drop this
      // page's bottom margin to 0 so the footer position is in-bounds, then write.
      doc.page.margins.bottom = 0;
      doc
        .font(SANS)
        .fontSize(7.5)
        .fillColor(MUTED)
        .text(
          `BioEval Reproducibility Report (preprint) · rubric v0.8.0 · page ${i + 1} of ${range.count}`,
          MARGIN,
          doc.page.height - 40,
          { width: contentWidth(doc), align: "center", lineBreak: false },
        );
    }

    doc.end();
  });
}

/** Fetch the corpus and render the paper to a Buffer. */
export async function generatePaperPdf(): Promise<Buffer> {
  const evals = await Promise.all(PAPER_EVAL_IDS.map(fetchPaperEval));

  // The paper claims to present the RAW, completed seven-dimension scores under a
  // single rubric version. Refuse to build if any eval would silently violate
  // that contract: wrong/absent status, wrong rubric version, or a missing
  // dimension. Better to fail loudly than ship a record contradicting its own
  // metadata.
  const problems: string[] = [];
  for (const e of evals) {
    if (e.status !== "complete") {
      problems.push(`#${e.id}: status="${e.status}" (expected "complete")`);
      continue;
    }
    if (e.rubricVersion !== REQUIRED_RUBRIC_VERSION) {
      problems.push(
        `#${e.id}: rubricVersion="${String(e.rubricVersion)}" (expected "${REQUIRED_RUBRIC_VERSION}")`,
      );
    }
    const missing = DIMENSION_KEYS.filter(
      (k) => typeof e[k] !== "number" || !Number.isFinite(e[k] as number),
    );
    if (missing.length > 0) {
      problems.push(`#${e.id}: missing dimension(s) ${missing.join(", ")}`);
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `Cannot build paper — corpus failed the raw v${REQUIRED_RUBRIC_VERSION} ` +
        `seven-dimension contract:\n  ${problems.join("\n  ")}`,
    );
  }

  return buildPaper(evals);
}

async function main(): Promise<void> {
  console.log(`Fetching ${PAPER_EVAL_IDS.length} evaluations...`);
  const pdf = await generatePaperPdf();
  const outPath = path.join(process.cwd(), "bioeval_paper.pdf");
  fs.writeFileSync(outPath, pdf);
  console.log(`Paper saved: ${outPath} (${(pdf.length / 1024).toFixed(0)} KB)`);
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
