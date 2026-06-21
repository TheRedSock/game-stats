import { MetricKind, ScrapeStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  buildMetacriticSlugCandidates,
  buildMetacriticUrls,
  extractPageTitle,
  hasAnyMetacriticScore,
  isGameDetailPage,
  parseMetacriticPage,
  parseSearchResultLinks,
  pickMetacriticSearchResult,
  shouldAutoSkipNoScores,
  titlesMatch,
  type MetacriticParsedScores,
} from "@/lib/metacritic/parser";
import { isEligibleForMetacriticScrape, UNRELEASED_METACRITIC } from "@/lib/igdb/release-eligibility";
import { batchLog, batchLogError, batchLogProgress } from "@/lib/jobs/batch-log";
import { isDueForMetacriticResync, metacriticResyncPriority } from "@/lib/metacritic/resync";
import { sleep } from "@/lib/utils";

const USER_AGENT =
  "Mozilla/5.0 (compatible; GameStatsBot/1.0; +https://github.com/game-stats)";

const NO_SCORES_AUTO = "No Metacritic scores (auto-approved: both TBD, released >1y ago)";
const NO_SCORES_MANUAL = "No Metacritic scores (manually approved)";

export const RESOLUTION_ERRORS = {
  noPage: "No Metacritic game page found for slug or search",
  slugTitleMismatch: "Slug resolved but title mismatch",
  searchTitleMismatch: "Search result title mismatch",
  manualInvalid: "Manual URL invalid or not a game page",
} as const;

type ResolutionResult = {
  url: string | null;
  status: ScrapeStatus;
  verifiedTitle?: string;
  error?: string;
};

type GameForScrape = {
  id: string;
  name: string;
  releaseDate: Date | null;
  releaseYear: number | null;
};

type ScrapeResult = {
  processed: number;
  success: number;
  failed: number;
  ambiguous: number;
  skipped: number;
  due?: number;
};

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function searchMetacritic(
  gameName: string,
  slug?: string | null,
): Promise<{ url: string; title: string } | null> {
  const query = encodeURIComponent(gameName);
  const searchUrl = `https://www.metacritic.com/search/game/${query}/results`;
  const html = await fetchHtml(searchUrl);
  if (!html) return null;

  const results = parseSearchResultLinks(html);
  const match = pickMetacriticSearchResult(gameName, results, slug);
  if (!match) return null;

  return { url: match.url, title: match.title || gameName };
}

async function resolveMetacriticUrl(
  gameName: string,
  slug?: string | null,
  manualUrl?: string | null,
): Promise<ResolutionResult> {
  // Only admin-supplied manualUrl bypasses slug/search discovery.
  // Do not pass resolvedUrl here — that would skip fallbacks on retry.
  if (manualUrl) {
    const html = await fetchHtml(manualUrl);
    if (!html || !isGameDetailPage(html)) {
      return { url: manualUrl, status: ScrapeStatus.FAILED, error: RESOLUTION_ERRORS.manualInvalid };
    }
    const title = extractPageTitle(html);
    // Admin picked this URL because auto-resolution failed on name differences — trust it.
    return { url: manualUrl, status: ScrapeStatus.SUCCESS, verifiedTitle: title ?? undefined };
  }

  const slugCandidates = buildMetacriticSlugCandidates(gameName, slug);
  const directUrls = buildMetacriticUrls(slugCandidates);

  let slugPageHit: { url: string; title: string } | null = null;

  for (const url of directUrls) {
    const html = await fetchHtml(url);
    if (!html || !isGameDetailPage(html)) continue;
    const title = extractPageTitle(html) ?? "";
    if (title && titlesMatch(gameName, title)) {
      return { url, status: ScrapeStatus.SUCCESS, verifiedTitle: title };
    }
    if (!slugPageHit && title) {
      slugPageHit = { url, title };
    }
  }

  if (slugPageHit) {
    return {
      url: slugPageHit.url,
      status: ScrapeStatus.AMBIGUOUS,
      verifiedTitle: slugPageHit.title,
      error: `${RESOLUTION_ERRORS.slugTitleMismatch}: "${slugPageHit.title}"`,
    };
  }

  const searchHit = await searchMetacritic(gameName, slug);
  if (searchHit) {
    const html = await fetchHtml(searchHit.url);
    if (html && isGameDetailPage(html)) {
      const title = extractPageTitle(html) ?? searchHit.title;
      if (title && titlesMatch(gameName, title)) {
        return { url: searchHit.url, status: ScrapeStatus.SUCCESS, verifiedTitle: title };
      }
      return {
        url: searchHit.url,
        status: ScrapeStatus.AMBIGUOUS,
        verifiedTitle: title || undefined,
        error: `${RESOLUTION_ERRORS.searchTitleMismatch}: "${title}"`,
      };
    }
  }

  return { url: null, status: ScrapeStatus.FAILED, error: RESOLUTION_ERRORS.noPage };
}

