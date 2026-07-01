import { MetricKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { igdbImageUrl } from "@/lib/igdb/images";

const PAGE_SIZE = 24;

export type GamesSearchParams = {
  q?: string;
  genreId?: string;
  platformId?: string;
  year?: number;
  page?: number;
};

function gameWhere(params: GamesSearchParams): Prisma.GameWhereInput {
  return {
    ...(params.q ? { name: { contains: params.q, mode: Prisma.QueryMode.insensitive } } : {}),
    ...(params.year ? { releaseYear: params.year } : {}),
    ...(params.genreId ? { genres: { some: { genreId: params.genreId } } } : {}),
    ...(params.platformId ? { platforms: { some: { platformId: params.platformId } } } : {}),
  };
}

function normalizeMetric(value: number, maxValue: number): number {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return value;
  return (value / maxValue) * 100;
}

function metricRank(metric: { source: { key: string; metricKind: MetricKind } }): number {
  if (metric.source.key === "metacritic_critic") return 0;
  if (metric.source.metricKind === MetricKind.CRITIC_SCORE) return 1;
  if (metric.source.key === "igdb_user") return 2;
  if (metric.source.metricKind === MetricKind.USER_SCORE) return 3;
  return 4;
}

export function pickHeadlineScore(
  metrics: Array<{ value: number; source: { key: string; name: string; metricKind: MetricKind; maxValue: number } }>,
) {
  const metric = [...metrics].sort((a, b) => metricRank(a) - metricRank(b))[0];
  if (!metric) return null;
  return {
    label: metric.source.name,
    value: normalizeMetric(metric.value, metric.source.maxValue),
  };
}

export async function getGamesPage(params: GamesSearchParams) {
  const page = Math.max(params.page ?? 1, 1);
  const where = gameWhere(params);
  const [games, total, filters] = await Promise.all([
    prisma.game.findMany({
      where,
      orderBy: [{ releaseYear: "desc" }, { name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        genres: { include: { genre: true }, take: 3 },
        platforms: { include: { platform: true }, take: 4 },
        metrics: { include: { source: true } },
      },
    }),
    prisma.game.count({ where }),
    getGamesFilterOptions(),
  ]);

  return {
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(Math.ceil(total / PAGE_SIZE), 1),
    filters,
    games: games.map((game) => ({
      id: game.id,
      name: game.name,
      releaseYear: game.releaseYear,
      coverUrl: igdbImageUrl(game.coverImageId),
      genres: game.genres.map((row) => row.genre.name),
      platforms: game.platforms.map((row) => row.platform.name),
      headlineScore: pickHeadlineScore(game.metrics),
    })),
  };
}

export async function getGamesFilterOptions() {
  const [genres, platforms, years] = await Promise.all([
    prisma.genre.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.platform.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.game.findMany({
      where: { releaseYear: { not: null } },
      distinct: ["releaseYear"],
      orderBy: { releaseYear: "desc" },
      select: { releaseYear: true },
    }),
  ]);

  return {
    genres,
    platforms,
    years: years.map((row) => row.releaseYear).filter((year): year is number => year != null),
  };
}

export async function getGameDetail(id: string) {
  const game = await prisma.game.findUnique({
    where: { id },
    include: {
      genres: { include: { genre: true } },
      themes: { include: { theme: true } },
      platforms: { include: { platform: true } },
      gameModes: { include: { gameMode: true } },
      perspectives: { include: { playerPerspective: true } },
      franchises: { include: { franchise: true } },
      companies: { include: { company: true } },
      metrics: { include: { source: true }, orderBy: { fetchedAt: "desc" } },
      scrapeTargets: true,
    },
  });

  if (!game) return null;

  return {
    ...game,
    coverUrl: igdbImageUrl(game.coverImageId),
    headlineScore: pickHeadlineScore(game.metrics),
    normalizedMetrics: game.metrics.map((metric) => ({
      id: metric.id,
      source: metric.source.name,
      key: metric.source.key,
      kind: metric.source.metricKind,
      value: metric.value,
      normalizedValue: normalizeMetric(metric.value, metric.source.maxValue),
      sampleSize: metric.sampleSize,
      fetchedAt: metric.fetchedAt,
    })),
  };
}
