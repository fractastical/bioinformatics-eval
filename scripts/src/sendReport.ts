import PDFDocument from "pdfkit";
import { ReplitConnectors } from "@replit/connectors-sdk";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const API_BASE = "http://localhost:80";

export interface Evaluation {
  id: number;
  title: string;
  paperUrl: string;
  overallScore: number;
  dataSourceScore: number;
  datasetScore: number;
  reproducibilityScore: number;
  citationScore: number;
  simulationClarityScore: number;
  reproPackageScore: number;
  summary: string;
  findings: string;
  gaps: string;
  recommendations: string;
  createdAt: string;
}

export async function fetchEval(id: number): Promise<Evaluation> {
  const r = await fetch(`${API_BASE}/api/evaluations/${id}`);
  return r.json() as Promise<Evaluation>;
}

const COLORS = {
  primary: "#1a365d",
  accent: "#2563eb",
  green: "#16a34a",
  orange: "#d97706",
  red: "#dc2626",
  lightGray: "#f1f5f9",
  midGray: "#94a3b8",
  darkGray: "#334155",
};

function scoreColor(score: number): string {
  if (score >= 60) return COLORS.green;
  if (score >= 40) return COLORS.orange;
  return COLORS.red;
}

function drawScoreBar(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  score: number,
  label: string
): void {
  const barWidth = width - 100;
  const filled = (score / 100) * barWidth;

  doc.fontSize(9).fillColor(COLORS.darkGray).text(label, x, y + 2, { width: 90 });
  doc.rect(x + 95, y + 4, barWidth, 10).fillColor("#e2e8f0").fill();
  doc.rect(x + 95, y + 4, filled, 10).fillColor(scoreColor(score)).fill();
  doc
    .fontSize(9)
    .fillColor(scoreColor(score))
    .text(`${Math.round(score)}`, x + 95 + barWidth + 5, y + 2);
}

