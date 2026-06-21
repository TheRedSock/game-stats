import { MetricKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type MetricFilter =
  | { mode: "source"; sourceKey: string }
  | { mode: "kind"; metricKind: MetricKind }
  | { mode: "all_critic" }
  | { mode: "all_user" };

export type GroupByDimension =
  | "releaseYear"
  | "genre"
  | "platform"
  | "developer"
  | "publisher"
  | "franchise"
  | "perspective";

export type AnalyticsFilters = {
  metric: MetricFilter;
  groupBy: GroupByDimension;
  yearFrom?: number;
  yearTo?: number;
  genreIds?: string[];
  platformIds?: string[];
  limit?: number;
};

export type GroupMetricRow = {
  key: string;
  label: string;
  count: number;
  average: number;
  median: number;
  min: number;
  max: number;
};

export type TrendRow = {
  year: number;
  count: number;
  average: number;
};

export type CorrelationPoint = {
  gameId: string;
  name: string;
  x: number;
  y: number;
  releaseYear: number | null;
};

function buildMetricWhere(metric: MetricFilter): Prisma.GameMetricWhereInput {
  switch (metric.mode) {
    case "source":
      return { source: { key: metric.sourceKey } };
    case "kind":
      return { source: { metricKind: metric.metricKind } };
    case "all_critic":
      return { source: { metricKind: MetricKind.CRITIC_SCORE } };
    case "all_user":
      return { source: { metricKind: MetricKind.USER_SCORE } };
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function aggregateValues(values: number[]): Omit<GroupMetricRow, "key" | "label"> {
  if (values.length === 0) {
    return { count: 0, average: 0, median: 0, min: 0, max: 0 };
  }
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    count: values.length,
    average: sum / values.length,
    median: median(values),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

export function averageMetricsByGame(
  metrics: Array<{ gameId: string; value: number; source: { metricKind: MetricKind; key: string } }>,
  filter: MetricFilter,
): Map<string, number> {
  const grouped = new Map<string, number[]>();

  for (const metric of metrics) {
    let include = false;
    switch (filter.mode) {
      case "source":
        include = metric.source.key === filter.sourceKey;
        break;
      case "kind":
        include = metric.source.metricKind === filter.metricKind;
        break;
      case "all_critic":
        include = metric.source.metricKind === MetricKind.CRITIC_SCORE;
        break;
      case "all_user":
        include = metric.source.metricKind === MetricKind.USER_SCORE;
        break;
    }
    if (!include) continue;
    const list = grouped.get(metric.gameId) ?? [];
    list.push(metric.value);
    grouped.set(metric.gameId, list);
  }

  const averages = new Map<string, number>();
  for (const [gameId, values] of grouped) {
    averages.set(gameId, values.reduce((a, b) => a + b, 0) / values.length);
  }
  return averages;
}

export async function getOverviewStats() {
  const [gameCount, metricCount, sourceCount, scrapePending, scrapeFailed] = await Promise.all([
    prisma.game.count(),
    prisma.gameMetric.count(),
    prisma.metricSource.count(),
    prisma.externalScrapeTarget.count({ where: { status: "PENDING" } }),
    prisma.externalScrapeTarget.count({ where: { status: { in: ["FAILED", "AMBIGUOUS"] } } }),
  ]);

  const avgScores = await prisma.gameMetric.groupBy({
    by: ["sourceId"],
    _avg: { value: true },
    _count: { value: true },
  });

  const sources = await prisma.metricSource.findMany();
  const sourceMap = new Map(sources.map((s) => [s.id, s]));

  return {
    gameCount,
    metricCount,
    sourceCount,
    scrapePending,
    scrapeFailed,
    sourceAverages: avgScores.map((row) => ({
      source: sourceMap.get(row.sourceId)?.key ?? row.sourceId,
      name: sourceMap.get(row.sourceId)?.name ?? "Unknown",
      average: row._avg.value ?? 0,
      count: row._count.value,
    })),
  };
}

export async function getGroupedMetrics(filters: AnalyticsFilters): Promise<GroupMetricRow[]> {
  const games = await prisma.game.findMany({
    where: {
      releaseYear: {
        gte: filters.yearFrom,
        lte: filters.yearTo,
      },
      ...(filters.genreIds?.length
        ? { genres: { some: { genreId: { in: filters.genreIds } } } }
        : {}),
      ...(filters.platformIds?.length
        ? { platforms: { some: { platformId: { in: filters.platformIds } } } }
        : {}),
    },
    include: {
      metrics: { include: { source: true } },
      genres: { include: { genre: true } },
      platforms: { include: { platform: true } },
      companies: { include: { company: true } },
      franchises: { include: { franchise: true } },
      perspectives: { include: { playerPerspective: true } },
    },
    take: 5000,
  });

  const gameAverages = averageMetricsByGame(
    games.flatMap((g) => g.metrics.map((m) => ({ ...m, gameId: g.id }))),
    filters.metric,
  );

  const buckets = new Map<string, { label: string; values: number[] }>();

  for (const game of games) {
    const value = gameAverages.get(game.id);
    if (value == null) continue;

    const keys: Array<{ key: string; label: string }> = [];

    switch (filters.groupBy) {
      case "releaseYear":
        if (game.releaseYear) keys.push({ key: String(game.releaseYear), label: String(game.releaseYear) });
        break;
      case "genre":
        for (const g of game.genres) {
          keys.push({ key: g.genreId, label: g.genre.name });
        }
        break;
      case "platform":
        for (const p of game.platforms) {
          keys.push({ key: p.platformId, label: p.platform.name });
        }
        break;
      case "developer":
        for (const c of game.companies.filter((x) => x.role === "DEVELOPER")) {
          keys.push({ key: c.companyId, label: c.company.name });
        }
        break;
      case "publisher":
        for (const c of game.companies.filter((x) => x.role === "PUBLISHER")) {
          keys.push({ key: c.companyId, label: c.company.name });
        }
        break;
      case "franchise":
        for (const f of game.franchises) {
          keys.push({ key: f.franchiseId, label: f.franchise.name });
        }
        break;
      case "perspective":
        for (const p of game.perspectives) {
          keys.push({ key: p.playerPerspectiveId, label: p.playerPerspective.name });
        }
        break;
    }

    for (const { key, label } of keys) {
      const bucket = buckets.get(key) ?? { label, values: [] };
      bucket.values.push(value);
      buckets.set(key, bucket);
    }
  }

  const rows = [...buckets.entries()]
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      ...aggregateValues(bucket.values),
    }))
    .filter((row) => row.count >= 3)
    .sort((a, b) => b.average - a.average);

  return rows.slice(0, filters.limit ?? 20);
}

export async function getReleaseYearTrend(filters: AnalyticsFilters): Promise<TrendRow[]> {
  const games = await prisma.game.findMany({
    where: {
      releaseYear: { not: null, gte: filters.yearFrom, lte: filters.yearTo },
    },
    include: {
      metrics: { where: buildMetricWhere(filters.metric), include: { source: true } },
    },
  });

  const buckets = new Map<number, number[]>();

  for (const game of games) {
    if (!game.releaseYear || game.metrics.length === 0) continue;
    const avg =
      game.metrics.reduce((sum, m) => sum + m.value, 0) / Math.max(game.metrics.length, 1);
    const list = buckets.get(game.releaseYear) ?? [];
    list.push(avg);
    buckets.set(game.releaseYear, list);
  }

  return [...buckets.entries()]
    .map(([year, values]) => ({
      year,
      count: values.length,
      average: values.reduce((a, b) => a + b, 0) / values.length,
    }))
    .sort((a, b) => a.year - b.year);
}

export async function getCriticVsUserCorrelation(limit = 500): Promise<CorrelationPoint[]> {
  const games = await prisma.game.findMany({
    take: limit,
    include: {
      metrics: { include: { source: true } },
    },
    where: {
      metrics: {
        some: {
          source: { key: { in: ["metacritic_critic", "metacritic_user", "igdb_user"] } },
        },
      },
    },
  });

  const points: CorrelationPoint[] = [];

  for (const game of games) {
    const criticMetric =
      game.metrics.find((m) => m.source.key === "metacritic_critic") ??
      game.metrics.find((m) => m.source.metricKind === MetricKind.CRITIC_SCORE);
    const userMetric =
      game.metrics.find((m) => m.source.key === "metacritic_user") ??
      game.metrics.find((m) => m.source.key === "igdb_user");

    if (!criticMetric || !userMetric) continue;

    const x = criticMetric.value;
    const y = userMetric.source.key === "metacritic_user" ? userMetric.value * 10 : userMetric.value;

    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
      continue;
    }

    points.push({
      gameId: game.id,
      name: game.name,
      x,
      y,
      releaseYear: game.releaseYear,
    });
  }

  return points;
}

export async function getFilterOptions() {
  const [genres, platforms, sources] = await Promise.all([
    prisma.genre.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.platform.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.metricSource.findMany({ orderBy: { name: "asc" } }),
  ]);

  const years = await prisma.game.findMany({
    where: { releaseYear: { not: null } },
    select: { releaseYear: true },
    distinct: ["releaseYear"],
    orderBy: { releaseYear: "asc" },
  });

  return {
    genres,
    platforms,
    sources,
    years: years.map((y) => y.releaseYear).filter((y): y is number => y != null),
  };
}

export async function getScoreDistribution(filters: AnalyticsFilters): Promise<Array<{ bucket: string; count: number }>> {
  const metrics = await prisma.gameMetric.findMany({
    where: {
      ...buildMetricWhere(filters.metric),
      game: {
        releaseYear: { gte: filters.yearFrom, lte: filters.yearTo },
      },
    },
    select: { value: true },
    take: 10000,
  });

  const buckets = new Map<string, number>();
  for (const { value } of metrics) {
    const bucketStart = Math.floor(value / 10) * 10;
    const label = `${bucketStart}-${bucketStart + 9}`;
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  }

  return [...buckets.entries()]
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket, undefined, { numeric: true }));
}
