import { ReplitConnectors } from "@replit/connectors-sdk";

// Parse a GitHub issue URL like https://github.com/owner/repo/issues/123
export function parseGithubIssueUrl(
  url: string,
): { owner: string; repo: string; issueNumber: number } | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname !== "github.com" && u.hostname !== "www.github.com") return null;
    const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
    if (!m) return null;
    return { owner: m[1], repo: m[2], issueNumber: Number(m[3]) };
  } catch {
    return null;
  }
}

export interface GithubIssue {
  state: string;
  authorLogin: string | null;
  title: string;
  htmlUrl: string;
}

export interface GithubComment {
  id: number;
  authorLogin: string | null;
  body: string;
  htmlUrl: string;
  createdAt: string;
}

// Never cache the client — connector tokens expire and the SDK refreshes per call.
function client() {
  return new ReplitConnectors();
}

export async function fetchIssue(
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<GithubIssue> {
  const res = await client().proxy(
    "github",
    `/repos/${owner}/${repo}/issues/${issueNumber}`,
    { method: "GET" },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub issue fetch failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const j = (await res.json()) as {
    state: string;
    user?: { login?: string };
    title?: string;
    html_url?: string;
  };
  return {
    state: j.state,
    authorLogin: j.user?.login ?? null,
    title: j.title ?? "",
    htmlUrl: j.html_url ?? "",
  };
}

export async function fetchIssueComments(
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<GithubComment[]> {
  const out: GithubComment[] = [];
  // Paginate to capture every reply.
  for (let page = 1; page <= 10; page++) {
    const res = await client().proxy(
      "github",
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100&page=${page}`,
      { method: "GET" },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GitHub comments fetch failed (${res.status}): ${text.slice(0, 200)}`);
    }
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
