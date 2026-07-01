import { Suspense } from "react";
import type { Metadata } from "next";
import {
  CorrelationScatter,
  DistributionChart,
  GroupComparisonChart,
  TrendChart,
} from "@/components/charts/analytics-charts";
import { AnalyticsFilters } from "@/components/filters/analytics-filters";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { emptyChartHint, resolveMetricParam } from "@/lib/metrics/filters";
import type { AnalyticsFilters as AnalyticsFilterShape, GroupByDimension, MetricFilter } from "@/lib/metrics/aggregation";
import {
  getCriticVsUserCorrelation,
  getFilterOptions,
  getGroupedMetrics,
  getReleaseYearTrend,
  getScoreDistribution,
} from "@/lib/metrics/aggregation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Explore",
  description: "Filter and compare game rating metrics by metadata dimensions.",
};

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
          <Suspense fallback={<ChartSkeleton />}>
            <GroupedPanel filters={filters} metric={metric} />
          </Suspense>
        </ChartPanel>
        <ChartPanel title="Score distribution">
          <Suspense fallback={<ChartSkeleton />}>
            <DistributionPanel filters={filters} metric={metric} />
          </Suspense>
        </ChartPanel>
        <ChartPanel title="Trend by release year">
          <Suspense fallback={<ChartSkeleton />}>
            <TrendPanel filters={filters} metric={metric} />
          </Suspense>
        </ChartPanel>
        <ChartPanel title="Critic vs user">
          <Suspense fallback={<ChartSkeleton />}>
            <CorrelationPanel metric={metric} />
          </Suspense>
        </ChartPanel>
      </section>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      {children}
    </Card>
  );
}

function ChartSkeleton() {
  return <div className="h-[280px] animate-pulse rounded-xl bg-background/70" />;
}

async function GroupedPanel({
  filters,
  metric,
}: {
  filters: AnalyticsFilterShape;
  metric: MetricFilter;
}) {
  const grouped = await getGroupedMetrics(filters);
  return grouped.length > 0 ? (
    <GroupComparisonChart data={grouped} description="Grouped average scores." />
  ) : (
    <EmptyState message={emptyChartHint(metric, "metric")} />
  );
}

async function DistributionPanel({
  filters,
  metric,
}: {
  filters: AnalyticsFilterShape;
  metric: MetricFilter;
}) {
  const distribution = await getScoreDistribution(filters);
  return distribution.length > 0 ? (
    <DistributionChart data={distribution} description="Filtered score distribution." />
  ) : (
    <EmptyState message={emptyChartHint(metric, "metric")} />
  );
}

async function TrendPanel({
  filters,
  metric,
}: {
  filters: AnalyticsFilterShape;
  metric: MetricFilter;
}) {
  const trend = await getReleaseYearTrend({ ...filters, groupBy: "releaseYear" });
  return trend.length > 0 ? (
    <TrendChart data={trend} description="Filtered release year trend." />
  ) : (
    <EmptyState message={emptyChartHint(metric, "metric")} />
  );
}

async function CorrelationPanel({ metric }: { metric: MetricFilter }) {
  const correlation = await getCriticVsUserCorrelation(400);
  return correlation.length > 0 ? (
    <CorrelationScatter data={correlation} description="Critic and user score correlation." />
  ) : (
    <EmptyState message={emptyChartHint(metric, "correlation")} />
  );
}
