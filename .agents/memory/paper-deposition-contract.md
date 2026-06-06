---
name: Paper/report deposition contract
description: When generating a "raw scores" report PDF (e.g. the BioEval Reproducibility Report bundled into Zenodo), validate the corpus and fail loudly instead of coercing missing data to 0.
---

When a generated report/paper asserts in its own metadata that it presents the
RAW, completed, single-rubric-version scores of a corpus, the generator MUST
enforce that contract before rendering — otherwise the artifact can silently
contradict the metadata.

**Rule (in `scripts/src/paper.ts`, `generatePaperPdf()`):**
- Every eval must be fetched, `status === "complete"` (NOTE: the status enum is
  `"complete"`, not `"completed"`), `rubricVersion === REQUIRED_RUBRIC_VERSION`,
  and have every weighted dimension present and finite.
- Reading a dimension goes through a strict `dim()` helper that throws on
  null/NaN. Never use `?? 0` for a score that the document claims is real — a
  silent zero reads as a genuine low score and is indistinguishable from missing
  data in the final PDF.
- Aggregate all violations and throw one error listing them, before any external
  side effect (e.g. before creating the Zenodo draft).

**Why:** an architect review caught that the first version only checked
`overallScore != null` and coerced every other dimension to 0 in both the
weighted-overall math and the table render. A row missing `informationTheoryScore`
would have shipped as "IT 0" inside a record whose abstract promised per-paper
information-theoretic scores — a permanent, citable contradiction.

**How to apply:** any time a deposition/report bundles generated numbers AND
describes them in prose, generate the numbers first (fail-fast before the draft),
validate the whole corpus against the prose's claims, and prefer a hard error
over a plausible-looking default. Keep `REQUIRED_RUBRIC_VERSION` in sync with the
pipeline's `RUBRIC_VERSION`.

## PDFKit footer/page-number loop appends blank pages
When stamping per-page footers via `bufferPages: true` + `bufferedPageRange()` +
`switchToPage()`, writing the footer at a low y (e.g. `page.height - 40`, which is
*below* the bottom-margin boundary `height - margins.bottom`) makes PDFKit treat it
as text overflow and auto-append a blank page — and the footer text lands on that
new page instead of the intended one. Symptom: N content pages followed by N nearly
blank pages whose only text is the footer, and footers reading "page 1 of N" on the
wrong physical page. Fix: before writing each footer, set that page's
`doc.page.margins.bottom = 0` (and pass `lineBreak: false`) so the low y is in
bounds; `lineBreak: false` alone is NOT enough.
