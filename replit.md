# BioEval — Bioinformatics Paper Evaluator

An AI-powered tool for evaluating bioinformatics research papers on data transparency, dataset declaration, and computational reproducibility. Researchers paste a URL or upload a PDF; Claude analyzes the paper and scores it across seven dimensions (six transparency/reproducibility dimensions plus one information-theoretic rigor dimension). Users can also paste simulation code to trace each code segment back to the data sources and citations it depends on.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port from env)
- `pnpm --filter @workspace/biopaper-eval run dev` — run the frontend (port from env)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run regen-report` — (re)generate `scripts/bee_ant_report.pdf` only, no email
- `pnpm --filter @workspace/scripts run send-report` — generate the PDF AND email it to jdietz@mit.edu (use with care)
- `pnpm --filter @workspace/scripts run outreach-digest -- --dry-run` — build the weekly outreach digest and print the HTML (no email)
- `pnpm --filter @workspace/scripts run outreach-digest` — re-sync every GitHub feedback issue and email the weekly outreach digest to jdietz@mit.edu (intended to run weekly via a Scheduled Deployment)
- `pnpm --filter @workspace/scripts run zenodo-deposit` — create a Zenodo **draft** deposition of the source code (HEAD git archive) behind the Opus validation gate; never publishes
- `pnpm --filter @workspace/scripts run zenodo-deposit -- --publish <id>` — **publish** an existing draft (IRREVERSIBLE); requires a strict gate pass + explicit user confirmation
- Required env: `DATABASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind + shadcn/ui + wouter
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- AI: Anthropic Claude (via Replit AI Integrations, no user API key required)
- PDF text extraction: `unpdf` (bundled pure-JS pdf.js — no native deps, bundles cleanly under esbuild)
- Validation: Zod, drizzle-zod
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/evaluations.ts` — evaluation table schema
- `lib/db/src/schema/codeAnalyses.ts` — code analysis table schema
- `lib/db/src/schema/outreach.ts` — outreach + outreach_feedback tables (per-paper outreach tracking)
- `artifacts/api-server/src/routes/outreach.ts` — outreach CRUD + GitHub sync + manual feedback routes
- `artifacts/api-server/src/lib/github.ts` — GitHub issue/comment fetch via the Replit `github` connector proxy
- `scripts/src/outreachDigest.ts` — weekly outreach digest: re-syncs GitHub feedback issues + emails jdietz@mit.edu a status table
- `scripts/src/zenodoDeposit.ts` — Zenodo source-code deposition (HEAD git archive) gated by an Opus metadata review; draft-only by default, publish behind `--publish <id>`
- `artifacts/biopaper-eval/src/components/outreach-tab.tsx` — Outreach tab UI on the evaluation detail page
- `lib/integrations-anthropic-ai/` — Anthropic AI client + batch utilities
- `artifacts/api-server/src/routes/evaluations.ts` — evaluation + stats routes
- `artifacts/api-server/src/routes/codeAnalyses.ts` — code analysis routes
- `artifacts/biopaper-eval/src/` — React frontend

## Architecture decisions

- Anthropic Claude analyzes papers async (fire-and-forget after API response) so the UI responds instantly and polls for results
- PDF text is really extracted (via `unpdf`) for both uploads and URL-linked PDFs — no placeholder/metadata-only scoring. If extraction yields too little text (e.g. scanned images), the evaluation is set to `status: "error"` with the reason in `summary` instead of scoring garbage
- PDF upload is handled outside of Orval codegen (multipart/form-data at `/api/evaluations/upload`) since Orval generates broken File/Blob types server-side
- Upload + URL fetch are hardened: multer size limit (25MB) + MIME/extension filter + `%PDF` magic-byte check; arbitrary URL fetches go through `safeFetch` (SSRF guard: blocks private/loopback/link-local/ULA/IPv4-mapped targets, re-validates every redirect hop, request timeout + capped streaming download)
- App-level: locked CORS (allowlist from `REPLIT_DOMAINS`/`REPLIT_DEV_DOMAIN`), 1MB body limits, `express-rate-limit` (300/min, `trust proxy` 1), central error handler
- Simulation code is broken into segments by Claude and each segment is mapped to a data source + citation with a confidence score (high/medium/low)
- Zod is used for route-level validation in route handlers (not from api-zod codegen) to avoid esbuild bundle issues with `zod/v4` subpath
- DB schema includes `extractedText` for caching fetched paper content on re-runs

## Product

- Submit a bioinformatics paper by URL or PDF upload
- AI scores the paper on 7 weighted dimensions (each 0-100): Data Disclosure (15%), Dataset Resolvability (12%), Code Availability & Versioning (12%), Code-to-Data Traceability (15%), Simulation Derivation Clarity (14%), Reproducibility Package Quality (7%), Information-Theoretic Rigor (25%). overallScore is the weighted average. (Rubric v0.9.0 elevated Information-Theoretic Rigor from 10% to 25% as a first-class axis; the published v0.8.0 Zenodo deposition used the prior 18/14/14/18/18/8/10 split.)
- Information-Theoretic Rigor measures whether the paper formalizes/quantifies the information content of the system it models (Shannon entropy, mutual/transfer entropy, channel capacity / communication bit rate) — apt for swarm/stigmergy/synchronization papers where information flow IS the phenomenon. It scores scientific-content rigor, NOT transparency (orthogonal to the other six). Topics with no information-theoretic dimension (e.g. phylogenetics) are scored at a neutral ~50 so non-applicability neither rewards nor punishes
- Full report with findings, gaps, and recommendations
- Submit simulation code against a paper — Claude breaks it into segments and maps each to a data source and citation
- Dashboard showing aggregate stats across all evaluated papers
- Per-paper Outreach tab: link a GitHub feedback issue (auto-pulls issue state + comments as responses) or log email/forum contacts with manual notes/replies

## User preferences

- Before anything is **published** to an external system (e.g. minting/publishing a Zenodo record), run a validation pass through Claude Opus (`claude-opus-4-8`) first. Never publish without an Opus review gate. The day-to-day evaluation pipeline still runs on `claude-sonnet-4-6`; Opus is the pre-publish validator.
- Zenodo: create depositions as **drafts** via the API and present them for review; only publish (irreversible) after explicit user confirmation AND a passing Opus validation.

## Gotchas

- Use `zod` not `zod/v4` in api-server routes (esbuild can't resolve the subpath export)
- After OpenAPI spec changes, always re-run codegen before starting the frontend workflow
- The Anthropic integration env vars (`AI_INTEGRATIONS_ANTHROPIC_BASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY`) are auto-provisioned by Replit — never ask the user for them
- PDF file upload: frontend uses native `fetch` with FormData to POST `/api/evaluations/upload` (not a generated hook)
- A failed/blocked submission still returns 201 (work is async); the failure surfaces later as `status: "error"` with the reason in `summary` — the UI must handle the error status, not assume 201 == success
- `markEvalError` nulls out all score/result columns so a failed rerun can't leave stale success data behind
- Report scripts: `sendReport.ts` only triggers email when run **directly** (guarded by an `import.meta.url` check) so it can be safely imported. `regenReport.ts` imports `buildPDF` and writes the PDF with **no email**.
- Outreach sync is idempotent: `outreach_feedback` has a unique index on `(outreach_id, external_id)` and sync uses `onConflictDoNothing` so re-syncs never duplicate GitHub comments. Status is monotonic — sync never downgrades a record already `responded`/`closed`.
- Mounted sub-routers (`outreach.ts`, `codeAnalyses.ts`) use `Router({ mergeParams: true })`; Express 5 types parent-supplied `req.params` as `{}`, so cast via `(req.params as Record<string, string>).id`
- The regenerated PDF injects the **published README calibrated scores** (hardcoded per eval id in `regenReport.ts`), NOT the live DB scores — the README diverged from the DB before the +20 calibration, so the DB values are intentionally overridden to keep README/issues/PDF consistent. Narrative text (summary/findings/gaps/recommendations) still comes from the DB.
- Zenodo deposition (`zenodoDeposit.ts`): sandbox vs production are separate token/host worlds. `ZENODO_SANDBOX=1` targets sandbox.zenodo.org using `ZENODO_TOKEN_SANDBOX`; unset/`0` targets production zenodo.org using `ZENODO_TOKEN_PRODUCTION`. NOTE: `ZENODO_SANDBOX=1` is set in this workspace's environment, so an unqualified run goes to **sandbox** — you must explicitly pass `ZENODO_SANDBOX=0` to deposit/publish to **production** (the first production record is DOI 10.5281/zenodo.20567720). The deposition bundles TWO files: the arXiv-style report PDF (built by `scripts/src/paper.ts`, raw rubric v0.9.0 scores) and the source zip. The `license` field submits `"mit-license"` (Zenodo's canonical legacy id) directly, NOT the `"MIT"` alias — submitting the alias makes the Opus publish gate escalate a "submitted MIT, stored mit-license" mismatch to a blocking high. Author is set via `ZENODO_CREATOR_NAME` / `ZENODO_CREATOR_ORCID`. The gate is asymmetric by reversibility: **draft** creation blocks only on Opus high-severity issues (warns on medium/low); **publish** stays strict (Opus `verdict: pass` + zero high). The validator prompt is fed the real current date so it can't false-flag today's `publication_date` as a future date, and it validates the full Opus issue schema (a malformed `severity` is treated as a blocking fail-safe, never silently counted as zero highs). Bucket uploads must use `application/octet-stream` (not `application/zip`, which 415s).
- The rubric is **versioned**: `RUBRIC_VERSION` in `paperPipeline.ts` (currently `"0.9.0"` — the rubric is intentionally pre-1.0 while it's being validated by reviewers) is the single source of truth and is stamped onto each evaluation (`rubric_version` column) at scoring time. While pre-1.0, bump MINOR (`0.x.0`) for dimension/weight changes and PATCH (`0.x.y`) for guidepost wording/calibration; promote to `1.0.0` once validated. `null` = scored before versioning existed; historic rows are not backfilled (they get stamped only on rerun). Weight changes apply only to NEW/rerun evaluations — existing rows keep the overallScore computed under the rubric they were scored with, so the dashboard mixes versions until rows are rerun (each completed eval shows its own `Rubric vX`).
- `scripts/src/paper.ts` (and `scripts/src/zenodoDeposit.ts`) now build at **rubric v0.9.0**: `WEIGHTS` = 15/12/12/15/14/7/25 and `REQUIRED_RUBRIC_VERSION` = "0.9.0". The corpus (eval ids 12, 35–47) was re-scored under v0.9.0 before the deposition; the paper builder gates on every corpus eval being complete@0.9.0. The prior **published PRODUCTION v0.8.0 record** (DOI 10.5281/zenodo.20567720, weights 18/14/14/18/18/8/10) is immutable and unaffected; its v0.8.0 builder constants are recoverable from git history at the pre-bump commit. A v0.9.0 SANDBOX **draft** (deposition 509977) was created behind the Opus gate but NOT published. A future rubric bump again needs its own re-scored corpus + updated constants in both builders.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
