import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { evaluationsTable } from "./evaluations";

export const codeAnalysesTable = pgTable("code_analyses", {
  id: serial("id").primaryKey(),
  evaluationId: integer("evaluation_id").notNull().references(() => evaluationsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Code Analysis"),
  codeSnippet: text("code_snippet").notNull(),
  language: text("language").notNull().default("python"),
  status: text("status").notNull().default("pending"), // pending | analyzing | complete | error
  overallTraceability: real("overall_traceability"),
  summary: text("summary"),
  // JSON: CodeSegment[] — each segment has label, code, dataSource, citation,
  // confidence (high|medium|low), paramSource (9-class taxonomy), issues[]
  segments: text("segments"),
  // JSON: TraceabilityRow[] — the structured traceability matrix
  traceabilityMatrix: text("traceability_matrix"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCodeAnalysisSchema = createInsertSchema(codeAnalysesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCodeAnalysis = z.infer<typeof insertCodeAnalysisSchema>;
export type CodeAnalysis = typeof codeAnalysesTable.$inferSelect;
