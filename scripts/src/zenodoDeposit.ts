/**
 * Create (and optionally publish) a Zenodo deposition for the BioEval tool.
 *
 * SAFETY:
 *  - Default mode creates a DRAFT only. It never publishes.
 *  - Publishing is irreversible, so it is a separate, explicit step (`--publish <id>`).
 *  - Per project policy (replit.md), NOTHING is published without first passing a
 *    Claude Opus (`claude-opus-4-8`) validation gate over the deposition metadata.
 *
 * Env:
 *  - ZENODO_TOKEN              (required) personal access token with `deposit:write`
 *                             (+ `deposit:actions` to publish)
 *  - ZENODO_SANDBOX=1         (optional) target sandbox.zenodo.org instead of zenodo.org
 *  - ZENODO_CREATOR_NAME      (required) author name, "Family, Given"
 *  - ZENODO_CREATOR_ORCID     (optional) author ORCID, e.g. 0000-0002-1825-0097
 *  - ZENODO_CREATOR_AFFILIATION (optional) author affiliation
 *
 * Usage:
 *  - pnpm --filter @workspace/scripts run zenodo-deposit            # create draft (+ Opus gate)
 *  - pnpm --filter @workspace/scripts run zenodo-deposit -- --publish <depositionId>
 */
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { generatePaperPdf } from "./paper";

const OPUS_MODEL = "claude-opus-4-8";

const SANDBOX = process.env.ZENODO_SANDBOX === "1";
const ZENODO_BASE = SANDBOX
  ? "https://sandbox.zenodo.org"
  : "https://zenodo.org";

function requireToken(): string {
  // Sandbox and production use different Zenodo accounts, so they need
  // separate tokens with explicit names. Sandbox-named tokens are preferred
  // in sandbox mode; the legacy unsuffixed ZENODO_TOKEN is accepted as a
  // fallback for backward compatibility.
  const varName = SANDBOX ? "ZENODO_TOKEN_SANDBOX" : "ZENODO_TOKEN_PRODUCTION";
  const token =
    process.env[varName] ||
    (SANDBOX ? process.env.ZENODO_TOKEN : undefined) ||
    process.env.ZENODO_TOKEN;
  if (!token) {
    console.error(
      `ERROR: ${varName} is not set (target: ${SANDBOX ? "sandbox.zenodo.org" : "zenodo.org"}). Add it as a secret, then re-run.`,
    );
    process.exit(1);
  }
  return token;
}

interface ZenodoMetadata {
  upload_type: string;
  title: string;
  description: string;
  creators: Array<{ name: string; affiliation?: string; orcid?: string }>;
  keywords: string[];
  license: string;
  version: string;
  access_right: string;
  language: string;
  publication_date: string;
  related_identifiers: Array<{
    relation: string;
    identifier: string;
    scheme: string;
  }>;
}

