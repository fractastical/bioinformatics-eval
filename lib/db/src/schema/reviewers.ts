import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// A curated list of people we think could review / give feedback on the
// research. This is a GLOBAL list (not tied to a single paper), distinct from
// the per-paper `outreach` records.
export const reviewersTable = pgTable("reviewers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  affiliation: text("affiliation"),
  // Why this person is a good fit (field / relevance).
  expertise: text("expertise"),
  // not_contacted | contacted | responded | declined
  status: text("status").notNull().default("not_contacted"),
  // What feedback they gave (free text), filled in once they respond.
  feedback: text("feedback"),
  // Freeform working notes (how we found them, when we reached out, etc.).
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertReviewerSchema = createInsertSchema(reviewersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertReviewer = z.infer<typeof insertReviewerSchema>;
export type Reviewer = typeof reviewersTable.$inferSelect;
