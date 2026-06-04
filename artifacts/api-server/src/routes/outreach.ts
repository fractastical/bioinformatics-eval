import { Router } from "express";
import {
  db,
  evaluationsTable,
  outreachTable,
  outreachFeedbackTable,
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";
import { parseGithubIssueUrl, fetchIssue, fetchIssueComments } from "../lib/github";

const router = Router({ mergeParams: true });

type OutreachRow = typeof outreachTable.$inferSelect;
type FeedbackRow = typeof outreachFeedbackTable.$inferSelect;

function serializeFeedback(row: FeedbackRow) {
  return {
    ...row,
    externalCreatedAt: row.externalCreatedAt ? row.externalCreatedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeOutreach(row: OutreachRow, feedback: FeedbackRow[]) {
  return {
    ...row,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    feedback: feedback.map(serializeFeedback),
  };
}

async function loadFeedback(outreachId: number) {
  return db
    .select()
    .from(outreachFeedbackTable)
    .where(eq(outreachFeedbackTable.outreachId, outreachId))
    .orderBy(asc(outreachFeedbackTable.externalCreatedAt), asc(outreachFeedbackTable.createdAt));
}

async function getOutreachWithFeedback(evalId: number, outreachId: number) {
  const [row] = await db
    .select()
    .from(outreachTable)
    .where(and(eq(outreachTable.id, outreachId), eq(outreachTable.evaluationId, evalId)));
  if (!row) return null;
  const feedback = await loadFeedback(outreachId);
  return { row, feedback };
}

// GET /evaluations/:id/outreach
router.get("/", async (req, res) => {
  const evalId = Number((req.params as Record<string, string>).id);
  if (isNaN(evalId)) {
    res.status(400).json({ error: "Invalid evaluation id" });
    return;
  }
  const rows = await db
    .select()
    .from(outreachTable)
    .where(eq(outreachTable.evaluationId, evalId))
    .orderBy(asc(outreachTable.createdAt));

  const result = [];
  for (const row of rows) {
    const feedback = await loadFeedback(row.id);
    result.push(serializeOutreach(row, feedback));
  }
  res.json(result);
});

// POST /evaluations/:id/outreach
router.post("/", async (req, res) => {
  const evalId = Number((req.params as Record<string, string>).id);
  if (isNaN(evalId)) {
    res.status(400).json({ error: "Invalid evaluation id" });
    return;
  }

  const schema = z.object({
    channel: z.enum(["github", "email", "forum", "other"]),
    contact: z.string().optional(),
    githubUrl: z.string().optional(),
    status: z.enum(["pending", "contacted", "responded", "closed"]).optional(),
    notes: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const [evalRow] = await db
    .select()
    .from(evaluationsTable)
    .where(eq(evaluationsTable.id, evalId));
  if (!evalRow) {
    res.status(404).json({ error: "Evaluation not found" });
    return;
  }

  const { channel, contact, githubUrl, status, notes } = parsed.data;

  const values: typeof outreachTable.$inferInsert = {
    evaluationId: evalId,
    channel,
    contact: contact ?? null,
    status: status ?? "pending",
    notes: notes ?? null,
  };

  if (channel === "github") {
    if (!githubUrl) {
      res.status(400).json({ error: "githubUrl is required for GitHub outreach" });
      return;
    }
    const parsedUrl = parseGithubIssueUrl(githubUrl);
    if (!parsedUrl) {
      res.status(400).json({ error: "Invalid GitHub issue URL" });
      return;
    }
    values.githubOwner = parsedUrl.owner;
    values.githubRepo = parsedUrl.repo;
    values.githubIssueNumber = parsedUrl.issueNumber;
    values.githubUrl = githubUrl.trim();
  }

  const [row] = await db.insert(outreachTable).values(values).returning();
  const feedback = await loadFeedback(row.id);
  res.status(201).json(serializeOutreach(row, feedback));
});

// PATCH /evaluations/:id/outreach/:outreachId
router.patch("/:outreachId", async (req, res) => {
  const evalId = Number((req.params as Record<string, string>).id);
  const outreachId = Number((req.params as Record<string, string>).outreachId);
  if (isNaN(evalId) || isNaN(outreachId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const schema = z.object({
    contact: z.string().optional(),
    status: z.enum(["pending", "contacted", "responded", "closed"]).optional(),
    notes: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const existing = await getOutreachWithFeedback(evalId, outreachId);
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [row] = await db
    .update(outreachTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(outreachTable.id, outreachId))
    .returning();
  const feedback = await loadFeedback(outreachId);
  res.json(serializeOutreach(row, feedback));
});

// DELETE /evaluations/:id/outreach/:outreachId
router.delete("/:outreachId", async (req, res) => {
  const evalId = Number((req.params as Record<string, string>).id);
  const outreachId = Number((req.params as Record<string, string>).outreachId);
  if (isNaN(evalId) || isNaN(outreachId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const existing = await getOutreachWithFeedback(evalId, outreachId);
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await db.delete(outreachTable).where(eq(outreachTable.id, outreachId));
  res.status(204).end();
});

// POST /evaluations/:id/outreach/:outreachId/sync
router.post("/:outreachId/sync", async (req, res) => {
  const evalId = Number((req.params as Record<string, string>).id);
  const outreachId = Number((req.params as Record<string, string>).outreachId);
  if (isNaN(evalId) || isNaN(outreachId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const existing = await getOutreachWithFeedback(evalId, outreachId);
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const { row } = existing;
  if (
    row.channel !== "github" ||
    !row.githubOwner ||
    !row.githubRepo ||
    row.githubIssueNumber == null
  ) {
    res.status(400).json({ error: "Not a GitHub-linked outreach record" });
    return;
  }

  let issue, comments;
  try {
    issue = await fetchIssue(row.githubOwner, row.githubRepo, row.githubIssueNumber);
    comments = await fetchIssueComments(row.githubOwner, row.githubRepo, row.githubIssueNumber);
  } catch (err) {
    req.log.error({ err }, "GitHub sync failed");
    res.status(502).json({ error: "Failed to reach GitHub" });
    return;
  }

  // Insert comments as feedback, deduped at the DB level by (outreachId,
  // externalId). on-conflict makes re-sync idempotent even under concurrency.
  for (const c of comments) {
    await db
      .insert(outreachFeedbackTable)
      .values({
        outreachId,
        source: "github",
        author: c.authorLogin,
        body: c.body,
        externalId: `gh-comment-${c.id}`,
        externalUrl: c.htmlUrl,
        externalCreatedAt: new Date(c.createdAt),
      })
      .onConflictDoNothing({
        target: [outreachFeedbackTable.outreachId, outreachFeedbackTable.externalId],
      });
  }

  // A reply from anyone other than the issue author (us) means they responded.
  // Status only advances — never regress a record that's already `responded`
  // (e.g. via a manually recorded reply) just because GitHub has no comments.
  const hasResponse = comments.some(
    (c) => c.authorLogin && issue.authorLogin && c.authorLogin !== issue.authorLogin,
  );
  let status = row.status;
  if (status !== "closed" && status !== "responded") {
    status = hasResponse ? "responded" : "contacted";
  }

  const [updated] = await db
    .update(outreachTable)
    .set({
      githubState: issue.state,
      status,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(outreachTable.id, outreachId))
    .returning();

  const feedback = await loadFeedback(outreachId);
  res.json(serializeOutreach(updated, feedback));
});

// POST /evaluations/:id/outreach/:outreachId/feedback
router.post("/:outreachId/feedback", async (req, res) => {
  const evalId = Number((req.params as Record<string, string>).id);
  const outreachId = Number((req.params as Record<string, string>).outreachId);
  if (isNaN(evalId) || isNaN(outreachId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const schema = z.object({
    author: z.string().optional(),
    body: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const existing = await getOutreachWithFeedback(evalId, outreachId);
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db.insert(outreachFeedbackTable).values({
    outreachId,
    source: "manual",
    author: parsed.data.author ?? null,
    body: parsed.data.body,
  });

  // A recorded reply means they responded (unless already closed).
  const newStatus = existing.row.status === "closed" ? "closed" : "responded";
  const [updated] = await db
    .update(outreachTable)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(outreachTable.id, outreachId))
    .returning();

  const feedback = await loadFeedback(outreachId);
  res.status(201).json(serializeOutreach(updated, feedback));
});

export default router;
