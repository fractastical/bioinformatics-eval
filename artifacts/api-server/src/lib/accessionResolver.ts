// Accession ID extractor and resolver
// Extracts bioinformatics accession IDs from text using regex,
// then validates them against public repository APIs.

export interface AccessionCandidate {
  identifier: string;
  repository: string;
  type: string;
}

export interface ResolvedAccession {
  identifier: string;
  repository: string;
  type: string;
  resolved: boolean;
  title: string | null;
  accessStatus: "public" | "controlled" | "unknown" | "not_found";
  organism: string | null;
  sampleCount: number | null;
  problems: string[];
  apiUrl: string | null;
}

const ACCESSION_PATTERNS: Array<{ pattern: RegExp; repository: string; type: string }> = [
  { pattern: /\bGSE\d+\b/g, repository: "NCBI GEO", type: "series" },
  { pattern: /\bGSM\d+\b/g, repository: "NCBI GEO", type: "sample" },
  { pattern: /\bGDS\d+\b/g, repository: "NCBI GEO", type: "dataset" },
  { pattern: /\bGPL\d+\b/g, repository: "NCBI GEO", type: "platform" },
  { pattern: /\bPRJ(?:NA|EB|DB)\d+\b/g, repository: "NCBI BioProject", type: "bioproject" },
  { pattern: /\bSAMN\d+\b/g, repository: "NCBI BioSample", type: "biosample" },
  { pattern: /\bSAMEA\d+\b/g, repository: "EBI BioSample", type: "biosample" },
  { pattern: /\bSRP\d+\b/g, repository: "NCBI SRA", type: "study" },
  { pattern: /\bSRX\d+\b/g, repository: "NCBI SRA", type: "experiment" },
  { pattern: /\bSRR\d+\b/g, repository: "NCBI SRA", type: "run" },
  { pattern: /\bSRS\d+\b/g, repository: "NCBI SRA", type: "sample" },
  { pattern: /\bERP\d+\b/g, repository: "EBI ENA", type: "study" },
  { pattern: /\bERX\d+\b/g, repository: "EBI ENA", type: "experiment" },
  { pattern: /\bERR\d+\b/g, repository: "EBI ENA", type: "run" },
  { pattern: /\bERS\d+\b/g, repository: "EBI ENA", type: "sample" },
  { pattern: /\bPXD\d{6,}\b/g, repository: "PRIDE/ProteomeXchange", type: "proteomics" },
  { pattern: /\bE-(?:MTAB|GEOD|TABM|MEXP|AFMX|NASC|MIMR|MAXD|MHGU|MPSR|SMDB|BUGS|CBIL|MEXP|ERAD|GRAY|UCON|DKFZ)-\d+\b/g, repository: "ArrayExpress/BioStudies", type: "arrayexpress" },
  { pattern: /\bphs\d+(?:\.\w+)?\b/g, repository: "dbGaP", type: "dbgap" },
  { pattern: /\bEGAS\d+\b/g, repository: "EGA", type: "study" },
  { pattern: /\bEGAD\d+\b/g, repository: "EGA", type: "dataset" },
  // Allow parentheses inside the match — they are legal DOI characters
  // (e.g. 10.1002/(SICI)...). Only stop at characters that never occur in a DOI.
  { pattern: /\b10\.\d{4,9}\/[^\s"'`<>\]]+/g, repository: "DOI", type: "doi" },
];

// DOIs extracted from source files / markdown often carry trailing markup
// (badge image suffixes, backticks, quotes, markdown link wrappers, trailing
// punctuation, or an UNBALANCED closing paren from a wrapping "(...)"). Strip
// only those so the DOI resolves, while PRESERVING balanced internal parens.
function cleanDoi(raw: string): string {
  let d = raw.trim().split(/[\s"'`<>]/)[0]; // stop at chars that never appear in a DOI
  d = d.replace(/\].*$/, ""); // drop a markdown "]" and anything after it
  let prev: string;
  do {
    prev = d;
    d = d.replace(/[.,;:]+$/, ""); // trailing punctuation
    d = d.replace(/\.svg$/i, ""); // shields/Zenodo badge image suffix
    if (d.endsWith(")")) {
      const opens = (d.match(/\(/g) ?? []).length;
      const closes = (d.match(/\)/g) ?? []).length;
      if (closes > opens) d = d.slice(0, -1); // strip only an unbalanced wrapper paren
    }
  } while (d !== prev);
  return d;
}

export function extractAccessions(text: string): AccessionCandidate[] {
  const seen = new Set<string>();
  const results: AccessionCandidate[] = [];

  for (const { pattern, repository, type } of ACCESSION_PATTERNS) {
    const matches = text.match(new RegExp(pattern.source, pattern.flags));
    if (!matches) continue;
    for (const identifier of matches) {
      const key = repository === "DOI" ? cleanDoi(identifier) : identifier.trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        results.push({ identifier: key, repository, type });
      }
    }
  }

  return results;
}

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "BioEval/1.0 (bioinformatics provenance evaluator)" },
    });
  } finally {
    clearTimeout(id);
  }
}

