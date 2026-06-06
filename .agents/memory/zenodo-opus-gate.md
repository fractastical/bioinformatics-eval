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
- License vocabulary differs by API. The **legacy deposit API** (`/api/deposit/...`,
  used to create/publish here) normalizes a submitted `"MIT"`/`"mit"` and stores it
  as its own internal id **`mit-license`** — that is the correct, expected stored
  value there. The newer **InvenioRDM records vocabulary** (`/api/vocabularies/licenses`)
  instead uses `mit`; `mit-license` 404s there. **Submit `mit-license` directly**
  (not the `MIT` alias): when submitted value == stored value, the gate has nothing
  to flag. Submitting the `MIT` alias works functionally, but the validator reads
  "submitted MIT, stored mit-license" as a mismatch and — critically — escalates it
  to **high** under the strict publish context even with a canonical-fact note,
  which hard-blocks the irreversible publish. The same note that is "medium/awareness"
  for the draft gate becomes a blocking "high" for publish, because the validator is
  told the action is permanent. Lesson: don't rely on canonical facts to suppress a
  recurring nit when you can remove the ambiguity at the source.
- **`ZENODO_SANDBOX` is set to `1` in this workspace's environment**, so an
  unqualified run targets sandbox. To publish to production you must explicitly pass
  `ZENODO_SANDBOX=0` on the command (do NOT just unset it — the env still has `1`).
- Sandbox DOIs use the `10.5072` test prefix (not `10.5281`); they are throwaway.
- Sandbox vs production are separate token + host worlds; keep clearly-named tokens
  and a sandbox toggle, and never publish to production without explicit user
  confirmation plus a passing strict gate.
