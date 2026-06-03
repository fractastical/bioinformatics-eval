import PDFDocument from "pdfkit";
import { ReplitConnectors } from "@replit/connectors-sdk";
import * as fs from "fs";
import * as path from "path";

const API_BASE = "http://localhost:80";

interface Evaluation {
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

async function fetchEval(id: number): Promise<Evaluation> {
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

  // Title bar
  doc.rect(margin, doc.y, pageWidth, 32).fillColor(COLORS.primary).fill();
  doc
    .fontSize(14)
    .fillColor("white")
    .text(ev.title, margin + 10, doc.y - 28, { width: pageWidth - 20 });
  doc.moveDown(0.3);

  // URL + date row
  const url = ev.paperUrl ?? "—";
  doc
    .fontSize(8)
    .fillColor(COLORS.midGray)
    .text(`Source: ${url}`, margin, doc.y, { width: pageWidth - 120, lineBreak: false });
  doc
    .fontSize(8)
    .fillColor(COLORS.midGray)
    .text(
      `Evaluated: ${new Date(ev.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
      margin + pageWidth - 120,
      doc.y - doc.currentLineHeight(),
      { width: 120, align: "right" }
    );
  doc.moveDown(0.8);

  // Overall score callout
  const scoreBoxY = doc.y;
  doc.rect(margin, scoreBoxY, 110, 54).fillColor(COLORS.lightGray).fill();
  doc
    .fontSize(36)
    .fillColor(scoreColor(ev.overallScore))
    .text(ev.overallScore.toFixed(1), margin, scoreBoxY + 4, { width: 110, align: "center" });
  doc
    .fontSize(9)
    .fillColor(COLORS.midGray)
    .text("Overall Score /100", margin, scoreBoxY + 40, { width: 110, align: "center" });

  // Dimension bars
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
  let barsY = scoreBoxY + 2;
  for (const [label, score] of dims) {
    drawScoreBar(doc, barsX, barsY, barsWidth, score ?? 0, label);
    barsY += 16;
  }
  doc.y = Math.max(doc.y, scoreBoxY + 58);
  doc.moveDown(0.8);

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

async function buildPDF(evals: Evaluation[]): Promise<Buffer> {
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

    // Intro blurb
    doc
      .fontSize(9)
      .fillColor(COLORS.darkGray)
      .text(
        "This report presents structured reproducibility evaluations for two simulation scaffold papers from the docxology research group. Each paper is scored across six dimensions: Data Disclosure, Dataset Resolvability, Code Availability, Traceability, Simulation Clarity, and Reproducibility Package Quality.",
        margin,
        doc.y,
        { width: pageWidth, lineGap: 2 }
      );
    doc.moveDown(1.2);

    // Comparison table
    doc.rect(margin, doc.y, pageWidth, 20).fillColor(COLORS.accent).fill();
    doc.fontSize(9).fillColor("white").text("Quick Comparison", margin + 6, doc.y - 16);
    doc.moveDown(0.3);

    const headers = ["Paper", "Overall", "Code", "Simulation", "Reproducibility"];
    const colWidths = [220, 60, 60, 70, 80];
    let tableX = margin;
    const tableY = doc.y;
    doc.rect(margin, tableY, pageWidth, 16).fillColor(COLORS.lightGray).fill();
    headers.forEach((h, i) => {
      doc.fontSize(8).fillColor(COLORS.darkGray).text(h, tableX + 4, tableY + 4, { width: colWidths[i] });
      tableX += colWidths[i];
    });
    doc.y = tableY + 18;

    for (const ev of evals) {
      const rowY = doc.y;
      tableX = margin;
      const rowData = [
        ev.title.slice(0, 40) + (ev.title.length > 40 ? "…" : ""),
        ev.overallScore.toFixed(1),
        (ev.reproducibilityScore ?? 0).toFixed(0),
        (ev.simulationClarityScore ?? 0).toFixed(0),
        (ev.reproPackageScore ?? 0).toFixed(0),
      ];
      rowData.forEach((cell, i) => {
        const color = i > 0 ? scoreColor(parseFloat(cell)) : COLORS.darkGray;
        doc.fontSize(8).fillColor(color).text(cell, tableX + 4, rowY + 3, { width: colWidths[i] });
        tableX += colWidths[i];
      });
      doc.y = rowY + 16;
    }
    doc.moveDown(1.5);
    doc.rect(margin, doc.y, pageWidth, 1).fillColor("#e2e8f0").fill();
    doc.moveDown(1.2);

    // Detailed sections
    for (const ev of evals) {
      if (doc.y > 650) doc.addPage();
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

async function sendEmail(pdfBuffer: Buffer): Promise<void> {
  const connectors = new ReplitConnectors();
  const b64 = pdfBuffer.toString("base64");

  const body = {
    from: "BioEval <joel@bioelectricitynexus.com>",
    to: ["jdietz@mit.edu"],
    subject: "BioEval Reproducibility Report — AntStack & BeeStack",
    html: `<p>Hi,</p>
<p>Please find attached the BioEval reproducibility evaluation report for two simulation scaffold papers:</p>
<ul>
  <li><strong>BeeStack</strong> — Evidence-Typed Scaffold for Whole-Colony Honeybee Simulation (Overall: 46.1 / 100)</li>
  <li><strong>AntStack</strong> — Reproducible Workspace for Ant-Inspired Simulation &amp; Complexity Energetics</li>
</ul>
<p>Each paper is scored across six dimensions: Data Disclosure, Dataset Resolvability, Code Availability, Code-to-Data Traceability, Simulation Clarity, and Reproducibility Package Quality.</p>
<p>Best,<br/>BioEval</p>`,
    attachments: [
      {
        filename: "BioEval_AntStack_BeeStack_Report.pdf",
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
  console.log("Fetching evaluations...");
  const [beestack, antstack] = await Promise.all([fetchEval(12), fetchEval(35)]);

  if (antstack.overallScore == null || beestack.overallScore == null) {
    console.error("One or both evaluations not yet complete. Re-run after analysis finishes.");
    process.exit(1);
  }

  console.log(`BeeStack: ${beestack.overallScore} | AntStack: ${antstack.overallScore}`);

  console.log("Generating PDF...");
  const pdfBuffer = await buildPDF([beestack, antstack]);
  const outPath = path.join(process.cwd(), "antstack_beestack_report.pdf");
  fs.writeFileSync(outPath, pdfBuffer);
  console.log(`PDF saved: ${outPath} (${(pdfBuffer.length / 1024).toFixed(0)} KB)`);

  console.log("Sending email to jdietz@mit.edu...");
  await sendEmail(pdfBuffer);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
