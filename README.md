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

## Insect Simulation Series

A focused evaluation of fourteen publicly available insect colony and swarm simulations — bees, ants, termites, and fireflies — scored June 2026. Full per-paper PDF reports available on request.

### Rankings

| Rank | Score | Repo | Type | Language | Stars |
|---|---|---|---|---|---|
| 1 | **51.8** | [fractastical/bee-swarm-sim](https://github.com/fractastical/bee-swarm-sim) | 🐝 Bee | HTML/JS | — |
| 1 | **51.8** | [lrdcxdes/ant-simulation](https://github.com/lrdcxdes/ant-simulation) | 🐜 Ant | Python | — |
| 3 | **46.1** | [docxology/BeeStack](https://github.com/docxology/BeeStack) | 🐝 Bee | Python | — |
| 4 | **36.1** | [bones-ai/rust-ants-colony-simulation](https://github.com/bones-ai/rust-ants-colony-simulation) | 🐜 Ant | Rust | ★208 |
| 5 | **35.3** | [fractastical/antstack](https://zenodo.org/records/16782757) | 🐜 Ant | Python | — |
| 6 | **34.3** | [cfrBernard/ant-colony-optimization](https://github.com/cfrBernard/ant-colony-optimization) | 🐜 Ant | JS/React | ★34 |
| 7 | **33.3** | [Dougarasu/termite-multiagent-system](https://github.com/Dougarasu/termite-multiagent-system) | 🪳 Termite | C#/Unity | — |
| 8 | **29.1** | [Haghrah/ACO---Robot-Path-Planning](https://github.com/Haghrah/ACO---Robot-Path-Planning) | 🐜 Ant | Python | ★61 |
| 9 | **28.6** | [matheuslosilva/Hardware-Accelerated-Ant-Colony...](https://github.com/matheuslosilva/Hardware-Accelerated-Ant-Colony-Based-Swarm-System) | 🐜 Ant | C++/CUDA | ★12 |
| 10 | **28.1** | [piXelicidio/locas-ants](https://github.com/piXelicidio/locas-ants) | 🐜 Ant | Lua/Love2D | ★161 |
| 10 | **28.1** | [lax4mike/firefly](https://github.com/lax4mike/firefly) | 🔆 Firefly | JS | — |
| 12 | **25.3** | [MeoMix/symbiants](https://github.com/MeoMix/symbiants) | 🐜 Ant | Rust | ★235 |
| 13 | **23.1** | [tulustul/ants-sandbox](https://github.com/tulustul/ants-sandbox) | 🐜 Ant | TypeScript | ★106 |
| 14 | **20.1** | [darwiiiish/swarm-abc](https://github.com/darwiiiish/swarm-abc) | 🐝 Bee | HTML/JS | — |

### Dimension Breakdown

| Repo | Data Disclosure | Dataset Resolvability | Code Availability | Traceability | Sim Clarity | Repro Pkg | **Overall** |
|---|---|---|---|---|---|---|---|
| bee-swarm-sim | 25 | 0 | 67 | 50 | 50 | 70 | **51.8** |
| ant-simulation (pygame) | 50 | 0 | 67 | 100 | 50 | 70 | **51.8** |
| BeeStack | 25 | 0 | 100 | 25 | 50 | 70 | **46.1** |
| rust-ants-colony | 0 | 0 | 67 | 100 | 25 | 40 | **36.1** |
| antstack | 25 | 0 | 67 | 25 | 25 | 40 | **35.3** |
| ant-colony-optimization | 25 | 33 | 67 | 50 | 25 | 40 | **34.3** |
| termite-multiagent | 0 | 0 | 67 | 25 | 50 | 40 | **33.3** |
| ACO-robot-path-planning | 0 | 0 | 67 | 25 | 25 | 40 | **29.1** |
| hw-accel-ant-colony | 0 | 0 | 67 | 25 | 25 | 40 | **28.6** |
| locas-ants | 0 | 0 | 67 | 0 | 25 | 40 | **28.1** |
| firefly | 0 | 0 | 67 | 25 | 25 | 40 | **28.1** |
| symbiants | 0 | 0 | 67 | 25 | 25 | 40 | **25.3** |
| ants-sandbox | 0 | 0 | 67 | 0 | 25 | 40 | **23.1** |
| swarm-abc | 0 | 0 | 67 | 25 | 25 | 40 | **20.1** |

### Key Findings per Paper

**🐝 [bee-swarm-sim](https://github.com/fractastical/bee-swarm-sim)** — 51.8/100
> Client-side agent-based waggle dance simulation. Runs zero-dependency in a browser. Citation-backed mode references 9 peer-reviewed sources (von Frisch 1967, Seeley 1995, Couvillon 2019, Menzel 2023 and others). BeeStack trace replay and JSON export supported.
- ✅ No build step; one-click to run
- ✅ Explicit citation-backed vs. heuristic mode distinction
- ❌ No deposited dataset or accession numbers; stochastic — no seed control
- ❌ No Zenodo DOI; only 4 commits with no tagged release

**🐜 [ant-simulation (pygame)](https://github.com/lrdcxdes/ant-simulation)** — 51.8/100
> Pygame stigmergy ant colony with emergent intelligence from simple pheromone rules. MIT license, requirements.txt with the three core dependencies (Pygame, NumPy, SciPy).
- ✅ Highest Traceability (100) and Data Disclosure (50) of the series
- ✅ Explicit dependency manifest (requirements.txt)
- ❌ No pinned dependency versions (pygame==, numpy==, scipy==)
- ❌ No release tag, commit hash, or Zenodo archive

**🐝 [BeeStack](https://zenodo.org/records/20420557)** — 46.1/100
> Whole-colony honeybee simulation scaffold. Code archived on Zenodo with MD5 checksums, tagged v1.0.0, MIT license, 676 passing tests.
- ✅ Zenodo DOI + SHA checksums; versioned release
- ✅ 676 passing tests; CLI-driven artifact regeneration
- ❌ Primary DOI does not resolve in Crossref; empirical dataset accessions missing
- ❌ Citation-to-parameter mapping partially opaque

**🐜 [rust-ants-colony-simulation](https://github.com/bones-ai/rust-ants-colony-simulation)** — 36.1/100  ★208
> Ant colony simulation in Rust (Bevy engine). Clear repo structure; `cargo run --release` startup; KD-tree and query caching documented.
- ✅ Traceability score 100 — algorithmic choices explicitly documented
- ✅ `cargo run --release` one-liner launch
- ❌ No versioned release or pinned commit; no Zenodo archive
- ❌ No simulation parameters table; no random seed control

**🐜 [antstack](https://zenodo.org/records/16782757)** — 35.3/100
> SHA-256 checksummed manifest system, 676 tests, CLI-driven artifact regeneration. External data sources (VFB, hemibrain) named in prose only without DOIs.
- ✅ SHA-256 provenance per run; comprehensive test suite
- ❌ No resolvable dataset identifiers; GitHub URL absent from paper
- ❌ Heuristic constants undocumented

**🐜 [ant-colony-optimization](https://github.com/cfrBernard/ant-colony-optimization)** — 34.3/100  ★34
> React + HTML5 canvas ACO visualizer. MIT license; sprite/tileset/map assets bundled in-repo. Only series entry with non-zero Dataset Resolvability (bundled map JSON).
- ✅ Visual + map assets versioned in-repo (sprite sheet, tileset, AntMap.json)
- ❌ Only 14 commits, no tagged release or DOI
- ❌ Install instructions reference a placeholder repo URL that doesn't match

**🪳 [termite-multiagent-system](https://github.com/Dougarasu/termite-multiagent-system)** — 33.3/100
> Unity/C# 3D termite colony. Agent behavior reduced to two IF-THEN rules, clearly documented in README. MIT license.
- ✅ Behavioral rules and environment structure documented
- ❌ No datasets or accession numbers of any kind
- ❌ No versioned release or Zenodo deposit

**🐜 [ACO-robot-path-planning](https://github.com/Haghrah/ACO---Robot-Path-Planning)** — 29.1/100  ★61
> Python ACO for robot path planning, explicitly tied to a published reference (Liu et al., 2017, Soft Computing). GPL-3.0.
- ✅ Linked to a specific peer-reviewed paper
- ❌ No data availability statement
- ❌ No dataset accession numbers or external links

**🐜 [hw-accel-ant-colony](https://github.com/matheuslosilva/Hardware-Accelerated-Ant-Colony-Based-Swarm-System)** — 28.6/100  ★12
> C++/CUDA/OpenGL hardware-accelerated ant colony swarm. 38 commits, clear structure.
- ✅ GPU-accelerated implementation (CUDA + OpenGL)
- ❌ No benchmark scenarios or test case files
- ❌ No documented results, metrics, figures, or tables

**🐜 [locas-ants](https://github.com/piXelicidio/locas-ants)** — 28.1/100  ★161
> Lua/Love2D ant colony remake. 6 versioned releases; pre-built `.love` binary available; MIT license.
- ✅ 6 versioned releases; binary download available
- ❌ No parameter documentation; pheromone decay rates and ant rules undocumented
- ❌ No biological citations or dataset references

**🔆 [firefly](https://github.com/lax4mike/firefly)** — 28.1/100
> JavaScript firefly synchronization simulation. Live demo at mikelambert.me/firefly.
- ✅ Live deployed demo for interactive inspection
- ❌ No README documenting parameters, initialization, or seeds
- ❌ No data availability statement

**🐜 [symbiants](https://github.com/MeoMix/symbiants)** — 25.3/100  ★235
> Rust/Bevy ant colony simulation game. Dual Apache-2.0/MIT license; devcontainer setup; native + WASM builds.
- ✅ Well-documented dev environment (devcontainer, WASM support)
- ❌ No biological data sources or parameter citations anywhere
- ❌ No versioned release; no Zenodo archive

**🐜 [ants-sandbox](https://github.com/tulustul/ants-sandbox)** — 23.1/100  ★106
> TypeScript/web ant colony. Live demo at ants-sandbox.vercel.app; MIT license; npm install + run documented.
- ✅ Live deployed demo; standard npm workflow
- ❌ No datasets, no citations, no parameter documentation
- ❌ No release tags or reproducible snapshot

**🐝 [swarm-abc](https://github.com/darwiiiish/swarm-abc)** — 20.1/100
> Artificial Bee Colony algorithm in HTML/JS. Public code; explanation page included.
- ✅ Explanation page documents algorithm intent
- ❌ No README, no license, no parameter config, no citations
- ❌ Lowest overall score in series

### Cross-Series Observations

- **Popularity ≠ reproducibility.** The most-starred repo (symbiants ★235) ranks 12th of 14. The two top scorers (bee-swarm-sim, pygame ant-simulation) have no stars listed at all.
- **Stigmergy done simply wins.** The pygame ant-simulation tied for first by doing the basics right: explicit dependency manifest, documented rules, and the only non-BeeStack entry to score Data Disclosure above 25.
- **Code Availability converges at 67 for every non-archived repo.** BeeStack (100) is the sole exception because it deposits a checksummed, versioned snapshot on Zenodo. The dimension that actually separates the field is Traceability.
- **Dataset Resolvability is 0 for 13 of 14.** Only ant-colony-optimization (33) scores anything, thanks to a bundled map JSON. No sim deposits output data with accession numbers — the clearest shared gap.
- **The fastest path to a higher score** is: (1) archive to Zenodo for a DOI, (2) add a parameters table mapping constants to cited sources, (3) pin dependency versions and add a deterministic seed, (4) deposit one example output file.

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
