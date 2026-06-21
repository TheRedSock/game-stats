import { slugify } from "@/lib/utils";

export type MetacriticCandidate = {
  url: string;
  title: string;
  score?: number;
};

export type MetacriticParsedScores = {
  critic?: number;
  user?: number;
  criticIsTbd: boolean;
  userIsTbd: boolean;
  criticReviewCount?: number;
  userRatingCount?: number;
};

const METACRITIC_BASE = "https://www.metacritic.com";

/** IGDB uses underscores for punctuation; Metacritic typically strips and hyphenates. */
export function metacriticSlugFromIgdb(igdbSlug: string): string {
  const hyphenated = igdbSlug
    .replace(/_/g, "-")
    .split("-")
    .filter(Boolean)
    .join("-");
  // baldur-s-gate / baldur_s_gate → baldurs-gate (apostrophe in "Baldur's" becomes _s_ or -s- in IGDB)
  return hyphenated.replace(/-s-(?=[a-z0-9])/gi, "s-");
}

export function buildMetacriticSlugCandidates(gameName: string, igdbSlug?: string | null): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (slug: string) => {
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    ordered.push(slug);
  };

  // Name-based slugs match Metacritic best — try before raw IGDB underscores
  add(slugify(gameName));
  add(slugify(gameName.replace(/\([^)]*\)/g, "").trim()));
  add(slugify(gameName.split(":")[0] ?? gameName));

  if (igdbSlug) {
    add(metacriticSlugFromIgdb(igdbSlug));
    add(igdbSlug.replace(/_/g, "-"));
    add(igdbSlug.replace(/_/g, ""));
    add(igdbSlug);
  }

  return ordered;
}

export function buildMetacriticUrls(slugs: string[]): string[] {
  return slugs.map((slug) => `${METACRITIC_BASE}/game/${slug}/`);
}

