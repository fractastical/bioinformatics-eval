/**
 * Weekly outreach digest.
 *
 * Self-contained (no running API server needed) so it can run as a Replit
 * Scheduled Deployment. For every evaluated project this:
 *   1. Re-syncs each GitHub-linked feedback issue (so "have they responded?" is fresh).
 *   2. Builds a status summary (repo, issue link + state, response status, latest reply).
 *   3. Emails the digest to jdietz@mit.edu via the Resend connector.
 *
 * Run directly to SEND:
 *   pnpm --filter @workspace/scripts run outreach-digest
 * Build + print WITHOUT sending (for testing):
 *   pnpm --filter @workspace/scripts run outreach-digest -- --dry-run
 *
 * Requires: DATABASE_URL, plus the `github` and `resend` connectors.
 */
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  db,
  pool,
  evaluationsTable,
  outreachTable,
  outreachFeedbackTable,
} from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { fileURLToPath } from "url";

const RECIPIENT = "jdietz@mit.edu";
const FROM = "BioEval <joel@bioelectricitynexus.com>";

type OutreachRow = typeof outreachTable.$inferSelect;
type FeedbackRow = typeof outreachFeedbackTable.$inferSelect;
type EvalRow = typeof evaluationsTable.$inferSelect;

// ---- GitHub (via the Replit `github` connector) --------------------------

interface GithubIssue {
  state: string;
  authorLogin: string | null;
}
interface GithubComment {
  id: number;
  authorLogin: string | null;
  body: string;
  htmlUrl: string;
  createdAt: string;
}

