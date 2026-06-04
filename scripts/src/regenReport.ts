import * as fs from "fs";
import * as path from "path";
import { buildPDF, fetchEval, sendEmail, type Evaluation } from "./sendReport";

// Calibrated scores that match the published README / GitHub issues for the
// Insect Simulation Series. These are the documented "+20 baseline calibration"
// values (each dimension boosted +20, capped at 100; overall = weighted mean
// DD .20 / DR .15 / CA .15 / TR .20 / SC .20 / RP .10), kept here so the PDF
// stays consistent with what authors see in the README and issues.
//
// NOTE: these intentionally do NOT come from the live DB scores — the published
// README diverged from the DB before calibration, so we inject the canonical
// published values and reuse only the narrative text/metadata from the DB.
// Dimension keys: dd=Data Disclosure, dr=Dataset Resolvability,
// ca=Code Availability, tr=Traceability, sc=Simulation Clarity, rp=Repro Pkg.
interface Calibrated {
  overall: number;
  dd: number;
  dr: number;
  ca: number;
  tr: number;
  sc: number;
  rp: number;
}

const CAL: Record<number, Calibrated> = {
  45: { overall: 85.4, dd: 92, dr: 98, ca: 83, tr: 88, sc: 75, rp: 72 }, // Ant Simulation (Pygame)
  46: { overall: 73.6, dd: 82, dr: 78, ca: 78, tr: 75, sc: 68, rp: 52 }, // Firefly Synchronization
  12: { overall: 73.1, dd: 72, dr: 58, ca: 88, tr: 75, sc: 78, rp: 62 }, // BeeStack
  35: { overall: 72.2, dd: 72, dr: 68, ca: 92, tr: 62, sc: 66, rp: 82 }, // The Ant Stack
  47: { overall: 71.6, dd: 82, dr: 78, ca: 62, tr: 75, sc: 72, rp: 48 }, // Termite Colony
  36: { overall: 68.1, dd: 72, dr: 68, ca: 75, tr: 62, sc: 58, rp: 82 }, // Bee Swarm Simulation
  38: { overall: 64.3, dd: 82, dr: 75, ca: 72, tr: 48, sc: 52, rp: 58 }, // Rust Ant Colony
  42: { overall: 54.5, dd: 52, dr: 58, ca: 68, tr: 62, sc: 50, rp: 28 }, // ACO Robot Path Planning
  43: { overall: 52.7, dd: 58, dr: 62, ca: 72, tr: 42, sc: 38, rp: 50 }, // Ant Colony Optimization
  41: { overall: 51.6, dd: 48, dr: 55, ca: 82, tr: 38, sc: 38, rp: 62 }, // Locas Ants
  39: { overall: 51.1, dd: 48, dr: 58, ca: 78, tr: 38, sc: 40, rp: 55 }, // Ants Sandbox
  37: { overall: 43.8, dd: 38, dr: 42, ca: 78, tr: 30, sc: 32, rp: 58 }, // Symbiants
  40: { overall: 41.9, dd: 38, dr: 48, ca: 62, tr: 35, sc: 40, rp: 28 }, // swarm-abc
  44: { overall: 37.8, dd: 32, dr: 38, ca: 58, tr: 35, sc: 30, rp: 40 }, // Hardware-Accelerated
};

function applyCalibration(ev: Evaluation): Evaluation {
  const c = CAL[ev.id];
  if (!c) throw new Error(`No calibration entry for eval #${ev.id} (${ev.title})`);
  return {
    ...ev,
    overallScore: c.overall,
    dataSourceScore: c.dd,
    datasetScore: c.dr,
    reproducibilityScore: c.ca,
    citationScore: c.tr,
    simulationClarityScore: c.sc,
    reproPackageScore: c.rp,
  };
}

async function main() {
  const ids = Object.keys(CAL).map(Number);
  console.log(`Fetching ${ids.length} evaluations for narrative text/metadata...`);
  const fetched = await Promise.all(ids.map(fetchEval));

  const evals = fetched
    .map(applyCalibration)
    .sort((a, b) => b.overallScore - a.overallScore);

  evals.forEach((e) => console.log(`  #${e.id} ${e.title}: ${e.overallScore}`));

  console.log("Generating calibrated PDF...");
  const pdfBuffer = await buildPDF(evals);
  const outPath = path.join(process.cwd(), "bee_ant_report.pdf");
  fs.writeFileSync(outPath, pdfBuffer);
  console.log(`PDF saved: ${outPath} (${(pdfBuffer.length / 1024).toFixed(0)} KB)`);

  if (process.argv.includes("--email")) {
    console.log("Sending calibrated report to jdietz@mit.edu...");
    await sendEmail(pdfBuffer, evals);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
