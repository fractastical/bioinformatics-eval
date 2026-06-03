# BioEval — Computational Simulation Paper Evaluator

An AI-powered tool that scores computational and simulation research papers on data transparency, reproducibility, and code availability. Researchers paste a URL or upload a PDF; Claude analyses the paper across six dimensions and returns a structured report with findings, gaps, and recommendations.

![BioEval Scores Dashboard](docs/dashboard.jpg)

---

## Scoring Rubric

Each paper is evaluated on six weighted dimensions (0–100):

| Dimension | Weight | What it measures |
|---|---|---|
| **Data Disclosure** | 20% | Datasets listed with repo links, accession IDs, version, access method |
| **Dataset Resolvability** | 15% | Identifiers actually resolve and metadata matches the paper |
| **Code Availability** | 15% | Code is public, versioned, archived, and documented |
| **Traceability** | 20% | Every data-loading step maps back to a declared dataset |
| **Simulation Clarity** | 20% | Parameters, distributions, and seeds are traceable to cited sources |
| **Reproducibility Package** | 10% | Environment + workflow + test data + instructions + checksums |

---

## Evaluated Papers

| Score | Paper | Domain |
|---|---|---|
| 68.3 | [Tellurium: Reproducible dynamical modeling in systems biology](https://doi.org/10.1016/j.biosystems.2018.07.006) | Systems biology |
| 68.0 | [Mixture density networks for epidemiological IBMs](https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1006869) | Epidemic simulation |
| 67.8 | [HAL: Hybrid Automata Library for agent-based modeling](https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1007635) | Agent-based modeling |
| 67.5 | [Brian2: Python simulator for spiking neural networks](https://elifesciences.org/articles/47314) | Neural simulation |
| 63.0 | [Covasim: Agent-based COVID-19 simulation](https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1009149) | Epidemic simulation |
| 57.6 | [PhysiCell: Open-source multicellular systems simulator](https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1005991) | Tissue simulation |
| 57.3 | [GeNN: GPU-accelerated brain simulation framework](https://www.nature.com/articles/srep18854) | Neural simulation |
| 57.0 | [OpenABM-Covid19: Agent-based COVID-19 intervention model](https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1009052) | Epidemic simulation |
| 55.0 | [ABCpy: Approximate Bayesian Computation framework](https://www.jstatsoft.org/article/view/v100i07) | Statistical simulation |
| 51.3 | [NetPyNE: Python package for multiscale neural modeling](https://elifesciences.org/articles/44494) | Neural simulation |
| 46.0 | [BeeStack: Scaffold for whole-colony honeybee simulation](https://zenodo.org/records/20420557) | Agent-based modeling |
| 38.0 | [Smoldyn: Spatial stochastic simulation of cellular kinetics](https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1002705) | Particle simulation |
| 35.3 | [The Ant Stack: Ant-inspired simulation workspace](https://zenodo.org/records/16782757) | Agent-based modeling |

---

## Features

- **Submit by URL or PDF upload** — paste a journal link or drag-and-drop a PDF
- **Multi-agent pipeline** — four Claude agents extract evidence, resolve dataset accessions, score dimensions, and audit weak claims
- **Full report** — findings, gaps, and prioritised recommendations per paper
- **Code analysis** — paste simulation code to trace each segment back to the data sources and citations it depends on
- **Dashboard** — aggregate stats across all evaluated papers with score distribution and dimension breakdown
- **PDF reports** — generate and email structured PDF reports for any subset of evaluations

---

## Stack

- **Frontend:** React + Vite + Tailwind + shadcn/ui
- **API:** Express 5 + OpenAPI (contract-first, Orval codegen)
- **DB:** PostgreSQL + Drizzle ORM
- **AI:** Anthropic Claude via Replit AI Integrations
- **Email:** Resend
- **Build:** pnpm workspaces, esbuild, Node.js 24, TypeScript 5.9

---

## Running Locally

```bash
# Install dependencies
pnpm install

# Start API server (reads PORT from env)
pnpm --filter @workspace/api-server run dev

# Start frontend (reads PORT from env)
pnpm --filter @workspace/biopaper-eval run dev

# Push DB schema changes (dev only)
pnpm --filter @workspace/db run push

# Regenerate API hooks after spec changes
pnpm --filter @workspace/api-spec run codegen

# Generate and email a report
pnpm --filter @workspace/scripts run send-report
```

**Required environment variables:**
- `DATABASE_URL` — PostgreSQL connection string
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` — auto-provisioned by Replit
- `AI_INTEGRATIONS_ANTHROPIC_API_KEY` — auto-provisioned by Replit

---

## Repository Structure

```
artifacts/
  api-server/          # Express API + evaluation pipeline
  biopaper-eval/       # React frontend
lib/
  api-spec/            # OpenAPI contract (source of truth)
  db/                  # Drizzle schema + migrations
  integrations-anthropic-ai/  # Anthropic client
scripts/
  src/sendReport.ts    # PDF report generator + email sender
docs/
  dashboard.jpg        # Dashboard screenshot
```