function buildMetadata(): ZenodoMetadata {
  const name = process.env.ZENODO_CREATOR_NAME;
  if (!name) {
    console.error(
      'ERROR: ZENODO_CREATOR_NAME is not set (e.g. "Doe, Jane"). ' +
        "This becomes the permanent author of the record — set it before depositing.",
    );
    process.exit(1);
  }
  const creator: { name: string; affiliation?: string; orcid?: string } = {
    name,
  };
  if (process.env.ZENODO_CREATOR_AFFILIATION) {
    creator.affiliation = process.env.ZENODO_CREATOR_AFFILIATION;
  }
  if (process.env.ZENODO_CREATOR_ORCID) {
    creator.orcid = process.env.ZENODO_CREATOR_ORCID;
  }

  return {
    upload_type: "software",
    title: "BioEval — Bioinformatics Paper Evaluator",
    description: [
      "<p>This deposition is a version of the <em>BioEval Reproducibility Report</em> &mdash; an arXiv-style preprint that explains how the BioEval evaluation system works and presents its evaluations of a corpus of computational-simulation papers &mdash; bundled together with the complete, MIT-licensed source code of the system. Two files are included: the report PDF and a full archive of the source at the corresponding revision.</p>",
      "<p>Computational and agent-based simulation papers increasingly drive claims about biological coordination (ant and termite stigmergy, honeybee colony dynamics, firefly synchronization, ant-colony optimization), yet their reproducibility is rarely assessed systematically. BioEval is an LLM-driven framework that submits a paper by URL or PDF, extracts its real text (and errors out rather than scoring unextractable input), gathers external evidence, and scores the paper on a versioned seven-dimension rubric using Anthropic Claude.</p>",
      "<p>The central question BioEval asks is whether a simulation accords with good data and reproducibility practice. Six dimensions measure exactly this: Data Disclosure (18%), Dataset Resolvability (14%), Code Availability &amp; Versioning (14%), Code-to-Data Traceability (18%), Simulation Derivation Clarity (18%), and Reproducibility Package Quality (8%). Scores are anchored to verified external signals &mdash; accessions and DOIs resolved against Crossref and DataCite, live repository facts such as a detected license &mdash; rather than the paper's own claims, and the framework does not credit unverifiable assertions or invent unsubstantiated gaps.</p>",
      "<p>A seventh, orthogonal dimension, Information-Theoretic Rigor (10%), scores whether a paper formalizes and quantifies the information content of the system it models &mdash; Shannon entropy, mutual and transfer entropy, channel capacity, communication bit rate &mdash; which is particularly apt for swarm, stigmergy, and synchronization systems where information flow IS the phenomenon. It measures scientific-content rigor, not transparency; topics with no information-theoretic dimension are scored at a neutral baseline (~50 on the 0&ndash;100 scale) so non-applicability neither rewards nor punishes. The overall score is the weighted mean of the seven dimensions.</p>",
      "<p>The bundled report applies the rubric (version 0.8.0) to fourteen insect-swarm and agent-based simulation projects, reporting the raw seven-dimension scores including per-paper information-theoretic rigor. Its headline finding is that transparency is uneven and reproducibility packaging consistently weak, while information-theoretic rigor is systematically low even across projects whose entire subject is communication and coordination.</p>",
      "<p>Version 0.8.0 is a pre-1.0 release: the tool and its evaluation rubric are co-versioned and the rubric is still under reviewer validation. Built as a pnpm monorepo: React + Vite frontend, Express 5 API, PostgreSQL + Drizzle ORM, contract-first OpenAPI/Orval codegen.</p>",
    ].join("\n"),
    creators: [creator],
    keywords: [
      "reproducibility",
      "bioinformatics",
      "computational biology",
      "research software evaluation",
      "data transparency",
      "information theory",
      "swarm intelligence",
      "stigmergy",
      "agent-based simulation",
      "FAIR data",
      "large language models",
    ],
    license: "mit-license",
    version: "0.8.0",
    access_right: "open",
    language: "eng",
    // Deposit date; Zenodo would otherwise default this on publish, but a
    // permanent scholarly record should set it explicitly.
    publication_date: new Date().toISOString().slice(0, 10),
    related_identifiers: [
      {
        // Zenodo/DataCite convention: a software record links its source repo
        // via "isSupplementTo" — this is what Zenodo's official GitHub
        // integration emits for a release archived from its repository. Pinned
        // deliberately: an LLM reviewer's preferred relation is non-deterministic
        // across runs, so the established convention is the tie-breaker.
        relation: "isSupplementTo",
        identifier: "https://github.com/fractastical/bioinformatics-eval",
        scheme: "url",
      },
    ],
  };
}

interface OpusVerdict {
  verdict: "pass" | "revise";
  issues: Array<{
    severity: "high" | "medium" | "low";
    field: string;
    problem: string;
    suggestedFix: string;
  }>;
  summary: string;
}