async function upsertMetacriticMetrics(gameId: string, parsed: MetacriticParsedScores): Promise<void> {
  const [criticSource, userSource] = await Promise.all([
    prisma.metricSource.findUnique({ where: { key: "metacritic_critic" } }),
    prisma.metricSource.findUnique({ where: { key: "metacritic_user" } }),
  ]);

  if (parsed.critic != null && criticSource) {
    await prisma.gameMetric.upsert({
      where: { gameId_sourceId: { gameId, sourceId: criticSource.id } },
      create: {
        gameId,
        sourceId: criticSource.id,
        value: parsed.critic,
        sampleSize: parsed.criticReviewCount ?? null,
        fetchedAt: new Date(),
      },
      update: {
        value: parsed.critic,
        sampleSize: parsed.criticReviewCount ?? null,
        fetchedAt: new Date(),
      },
    });
  }

  if (parsed.user != null && userSource) {
    await prisma.gameMetric.upsert({
      where: { gameId_sourceId: { gameId, sourceId: userSource.id } },
      create: {
        gameId,
        sourceId: userSource.id,
        value: parsed.user,
        sampleSize: parsed.userRatingCount ?? null,
        fetchedAt: new Date(),
      },
      update: {
        value: parsed.user,
        sampleSize: parsed.userRatingCount ?? null,
        fetchedAt: new Date(),
      },
    });
  }
}

async function markTargetSkipped(
  targetId: string,
  url: string | null,
  verifiedTitle: string | null | undefined,
  reason: string,
): Promise<ScrapeStatus> {
  await prisma.externalScrapeTarget.update({
    where: { id: targetId },
    data: {
      status: ScrapeStatus.SKIPPED,
      resolvedUrl: url,
      verifiedTitle: verifiedTitle ?? null,
      lastSuccessAt: new Date(),
      lastError: reason,
    },
  });
  return ScrapeStatus.SKIPPED;
}

export async function approveNoMetacriticScores(gameId: string): Promise<void> {
  await prisma.externalScrapeTarget.upsert({
    where: { gameId_provider: { gameId, provider: "METACRITIC" } },
    create: {
      gameId,
      provider: "METACRITIC",
      status: ScrapeStatus.SKIPPED,
      lastError: NO_SCORES_MANUAL,
      lastSuccessAt: new Date(),
    },
    update: {
      status: ScrapeStatus.SKIPPED,
      lastError: NO_SCORES_MANUAL,
      lastSuccessAt: new Date(),
    },
  });
}

async function importMetacriticPage(
  targetId: string,
  game: GameForScrape,
  url: string,
  verifiedTitle: string | null | undefined,
): Promise<ScrapeStatus> {
  const html = await fetchHtml(url);
  if (!html) {
    batchLogError("Metacritic fetch failed", { game: game.name, url });
    await prisma.externalScrapeTarget.update({
      where: { id: targetId },
      data: {
        status: ScrapeStatus.FAILED,
        lastError: "Failed to fetch resolved page",
        resolvedUrl: url,
      },
    });
    return ScrapeStatus.FAILED;
  }

  const parsed = parseMetacriticPage(html);

  batchLog("Metacritic parsed page", {
    game: game.name,
    url,
    critic: parsed.critic,
    user: parsed.user,
    criticReviewCount: parsed.criticReviewCount,
    userRatingCount: parsed.userRatingCount,
    criticIsTbd: parsed.criticIsTbd,
    userIsTbd: parsed.userIsTbd,
    releaseYear: game.releaseYear,
  });

  if (shouldAutoSkipNoScores(game.releaseDate, game.releaseYear, parsed)) {
    batchLog("Metacritic auto-skipped (both TBD, old release)", { game: game.name, url });
    return markTargetSkipped(targetId, url, verifiedTitle, NO_SCORES_AUTO);
  }

  if (!hasAnyMetacriticScore(parsed)) {
    const error =
      parsed.criticIsTbd || parsed.userIsTbd
        ? "Scores still TBD on Metacritic"
        : "No scores found on page";
    batchLog("Metacritic no scores to import", { game: game.name, url, error });
    await prisma.externalScrapeTarget.update({
      where: { id: targetId },
      data: {
        status: ScrapeStatus.FAILED,
        lastError: error,
        resolvedUrl: url,
        verifiedTitle: verifiedTitle ?? null,
      },
    });
    return ScrapeStatus.FAILED;
  }

  await upsertMetacriticMetrics(game.id, parsed);
  batchLog("Metacritic scrape success", {
    game: game.name,
    url,
    critic: parsed.critic,
    user: parsed.user,
    criticReviewCount: parsed.criticReviewCount,
    userRatingCount: parsed.userRatingCount,
  });
  await prisma.externalScrapeTarget.update({
    where: { id: targetId },
    data: {
      status: ScrapeStatus.SUCCESS,
      resolvedUrl: url,
      verifiedTitle: verifiedTitle ?? null,
      lastSuccessAt: new Date(),
      lastError: null,
    },
  });

  return ScrapeStatus.SUCCESS;
}

