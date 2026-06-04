import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { evaluationsTable } from "./evaluations";

// One outreach record per (paper, contact target). A paper can have several:
// a GitHub feedback issue, an email thread, a forum post, etc.
export const outreachTable = pgTable("outreach", {
  id: serial("id").primaryKey(),
  evaluationId: integer("evaluation_id")
    .notNull()
    .references(() => evaluationsTable.id, { onDelete: "cascade" }),

  // github | email | forum | other
  channel: text("channel").notNull().default("github"),
  // Free-form: person/lab name, email address, handle, forum link, etc.
  contact: text("contact"),

  // GitHub-specific linkage (populated when channel === "github")
  githubOwner: text("github_owner"),
  githubRepo: text("github_repo"),
  githubIssueNumber: integer("github_issue_number"),
  githubUrl: text("github_url"),
  githubState: text("github_state"), // open | closed

  // pending | contacted | responded | closed
  status: text("status").notNull().default("pending"),
  notes: text("notes"),

  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// A single response/comment tied to an outreach record. Sourced either from a
// synced GitHub issue comment or entered manually (e.g. an email reply).
export const outreachFeedbackTable = pgTable(
  "outreach_feedback",
  {
    id: serial("id").primaryKey(),
    outreachId: integer("outreach_id")
      .notNull()
      .references(() => outreachTable.id, { onDelete: "cascade" }),

    source: text("source").notNull().default("github"), // github | manual
    author: text("author"),
    body: text("body").notNull(),

    // For dedupe on re-sync (e.g. "gh-comment-<id>"); null for manual entries.
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    externalCreatedAt: timestamp("external_created_at"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // Guarantee dedupe of synced comments at the DB level. Postgres treats
    // NULLs as distinct, so manual entries (null externalId) are unaffected.
    uniqueIndex("outreach_feedback_external_uq").on(table.outreachId, table.externalId),
  ],
);

export const insertOutreachSchema = createInsertSchema(outreachTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOutreach = z.infer<typeof insertOutreachSchema>;
export type Outreach = typeof outreachTable.$inferSelect;

export const insertOutreachFeedbackSchema = createInsertSchema(outreachFeedbackTable).omit({
  id: true,
  createdAt: true,
});
export type InsertOutreachFeedback = z.infer<typeof insertOutreachFeedbackSchema>;
export type OutreachFeedback = typeof outreachFeedbackTable.$inferSelect;
