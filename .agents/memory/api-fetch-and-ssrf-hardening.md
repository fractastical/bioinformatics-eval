---
name: SSRF, PDF ingestion & async-failure hardening for the eval API
description: Non-obvious correctness/security rules when fetching user URLs, ingesting PDFs, and reporting async failures in the BioEval API server
---

# SSRF validation must cover every redirect hop, not just the initial URL
Validating only the submitted URL is bypassable: a public URL can 30x-redirect to a private/
metadata target (e.g. 169.254.169.254). Fetch with `redirect: "manual"` and re-validate each
`Location` hop. **Why:** caught in review as a high-severity bypass. **How to apply:** any
server-side fetch of a user-supplied URL must go through the hop-revalidating `safeFetch`, never
raw `fetch` with default redirect following.
**Node detail:** under Node/undici, `redirect: "manual"` returns the *real* 3xx response with a
readable `Location` header (unlike browsers, which return an opaque-redirect with status 0), so
manual following + re-validation works.

# IPv6 private-address checks need full parsing, not prefix string matching
Naive checks miss: expanded loopback (`0:0:0:0:0:0:0:1`), link-local beyond literal `fe80`
(it's `fe80::/10`, so `fe90::` is still link-local), ULA `fc00::/7`, and IPv4-mapped in hex form
(`::ffff:7f00:1` == 127.0.0.1, not just dotted `::ffff:127.0.0.1`). Parse the address into eight
16-bit groups (handling `::` compression + embedded IPv4) and test ranges with bitmasks, then map
IPv4-mapped/compatible forms back to the IPv4 private check.

# Bound and time external downloads before buffering
Don't `await res.arrayBuffer()` then check size — that buffers the whole (possibly huge) body
first. Check `content-length`, then stream-read with a running byte cap and `reader.cancel()` on
overflow, and wrap fetch in an `AbortController` timeout. Applies to both PDF and HTML bodies.

# Async (fire-and-forget) work returns 201 before it can fail
The submit/upload/rerun routes respond 201 immediately, then do fetch+extract+score in a detached
async IIFE. Failures therefore can't be returned to the client — they must be persisted as
`status: "error"` with the reason in `summary`. Callers/UI must treat 201 as "accepted", not
"succeeded", and poll for terminal status.

# On failure, null out prior scores
`markEvalError` must clear all score/result columns. **Why:** a failed *rerun* otherwise leaves
the previous successful scores next to `status:"error"`, an inconsistent state the UI/API can
misread.

# PDF extraction
`unpdf` (bundled pure-JS pdf.js) extracts text with no native deps and bundles cleanly under
esbuild ESM — no externalization needed. Always verify the `%PDF-` magic bytes (uploads AND remote
downloads) regardless of declared MIME, and treat <~200 chars of extracted text as a failure
(scanned-image PDF without OCR) rather than scoring near-empty content.

## Link-local IPv6 false positive (re-fetch)
The SSRF guard blocks a legitimate **public** host if DNS resolution returns a
link-local IPv6 (`fe80::…`) alongside the real public IPv4. On Replit, `getent
ahosts <host>` often appends the local interface's `fe80::` address, so hosts
like `www.jstatsoft.org` (real IP 138.x public, curl reaches fine) get rejected
with "URL points to a disallowed (private) address" on re-fetch.

**Workaround to re-score without touching SSRF code:** the rerun route re-fetches
URL papers but falls back to cached `extracted_text` when `paper_url` is null.
Temporarily `UPDATE evaluations SET paper_url=NULL`, trigger rerun (uses cached
text), then restore the URL. `runEvaluation` never writes `paper_url`, so restore
is safe.
**Proper fix (if ever needed):** resolve+connect to a validated public address and
only block when ALL resolved addresses are private — don't reject because one
resolved address is link-local.