/** Accept an AMBIGUOUS slug/search hit and import scores from its resolved URL. */
export async function approveAmbiguousMetacriticMatch(gameId: string): Promise<ScrapeStatus> {
  const target = await prisma.externalScrapeTarget.findUnique({
    where: { gameId_provider: { gameId, provider: "METACRITIC" } },
    include: { game: true },
  });
  if (!target) throw new Error("Scrape target not found");
  if (target.status !== ScrapeStatus.AMBIGUOUS || !target.resolvedUrl) {
    throw new Error("Target is not awaiting match approval");
  }

  batchLog("Metacritic approving ambiguous match", {
    game: target.game.name,
    url: target.resolvedUrl,
    verifiedTitle: target.verifiedTitle ?? undefined,
  });

  return importMetacriticPage(
    target.id,
    {
      id: target.game.id,
      name: target.game.name,
      releaseDate: target.game.releaseDate,
      releaseYear: target.game.releaseYear,
    },
    target.resolvedUrl,
    target.verifiedTitle,
  );
}

export async function scrapeMetacriticTarget(targetId: string): Promise<ScrapeStatus> {
  const target = await prisma.externalScrapeTarget.findUnique({
    where: { id: targetId },
    include: { game: true },
  });
  if (!target) throw new Error("Scrape target not found");

  if (
    !isEligibleForMetacriticScrape({
      igdbStatus: target.game.igdbStatus,
      releaseDate: target.game.releaseDate,
    })
  ) {
    batchLog("Metacritic skipped (unreleased on IGDB)", {
      game: target.game.name,
      igdbStatus: target.game.igdbStatus ?? undefined,
      releaseDate: target.game.releaseDate?.toISOString(),
    });
    return markTargetSkipped(targetId, target.resolvedUrl, target.verifiedTitle, UNRELEASED_METACRITIC);
  }

  batchLog("Metacritic scrape start", {
    game: target.game.name,
    igdbSlug: target.game.slug,
    attempt: target.attemptCount + 1,
    manualUrl: target.manualUrl ?? undefined,
    previousResolvedUrl: target.resolvedUrl ?? undefined,
    previousStatus: target.status,
  });

  await prisma.externalScrapeTarget.update({
    where: { id: targetId },
    data: {
      attemptCount: { increment: 1 },
      lastAttemptAt: new Date(),
    },
  });

  const resolution = await resolveMetacriticUrl(
    target.game.name,
    target.game.slug,
    target.manualUrl,
  );

  if (resolution.status !== ScrapeStatus.SUCCESS) {
    batchLog(
      resolution.status === ScrapeStatus.AMBIGUOUS
        ? "Metacritic URL needs review"
        : "Metacritic URL resolution failed",
      {
        game: target.game.name,
        status: resolution.status,
        url: resolution.url ?? undefined,
        verifiedTitle: resolution.verifiedTitle,
        error: resolution.error,
      },
    );
    await prisma.externalScrapeTarget.update({
      where: { id: targetId },
      data: {
        status: resolution.status,
        lastError: resolution.error ?? "Resolution failed",
        verifiedTitle: resolution.verifiedTitle ?? null,
        resolvedUrl: resolution.url,
      },
    });
    return resolution.status;
  }

  batchLog("Metacritic URL resolved", {
    game: target.game.name,
    url: resolution.url,
    verifiedTitle: resolution.verifiedTitle,
  });

  return importMetacriticPage(
    targetId,
    {
      id: target.game.id,
      name: target.game.name,
      releaseDate: target.game.releaseDate,
      releaseYear: target.game.releaseYear,
    },
    resolution.url,
    resolution.verifiedTitle,
  );
}