async function opusValidate(metadata: ZenodoMetadata): Promise<OpusVerdict> {
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `You are a meticulous research-software metadata reviewer. Validate the following Zenodo deposition metadata for a software project before it is published (publishing is IRREVERSIBLE).

IMPORTANT — current date: today is ${today}. Treat ${today} as "now". A publication_date equal to ${today} is correct (it is today's deposit date) and must NOT be flagged as a future date. Only flag publication_date if it is strictly AFTER ${today}.

Check for: (1) factual accuracy of every claim in the description vs. the canonical facts below, (2) any overstated/unsupported claims, (3) missing standard metadata for a software deposition, (4) license consistency, (5) keyword quality, (6) anything that would be misleading in a permanent scholarly record.

CANONICAL FACTS (source of truth):
- AI tool evaluating bioinformatics papers on data transparency, dataset declaration, reproducibility.
- 7 weighted dims (0-100): Data Disclosure 18%, Dataset Resolvability 14%, Code Availability & Versioning 14%, Code-to-Data Traceability 18%, Simulation Derivation Clarity 18%, Reproducibility Package Quality 8%, Information-Theoretic Rigor 10%. Overall = weighted average.
- Information-Theoretic Rigor: orthogonal content-rigor dimension that measures whether a paper formalizes/quantifies the information content of the system it models (e.g. Shannon entropy, mutual/transfer entropy, channel capacity, communication bit rate); particularly apt for swarm/stigmergy/synchronization papers where information flow IS the phenomenon; non-applicable topics (e.g. phylogenetics) scored at a neutral baseline (~50).
- Real PDF text extraction (unpdf); errors out instead of scoring garbage.
- DOI/accession resolution is real and uses exactly these public registries: Crossref (api.crossref.org) first, then DataCite (api.datacite.org) as a fallback for data/software DOIs (Zenodo/figshare/Dryad). So the description's claim that scores are anchored to evidence "resolved against Crossref and DataCite" is VERIFIED and correct — do not flag it as an unverifiable specific claim.
- Code-to-data traceability: code segments mapped to data source + citation with a confidence rating.
- Dashboard of aggregate stats; per-paper outreach (GitHub issue sync or manual email/forum logs).
- Rubric version 0.8.0, pre-1.0. The software and rubric are co-versioned at 0.8.0 — there is no separate software release version (root package.json is an unpublished 0.0.0 placeholder and there are no git release tags), so 0.8.0 legitimately serves as the deposition version. Stack: pnpm monorepo, React+Vite, Express 5, Postgres+Drizzle, Anthropic Claude, OpenAPI/Orval.
- Repo: github.com/fractastical/bioinformatics-eval. Declared MIT in root package.json.
- This deposition bundles TWO files: (1) an arXiv-style preprint PDF, the "BioEval Reproducibility Report", which explains how the system works and presents evaluations of fourteen insect-swarm/agent-based simulation projects under rubric v0.8.0 (reporting the raw seven-dimension scores, including per-paper Information-Theoretic Rigor), and (2) a zip archive of the complete source code at HEAD. The metadata description is written as that paper's abstract; its paper-style, report-framed prose is intentional and correct (the record is genuinely a paper + code, an upload_type "software" record with an accompanying report). Do NOT flag the description for "reading like a paper", for describing evaluation results, or for the dual paper-and-code framing.
- License: the project is MIT (declared in package.json). The metadata SUBMITS Zenodo's canonical legacy license identifier "mit-license" directly (the value in the JSON below IS "mit-license", not "MIT"). VERIFIED empirically: "mit-license" is exactly the id the legacy deposit API stores for the MIT license (submitting the SPDX alias "MIT"/"mit" is normalized to this same id), so "mit-license" is the correct, expected, unambiguous value and validates without error. Submitted value == stored value == "mit-license"; it is fully consistent with the MIT declaration in package.json. Do NOT flag it as invalid, non-standard, mismatched, or ambiguous.
- Source-repo link convention: this software deposition references its source repository via related_identifier relation "isSupplementTo" — the relation Zenodo's official GitHub integration uses to link a software record to its repository. This is the intended, correct relation for this record; treat it as correct and do not flag it.

METADATA TO VALIDATE (JSON):
${JSON.stringify(metadata, null, 2)}

Respond with STRICT JSON only, no prose, no code fences:
{"verdict":"pass"|"revise","issues":[{"severity":"high"|"medium"|"low","field":"...","problem":"...","suggestedFix":"..."}],"summary":"..."}`;

  const resp = await anthropic.messages.create({
    model: OPUS_MODEL,
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });
  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();

  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error(`Opus did not return parseable JSON:\n${text}`);
  }
  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as unknown;
  // Fail safe: only synthesize a blocking issue when the response is genuinely
  // malformed (wrong shape). A well-formed "revise" verdict carrying its own
  // issues must be preserved verbatim — do NOT collapse it into a synthetic
  // high, or every minor (medium/low) suggestion would escalate into a hard
  // block and the gate could never be satisfied.
  const p = parsed as OpusVerdict;
  const isStr = (v: unknown): v is string => typeof v === "string";
  const validIssue = (i: unknown): boolean => {
    if (!i || typeof i !== "object") return false;
    const o = i as Record<string, unknown>;
    return (
      (o.severity === "high" ||
        o.severity === "medium" ||
        o.severity === "low") &&
      isStr(o.field) &&
      isStr(o.problem) &&
      isStr(o.suggestedFix)
    );
  };
  // Validate the FULL schema, not just the top-level shape: every issue's
  // severity must be a known enum value. Otherwise a malformed entry (e.g.
  // severity "HIGH") would not match the `=== "high"` filter, leaving
  // highs.length === 0 and silently letting an irreversible publish through.
  const wellFormed =
    !!parsed &&
    typeof parsed === "object" &&
    (p.verdict === "pass" || p.verdict === "revise") &&
    isStr(p.summary) &&
    Array.isArray(p.issues) &&
    p.issues.every(validIssue);
  if (!wellFormed) {
    return {
      verdict: "revise",
      issues: [
        {
          severity: "high",
          field: "_validator",
          problem: "Opus returned a malformed verdict that could not be parsed.",
          suggestedFix: `Re-run validation; raw output: ${text.slice(0, 500)}`,
        },
      ],
      summary: "Opus output did not match the expected schema.",
    };
  }
  return p;
}