async function fetchIssue(owner: string, repo: string, n: number): Promise<GithubIssue> {
  const res = await new ReplitConnectors().proxy(
    "github",
    `/repos/${owner}/${repo}/issues/${n}`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(`issue fetch ${res.status}`);
  const j = (await res.json()) as { state: string; user?: { login?: string } };
  return { state: j.state, authorLogin: j.user?.login ?? null };
}

async function fetchIssueComments(owner: string, repo: string, n: number): Promise<GithubComment[]> {
  const out: GithubComment[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await new ReplitConnectors().proxy(
      "github",
      `/repos/${owner}/${repo}/issues/${n}/comments?per_page=100&page=${page}`,
      { method: "GET" },
    );
    if (!res.ok) throw new Error(`comments fetch ${res.status}`);
    const batch = (await res.json()) as Array<{
      id: number;
      user?: { login?: string };
      body?: string;
      html_url?: string;
      created_at?: string;
    }>;
    for (const c of batch) {
      out.push({
        id: c.id,
        authorLogin: c.user?.login ?? null,
        body: c.body ?? "",
        htmlUrl: c.html_url ?? "",
        createdAt: c.created_at ?? new Date().toISOString(),
      });
    }
    if (batch.length < 100) break;
  }
  return out;
}

// Mirror of the API's sync route: dedupe comments, advance status monotonically.
async function syncGithubOutreach(row: OutreachRow): Promise<void> {
  if (
    row.channel !== "github" ||
    !row.githubOwner ||
    !row.githubRepo ||
    row.githubIssueNumber == null
  ) {
    return;
  }
  const issue = await fetchIssue(row.githubOwner, row.githubRepo, row.githubIssueNumber);
  const comments = await fetchIssueComments(row.githubOwner, row.githubRepo, row.githubIssueNumber);

  for (const c of comments) {
    await db
      .insert(outreachFeedbackTable)
      .values({
        outreachId: row.id,
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

  const hasResponse = comments.some(
    (c) => c.authorLogin && issue.authorLogin && c.authorLogin !== issue.authorLogin,
  );
  let status = row.status;
  if (status !== "closed" && status !== "responded") {
    status = hasResponse ? "responded" : "contacted";
  }

  await db
    .update(outreachTable)
    .set({
      githubState: issue.state,
      status,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(outreachTable.id, row.id));
}

// ---- Gather --------------------------------------------------------------

interface ProjectStatus {
  evaluation: EvalRow;
  outreach: OutreachRow[];
  feedbackByOutreach: Map<number, FeedbackRow[]>;
}

async function gather(): Promise<ProjectStatus[]> {
  const evals = await db
    .select()
    .from(evaluationsTable)
    .orderBy(asc(evaluationsTable.id));

  const out: ProjectStatus[] = [];
  for (const ev of evals) {
    const records = await db
      .select()
      .from(outreachTable)
      .where(eq(outreachTable.evaluationId, ev.id))
      .orderBy(asc(outreachTable.createdAt));

    // Refresh GitHub-linked records so the "responded?" signal is current.
    for (const o of records) {
      if (o.channel === "github" && o.githubIssueNumber != null) {
        try {
          await syncGithubOutreach(o);
        } catch (err) {
          console.warn(
            `  ! sync failed for eval #${ev.id} outreach #${o.id}: ${
              err instanceof Error ? err.message : err
            } (using stored status)`,
          );
        }
      }
    }

    // Re-read after sync to pick up new status + feedback.
    const refreshed = await db
      .select()
      .from(outreachTable)
      .where(eq(outreachTable.evaluationId, ev.id))
      .orderBy(asc(outreachTable.createdAt));

    const feedbackByOutreach = new Map<number, FeedbackRow[]>();
    for (const o of refreshed) {
      const fb = await db
        .select()
        .from(outreachFeedbackTable)
        .where(eq(outreachFeedbackTable.outreachId, o.id))
        .orderBy(
          asc(outreachFeedbackTable.externalCreatedAt),
          asc(outreachFeedbackTable.createdAt),
        );
      feedbackByOutreach.set(o.id, fb);
    }

    out.push({ evaluation: ev, outreach: refreshed, feedbackByOutreach });
  }
  return out;
}

// ---- Render --------------------------------------------------------------

type StatusKey = "responded" | "contacted" | "pending" | "noOutreach";

// Single source of truth for both the summary counts and the per-row label,
// aggregating across all of a project's outreach records (any channel).
function projectStatusKey(p: ProjectStatus): StatusKey {
  if (!p.outreach.length) return "noOutreach";
  if (p.outreach.some((o) => o.status === "responded" || o.status === "closed")) return "responded";
  if (p.outreach.some((o) => o.status === "contacted")) return "contacted";
  return "pending";
}

function statusLabel(p: ProjectStatus, key: StatusKey): string {
  switch (key) {
    case "noOutreach":
      return "— No outreach logged";
    case "responded":
      return p.outreach.some((o) => o.status === "closed") ? "🔒 Closed" : "✅ Responded";
    case "contacted":
      return "⏳ Awaiting response";
    default:
      return "• Not yet contacted";
  }
}

function latestExternalReply(fb: FeedbackRow[]): FeedbackRow | null {
  const sorted = [...fb].sort((a, b) => {
    const ta = new Date(a.externalCreatedAt ?? a.createdAt).getTime();
    const tb = new Date(b.externalCreatedAt ?? b.createdAt).getTime();
    return tb - ta;
  });
  return sorted[0] ?? null;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildHtml(projects: ProjectStatus[]): { html: string; counts: Record<string, number> } {
  const counts: Record<string, number> = { responded: 0, contacted: 0, pending: 0, noOutreach: 0 };

  const rank = (p: ProjectStatus): number => {
    const key = projectStatusKey(p);
    if (key === "responded") return 0;
    if (key === "contacted" || key === "pending") return 1;
    return 2;
  };
  const sorted = [...projects].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (b.evaluation.overallScore ?? 0) - (a.evaluation.overallScore ?? 0),
  );

  const rows: string[] = [];
  for (const p of sorted) {
    const ev = p.evaluation;
    const gh = p.outreach.find((o) => o.channel === "github");
    const other = p.outreach.filter((o) => o.channel !== "github");

    const key = projectStatusKey(p);
    counts[key]++;

    const repoCell =
      gh && gh.githubOwner && gh.githubRepo
        ? `<a href="https://github.com/${esc(gh.githubOwner)}/${esc(gh.githubRepo)}">${esc(gh.githubOwner)}/${esc(gh.githubRepo)}</a>`
        : ev.paperUrl
          ? `<a href="${esc(ev.paperUrl)}">source</a>`
          : "—";

    const issueCell = gh?.githubUrl
      ? `<a href="${esc(gh.githubUrl)}">#${gh.githubIssueNumber}</a>${gh.githubState ? ` (${esc(gh.githubState)})` : ""}`
      : other.length
        ? esc(other.map((o) => o.channel).join(", "))
        : "—";

    const reply = gh ? latestExternalReply(p.feedbackByOutreach.get(gh.id) ?? []) : null;
    const replyCell = reply
      ? `<span title="${esc(reply.body.slice(0, 300))}">${esc(reply.author ?? "?")}, ${new Date(
          reply.externalCreatedAt ?? reply.createdAt,
        ).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>`
      : "—";

    const label = statusLabel(p, key);

    rows.push(`<tr>
  <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${esc(ev.title)}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${repoCell}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${issueCell}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-weight:600;">${esc(label)}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${replyCell}</td>
</tr>`);
  }

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <h2 style="color:#0f766e;margin-bottom:4px;">BioEval — Weekly Outreach Digest</h2>
  <p style="color:#64748b;margin-top:0;">${today}</p>
  <p>Status of author outreach across <strong>${projects.length}</strong> evaluated ${projects.length === 1 ? "project" : "projects"}:</p>
  <ul>
    <li><strong>${counts.responded}</strong> responded / closed</li>
    <li><strong>${counts.contacted}</strong> awaiting response</li>
    <li><strong>${counts.pending}</strong> contacted but no status / not yet contacted</li>
    <li><strong>${counts.noOutreach}</strong> no outreach logged yet</li>
  </ul>
  <table style="border-collapse:collapse;width:100%;font-size:13px;">
    <thead>
      <tr style="background:#f1f5f9;text-align:left;">
        <th style="padding:6px 8px;">Project</th>
        <th style="padding:6px 8px;">Repo</th>
        <th style="padding:6px 8px;">Issue</th>
        <th style="padding:6px 8px;">Status</th>
        <th style="padding:6px 8px;">Latest reply</th>
      </tr>
    </thead>
    <tbody>
      ${rows.join("\n      ")}
    </tbody>
  </table>
  <p style="color:#94a3b8;font-size:12px;margin-top:16px;">Generated automatically by BioEval. GitHub issue statuses are re-synced at send time.</p>
</div>`;

  return { html, counts };
}

async function sendEmail(html: string, projectCount: number): Promise<void> {
  const connectors = new ReplitConnectors();
  const body = {
    from: FROM,
    to: [RECIPIENT],
    subject: `BioEval Weekly Outreach Digest — ${projectCount} projects`,
    html,
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
    throw new Error(`Resend send failed: ${JSON.stringify(result)}`);
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  console.log("Gathering outreach status for all projects...");
  const projects = await gather();
  const { html, counts } = buildHtml(projects);
  console.log(
    `Digest: ${counts.responded} responded, ${counts.contacted} awaiting, ${counts.pending} pending, ${counts.noOutreach} no-outreach.`,
  );

  if (dryRun) {
    console.log("\n--- DRY RUN (not sending). HTML preview: ---\n");
    console.log(html);
    return;
  }

  console.log(`Sending weekly digest to ${RECIPIENT}...`);
  await sendEmail(html, projects.length);
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main()
    .then(() => pool.end())
    .catch(async (e) => {
      console.error(e);
      await pool.end().catch(() => {});
      process.exit(1);
    });
}