export async function runMetacriticScrapeBatch(options?: {
  batchSize?: number;
  retryFailed?: boolean;
}): Promise<ScrapeResult> {
  const batchSize = options?.batchSize ?? Number(process.env.METACRITIC_SCRAPE_BATCH_SIZE ?? 20);
  const statuses = options?.retryFailed
    ? ([ScrapeStatus.PENDING, ScrapeStatus.FAILED, ScrapeStatus.AMBIGUOUS] as ScrapeStatus[])
    : ([ScrapeStatus.PENDING] as ScrapeStatus[]);

  const targets = await prisma.externalScrapeTarget.findMany({
    where: { provider: "METACRITIC", status: { in: statuses } },
    orderBy: [{ lastAttemptAt: "asc" }, { createdAt: "asc" }],
    take: batchSize,
  });

  batchLog("Metacritic batch started", {
    batchSize,
    retryFailed: options?.retryFailed ?? false,
    targets: targets.length,
    statuses: statuses.join(", "),
  });

  const result: ScrapeResult = {
    processed: 0,
    success: 0,
    failed: 0,
    ambiguous: 0,
    skipped: 0,
  };

  for (const target of targets) {
    result.processed += 1;
    const status = await scrapeMetacriticTarget(target.id);
    if (status === ScrapeStatus.SUCCESS) result.success += 1;
    else if (status === ScrapeStatus.AMBIGUOUS) result.ambiguous += 1;
    else if (status === ScrapeStatus.SKIPPED) result.skipped += 1;
    else result.failed += 1;

    batchLogProgress("Metacritic batch", result.processed, targets.length, {
      success: result.success,
      failed: result.failed,
      ambiguous: result.ambiguous,
      skipped: result.skipped,
    });

    await sleep(1500);
  }

  batchLog("Metacritic batch finished", { ...result });

  return result;
}

export async function runMetacriticResyncBatch(options?: {
  batchSize?: number;
}): Promise<ScrapeResult> {
  const batchSize = options?.batchSize ?? Number(process.env.METACRITIC_RESYNC_BATCH_SIZE ?? 20);
  const poolSize = Math.max(batchSize * 10, 200);

  const candidates = await prisma.externalScrapeTarget.findMany({
    where: {
      provider: "METACRITIC",
      status: {
        in: [ScrapeStatus.SUCCESS, ScrapeStatus.FAILED, ScrapeStatus.SKIPPED],
      },
      NOT: { lastError: UNRELEASED_METACRITIC },
    },
    include: {
      game: {
        select: {
          id: true,
          name: true,
          releaseDate: true,
          releaseYear: true,
          igdbStatus: true,
        },
      },
    },
    take: poolSize,
  });

  const ranked = candidates
    .filter((target) => {
      if (
        target.status === ScrapeStatus.FAILED &&
        !target.resolvedUrl &&
        !target.manualUrl
      ) {
        return false;
      }

      return isEligibleForMetacriticScrape({
        igdbStatus: target.game.igdbStatus,
        releaseDate: target.game.releaseDate,
      });
    })
    .map((target) => ({
      target,
      priority: metacriticResyncPriority({
        lastSuccessAt: target.lastSuccessAt,
        lastAttemptAt: target.lastAttemptAt,
        releaseYear: target.game.releaseYear,
      }),
    }))
    .filter(({ target }) =>
      isDueForMetacriticResync({
        lastSuccessAt: target.lastSuccessAt,
        lastAttemptAt: target.lastAttemptAt,
        releaseYear: target.game.releaseYear,
      }),
    )
    .sort((a, b) => b.priority - a.priority)
    .slice(0, batchSize);

  batchLog("Metacritic resync batch started", {
    batchSize,
    pool: candidates.length,
    due: ranked.length,
  });

  const result: ScrapeResult = {
    processed: 0,
    success: 0,
    failed: 0,
    ambiguous: 0,
    skipped: 0,
    due: ranked.length,
  };

  for (const { target } of ranked) {
    result.processed += 1;
    const status = await scrapeMetacriticTarget(target.id);
    if (status === ScrapeStatus.SUCCESS) result.success += 1;
    else if (status === ScrapeStatus.AMBIGUOUS) result.ambiguous += 1;
    else if (status === ScrapeStatus.SKIPPED) result.skipped += 1;
    else result.failed += 1;

    batchLogProgress("Metacritic resync batch", result.processed, ranked.length, {
      success: result.success,
      failed: result.failed,
      ambiguous: result.ambiguous,
      skipped: result.skipped,
    });

    await sleep(1500);
  }

  batchLog("Metacritic resync batch finished", { ...result });

  return result;
}

export async function setManualMetacriticUrl(gameId: string, url: string): Promise<void> {
  await prisma.externalScrapeTarget.upsert({
    where: { gameId_provider: { gameId, provider: "METACRITIC" } },
    create: {
      gameId,
      provider: "METACRITIC",
      manualUrl: url,
      status: ScrapeStatus.PENDING,
    },
    update: {
      manualUrl: url,
      status: ScrapeStatus.PENDING,
      lastError: null,
    },
  });
}

export { MetricKind };
