---
name: Scheduled job must be self-contained
description: Design rule for cron/digest/batch scripts in this monorepo
---

A Replit Scheduled Deployment runs its command in an isolated prod environment with the repo, secrets, and `DATABASE_URL`, but **no dev workflows run** — there is no in-repo API server to call.

**Rule:** a script meant to run as a scheduled job must reach data via the DB and third-party connectors directly, never via the in-repo HTTP API.

**Why:** an early version fetched from a localhost API URL; that works in dev but silently breaks in a scheduled deployment where nothing serves that port.

**How to apply:** import the DB client + tables, use the connector SDK for external calls, and close the connection pool on exit. If a job duplicates business logic that also lives in an artifact route (leaf packages can't import from `artifacts/`), keep the two copies in lockstep when either changes.

**Scheduling is user-driven:** the agent cannot set the cron — the user creates the Scheduled Deployment and picks the schedule in the Publishing UI.
