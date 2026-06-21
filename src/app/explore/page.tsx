import { Suspense } from "react";
import {
  CorrelationScatter,
  DistributionChart,
  GroupComparisonChart,
  TrendChart,
} from "@/components/charts/analytics-charts";
import { AnalyticsFilters } from "@/components/filters/analytics-filters";
import { emptyChartHint, resolveMetricParam } from "@/lib/metrics/filters";
import type { GroupByDimension } from "@/lib/metrics/aggregation";
import {
  getCriticVsUserCorrelation,
  getFilterOptions,
  getGroupedMetrics,
  getReleaseYearTrend,
  getScoreDistribution,
} from "@/lib/metrics/aggregation";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const options = await getFilterOptions();

  const { filter: metric, param: metricParam } = await resolveMetricParam(
    typeof params.metric === "string" ? params.metric : undefined,
  );
  const groupBy = (typeof params.groupBy === "string"
    ? params.groupBy
    : "genre") as GroupByDimension;
  const yearFrom = params.yearFrom ? Number(params.yearFrom) : undefined;
  const yearTo = params.yearTo ? Number(params.yearTo) : undefined;
  const genreIds =
    typeof params.genreId === "string" && params.genreId ? [params.genreId] : undefined;
  const platformIds =
    typeof params.platformId === "string" && params.platformId
      ? [params.platformId]
      : undefined;

  const filters = { metric, groupBy, yearFrom, yearTo, genreIds, platformIds, limit: 15 };

  const [grouped, trend, distribution, correlation] = await Promise.all([
    getGroupedMetrics(filters),
    getReleaseYearTrend({ ...filters, groupBy: "releaseYear" }),
    getScoreDistribution(filters),
    getCriticVsUserCorrelation(400),
  ]);

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Explore</h1>
        <p className="text-muted">
          Filter by source, group by metadata dimensions, and compare trends interactively.
        </p>
      </section>

      <Suspense fallback={<div className="h-32 animate-pulse rounded-2xl bg-card/50" />}>
        <AnalyticsFilters options={options} defaultMetric={metricParam} />
      </Suspense>

      <section className="grid gap-6 lg:grid-cols-2">
        <ChartPanel title="Grouped averages">
          {grouped.length > 0 ? (
            <GroupComparisonChart data={grouped} />
          ) : (
            <EmptyState message={emptyChartHint(metric, "metric")} />
          )}
        </ChartPanel>
        <ChartPanel title="Score distribution">
          {distribution.length > 0 ? (
            <DistributionChart data={distribution} />
          ) : (
            <EmptyState message={emptyChartHint(metric, "metric")} />
          )}
        </ChartPanel>
        <ChartPanel title="Trend by release year">
          {trend.length > 0 ? (
            <TrendChart data={trend} />
          ) : (
            <EmptyState message={emptyChartHint(metric, "metric")} />
          )}
        </ChartPanel>
        <ChartPanel title="Critic vs user">
          {correlation.length > 0 ? (
            <CorrelationScatter data={correlation} />
          ) : (
            <EmptyState message={emptyChartHint(metric, "correlation")} />
          )}
        </ChartPanel>
      </section>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-card-border bg-card/50 p-5">
      <h2 className="mb-4 text-lg font-medium">{title}</h2>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed border-card-border p-6 text-center text-sm text-muted">
      {message}
    </div>
  );
}
