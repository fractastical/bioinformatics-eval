---
name: Outreach GitHub-sync design rules
description: Durable correctness rules for syncing external (GitHub) data into local records that re-run repeatedly.
---

# Re-syncable external data: dedupe + status must be idempotent & monotonic

Applies to any endpoint that pulls external state (GitHub issue comments, etc.)
into local rows and can be called many times.

## Rules

1. **Dedupe at the DB level, not just in app code.** An in-memory "seen" set
   from the current rows does NOT prevent duplicates under concurrent syncs.
   Put a unique index on `(parentId, externalId)` and use
   `onConflictDoNothing({ target: [...] })` on insert. Postgres treats NULLs as
   distinct, so manually-entered rows (null externalId) are unaffected.
2. **Status transitions must be monotonic — never regress on sync.** Deriving
   status purely from the *current* external snapshot can downgrade a record
   (e.g. `responded` → `contacted`) when the external source has no qualifying
   signal but a manual reply already advanced it. Only advance: skip the
   derivation if status is already terminal/higher (`closed`, `responded`).

**Why:** a sync feature is expected to be safe to re-run; duplicate child rows
and flapping status both corrupt the user's view of outreach progress.

**How to apply:** whenever adding a "pull latest from <external service>"
button/endpoint, add the unique index + on-conflict, and gate status derivation
behind a check for already-advanced states.
