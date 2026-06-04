---
name: LLM rubric scoring snaps to guideposts
description: Why BioEval paper scores looked "round" and how to keep them differentiated
---

# Fine-grained scoring needs real external signals

When an LLM scores items against a rubric whose tiers are stated as discrete
levels (e.g. 0 / 25 / 50 / 67 / 100), it anchors to those numbers and outputs
near-identical "round" scores across many items — entire dimensions collapsed to
a single value (Code Availability was 67 for nearly every repo).

**Why:** Discrete rubric tiers act as attractors; without distinguishing evidence
the model picks the nearest tier, so items that differ in reality score the same.

**How to apply:**
- Phrase rubric tiers as continuous "guideposts," not the only allowed values.
- Feed the model *real external evidence* that actually varies per item. For repo
  evaluation we fetch live GitHub signals (license, releases/tags, dependency
  manifests, tests dir, CI, Dockerfile, last push, README size, stars) and pass
  them into the prompt — this is what spread Code Availability from a flat 67 to
  a genuine 38–72 range.
- Add domain rules so a whole class isn't floored at 0: rule-based sims have no
  deposited datasets, so Dataset Resolvability is scored on how completely the
  synthetic-data definition (rules/params/config) is specified, not on accessions.
- The LLM's returned overallScore is NOT the exact weighted formula — treat the
  stored DB overall as authoritative when reporting, and don't recompute from
  dimensions expecting a match.