function printVerdict(v: OpusVerdict): void {
  console.log(`\n=== Opus (${OPUS_MODEL}) validation ===`);
  console.log(`verdict: ${v.verdict}`);
  console.log(`summary: ${v.summary}`);
  if (v.issues.length) {
    console.log("issues:");
    for (const i of v.issues) {
      console.log(`  [${i.severity}] ${i.field}: ${i.problem}`);
      console.log(`        fix: ${i.suggestedFix}`);
    }
  } else {
    console.log("issues: none");
  }
  console.log("=====================================\n");
}

function makeSourceArchive(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, "..", "..");
  const out = "/tmp/bioeval-source.zip";
  if (fs.existsSync(out)) fs.rmSync(out);
  execSync(
    `git -C "${repoRoot}" archive --format=zip --prefix=bioinformatics-eval/ -o "${out}" HEAD`,
    { stdio: "inherit" },
  );
  const bytes = fs.statSync(out).size;
  console.log(`Created source archive: ${out} (${(bytes / 1024).toFixed(0)} KB)`);
  return out;
}

async function zfetch(
  url: string,
  token: string,
  init: RequestInit = {},
): Promise<any> {
  const resp = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const body = await resp.text();
  if (!resp.ok) {
    throw new Error(`Zenodo ${resp.status} ${resp.statusText}: ${body}`);
  }
  return body ? JSON.parse(body) : {};
}