// Retry on transient rate-limit / unavailable responses so a 429 burst from
// Crossref does not get mis-reported as "DOI not found" (a false defect).
async function fetchWithRetry(url: string, retries = 2, timeoutMs = 8000): Promise<Response> {
  let last: Response | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetchWithTimeout(url, timeoutMs);
    if (res.status !== 429 && res.status !== 503) return res;
    last = res;
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "", 10);
    const waitMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 600 * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 4000)));
  }
  return last as Response;
}

async function resolveNCBIGEO(identifier: string): Promise<Partial<ResolvedAccession>> {
  try {
    const db = identifier.startsWith("GSE") ? "gds" : identifier.startsWith("GPL") ? "gds" : "gds";
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=${db}&term=${identifier}&retmode=json&retmax=1`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { resolved: false, accessStatus: "unknown", problems: [`NCBI API returned ${res.status}`] };
    const data = await res.json() as { esearchresult?: { count?: string; idlist?: string[] } };
    const count = parseInt(data?.esearchresult?.count ?? "0");
    if (count === 0) return { resolved: false, accessStatus: "not_found", problems: [`${identifier} not found in NCBI GEO`] };

    // Fetch summary for the first hit
    const uid = data?.esearchresult?.idlist?.[0];
    if (uid) {
      const sumUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=${db}&id=${uid}&retmode=json`;
      const sumRes = await fetchWithTimeout(sumUrl);
      if (sumRes.ok) {
        const sumData = await sumRes.json() as { result?: Record<string, { title?: string; n_samples?: number; organism?: string }> };
        const record = sumData?.result?.[uid];
        return {
          resolved: true,
          accessStatus: "public",
          title: record?.title ?? null,
          sampleCount: record?.n_samples ?? null,
          organism: record?.organism ?? null,
          apiUrl: `https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=${identifier}`,
          problems: [],
        };
      }
    }
    return { resolved: true, accessStatus: "public", problems: [] };
  } catch {
    return { resolved: false, accessStatus: "unknown", problems: ["NCBI GEO API unreachable"] };
  }
}

async function resolveNCBIBioProject(identifier: string): Promise<Partial<ResolvedAccession>> {
  try {
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=bioproject&term=${identifier}&retmode=json&retmax=1`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { resolved: false, accessStatus: "unknown", problems: [`NCBI API returned ${res.status}`] };
    const data = await res.json() as { esearchresult?: { count?: string } };
    const count = parseInt(data?.esearchresult?.count ?? "0");
    if (count === 0) return { resolved: false, accessStatus: "not_found", problems: [`${identifier} not found in BioProject`] };
    return {
      resolved: true,
      accessStatus: "public",
      apiUrl: `https://www.ncbi.nlm.nih.gov/bioproject/${identifier}`,
      problems: [],
    };
  } catch {
    return { resolved: false, accessStatus: "unknown", problems: ["NCBI BioProject API unreachable"] };
  }
}

async function resolveEBIENA(identifier: string): Promise<Partial<ResolvedAccession>> {
  try {
    const url = `https://www.ebi.ac.uk/ena/browser/api/json/${identifier}`;
    const res = await fetchWithTimeout(url);
    if (res.status === 404) return { resolved: false, accessStatus: "not_found", problems: [`${identifier} not found in EBI ENA`] };
    if (!res.ok) return { resolved: false, accessStatus: "unknown", problems: [`EBI ENA returned ${res.status}`] };
    const data = await res.json() as { summaries?: Array<{ scientificName?: string; studyTitle?: string }> };
    const summary = data?.summaries?.[0];
    return {
      resolved: true,
      accessStatus: "public",
      organism: summary?.scientificName ?? null,
      title: summary?.studyTitle ?? null,
      apiUrl: `https://www.ebi.ac.uk/ena/browser/view/${identifier}`,
      problems: [],
    };
  } catch {
    return { resolved: false, accessStatus: "unknown", problems: ["EBI ENA API unreachable"] };
  }
}

