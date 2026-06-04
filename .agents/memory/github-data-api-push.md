---
name: GitHub push via Git Data API
description: How to push to fractastical/bioinformatics-eval when local/remote git histories have diverged
---

This repo's local and remote histories have **diverged**, so a normal `git push` won't fast-forward and force-push is avoided. Push via the GitHub Git Data API instead, parenting the new commit on the current remote HEAD (no force).

**Why:** A force-push would destroy remote history; the divergence is intentional, so always build on remote HEAD.

**How to apply (incremental single/few-file change — preferred):**
1. GET repo → `default_branch` (it's `main`).
2. GET `git/ref/heads/<branch>` → head sha; GET that commit → its `tree.sha` (use as `base_tree`).
3. Create a blob per changed file (`encoding:"utf-8"` for text, `"base64"` for binary).
4. Create a tree with `base_tree` + only the changed paths.
5. Create a commit with `parents:[headSha]`, then PATCH `git/refs/heads/<branch>` with `force:false`.

**Gotchas:**
- `raw.githubusercontent.com` serves a stale CDN cache — verify pushes via the **contents API** (decode base64), not the raw URL.
- For a full first-time push, inline all text files into one create-tree call; create binary blobs **sequentially** (concurrent blob creation trips GitHub secondary rate limits).
- Token: `(await listConnections('github'))[0].settings.access_token`. Never print it.