/** Accepts a full Metacritic URL, path, or game slug and returns a canonical game page URL. */
export function normalizeMetacriticGameUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/metacritic\.com/i.test(trimmed)) {
    try {
      const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`;
      const parsed = new URL(withProtocol);
      if (!parsed.hostname.endsWith("metacritic.com")) return null;
      const slugMatch = parsed.pathname.match(/\/game\/([^/]+)/i);
      if (!slugMatch?.[1]) return null;
      return `${METACRITIC_BASE}/game/${slugMatch[1]}/`;
    } catch {
      return null;
    }
  }

  const pathMatch = trimmed.match(/^(?:\/game\/|game\/)([^/?#]+)\/?$/i);
  if (pathMatch?.[1]) {
    return `${METACRITIC_BASE}/game/${pathMatch[1]}/`;
  }

  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(trimmed)) {
    return `${METACRITIC_BASE}/game/${trimmed}/`;
  }

  return null;
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titlesMatch(expected: string, actual: string): boolean {
  const a = normalizeTitle(expected);
  const b = normalizeTitle(actual);
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.includes(a) || a.includes(b)) return true;

  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  const overlap = [...aTokens].filter((t) => bTokens.has(t) && t.length > 2);
  const ratio = overlap.length / Math.max(aTokens.size, bTokens.size);
  return ratio >= 0.7;
}

export function pickMetacriticSearchResult(
  gameName: string,
  results: MetacriticCandidate[],
  igdbSlug?: string | null,
): MetacriticCandidate | null {
  const slugCandidates = new Set(buildMetacriticSlugCandidates(gameName, igdbSlug));

  for (const result of results) {
    if (result.title && titlesMatch(gameName, result.title)) {
      return result;
    }
    const urlSlug = result.url.match(/\/game\/([^/]+)/)?.[1];
    if (urlSlug && slugCandidates.has(urlSlug)) {
      return result;
    }
  }

  return null;
}

export function parseSearchResultLinks(html: string): MetacriticCandidate[] {
  const results: MetacriticCandidate[] = [];
  const linkRegex = /href="(\/game\/[^"]+)"/gi;
  const titleRegex = /<span[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/span>/gi;

  const links = [...html.matchAll(linkRegex)].map((m) => m[1]);
  const titles = [...html.matchAll(titleRegex)].map((m) => m[1].trim());

  links.forEach((link, index) => {
    if (!link.includes("/game/")) return;
    results.push({
      url: `${METACRITIC_BASE}${link.endsWith("/") ? link : `${link}/`}`,
      title: titles[index] ?? "",
    });
  });

  return results;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function extractPageTitle(html: string): string | null {
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    return decodeHtmlEntities(h1Match[1].replace(/<[^>]+>/g, "").trim());
  }
  const ogMatch = html.match(/property="og:title"\s+content="([^"]+)"/i);
  return ogMatch?.[1]?.replace(/\s+\|\s+Metacritic.*/i, "").trim() ?? null;
}

function parseCount(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const n = Number(text.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseScore(text: string | undefined, max: number): number | undefined {
  if (!text) return undefined;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0 || n > max) return undefined;
  return n;
}

function extractAggregateSection(html: string, headerPattern: RegExp): string {
  const start = html.search(headerPattern);
  if (start < 0) return "";
  return html.slice(start, start + 1200);
}

function extractCriticAggregateSection(html: string): string {
  return extractAggregateSection(html, /data-testid="global-score-header">Metascore/i);
}

function extractUserAggregateSection(html: string): string {
  return extractAggregateSection(html, /data-testid="global-score-header">User score/i);
}

function aggregateShowsTbd(section: string, hasScore: boolean): boolean {
  if (hasScore) return false;
  const withoutPersonal = section.replace(/My Score[\s\S]{0,300}/gi, "");
  return /\btbd\b/i.test(withoutPersonal);
}

function criticAggregateIsTbd(section: string): boolean {
  if (/(?:title|aria-label)="Metascore TBD"/i.test(section)) return true;
  if (/data-testid="global-score-tbd"/i.test(section)) return true;
  if (/Critic reviews are not available yet/i.test(section)) return true;
  return false;
}

function parseAggregateCriticScore(section: string): number | undefined {
  if (!section || criticAggregateIsTbd(section)) return undefined;

  const patterns = [
    /(?:title|aria-label)="Metascore (\d{2,3}) out of 100"/i,
    /Metascore[\s\S]{0,600}?(\d{2,3})[\s\S]{0,250}?Based on [\d,]+ Critic Reviews/i,
    /Based on [\d,]+ Critic Reviews[\s\S]{0,250}?(\d{2,3})/i,
    /global-score-value[^>]*>(\d{2,3})</i,
    /metascore_w[^>]*>[\s\S]*?(\d{2,3})/i,
    /"description"\s*:\s*"Metascore"[\s\S]*?"ratingValue"\s*:\s*"?([\d.]+)"?/i,
  ];

  for (const pattern of patterns) {
    const match = section.match(pattern);
    const score = parseScore(match?.[1], 100);
    if (score != null) return score;
  }
  return undefined;
}

function parseAggregateUserScore(section: string): number | undefined {
  if (!section) return undefined;

  const patterns = [
    /(?:title|aria-label)="User score (\d+\.\d) out of 10"/i,
    /Based on [\d,]+ User Ratings[\s\S]{0,800}?global-score-value[^>]*>(\d+\.\d)</i,
    /User score[\s\S]{0,600}?(\d+\.\d)[\s\S]{0,250}?Based on [\d,]+ User Ratings/i,
    /User score[\s\S]{0,600}?Based on [\d,]+ User Ratings[\s\S]{0,800}?(\d+\.\d)/i,
    /global-score-value[^>]*>(\d+\.\d)</i,
    /"description"\s*:\s*"User Score"[\s\S]*?"ratingValue"\s*:\s*"?([\d.]+)"?/i,
  ];

  for (const pattern of patterns) {
    const match = section.match(pattern);
    const score = parseScore(match?.[1], 10);
    if (score != null) return score;
  }

  // Whole-number aggregate user scores are uncommon; only accept near the summary block
  const intMatch = section.match(
    /User score[\s\S]{0,400}?(\d{1,2})[\s\S]{0,200}?Based on [\d,]+ User Ratings/i,
  );
  return parseScore(intMatch?.[1], 10);
}

function parseJsonLdRatings(html: string): Partial<MetacriticParsedScores> {
  const result: Partial<MetacriticParsedScores> = {};
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];

  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    const record = node as Record<string, unknown>;
    if (record["@type"] === "AggregateRating" || record.ratingValue != null) {
      const raw = String(record.ratingValue ?? "");
      const count = parseCount(String(record.ratingCount ?? record.reviewCount ?? ""));
      const name = String(record.name ?? record.description ?? "").toLowerCase();

      if (name.includes("user")) {
        const value = parseScore(raw, 10);
        if (value != null) result.user = value;
        if (count) result.userRatingCount = count;
      } else if (name.includes("meta") || name.includes("critic")) {
        const value = parseScore(raw, 100);
        if (value != null) result.critic = value;
        if (count) result.criticReviewCount = count;
      } else {
        const asUser = parseScore(raw, 10);
        const asCritic = parseScore(raw, 100);
        if (asUser != null && raw.includes(".")) {
          result.user = asUser;
          if (count) result.userRatingCount = count;
        } else if (asCritic != null && asCritic > 10) {
          result.critic = asCritic;
          if (count) result.criticReviewCount = count;
        }
      }
    }

    Object.values(record).forEach(visit);
  };

  for (const block of blocks) {
    try {
      visit(JSON.parse(block[1]));
    } catch {
      // ignore invalid JSON-LD
    }
  }

  return result;
}

export function parseMetacriticPage(html: string): MetacriticParsedScores {
  const ld = parseJsonLdRatings(html);

  const criticSection = extractCriticAggregateSection(html);
  const userSection = extractUserAggregateSection(html);

  const criticReviewCount =
    parseCount(criticSection.match(/Based on ([\d,]+)\s+Critic Reviews?/i)?.[1]) ??
    ld.criticReviewCount;
  const userRatingCount =
    parseCount(userSection.match(/Based on ([\d,]+)\s+User Ratings?/i)?.[1]) ?? ld.userRatingCount;

  let critic = ld.critic ?? parseAggregateCriticScore(criticSection);
  let user = ld.user ?? parseAggregateUserScore(userSection);

  if (critic != null && !criticReviewCount) critic = undefined;
  if (user != null && !userRatingCount) user = undefined;

  let criticIsTbd = aggregateShowsTbd(criticSection, critic != null);
  let userIsTbd = aggregateShowsTbd(userSection, user != null);

  if (critic != null) criticIsTbd = false;
  if (user != null) userIsTbd = false;

  return {
    critic,
    user,
    criticIsTbd,
    userIsTbd,
    criticReviewCount,
    userRatingCount,
  };
}

/** @deprecated use parseMetacriticPage */
export function extractMetacriticScores(html: string): { critic?: number; user?: number } {
  const parsed = parseMetacriticPage(html);
  return { critic: parsed.critic, user: parsed.user };
}

export function isGameDetailPage(html: string): boolean {
  return (
    html.includes("metascore") ||
    html.includes("Metascore") ||
    html.includes('"@type":"VideoGame"') ||
    html.includes("game-details")
  );
}

export function isReleasedOverOneYearAgo(
  releaseDate: Date | null,
  releaseYear?: number | null,
): boolean {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  if (releaseDate) {
    return releaseDate < oneYearAgo;
  }

  if (releaseYear != null) {
    return releaseYear < oneYearAgo.getFullYear();
  }

  return false;
}

export function shouldAutoSkipNoScores(
  releaseDate: Date | null,
  releaseYear: number | null | undefined,
  parsed: MetacriticParsedScores,
): boolean {
  if (parsed.critic != null || parsed.user != null) return false;
  if (!parsed.criticIsTbd || !parsed.userIsTbd) return false;
  return isReleasedOverOneYearAgo(releaseDate, releaseYear);
}

export function hasAnyMetacriticScore(parsed: MetacriticParsedScores): boolean {
  return parsed.critic != null || parsed.user != null;
}
