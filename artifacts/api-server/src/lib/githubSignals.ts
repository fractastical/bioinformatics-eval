// Fetches structured repository signals from the GitHub API so the scorer can
// judge Code Availability / Reproducibility Package on concrete evidence rather
// than guessing from README prose. Best-effort: returns null on any failure.

import { ReplitConnectors } from "@replit/connectors-sdk";
import { extractAccessions } from "./accessionResolver";

const connectors = new ReplitConnectors();

const MANIFESTS = [
  "requirements.txt",
  "package.json",
  "cargo.toml",
  "environment.yml",
  "environment.yaml",
  "pipfile",
  "pyproject.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "gemfile",
  "composer.json",
  "renv.lock",
  "poetry.lock",
];

const TEST_DIRS = ["test", "tests", "spec", "__tests__"];

function parseRepo(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url);
    if (u.hostname !== "github.com" && u.hostname !== "www.github.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/, "");
    return { owner, repo };
  } catch {
    return null;
  }
}

async function gh(path: string): Promise<Response> {
  return connectors.proxy("github", path);
}

export interface RepoSignals {
  url: string;
  ok: boolean;
  text: string;
  accessions: string[];
}

// Read a small budget of likely data/provenance source files and scan them for
// accession IDs and DOIs, so the review reflects the actual CODE — not just the
// PDF. This is what catches datasets declared in e.g. src/.../datasets.py that a
// PDF-only review would wrongly report as "no accessions provided".
async function scanRepoSourceFiles(
  base: string,
  branch: string,
): Promise<{ findings: string[]; accessions: string[]; scanned: number }> {
  const findings: string[] = [];
  const accessions = new Set<string>();
  const KEYWORDS = [
    "dataset", "data_source", "datasource", "accession", "sources", "citation",
    "reference", "provenance", "config", "param", "metadata", "manifest", "data",
  ];
  const EXT = /\.(py|json|ya?ml|toml|csv|tsv|md|txt|bib|r|jl|ipynb)$/i;
  try {
    const treeRes = await gh(`${base}/git/trees/${encodeURIComponent(branch)}?recursive=1`).catch(() => null);
    if (!treeRes?.ok) return { findings, accessions: [], scanned: 0 };
    const tree = (await treeRes.json()) as { tree?: Array<{ path: string; type: string; sha: string; size?: number }> };
    const candidates = (tree.tree ?? [])
      .filter((t) => {
        if (t.type !== "blob") return false;
        const p = t.path.toLowerCase();
        return EXT.test(p) && KEYWORDS.some((k) => p.includes(k)) && (t.size ?? 0) > 0 && (t.size ?? 0) < 200_000;
      })
      .slice(0, 12);

    for (const f of candidates) {
      const blobRes = await gh(`${base}/git/blobs/${f.sha}`).catch(() => null);
      if (!blobRes?.ok) continue;
      const blob = (await blobRes.json()) as { content?: string; encoding?: string };
      if (blob.encoding !== "base64" || !blob.content) continue;
      const content = Buffer.from(blob.content, "base64").toString("utf8");
      const accs = extractAccessions(content);
      if (accs.length) {
        const uniq = [...new Set(accs.map((a) => a.identifier))];
        uniq.forEach((id) => accessions.add(id));
        findings.push(`${f.path}: ${uniq.slice(0, 8).join(", ")}${uniq.length > 8 ? ", …" : ""}`);
      }
    }
    return { findings, accessions: [...accessions], scanned: candidates.length };
  } catch {
    return { findings, accessions: [...accessions], scanned: 0 };
  }
}