async function resolveDOI(identifier: string): Promise<Partial<ResolvedAccession>> {
  // DOIs are registered through different agencies: journal articles are usually
  // Crossref, while data/software deposits (Zenodo, figshare, Dryad) are DataCite.
  // Querying only Crossref wrongly flags every Zenodo DOI as "not found". Try
  // Crossref first, then fall back to DataCite so data/software DOIs resolve too.
  const doi = identifier.replace(/[.,;)\]]+$/, ""); // strip trailing punctuation
  let crossrefStatus = 0;
  try {
    const crUrl = `https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=bioeval@replit.app`;
    const crRes = await fetchWithRetry(crUrl);
    crossrefStatus = crRes.status;
    if (crRes.ok) {
      const data = await crRes.json() as { message?: { title?: string[]; publisher?: string } };
      const msg = data?.message;
      return {
        resolved: true,
        accessStatus: "public",
        title: msg?.title?.[0] ?? null,
        apiUrl: `https://doi.org/${doi}`,
        problems: [],
      };
    }
  } catch {
    // fall through to DataCite
  }

  // Not a Crossref DOI (e.g. 404) — try DataCite (Zenodo/figshare/Dryad live here).
  try {
    const dcRes = await fetchWithRetry(`https://api.datacite.org/dois/${encodeURIComponent(doi)}`);
    if (dcRes.ok) {
      const dc = await dcRes.json() as {
        data?: { attributes?: { titles?: Array<{ title?: string }>; publisher?: string } };
      };
      const attrs = dc?.data?.attributes;
      const publisher = attrs?.publisher ? ` (${attrs.publisher})` : "";
      return {
        resolved: true,
        accessStatus: "public",
        title: (attrs?.titles?.[0]?.title ?? null),
        apiUrl: `https://doi.org/${doi}`,
        problems: publisher ? [`Resolved via DataCite${publisher}`] : [],
      };
    }
    if (dcRes.status === 404 && (crossrefStatus === 404 || crossrefStatus === 0)) {
      return { resolved: false, accessStatus: "not_found", problems: [`DOI ${doi} not found in Crossref or DataCite`] };
    }
    if (crossrefStatus === 429 || dcRes.status === 429 || crossrefStatus === 503 || dcRes.status === 503) {
      return { resolved: false, accessStatus: "unknown", problems: ["Verification rate-limited — NOT a paper defect; could not confirm in this run"] };
    }
    return { resolved: false, accessStatus: "unknown", problems: [`DOI lookup inconclusive (Crossref ${crossrefStatus || "err"}, DataCite ${dcRes.status})`] };
  } catch {
    return { resolved: false, accessStatus: "unknown", problems: ["DOI resolution APIs unreachable"] };
  }
}

export async function resolveAccessions(candidates: AccessionCandidate[]): Promise<ResolvedAccession[]> {
  // Limit to top 10 unique accessions to avoid rate limiting
  const limited = candidates.slice(0, 10);

  const resolveOne = async (c: AccessionCandidate): Promise<ResolvedAccession> => {
    const base: ResolvedAccession = {
      identifier: c.identifier,
      repository: c.repository,
      type: c.type,
      resolved: false,
      title: null,
      accessStatus: "unknown",
      organism: null,
      sampleCount: null,
      problems: [],
      apiUrl: null,
    };

    let partial: Partial<ResolvedAccession> = {};

    if (c.identifier.match(/^GSE|^GSM|^GDS|^GPL/)) {
      partial = await resolveNCBIGEO(c.identifier);
    } else if (c.identifier.match(/^PRJ(NA|EB|DB)/)) {
      partial = await resolveNCBIBioProject(c.identifier);
    } else if (c.identifier.match(/^(ERP|ERX|ERR|ERS|SRP|SRX|SRR|SRS)\d/)) {
      partial = await resolveEBIENA(c.identifier);
    } else if (c.identifier.match(/^10\.\d/)) {
      partial = await resolveDOI(c.identifier);
    } else {
      // For other types (PXD, phs, EGAS, etc.) — mark as found in text, not verified
      partial = {
        resolved: false,
        accessStatus: "unknown",
        problems: ["Automatic verification not supported for this identifier type; confirm manually"],
      };
    }

    return { ...base, ...partial };
  };

  // Resolve in small chunks to avoid bursting public APIs (Crossref returns 429
  // under parallel load, which would otherwise be mis-reported as "not found").
  const CHUNK = 3;
  const results: ResolvedAccession[] = [];
  for (let i = 0; i < limited.length; i += CHUNK) {
    const chunk = limited.slice(i, i + CHUNK);
    const settled = await Promise.allSettled(chunk.map(resolveOne));
    settled.forEach((r, j) => {
      if (r.status === "fulfilled") {
        results.push(r.value);
      } else {
        results.push({
          ...chunk[j],
          resolved: false,
          title: null,
          accessStatus: "unknown",
          organism: null,
          sampleCount: null,
          problems: [`Resolution failed: ${r.reason}`],
          apiUrl: null,
        });
      }
    });
  }

  return results;
}
