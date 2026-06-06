# BioEval — Computational Simulation Paper Evaluator

An AI-powered tool that scores computational and simulation research papers on data transparency, reproducibility, and code availability. Researchers paste a URL or upload a PDF; Claude analyses the paper across six dimensions and returns a structured report with findings, gaps, and recommendations.

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.20567720.svg)](https://doi.org/10.5281/zenodo.20567720)

> 📄 **Published paper:** *BioEval Reproducibility Report* — the system and full evaluation corpus (raw rubric v0.8.0 scores, including the information-theoretic dimension), archived with the source code on Zenodo: **[doi.org/10.5281/zenodo.20567720](https://doi.org/10.5281/zenodo.20567720)**.

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

> **Baseline calibration:** the rubric is deliberately strict, so a fixed **+20 baseline adjustment** is applied to each dimension (capped at 100) before weighting. Every score below is reported post-calibration, and each **Overall** is the weighted mean of the six calibrated dimensions.

---

## Insect Simulation Series

A focused evaluation of fourteen publicly available insect colony and swarm simulations — bees, ants, termites, and fireflies — scored June 2026. Code Availability and Reproducibility Package are scored against **live GitHub repository signals** (license, releases, dependency manifests, tests, CI, recency), so every dimension is continuous rather than snapped to rubric tiers. Full per-paper PDF reports available on request.

### Rankings

| Rank | Score | Repo | Type | Language | Stars |
|---|---|---|---|---|---|
| 1 | **85.4** | [lrdcxdes/ant-simulation](https://github.com/lrdcxdes/ant-simulation) | 🐜 Ant | Python | — |
| 2 | **73.6** | [lax4mike/firefly](https://github.com/lax4mike/firefly) | 🔆 Firefly | JS | — |
| 3 | **73.1** | [docxology/BeeStack](https://github.com/docxology/BeeStack) | 🐝 Bee | Python | — |
| 4 | **72.2** | [fractastical/antstack](https://zenodo.org/records/16782757) | 🐜 Ant | Python | — |
| 5 | **71.6** | [Dougarasu/termite-multiagent-system](https://github.com/Dougarasu/termite-multiagent-system) | 🪳 Termite | C#/Unity | — |
| 6 | **68.1** | [fractastical/bee-swarm-sim](https://github.com/fractastical/bee-swarm-sim) | 🐝 Bee | HTML/JS | — |
| 7 | **64.3** | [bones-ai/rust-ants-colony-simulation](https://github.com/bones-ai/rust-ants-colony-simulation) | 🐜 Ant | Rust | ★208 |
| 8 | **54.5** | [Haghrah/ACO---Robot-Path-Planning](https://github.com/Haghrah/ACO---Robot-Path-Planning) | 🐜 Ant | Python | ★61 |
| 9 | **52.7** | [cfrBernard/ant-colony-optimization](https://github.com/cfrBernard/ant-colony-optimization) | 🐜 Ant | JS/React | ★34 |
| 10 | **51.6** | [piXelicidio/locas-ants](https://github.com/piXelicidio/locas-ants) | 🐜 Ant | Lua/Love2D | ★161 |
| 11 | **51.1** | [tulustul/ants-sandbox](https://github.com/tulustul/ants-sandbox) | 🐜 Ant | TypeScript | ★106 |
| 12 | **43.8** | [MeoMix/symbiants](https://github.com/MeoMix/symbiants) | 🐜 Ant | Rust | ★235 |
| 13 | **41.9** | [darwiiiish/swarm-abc](https://github.com/darwiiiish/swarm-abc) | 🐝 Bee | HTML/JS | — |
| 14 | **37.8** | [matheuslosilva/Hardware-Accelerated-Ant-Colony...](https://github.com/matheuslosilva/Hardware-Accelerated-Ant-Colony-Based-Swarm-System) | 🐜 Ant | C++/CUDA | ★12 |

### Dimension Breakdown

| Repo | Data Disclosure | Dataset Resolvability | Code Availability | Traceability | Sim Clarity | Repro Pkg | **Overall** |
|---|---|---|---|---|---|---|---|
| ant-simulation (pygame) | 92 | 98 | 83 | 88 | 75 | 72 | **85.4** |
| firefly | 82 | 78 | 78 | 75 | 68 | 52 | **73.6** |
| BeeStack | 72 | 58 | 88 | 75 | 78 | 62 | **73.1** |
| antstack | 72 | 68 | 92 | 62 | 66 | 82 | **72.2** |
| termite-multiagent | 82 | 78 | 62 | 75 | 72 | 48 | **71.6** |
| bee-swarm-sim | 72 | 68 | 75 | 62 | 58 | 82 | **68.1** |
| rust-ants-colony | 82 | 75 | 72 | 48 | 52 | 58 | **64.3** |
| ACO-robot-path-planning | 52 | 58 | 68 | 62 | 50 | 28 | **54.5** |
| ant-colony-optimization | 58 | 62 | 72 | 42 | 38 | 50 | **52.7** |
| locas-ants | 48 | 55 | 82 | 38 | 38 | 62 | **51.6** |
| ants-sandbox | 48 | 58 | 78 | 38 | 40 | 55 | **51.1** |
| symbiants | 38 | 42 | 78 | 30 | 32 | 58 | **43.8** |
| swarm-abc | 38 | 48 | 62 | 35 | 40 | 28 | **41.9** |
| hw-accel-ant-colony | 32 | 38 | 58 | 35 | 30 | 40 | **37.8** |

### Key Findings per Paper

**🐜 [ant-simulation (pygame)](https://github.com/lrdcxdes/ant-simulation)** — 85.4/100  ·  #1
> Pygame stigmergy ant colony with emergent intelligence from simple pheromone rules. MIT license, requirements.txt with the three core dependencies (Pygame, NumPy, SciPy). The clear series leader once repository signals are read.
✅ Tops the series on Data Disclosure (92) and Dataset Resolvability (98) — generative rules and config are well specified
✅ Explicit dependency manifest plus strong Traceability (88)
❌ Dependencies unpinned (pygame==, numpy==, scipy==)
❌ No release tag, commit hash, or Zenodo archive

**🔆 [firefly](https://github.com/lax4mike/firefly)** — 73.6/100  ·  #2
> JavaScript firefly synchronization simulation. Live demo at mikelambert.me/firefly. Jumped from near-last to the top tier once repo signals were read properly.
✅ Solid Data Disclosure (82) and Dataset Resolvability (78) — a simple, fully specified model
✅ Live deployed demo for interactive inspection
❌ Sparse README; no parameter, initialization, or seed documentation
❌ No release or archive → lowest Repro Package in the top tier (52)

**🐝 [BeeStack](https://zenodo.org/records/20420557)** — 73.1/100  ·  #3
> Whole-colony honeybee simulation scaffold. Code archived on Zenodo with MD5 checksums, tagged release, MIT license, large passing test suite.
✅ Strong Code Availability (88) and the best Simulation Clarity in the series (78)
✅ Versioned release + SHA checksums; CLI-driven artifact regeneration
❌ Primary DOI does not resolve in Crossref → Dataset Resolvability only 58
❌ Citation-to-parameter mapping partially opaque

**🐜 [antstack](https://zenodo.org/records/16782757)** — 72.2/100  ·  #4
> SHA-256 checksummed manifest system, comprehensive tests, CLI-driven artifact regeneration. External data sources (VFB, hemibrain) named in prose only without DOIs.
✅ Leads the series on Code Availability (92) and Reproducibility Package (82)
✅ SHA-256 provenance per run; comprehensive test suite
❌ No resolvable dataset identifiers; data sources named in prose only
❌ Heuristic constants undocumented → Sim Clarity 66

**🪳 [termite-multiagent-system](https://github.com/Dougarasu/termite-multiagent-system)** — 71.6/100  ·  #5
> Unity/C# 3D termite colony. Agent behavior reduced to two IF-THEN rules, clearly documented in README. MIT license.
✅ Behavioral rules and environment structure well documented → Data Disclosure 82
❌ Weak Code Availability (62) — no dependency manifest, release, or tests detected
❌ No datasets or accession numbers of any kind

**🐝 [bee-swarm-sim](https://github.com/fractastical/bee-swarm-sim)** — 68.1/100  ·  #6
> Client-side agent-based waggle dance simulation. Runs zero-dependency in a browser. Citation-backed mode references 9 peer-reviewed sources (von Frisch 1967, Seeley 1995, Couvillon 2019, Menzel 2023 and others). BeeStack trace replay and JSON export supported.
✅ Strongest Reproducibility Package in the series (82) — self-contained with trace export
✅ Explicit citation-backed vs. heuristic mode distinction
❌ Only 4 commits, no tagged release, no Zenodo DOI
❌ Stochastic with no seed control → Sim Clarity 58

**🐜 [rust-ants-colony-simulation](https://github.com/bones-ai/rust-ants-colony-simulation)** — 64.3/100  ★208  ·  #7
> Ant colony simulation in Rust (Bevy engine). Clear repo structure; `cargo run --release` startup; KD-tree and query caching documented.
✅ Good Data Disclosure (82) and Dataset Resolvability (75)
✅ `cargo run --release` one-liner launch
❌ Low Traceability (48) — algorithmic choices not mapped back to sources
❌ No versioned release, pinned commit, or Zenodo archive

**🐜 [ACO-robot-path-planning](https://github.com/Haghrah/ACO---Robot-Path-Planning)** — 54.5/100  ★61  ·  #8
> Python ACO for robot path planning, explicitly tied to a published reference (Liu et al., 2017, Soft Computing). GPL-3.0.
✅ Linked to a specific peer-reviewed paper
❌ Lowest Reproducibility Package in the series (28) — no environment or test files
❌ No data availability statement or accession numbers

**🐜 [ant-colony-optimization](https://github.com/cfrBernard/ant-colony-optimization)** — 52.7/100  ★34  ·  #9
> React + HTML5 canvas ACO visualizer. MIT license; sprite/tileset/map assets bundled in-repo.
✅ Bundled map/asset files give non-trivial Dataset Resolvability (62)
❌ Low Traceability (42) and Sim Clarity (38)
❌ Only 14 commits, no tagged release or DOI

**🐜 [locas-ants](https://github.com/piXelicidio/locas-ants)** — 51.6/100  ★161  ·  #10
> Lua/Love2D ant colony remake. 6 versioned releases; pre-built `.love` binary available; MIT license.
✅ Best Code Availability in the bottom tier (82) — versioned releases + binary download
❌ Pheromone decay rates and ant rules undocumented → Traceability/Sim Clarity 38
❌ No biological citations or dataset references

**🐜 [ants-sandbox](https://github.com/tulustul/ants-sandbox)** — 51.1/100  ★106  ·  #11
> TypeScript/web ant colony. Live demo at ants-sandbox.vercel.app; MIT license; npm install + run documented.
✅ Decent Code Availability (78) — standard, runnable npm repo
❌ Very low Traceability (38) and Sim Clarity (40)
❌ No datasets, citations, or parameter documentation

**🐜 [symbiants](https://github.com/MeoMix/symbiants)** — 43.8/100  ★235  ·  #12
> Rust/Bevy ant colony simulation game. Dual Apache-2.0/MIT license; devcontainer setup; native + WASM builds.
✅ Well-documented dev environment → Code Availability 78
❌ No biological data sources or parameter citations → Traceability 30, Sim Clarity 32
❌ Most-starred repo in the series, yet near the bottom on reproducibility

**🐝 [swarm-abc](https://github.com/darwiiiish/swarm-abc)** — 41.9/100  ·  #13
> Artificial Bee Colony algorithm in HTML/JS. Public code; explanation page included.
✅ Explanation page documents algorithm intent
❌ No README, no license, no parameter config, no citations
❌ Reproducibility Package 28 — not practically rerunnable

**🐜 [hw-accel-ant-colony](https://github.com/matheuslosilva/Hardware-Accelerated-Ant-Colony-Based-Swarm-System)** — 37.8/100  ★12  ·  #14
> C++/CUDA/OpenGL hardware-accelerated ant colony swarm. 38 commits, clear structure.
✅ GPU-accelerated implementation (CUDA + OpenGL)
❌ Weakest Data Disclosure (32) and Dataset Resolvability (38) in the series
❌ No benchmark scenarios, documented results, or test files

### Cross-Series Observations

- **Popularity ≠ reproducibility.** The two most-starred repos (symbiants ★235, rust-ants ★208) land at #12 and #7; the top scorer (pygame ant-simulation) has no stars listed at all.
- **Stigmergy done simply wins.** The pygame ant-simulation is the clear #1 — explicit dependency manifest, documented rules, and the best-specified generative model in the series.
- **Code Availability actually discriminates.** Scoring against live GitHub signals (license, releases, manifests, tests, CI, recency) spreads this dimension from 58 (bare repos like hw-accel) to 92 (ant-stack), instead of collapsing every public repo into one value.
- **No external datasets — but specification quality varies widely.** These are rule-based sims, so none deposit accessioned data. Scoring resolvability of the *synthetic-data definition* instead spreads the field from 38 (hw-accel) to 98 (pygame ant): the gap is how completely rules, parameters, and configs are written down.
- **The fastest path to a higher score** is: (1) pin dependency versions and add a deterministic seed, (2) add a parameters table mapping every constant to its source, (3) tag a release and archive to Zenodo for a DOI, (4) commit one example output file with a checksum.

---

## Features

- **Submit by URL or PDF upload** — paste a journal link or drag-and-drop a PDF
- **Real PDF text extraction** — uploaded and URL-linked PDFs are parsed to text (via `unpdf`) and scored on their actual contents; if a PDF yields too little readable text (e.g. a scanned image), the evaluation is flagged as an error instead of scoring an empty document
- **Multi-agent pipeline** — four Claude agents extract evidence, resolve dataset accessions, score dimensions, and audit weak claims
- **Full report** — findings, gaps, and prioritised recommendations per paper
- **Code analysis** — paste simulation code to trace each segment back to the data sources and citations it depends on
- **Dashboard** — aggregate stats across all evaluated papers with score distribution and dimension breakdown
- **PDF reports** — generate and email structured PDF reports for any subset of evaluations
- **Hardened ingestion** — SSRF-guarded URL fetching (blocks private/loopback/link-local targets and re-validates every redirect hop), upload size/MIME/magic-byte checks, capped/timed downloads, locked CORS, request body limits, and rate limiting

---

## Stack

- **Frontend:** React + Vite + Tailwind + shadcn/ui
- **API:** Express 5 + OpenAPI (contract-first, Orval codegen)
- **DB:** PostgreSQL + Drizzle ORM
- **AI:** Anthropic Claude via Replit AI Integrations
- **PDF extraction:** `unpdf` (bundled pure-JS pdf.js — no native deps)
- **Email:** Resend
- **Security:** SSRF-guarded fetch, `express-rate-limit`, locked CORS, body-size limits
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

# Generate and email a report (defaults to IDs 12, 35, 36, 37, 38, 39, 40, 41)
pnpm --filter @workspace/scripts run send-report

# Or pass specific evaluation IDs
pnpm --filter @workspace/scripts run send-report 12 36
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
