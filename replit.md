# BioEval — Bioinformatics Paper Evaluator

An AI-powered tool for evaluating bioinformatics research papers on data transparency, dataset declaration, and computational reproducibility. Researchers paste a URL or upload a PDF; Claude analyzes the paper and scores it across four dimensions. Users can also paste simulation code to trace each code segment back to the data sources and citations it depends on.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port from env)
- `pnpm --filter @workspace/biopaper-eval run dev` — run the frontend (port from env)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind + shadcn/ui + wouter
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- AI: Anthropic Claude (via Replit AI Integrations, no user API key required)
- Validation: Zod, drizzle-zod
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/evaluations.ts` — evaluation table schema
- `lib/db/src/schema/codeAnalyses.ts` — code analysis table schema
- `lib/integrations-anthropic-ai/` — Anthropic AI client + batch utilities
- `artifacts/api-server/src/routes/evaluations.ts` — evaluation + stats routes
- `artifacts/api-server/src/routes/codeAnalyses.ts` — code analysis routes
- `artifacts/biopaper-eval/src/` — React frontend

## Architecture decisions

- Anthropic Claude analyzes papers async (fire-and-forget after API response) so the UI responds instantly and polls for results
- PDF upload is handled outside of Orval codegen (multipart/form-data at `/api/evaluations/upload`) since Orval generates broken File/Blob types server-side
- Simulation code is broken into segments by Claude and each segment is mapped to a data source + citation with a confidence score (high/medium/low)
- Zod is used for route-level validation in route handlers (not from api-zod codegen) to avoid esbuild bundle issues with `zod/v4` subpath
- DB schema includes `extractedText` for caching fetched paper content on re-runs

## Product

- Submit a bioinformatics paper by URL or PDF upload
- AI scores the paper on: Data Source Clarity, Dataset Declaration, Reproducibility, Citation Quality (each 0-100)
- Full report with findings, gaps, and recommendations
- Submit simulation code against a paper — Claude breaks it into segments and maps each to a data source and citation
- Dashboard showing aggregate stats across all evaluated papers

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Use `zod` not `zod/v4` in api-server routes (esbuild can't resolve the subpath export)
- After OpenAPI spec changes, always re-run codegen before starting the frontend workflow
- The Anthropic integration env vars (`AI_INTEGRATIONS_ANTHROPIC_BASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY`) are auto-provisioned by Replit — never ask the user for them
- PDF file upload: frontend uses native `fetch` with FormData to POST `/api/evaluations/upload` (not a generated hook)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
