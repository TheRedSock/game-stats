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

function metricPredicate(metric: MetricFilter): Prisma.Sql {
  switch (metric.mode) {
    case "source":
      return Prisma.sql`ms."key" = ${metric.sourceKey}`;
    case "kind":
      return Prisma.sql`ms."metricKind"::text = ${metric.metricKind}`;
    case "all_critic":
      return Prisma.sql`ms."metricKind"::text = ${MetricKind.CRITIC_SCORE}`;
    case "all_user":
      return Prisma.sql`ms."metricKind"::text = ${MetricKind.USER_SCORE}`;
  }
}

function gameFilterPredicate(filters: AnalyticsFilters): Prisma.Sql {
  const yearFrom = filters.yearFrom ?? null;
  const yearTo = filters.yearTo ?? null;
  const genreFilter = filters.genreIds?.length
    ? Prisma.sql`EXISTS (
        SELECT 1 FROM "GameGenre" gg_filter
        WHERE gg_filter."gameId" = g."id"
          AND gg_filter."genreId" IN (${Prisma.join(filters.genreIds)})
      )`
    : Prisma.sql`TRUE`;
  const platformFilter = filters.platformIds?.length
    ? Prisma.sql`EXISTS (
        SELECT 1 FROM "GamePlatform" gp_filter
        WHERE gp_filter."gameId" = g."id"
          AND gp_filter."platformId" IN (${Prisma.join(filters.platformIds)})
      )`
    : Prisma.sql`TRUE`;

  return Prisma.sql`
    (${yearFrom}::int IS NULL OR g."releaseYear" >= ${yearFrom}::int)
    AND (${yearTo}::int IS NULL OR g."releaseYear" <= ${yearTo}::int)
    AND ${genreFilter}
    AND ${platformFilter}
  `;
}

function groupedDimensionQuery(groupBy: GroupByDimension): Prisma.Sql {
  switch (groupBy) {
    case "releaseYear":
      return Prisma.sql`
        SELECT gs.score, g."releaseYear"::text AS key, g."releaseYear"::text AS label
        FROM game_scores gs
        JOIN "Game" g ON g."id" = gs."gameId"
        WHERE g."releaseYear" IS NOT NULL
      `;
    case "genre":
      return Prisma.sql`
        SELECT gs.score, genre."id" AS key, genre."name" AS label
        FROM game_scores gs
        JOIN "GameGenre" gg ON gg."gameId" = gs."gameId"
        JOIN "Genre" genre ON genre."id" = gg."genreId"
      `;
    case "platform":
      return Prisma.sql`
        SELECT gs.score, platform."id" AS key, platform."name" AS label
        FROM game_scores gs
        JOIN "GamePlatform" gp ON gp."gameId" = gs."gameId"
        JOIN "Platform" platform ON platform."id" = gp."platformId"
      `;
    case "developer":
      return Prisma.sql`
        SELECT gs.score, company."id" AS key, company."name" AS label
        FROM game_scores gs
        JOIN "GameCompany" gc ON gc."gameId" = gs."gameId" AND gc."role"::text = 'DEVELOPER'
        JOIN "Company" company ON company."id" = gc."companyId"
      `;
    case "publisher":
      return Prisma.sql`
        SELECT gs.score, company."id" AS key, company."name" AS label
        FROM game_scores gs
        JOIN "GameCompany" gc ON gc."gameId" = gs."gameId" AND gc."role"::text = 'PUBLISHER'
        JOIN "Company" company ON company."id" = gc."companyId"
      `;
    case "franchise":
      return Prisma.sql`
        SELECT gs.score, franchise."id" AS key, franchise."name" AS label
        FROM game_scores gs
        JOIN "GameFranchise" gf ON gf."gameId" = gs."gameId"
        JOIN "Franchise" franchise ON franchise."id" = gf."franchiseId"
      `;
    case "perspective":
      return Prisma.sql`
        SELECT gs.score, perspective."id" AS key, perspective."name" AS label
        FROM game_scores gs
        JOIN "GamePlayerPerspective" gpp ON gpp."gameId" = gs."gameId"
        JOIN "PlayerPerspective" perspective ON perspective."id" = gpp."playerPerspectiveId"
      `;
  }
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
  const limit = filters.limit ?? 20;
  const rows = await prisma.$queryRaw<
    Array<{
      key: string;
      label: string;
      count: number | bigint;
      average: number;
      median: number;
      min: number;
      max: number;
    }>
  >(Prisma.sql`
    WITH game_scores AS (
      SELECT
        g."id" AS "gameId",
        AVG((gm."value" / NULLIF(ms."maxValue", 0)) * 100) AS score
      FROM "Game" g
      JOIN "GameMetric" gm ON gm."gameId" = g."id"
      JOIN "MetricSource" ms ON ms."id" = gm."sourceId"
      WHERE ${metricPredicate(filters.metric)}
        AND ${gameFilterPredicate(filters)}
      GROUP BY g."id"
    ),
    dimension_scores AS (${groupedDimensionQuery(filters.groupBy)})
    SELECT
      key,
      label,
      COUNT(*)::int AS count,
      AVG(score)::float AS average,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY score)::float AS median,
      MIN(score)::float AS min,
      MAX(score)::float AS max
    FROM dimension_scores
    GROUP BY key, label
    HAVING COUNT(*) >= 3
    ORDER BY average DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    count: Number(row.count),
    average: row.average,
    median: row.median,
    min: row.min,
    max: row.max,
  }));
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
  const rows = await prisma.$queryRaw<Array<{ bucket: number; count: number | bigint }>>(Prisma.sql`
    WITH metric_values AS (
      SELECT LEAST(90, FLOOR(((gm."value" / NULLIF(ms."maxValue", 0)) * 100) / 10) * 10)::int AS bucket
      FROM "Game" g
      JOIN "GameMetric" gm ON gm."gameId" = g."id"
      JOIN "MetricSource" ms ON ms."id" = gm."sourceId"
      WHERE ${metricPredicate(filters.metric)}
        AND ${gameFilterPredicate(filters)}
    )
    SELECT bucket, COUNT(*)::int AS count
    FROM metric_values
    GROUP BY bucket
    ORDER BY bucket ASC
  `);

  return rows.map((row) => ({
    bucket: `${row.bucket}-${row.bucket + 9}`,
    count: Number(row.count),
  }));
}
