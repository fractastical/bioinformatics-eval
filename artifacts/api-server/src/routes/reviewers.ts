import { Router } from "express";
import { db, reviewersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const STATUSES = ["not_contacted", "contacted", "responded", "declined"] as const;

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  affiliation: z.string().optional(),
  expertise: z.string().optional(),
  status: z.enum(STATUSES).optional(),
  feedback: z.string().optional(),
  notes: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal("")),
  affiliation: z.string().optional(),
  expertise: z.string().optional(),
  status: z.enum(STATUSES).optional(),
  feedback: z.string().optional(),
  notes: z.string().optional(),
});

// GET /reviewers
router.get("/", async (_req, res) => {
  const rows = await db
    .select()
    .from(reviewersTable)
    .orderBy(desc(reviewersTable.createdAt));
  res.json(rows);
});

// POST /reviewers
router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { email, ...rest } = parsed.data;
  const [row] = await db
    .insert(reviewersTable)
    .values({ ...rest, email: email || null })
    .returning();
  res.status(201).json(row);
});

// PATCH /reviewers/:reviewerId
router.patch("/:reviewerId", async (req, res) => {
  const id = Number(req.params.reviewerId);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid reviewer id" });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const data = { ...parsed.data } as Record<string, unknown>;
  if (data.email === "") data.email = null;
  const [row] = await db
    .update(reviewersTable)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(reviewersTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Reviewer not found" });
    return;
  }
  res.json(row);
});

// DELETE /reviewers/:reviewerId
router.delete("/:reviewerId", async (req, res) => {
  const id = Number(req.params.reviewerId);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid reviewer id" });
    return;
  }
  const [row] = await db
    .delete(reviewersTable)
    .where(eq(reviewersTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Reviewer not found" });
    return;
  }
  res.status(204).end();
});

export default router;
