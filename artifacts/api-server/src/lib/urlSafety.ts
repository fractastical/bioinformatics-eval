import dns from "node:dns/promises";
import net from "node:net";

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true; // "this" network
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

// Parse an IPv6 address (including "::" compression and embedded IPv4) into eight 16-bit groups.
function parseIPv6(ip: string): number[] | null {
  let s = ip;
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);

  // Embedded IPv4 suffix, e.g. ::ffff:1.2.3.4
  let tailGroups: number[] = [];
  if (s.includes(".")) {
    const idx = s.lastIndexOf(":");
    if (idx === -1) return null;
    const v4 = s.slice(idx + 1);
    if (!net.isIPv4(v4)) return null;
    const o = v4.split(".").map(Number);
    tailGroups = [((o[0] << 8) | o[1]) & 0xffff, ((o[2] << 8) | o[3]) & 0xffff];
    s = s.slice(0, idx);
  }

  const dbl = s.split("::");
  if (dbl.length > 2) return null;

  const parseGroups = (raw: string): number[] | null => {
    if (raw === "") return [];
    const out: number[] = [];
    for (const g of raw.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  const headG = parseGroups(dbl[0]);
  if (!headG) return null;

  let groups: number[];
  if (dbl.length === 1) {
    groups = [...headG, ...tailGroups];
    if (groups.length !== 8) return null;
  } else {
    const tailG = parseGroups(dbl[1]);
    if (!tailG) return null;
    const explicit = headG.length + tailG.length + tailGroups.length;
    const missing = 8 - explicit;
    if (missing < 1) return null; // "::" must stand in for at least one group
    groups = [...headG, ...Array(missing).fill(0), ...tailG, ...tailGroups];
  }
  if (groups.length !== 8 || groups.some((g) => g < 0 || g > 0xffff)) return null;
  return groups;
}

function ipv4FromGroups(hi: number, lo: number): string {
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

function isPrivateIPv6(ip: string): boolean {
  const g = parseIPv6(ip);
  if (!g) return true; // unparseable — reject
  if (g.every((x) => x === 0)) return true; // ::  unspecified
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1 loopback
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  // IPv4-mapped ::ffff:0:0/96
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) {
    return isPrivateIPv4(ipv4FromGroups(g[6], g[7]));
  }
  // IPv4-compatible ::a.b.c.d (deprecated)
  if (g.slice(0, 6).every((x) => x === 0) && (g[6] !== 0 || g[7] !== 0)) {
    return isPrivateIPv4(ipv4FromGroups(g[6], g[7]));
  }
  return false;
}

function isDisallowedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // unknown format — reject
}

// Validate a user-supplied URL before fetching it, to mitigate SSRF.
// Rejects non-http(s) schemes and any host that resolves to a private/loopback/link-local
// address. Redirect targets must be re-validated separately (see safeFetch).
export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }

  const host = url.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  if (net.isIP(host)) {
    if (isDisallowedIp(host)) throw new Error("URL points to a disallowed (private) address");
    return url;
  }

  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("URL points to a disallowed host");
  }

  let records: { address: string }[];
  try {
    records = await dns.lookup(host, { all: true });
  } catch {
    throw new Error("URL host could not be resolved");
  }
  if (records.length === 0) throw new Error("URL host could not be resolved");
  for (const r of records) {
    if (isDisallowedIp(r.address)) {
      throw new Error("URL points to a disallowed (private) address");
    }
  }
  return url;
}

// SSRF-safe fetch: validates the URL and every redirect hop against the private-address
// blocklist, and enforces a request timeout. Redirects are followed manually so each hop
// is re-validated (a public URL cannot 30x-redirect into the internal network).
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  opts: { maxRedirects?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? 5;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  let current = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const safe = await assertSafeUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(safe.toString(), { ...init, redirect: "manual", signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res;
      current = new URL(location, safe).toString();
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects while fetching paper");
}
