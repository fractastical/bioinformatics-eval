---
name: Zenodo Opus pre-publish gate
description: Durable design lessons for the LLM-validated, draft-first Zenodo deposition gate (applies to any irreversible "validate-then-publish" flow).
---

# Zenodo Opus validation gate — durable lessons

Two-stage flow: an Opus (`claude-opus-4-8`) metadata review runs before a Zenodo
deposition is created/published. Draft creation is reversible; publish is not.

## Asymmetric gating by reversibility
- **Draft gate blocks only on high-severity issues** (warn on medium/low). A draft
  is human-reviewed in the Zenodo UI and deletable, so minor nits must not make the
  gate unsatisfiable.
- **Publish gate stays strict**: require `verdict === "pass"` AND zero high-severity
  issues.
- **Why:** an earlier version collapsed every non-pass verdict into a synthetic high,
  so any minor suggestion permanently blocked the flow. Match gate strictness to the
  cost of being wrong, not to a single threshold.

## An LLM validator needs the real "today" injected
- Models past their knowledge cutoff treat a current date as a *future* date and
  false-flag a correct `publication_date`. Inject the runtime current date into the
  prompt ("treat <today> as now; only flag dates strictly after it").
- **Why:** env clock can be years past the model's cutoff; without this, today's
  deposit date is reported as a high-severity "future date" error every run.

## Validate the validator's FULL schema before trusting it
- Don't trust just the top-level shape. Validate every issue object's `severity`
  against the known enum before counting highs. A malformed severity (e.g. `"HIGH"`)
  won't match a `=== "high"` filter, leaving `highs.length === 0` and silently
  letting an irreversible publish through. On any schema mismatch, synthesize a
  blocking high as a fail-safe.
- **Why:** the severity count is the safety interlock for an irreversible action;
  a parser that under-counts highs converts malformed output into false approval.

## Stop LLM flip-flop by pinning conventions in canonical facts
- When the validator oscillates between two defensible choices across runs (e.g.
  `isSupplementTo` vs `isDerivedFrom` for the source-repo relation), pick the
  platform convention and add it to the canonical-facts block so the gate stops
  re-flagging a settled decision.

## Zenodo API gotchas
- Bucket file upload Content-Type must be `application/octet-stream` (not
  `application/zip`) or the bucket returns 415.
- Sandbox vs production are separate token + host worlds; keep clearly-named tokens
  and a sandbox toggle, and never publish to production without explicit user
  confirmation plus a passing strict gate.
