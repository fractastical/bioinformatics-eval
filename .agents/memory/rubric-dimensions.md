---
name: BioEval rubric dimensions
description: How the paper-scoring rubric is structured, the orthogonality rule for content vs transparency axes, and every touchpoint to update when adding/changing a dimension.
---

# Rubric structure

The evaluator scores papers on a set of weighted continuous (0-100) dimensions; `overallScore` is the weighted average and the weights must sum to 1.00. The prompt's per-dimension `[Name, Npts]` labels, the JSON formula line, and the UI weight labels must all agree — they are three copies of the same numbers and drift silently if you change one.

## Axis orthogonality (durable decision)

There are two *kinds* of dimension and they must not be conflated:
- **Transparency / reproducibility** dimensions ask "can someone else reproduce/verify this?" (data disclosure, dataset resolvability, code availability, traceability, simulation-derivation clarity, repro-package quality).
- **Scientific-content rigor** dimensions ask "is the model itself rigorous?" The Information-Theoretic Rigor dimension is the first of this kind — it judges whether a paper formalizes/quantifies the information content of the system it models (Shannon entropy, mutual/transfer entropy, channel capacity / communication bit rate), which is especially apt for swarm/stigmergy/synchronization papers where information flow IS the phenomenon.

**Why:** a paper can be perfectly reproducible yet never quantify its own communication channel, and vice versa. Folding a content-rigor score into the transparency scores muddies a clean signal. Score content-rigor independently of data/code availability.

**How to apply:** for a content-rigor dimension, topics where the axis genuinely does not apply (e.g. a pure phylogenetics / sequence-alignment pipeline) must be scored at a **neutral midpoint (~50), not 0**, so non-applicability neither rewards nor punishes. Reserve low scores for papers where the axis is clearly central but left unaddressed.

## Touchpoints when adding/changing a dimension

Adding a scored dimension is a cross-cutting change. Miss one and it silently no-ops:
1. DB schema (`lib/db/src/schema/evaluations.ts`) — new nullable `real` column → then `pnpm --filter @workspace/db run push`.
2. OpenAPI (`lib/api-spec/openapi.yaml`) Evaluation schema → then `pnpm --filter @workspace/api-spec run codegen` (regenerates the react client + zod; clearing/rebuilding momentarily breaks vite HMR — transient "Failed to load url .../generated" errors are expected and clear on a fresh load).
3. Pipeline (`artifacts/api-server/src/lib/paperPipeline.ts`) — `PaperScores` interface, the rubric guidepost, the JSON shape, AND the weighted-average formula (rebalance so weights sum to 1.00).
4. Routes (`artifacts/api-server/src/routes/evaluations.ts`) — persist on complete + null it out in `markEvalError`.
5. Frontend — `evaluation-detail.tsx` (DimensionBar), `dashboard.tsx` (`DIMENSIONS` array + the "N rubric dimensions" copy + skeleton row count), `home.tsx` (mini-score).

Note: `/stats` deliberately exposes only a *subset* of dimension averages (not all of them) — that partiality predates the 7th dimension, it is not a regression.

## Rubric versioning (durable decision)

Every change to the dimension set, weights, or guideposts makes scores incomparable across runs, so each evaluation is stamped with the rubric that produced it.
- Single source of truth: `RUBRIC_VERSION` const in `paperPipeline.ts` (currently `"3.0.0"`); it flows through `PipelineResult.rubricVersion` and is persisted to the nullable `rubric_version` column on completion (and nulled in `markEvalError`).
- Semver convention: MAJOR = dimensions change, MINOR = weights change, PATCH = guidepost wording/calibration only. **Bump it whenever you touch the rubric** (it's a 6th touchpoint on top of the list above).
- `null` rubricVersion = scored before versioning existed ("unversioned"). We deliberately do NOT backfill historic rows with a guessed version — they get stamped only on rerun. UI shows "Rubric vX" or "Rubric: unversioned" on the completed detail page.