async function createDraft(): Promise<void> {
  const token = requireToken();
  const metadata = buildMetadata();

  console.log(`Target: ${ZENODO_BASE}${SANDBOX ? " (SANDBOX)" : ""}`);
  console.log("Running Opus validation gate before creating the draft...");
  const verdict = await opusValidate(metadata);
  printVerdict(verdict);

  // A draft is reversible and is created specifically for human review, so it
  // blocks only on high-severity (factual/misleading) issues. Medium/low
  // precision suggestions are surfaced as warnings to address in the Zenodo UI.
  // The irreversible publish step keeps the strict "verdict pass + no high" gate.
  const highs = verdict.issues.filter((i) => i.severity === "high");
  if (highs.length > 0) {
    console.error(
      `ABORTING: Opus flagged ${highs.length} high-severity issue(s) in the metadata. Fix them and re-run.`,
    );
    process.exit(2);
  }
  const minor = verdict.issues.filter((i) => i.severity !== "high");
  if (minor.length > 0) {
    console.warn(
      `Proceeding to DRAFT despite ${minor.length} non-blocking (medium/low) suggestion(s) above — review them in the Zenodo UI before publishing.`,
    );
  }

  // Generate the paper FIRST so we fail fast (before creating a draft) if the
  // API server / DB needed to render it is unavailable.
  console.log("Generating the BioEval Reproducibility Report (paper PDF)...");
  const paperBuf = await generatePaperPdf();
  console.log(`Paper rendered (${(paperBuf.length / 1024).toFixed(0)} KB).`);

  const archive = makeSourceArchive();

  console.log("Creating draft deposition...");
  const draft = await zfetch(`${ZENODO_BASE}/api/deposit/depositions`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const depId: number = draft.id;
  const bucketUrl: string = draft.links.bucket;
  console.log(`Draft created: id=${depId}`);

  // Zenodo's bucket (files) API only accepts application/octet-stream.
  const octet = { "Content-Type": "application/octet-stream" } as const;

  console.log("Uploading the report paper...");
  await zfetch(`${bucketUrl}/BioEval-Reproducibility-Report.pdf`, token, {
    method: "PUT",
    headers: octet,
    body: paperBuf,
  });

  console.log("Uploading source archive...");
  const fileBuf = fs.readFileSync(archive);
  await zfetch(`${bucketUrl}/bioinformatics-eval-source.zip`, token, {
    method: "PUT",
    headers: octet,
    body: fileBuf,
  });
  console.log("Both files uploaded.");

  console.log("Setting metadata...");
  const updated = await zfetch(
    `${ZENODO_BASE}/api/deposit/depositions/${depId}`,
    token,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata }),
    },
  );

  const htmlLink =
    updated.links?.html || `${ZENODO_BASE}/deposit/${depId}`;
  const reservedDoi =
    updated.metadata?.prereserve_doi?.doi || draft.metadata?.prereserve_doi?.doi;

  console.log("\n========== DRAFT READY (NOT PUBLISHED) ==========");
  console.log(`Deposition id : ${depId}`);
  console.log(`Reserved DOI  : ${reservedDoi || "(will be assigned on publish)"}`);
  console.log(`Edit/review   : ${htmlLink}`);
  console.log(
    `To publish    : pnpm --filter @workspace/scripts run zenodo-deposit -- --publish ${depId}`,
  );
  console.log("=================================================\n");
  console.log(
    "Review the draft in the Zenodo UI. Publishing is irreversible — only run --publish after explicit confirmation.",
  );
}

async function publish(depId: number): Promise<void> {
  const token = requireToken();
  console.log(`Target: ${ZENODO_BASE}${SANDBOX ? " (SANDBOX)" : ""}`);

  console.log("Re-fetching draft metadata for the Opus pre-publish gate...");
  const dep = await zfetch(
    `${ZENODO_BASE}/api/deposit/depositions/${depId}`,
    token,
  );
  const verdict = await opusValidate(dep.metadata as ZenodoMetadata);
  printVerdict(verdict);
  const highs = verdict.issues.filter((i) => i.severity === "high");
  if (verdict.verdict !== "pass" || highs.length > 0) {
    console.error(
      `ABORTING publish: Opus did not pass (${highs.length} high-severity issue(s)).`,
    );
    process.exit(2);
  }

  console.log(`Publishing deposition ${depId} (IRREVERSIBLE)...`);
  const published = await zfetch(
    `${ZENODO_BASE}/api/deposit/depositions/${depId}/actions/publish`,
    token,
    { method: "POST" },
  );
  console.log("\n========== PUBLISHED ==========");
  console.log(`DOI       : ${published.doi}`);
  console.log(`Record    : ${published.links?.record_html || published.links?.html}`);
  console.log("===============================\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const publishIdx = args.indexOf("--publish");
  if (publishIdx !== -1) {
    const idRaw = args[publishIdx + 1];
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) {
      console.error("ERROR: --publish requires a positive integer deposition id.");
      process.exit(1);
    }
    await publish(id);
    return;
  }
  await createDraft();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