function addEvalSection(doc: PDFKit.PDFDocument, ev: Evaluation): void {
  const margin = 50;
  const pageWidth = doc.page.width - margin * 2;

  // --- Title bar (anchor to titleY before drawing anything) ---
  const titleY = doc.y;
  doc.rect(margin, titleY, pageWidth, 36).fillColor(COLORS.primary).fill();
  doc.fontSize(13).fillColor("white").text(ev.title, margin + 10, titleY + 10, { width: pageWidth - 20, lineBreak: false });
  doc.y = titleY + 42; // advance cursor past the bar

  // URL + date row
  const url = ev.paperUrl ?? "—";
  const metaY = doc.y;
  doc.fontSize(8).fillColor(COLORS.midGray)
    .text(`Source: ${url}`, margin, metaY, { width: pageWidth - 160, lineBreak: false });
  const dateStr = new Date(ev.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  doc.fontSize(8).fillColor(COLORS.midGray)
    .text(`Evaluated: ${dateStr}`, margin + pageWidth - 155, metaY, { width: 155, align: "right" });
  doc.y = metaY + 18;

  // --- Score callout box + dimension bars (both anchored to scoreY) ---
  const scoreY = doc.y;
  const scoreBoxH = 110;

  // Score box
  doc.rect(margin, scoreY, 110, scoreBoxH).fillColor(COLORS.lightGray).fill();
  doc.fontSize(38).fillColor(scoreColor(ev.overallScore))
    .text(ev.overallScore.toFixed(1), margin, scoreY + 12, { width: 110, align: "center" });
  doc.fontSize(8).fillColor(COLORS.midGray)
    .text("Overall /100", margin, scoreY + 56, { width: 110, align: "center" });

  // Dimension bars — pinned to scoreY, independent of cursor
  const barsX = margin + 120;
  const barsWidth = pageWidth - 120;
  const dims: [string, number][] = [
    ["Data Disclosure", ev.dataSourceScore],
    ["Dataset Resolvability", ev.datasetScore],
    ["Code Availability", ev.reproducibilityScore],
    ["Traceability", ev.citationScore],
    ["Simulation Clarity", ev.simulationClarityScore],
    ["Reproducibility Pkg", ev.reproPackageScore],
  ];
  dims.forEach(([label, score], i) => {
    drawScoreBar(doc, barsX, scoreY + 4 + i * 17, barsWidth, score ?? 0, label);
  });

  doc.y = scoreY + scoreBoxH + 10;

  // Summary
  doc.fontSize(10).fillColor(COLORS.accent).text("Summary", margin);
  doc.moveDown(0.2);
  doc
    .fontSize(9)
    .fillColor(COLORS.darkGray)
    .text(ev.summary ?? "", margin, doc.y, { width: pageWidth, lineGap: 2 });
  doc.moveDown(0.7);

  // Stacked sections: findings / gaps / recommendations
  const sections: [string, string, string][] = [
    ["Positive Findings", ev.findings ?? "", COLORS.green],
    ["Gaps Identified", ev.gaps ?? "", COLORS.red],
    ["Recommendations", ev.recommendations ?? "", COLORS.accent],
  ];

  for (const [heading, body, color] of sections) {
    doc.fontSize(9).fillColor(color).text(heading, margin);
    doc.moveDown(0.15);
    doc.fontSize(8).fillColor(COLORS.darkGray).text(body, margin, doc.y, { width: pageWidth, lineGap: 1.5 });
    doc.moveDown(0.6);
  }
  doc.moveDown(0.5);

  // Separator
  doc.rect(margin, doc.y, pageWidth, 1).fillColor("#e2e8f0").fill();
  doc.moveDown(1.2);
}

export async function buildPDF(evals: Evaluation[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const margin = 50;
    const pageWidth = doc.page.width - margin * 2;

    // Cover header
    doc.rect(0, 0, doc.page.width, 90).fillColor(COLORS.primary).fill();
    doc.fontSize(22).fillColor("white").text("BioEval Reproducibility Report", margin, 28);
    doc.fontSize(10).fillColor("#93c5fd").text(
      `Computational Simulation Papers — Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
      margin,
      58
    );
    doc.y = 110;
    doc.moveDown(0.5);

    // Intro blurb — dynamic
    doc
      .fontSize(9)
      .fillColor(COLORS.darkGray)
      .text(
        `This report presents structured reproducibility evaluations for ${evals.length} computational simulation ${evals.length === 1 ? "project" : "projects"}. Each is scored across six dimensions: Data Disclosure, Dataset Resolvability, Code Availability, Traceability, Simulation Clarity, and Reproducibility Package Quality. Papers are ordered by overall score.`,
        margin,
        doc.y,
        { width: pageWidth, lineGap: 2 }
      );
    doc.moveDown(1.2);

    // Comparison table — all 6 dimensions
    const headerBarY = doc.y;
    doc.rect(margin, headerBarY, pageWidth, 20).fillColor(COLORS.accent).fill();
    doc.fontSize(9).fillColor("white").text("All Papers — Score Summary", margin + 6, headerBarY + 5);
    doc.y = headerBarY + 24;

    const headers = ["Paper", "Score", "Disclosure", "Dataset", "Code", "Trace", "Sim", "Repro"];
    const colWidths = [162, 40, 52, 46, 40, 42, 40, 43];
    let tableX = margin;
    const tableY = doc.y;
    doc.rect(margin, tableY, pageWidth, 14).fillColor(COLORS.lightGray).fill();
    headers.forEach((h, i) => {
      doc.fontSize(7).fillColor(COLORS.darkGray).text(h, tableX + 3, tableY + 3, { width: colWidths[i] });
      tableX += colWidths[i];
    });
    doc.y = tableY + 16;

    for (const ev of evals) {
      const rowY = doc.y;
      tableX = margin;
      const rowData = [
        ev.title.slice(0, 38) + (ev.title.length > 38 ? "…" : ""),
        ev.overallScore.toFixed(1),
        (ev.dataSourceScore ?? 0).toFixed(0),
        (ev.datasetScore ?? 0).toFixed(0),
        (ev.reproducibilityScore ?? 0).toFixed(0),
        (ev.citationScore ?? 0).toFixed(0),
        (ev.simulationClarityScore ?? 0).toFixed(0),
        (ev.reproPackageScore ?? 0).toFixed(0),
      ];
      rowData.forEach((cell, i) => {
        const color = i > 0 ? scoreColor(parseFloat(cell)) : COLORS.darkGray;
        doc.fontSize(7.5).fillColor(color).text(cell, tableX + 3, rowY + 3, { width: colWidths[i], lineBreak: false });
        tableX += colWidths[i];
      });
      doc.y = rowY + 14;
    }
    doc.moveDown(1.5);
    doc.rect(margin, doc.y, pageWidth, 1).fillColor("#e2e8f0").fill();
    doc.moveDown(1.2);

    // Detailed sections — each paper starts on a fresh page
    for (const ev of evals) {
      doc.addPage();
      addEvalSection(doc, ev);
    }

    // Footer on each page
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc
        .fontSize(7)
        .fillColor(COLORS.midGray)
        .text(
          `BioEval Reproducibility Report  •  Page ${i + 1} of ${pages.count}  •  bioeval.replit.app`,
          margin,
          doc.page.height - 30,
          { width: pageWidth, align: "center" }
        );
    }

    doc.end();
  });
}

export async function sendEmail(pdfBuffer: Buffer, evals: Evaluation[]): Promise<void> {
  const connectors = new ReplitConnectors();
  const b64 = pdfBuffer.toString("base64");

  const sorted = [...evals].sort((a, b) => b.overallScore - a.overallScore);
  const listItems = sorted
    .map(e => `  <li><strong>${e.title}</strong> — Overall: <strong>${e.overallScore.toFixed(1)} / 100</strong></li>`)
    .join("\n");

  const slugs = sorted.map(e => e.title.split(/\s+/).slice(0, 3).join("_")).join("_&_");
  const filename = `BioEval_Report_${new Date().toISOString().slice(0, 10)}.pdf`;

  const body = {
    from: "BioEval <joel@bioelectricitynexus.com>",
    to: ["jdietz@mit.edu"],
    subject: `BioEval Reproducibility Report — ${evals.length} Simulation Projects`,
    html: `<p>Hi,</p>
<p>Please find attached the BioEval reproducibility evaluation report for ${evals.length} computational simulation ${evals.length === 1 ? "project" : "projects"}, ranked by overall score:</p>
<ul>
${listItems}
</ul>
<p>Each project is scored across six dimensions: Data Disclosure, Dataset Resolvability, Code Availability, Code-to-Data Traceability, Simulation Clarity, and Reproducibility Package Quality.</p>
<p>Full findings, gaps, and recommendations for each project are included in the attached PDF.</p>
<p>Best,<br/>BioEval</p>`,
    attachments: [
      {
        filename,
        content: b64,
      },
    ],
  };

  const response = await connectors.proxy("resend", "/emails", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

  const result = (await response.json()) as { id?: string; message?: string };
  if (result.id) {
    console.log("Email sent! Message ID:", result.id);
  } else {
    console.error("Send failed:", JSON.stringify(result));
    process.exit(1);
  }
}

async function main() {
  const ids: number[] = process.argv.slice(2).map(Number).filter(Boolean);
  const evalIds = ids.length > 0 ? ids : [12, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47];

  console.log(`Fetching evaluations: ${evalIds.join(", ")}...`);
  const evals = await Promise.all(evalIds.map(fetchEval));

  const incomplete = evals.filter(e => e.overallScore == null);
  if (incomplete.length > 0) {
    console.error(`Not yet complete: ${incomplete.map(e => `#${e.id} ${e.title}`).join(", ")}`);
    process.exit(1);
  }

  // Highest-scoring papers first, everywhere (cover table, detail pages, email)
  evals.sort((a, b) => b.overallScore - a.overallScore);

  evals.forEach(e => console.log(`  #${e.id} ${e.title}: ${e.overallScore}`));

  console.log("Generating PDF...");
  const pdfBuffer = await buildPDF(evals);
  const outPath = path.join(process.cwd(), "bee_ant_report.pdf");
  fs.writeFileSync(outPath, pdfBuffer);
  console.log(`PDF saved: ${outPath} (${(pdfBuffer.length / 1024).toFixed(0)} KB)`);

  console.log("Sending email to jdietz@mit.edu...");
  await sendEmail(pdfBuffer, evals);
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
