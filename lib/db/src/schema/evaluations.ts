import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const evaluationsTable = pgTable("evaluations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  paperUrl: text("paper_url"),
  pdfFilename: text("pdf_filename"),
  extractedText: text("extracted_text"),
  status: text("status").notNull().default("pending"), // pending | analyzing | complete | error

  // 7-dimension rubric scores (0-100 normalized)
  overallScore: real("overall_score"),
  // Dim 1: Data Disclosure (18 pts rubric → 0-100)
  dataSourceScore: real("data_source_score"),
  // Dim 2: Dataset Resolvability (14 pts rubric → 0-100)
  datasetScore: real("dataset_score"),
  // Dim 3: Code Availability & Versioning (14 pts rubric → 0-100)
  reproducibilityScore: real("reproducibility_score"),
  // Dim 4: Code-to-Data Traceability (18 pts rubric → 0-100)
  citationScore: real("citation_score"),
  // Dim 5: Simulation Derivation Clarity (18 pts rubric → 0-100)
  simulationClarityScore: real("simulation_clarity_score"),
  // Dim 6: Reproducibility Package Quality (8 pts rubric → 0-100)
  reproPackageScore: real("repro_package_score"),
  // Dim 7: Information-Theoretic Rigor (10 pts rubric → 0-100)
  informationTheoryScore: real("information_theory_score"),

  // Rubric version that produced the scores above (e.g. "3.0.0").
  // Null = scored before rubric versioning was introduced (rubric unknown).
  rubricVersion: text("rubric_version"),

  summary: text("summary"),
  dataSourcesFound: integer("data_sources_found"),
  datasetsFound: integer("datasets_found"),
  citationsFound: integer("citations_found"),
  findings: text("findings"),
  gaps: text("gaps"),
  recommendations: text("recommendations"),

  // Structured evidence from multi-agent pipeline
  accessions: text("accessions"),       // JSON: ResolvedAccession[]
  evidenceItems: text("evidence_items"), // JSON: EvidenceItem[]
  codeRepoUrl: text("code_repo_url"),   // Detected code repository URL

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEvaluationSchema = createInsertSchema(evaluationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEvaluation = z.infer<typeof insertEvaluationSchema>;
export type Evaluation = typeof evaluationsTable.$inferSelect;