export async function fetchGithubRepoSignals(url: string | null): Promise<RepoSignals | null> {
  if (!url) return null;
  const parsed = parseRepo(url);
  if (!parsed) return null;
  const { owner, repo } = parsed;
  const base = `/repos/${owner}/${repo}`;

  try {
    const repoRes = await gh(base);
    if (!repoRes.ok) return null;
    const meta = (await repoRes.json()) as Record<string, unknown>;

    // Run the remaining lookups in parallel; tolerate individual failures.
    const [readmeRes, contentsRes, releasesRes, tagsRes] = await Promise.all([
      gh(`${base}/readme`).catch(() => null),
      gh(`${base}/contents`).catch(() => null),
      gh(`${base}/releases?per_page=100`).catch(() => null),
      gh(`${base}/tags?per_page=100`).catch(() => null),
    ]);

    // README
    let readmeChars = 0;
    if (readmeRes?.ok) {
      const r = (await readmeRes.json()) as { size?: number; content?: string };
      readmeChars = r.size ?? 0;
    }

    // Root contents → manifests, license file, tests dir, CI, Dockerfile
    const foundManifests: string[] = [];
    let hasTestsDir = false;
    let hasGithubDir = false;
    let hasDockerfile = false;
    let hasLicenseFile = false;
    let topLevelFileCount = 0;
    if (contentsRes?.ok) {
      const items = (await contentsRes.json()) as Array<{ name: string; type: string }>;
      topLevelFileCount = items.length;
      for (const it of items) {
        const lower = it.name.toLowerCase();
        if (it.type === "file" && MANIFESTS.includes(lower)) foundManifests.push(it.name);
        if (it.type === "dir" && TEST_DIRS.includes(lower)) hasTestsDir = true;
        if (it.type === "dir" && lower === ".github") hasGithubDir = true;
        if (it.type === "file" && lower.startsWith("dockerfile")) hasDockerfile = true;
        if (it.type === "file" && lower.startsWith("license")) hasLicenseFile = true;
      }
    }

    // CI: check .github/workflows if .github exists
    let hasCI = false;
    if (hasGithubDir) {
      const wf = await gh(`${base}/contents/.github/workflows`).catch(() => null);
      if (wf?.ok) {
        const files = (await wf.json()) as Array<unknown>;
        hasCI = Array.isArray(files) && files.length > 0;
      }
    }

    const releases = releasesRes?.ok ? ((await releasesRes.json()) as Array<unknown>) : [];
    const tags = tagsRes?.ok ? ((await tagsRes.json()) as Array<unknown>) : [];

    const license =
      (meta.license as { spdx_id?: string; name?: string } | null)?.spdx_id ??
      (meta.license as { name?: string } | null)?.name ??
      null;
    const licenseStr =
      license && license !== "NOASSERTION" ? license : hasLicenseFile ? "present (unrecognized)" : "none detected";

    const pushedAt = typeof meta.pushed_at === "string" ? meta.pushed_at : null;
    const ageStr = pushedAt
      ? `${pushedAt.slice(0, 10)} (${monthsSince(pushedAt)} months ago)`
      : "unknown";

    // Scan in-repo source/config files for dataset accessions and DOIs.
    const defaultBranch = typeof meta.default_branch === "string" ? meta.default_branch : "main";
    const srcScan = await scanRepoSourceFiles(base, defaultBranch);
    const srcLine = srcScan.findings.length
      ? `accession/DOI identifiers found inside repository source/config files (these are real IDs present in the code, not just the PDF) — ${srcScan.findings.slice(0, 6).join(" | ")}`
      : srcScan.scanned > 0
        ? `scanned ${srcScan.scanned} likely data/config file(s); no machine-detectable accession IDs found (datasets may still be declared as URLs or in prose)`
        : "no candidate data/config files scanned";

    const lines = [
      `GitHub repository signals for ${url} (repository is publicly accessible — fetched live via the GitHub API):`,
      `- License: ${licenseStr}`,
      `- Published releases: ${releases.length}${releases.length >= 100 ? "+" : ""}`,
      `- Tags: ${tags.length}${tags.length >= 100 ? "+" : ""}`,
      `- README: ${readmeChars > 0 ? `present (~${readmeChars} bytes)` : "missing or empty"}`,
      `- Dependency manifest(s): ${foundManifests.length ? foundManifests.join(", ") : "none detected at repo root"}`,
      `- Tests directory: ${hasTestsDir ? "present" : "not detected"}`,
      `- CI (GitHub Actions workflows): ${hasCI ? "present" : "not detected"}`,
      `- Dockerfile: ${hasDockerfile ? "present" : "not detected"}`,
      `- Last push: ${ageStr}`,
      `- Stars: ${meta.stargazers_count ?? 0}; open issues: ${meta.open_issues_count ?? 0}`,
      `- Top-level entries: ${topLevelFileCount}`,
      `- Source-file data/accession scan: ${srcLine}`,
      `- Archived snapshot (Zenodo/DOI): not detectable via GitHub API — only count it if the paper/README explicitly cites a DOI. Do NOT report a missing archive as a defect unless you positively confirmed one is absent.`,
    ];

    return { url, ok: true, text: lines.join("\n"), accessions: srcScan.accessions };
  } catch {
    return null;
  }
}

function monthsSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return -1;
  return Math.max(0, Math.round((Date.now() - then) / (1000 * 60 * 60 * 24 * 30)));
}
