---
name: DOI resolution & evidence discipline in the eval pipeline
description: Non-obvious correctness rules for accession/DOI resolution and multi-agent finding generation in BioEval
---

# DOI resolution must query BOTH Crossref and DataCite
DOIs are split across registration agencies: journal articles → Crossref; data/software
deposits (Zenodo, figshare, Dryad) → DataCite (`api.datacite.org/dois/{doi}`). Querying only
Crossref falsely flags every Zenodo DOI as "not found".
**Why:** the BeeStack author flagged this as a category error — the most damaging kind of false
negative for a transparency-scoring tool. **How to apply:** try Crossref, fall back to DataCite;
never present "absent from Crossref" as a defect.

# Public resolver APIs rate-limit (429) under parallel bursts → false "not found"
Resolving ~10 DOIs in parallel makes Crossref return 429, which naively reads as "DOI doesn't
exist." **How to apply:** resolve in small chunks (≈3) + retry with backoff on 429/503; and mark
rate-limited results as UNKNOWN / "not a paper defect", distinct from genuine not-found. Treat
"couldn't verify this run" and "verified missing" as different states everywhere downstream.

# Every agent that emits findings needs the same evidence-discipline guardrails
The pipeline has separate scorer (Agent C) and critic (Agent D) prompts. Adding "only report
verified gaps; never say 'repo not confirmed accessible' / 'unverified by hash' / speculate a
resolved DOI may not exist" to the scorer is NOT enough — the critic re-introduces the same
false negatives unless it gets the identical rules AND the list of already-resolved IDs + live
repo signals. **Why:** false-negative caveats are exactly what erodes author trust.

# Reflect the CODE, not just the PDF
A PDF-only review of a software package wrongly reports "no accessions provided" when datasets
are declared in source (e.g. `src/.../datasets.py`). Fetch the repo git tree, scan likely
data/config files for accession/DOI patterns, and feed those IDs into resolution + scoring.

# DOI extraction from markdown/source needs careful cleaning
Raw DOI regex matches drag in trailing markup (`)](`, backticks, `.svg` badge suffixes, trailing
punctuation), which then fail to resolve and get reported as "broken markup". Strip trailing
wrappers but PRESERVE balanced internal parentheses — parens are legal DOI characters
(e.g. `10.1002/(SICI)...`), so do not split on `(`/`)` unconditionally.
