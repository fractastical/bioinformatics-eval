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
  overallScore: real("overall_score"),
  dataSourceScore: real("data_source_score"),
  datasetScore: real("dataset_score"),
  reproducibilityScore: real("reproducibility_score"),
  citationScore: real("citation_score"),
  summary: text("summary"),
  dataSourcesFound: integer("data_sources_found"),
  datasetsFound: integer("datasets_found"),
  citationsFound: integer("citations_found"),
  findings: text("findings"),
  gaps: text("gaps"),
  recommendations: text("recommendations"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEvaluationSchema = createInsertSchema(evaluationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEvaluation = z.infer<typeof insertEvaluationSchema>;
export type Evaluation = typeof evaluationsTable.$inferSelect;
