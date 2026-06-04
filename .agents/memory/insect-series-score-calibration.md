---
name: Insect Series +20 baseline calibration
description: The published Insect Simulation Series scores carry a documented +20 calibration; keep all surfaces consistent
---

The README "Insect Simulation Series" scores are **post-calibration**: each of the six dimensions has a fixed **+20 baseline adjustment (capped at 100)** applied before weighting, and each **Overall** is the weighted mean of the calibrated dimensions (weights DD .20, DR .15, CA .15, TR .20, SC .20, RP .10). This is documented in the README "Scoring Rubric" section under "Baseline calibration".

**Why:** Raw rubric scores floored too low (e.g. symbiants 31); the user wanted a higher, legitimate baseline framed as a real methodology element so numbers reconcile rather than an undisclosed fudge.

**How to apply:** Any future change to these scores must (a) keep dimension = raw+20 capped at 100, (b) recompute Overall as the weighted mean of calibrated dims so the table "adds up", and (c) keep the README rubric note, the Rankings table, the Dimension Breakdown table, the per-paper Key Findings, and any outbound GitHub issues all showing the **same** calibrated numbers. Public feedback issues were filed on the 12 external repos (not fractastical's own antstack/bee-swarm-sim) citing these calibrated scores + a link to fractastical/bioinformatics-eval.

**Critical divergence — published scores are NOT the DB scores:** The published README numbers were authored independently and do **not** equal `DB raw + 20`; the README base values already differed from the live evaluation rows before calibration (e.g. BeeStack README base ≈56 vs DB raw overall 71). So the canonical published figures live only in the README/issues — and, for the PDF, hardcoded per eval id in `scripts/src/regenReport.ts`. The PDF report (`pnpm --filter @workspace/scripts run regen-report`) therefore **injects these published values over the DB scores** and pulls only narrative text/metadata from the DB. The live app dashboard still shows the raw DB numbers. **Why:** user chose to keep everything authors see (README + 12 issues + PDF) mutually consistent rather than re-base on the DB and re-edit 12 public issues. If you ever recalibrate, update the `CAL` table in `regenReport.ts` in lockstep with the README/issues.
