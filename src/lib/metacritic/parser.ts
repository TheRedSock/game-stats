import { load, type CheerioAPI } from "cheerio";
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
  const $ = load(html);
  const seen = new Set<string>();

  $('a[href*="/game/"]').each((_, element) => {
    const link = $(element).attr("href");
    if (!link?.includes("/game/")) return;
    const url = link.startsWith("http")
      ? link
      : `${METACRITIC_BASE}${link.startsWith("/") ? link : `/${link}`}`;
    const canonicalUrl = url.endsWith("/") ? url : `${url}/`;
    if (seen.has(canonicalUrl)) return;

    const titleElement = $(element)
      .find("[class]")
      .filter((_, child) => ($(child).attr("class") ?? "").toLowerCase().includes("title"))
      .first();
    const title =
      titleElement.text().trim() ||
      $(element).attr("title")?.trim() ||
      $(element).text().replace(/\s+/g, " ").trim();

    seen.add(canonicalUrl);
    results.push({
      url: canonicalUrl,
      title,
    });
  });

  return results;
}

export function extractPageTitle(html: string): string | null {
  const $ = load(html);
  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();
  if (h1) return h1;

  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim();
  return ogTitle?.replace(/\s+\|\s+Metacritic.*/i, "").trim() ?? null;
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

function sectionFromHeader($: CheerioAPI, label: "Metascore" | "User score"): string {
  const header = $('[data-testid="global-score-header"]')
    .filter((_, element) => $(element).text().trim().toLowerCase() === label.toLowerCase())
    .first();

  if (!header.length) return "";

  const container =
    header.closest("section, article, div").text().replace(/\s+/g, " ").trim() ||
    header.parent().text().replace(/\s+/g, " ").trim();
  return container;
}

function extractCriticAggregateSection(html: string): string {
  const $ = load(html);
  const section = sectionFromHeader($, "Metascore");
  if (/Metascore|Critic Reviews?|global-score-value/i.test(section) && /Based on|title=|aria-label=/i.test(section)) {
    return section;
  }
  const start = html.search(/Metascore/i);
  return start >= 0 ? html.slice(start, start + 1200) : section;
}

function extractUserAggregateSection(html: string): string {
  const $ = load(html);
  const section = sectionFromHeader($, "User score");
  if (/User score|User Ratings?|global-score-value/i.test(section) && /Based on|title=|aria-label=/i.test(section)) {
    return section;
  }
  const start = html.search(/User score/i);
  return start >= 0 ? html.slice(start, start + 1200) : section;
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
  const $ = load(html);
  const blocks = $('script[type="application/ld+json"]')
    .map((_, element) => $(element).text())
    .get();

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
      visit(JSON.parse(block));
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
