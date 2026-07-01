import { Suspense } from "react";
import {
  CorrelationScatter,
  DistributionChart,
  GroupComparisonChart,
  TrendChart,
} from "@/components/charts/analytics-charts";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import {
  getCriticVsUserCorrelation,
  getGroupedMetrics,
  getOverviewStats,
  getReleaseYearTrend,
  getScoreDistribution,
} from "@/lib/metrics/aggregation";
import { resolveMetricParam } from "@/lib/metrics/filters";
import { formatNumber, formatScore } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const overview = await getOverviewStats();
  const { filter: defaultMetric } = await resolveMetricParam(undefined);

  const avgCritic =
    overview.sourceAverages.find((s) => s.source.includes("critic"))?.average ?? 0;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm uppercase tracking-[0.2em] text-accent">Analytics</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Video game ratings & metadata
        </h1>
        <p className="max-w-2xl text-muted">
          Explore distributions, trends, and correlations across IGDB metadata and multi-source
          ratings including Metacritic.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Games indexed" value={formatNumber(overview.gameCount)} />
        <StatCard label="Metric records" value={formatNumber(overview.metricCount)} />
        <StatCard
          label="Avg critic score"
          value={formatScore(avgCritic)}
          hint="Across available critic sources"
        />
        <StatCard
          label="Pending Metacritic"
          value={formatNumber(overview.scrapePending)}
          hint={`${overview.scrapeFailed} failed/ambiguous`}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Panel title="Score distribution" subtitle="All critic scores">
          <Suspense fallback={<ChartSkeleton />}>
            <DistributionPanel metric={defaultMetric} />
          </Suspense>
        </Panel>
        <Panel title="Release year trend" subtitle="Average critic score by year since 2000">
          <Suspense fallback={<ChartSkeleton />}>
            <TrendPanel metric={defaultMetric} />
          </Suspense>
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Panel title="Top genres by critic score" subtitle="Minimum 3 titles per genre">
          <Suspense fallback={<ChartSkeleton />}>
            <TopGenresPanel metric={defaultMetric} />
          </Suspense>
        </Panel>
        <Panel title="Critic vs user correlation" subtitle="Normalized to 0–100 scale">
          <Suspense fallback={<ChartSkeleton />}>
            <CorrelationPanel />
          </Suspense>
        </Panel>
      </section>

      <Card>
        <h2 className="text-lg font-medium">Source averages</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {overview.sourceAverages.map((source) => (
            <div key={source.source} className="rounded-xl border border-card-border p-4">
              <p className="text-sm text-muted">{source.name}</p>
              <p className="mt-1 text-2xl font-semibold">{formatScore(source.average)}</p>
              <p className="text-xs text-muted">{formatNumber(source.count)} records</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      {children}
    </Card>
  );
}

function ChartSkeleton() {
  return <div className="h-[280px] animate-pulse rounded-xl bg-background/70" />;
}

async function DistributionPanel({ metric }: { metric: Awaited<ReturnType<typeof resolveMetricParam>>["filter"] }) {
  const distribution = await getScoreDistribution({ metric, groupBy: "genre" });
  return distribution.length > 0 ? (
    <DistributionChart data={distribution} description="Score bucket distribution." />
  ) : (
    <EmptyState message="Run IGDB sync from admin to populate data." />
  );
}

async function TrendPanel({ metric }: { metric: Awaited<ReturnType<typeof resolveMetricParam>>["filter"] }) {
  const trend = await getReleaseYearTrend({
    metric,
    groupBy: "releaseYear",
    yearFrom: 2000,
  });
  return trend.length > 0 ? (
    <TrendChart data={trend} description="Average score by release year since 2000." />
  ) : (
    <EmptyState message="Not enough release year data yet." />
  );
}

async function TopGenresPanel({ metric }: { metric: Awaited<ReturnType<typeof resolveMetricParam>>["filter"] }) {
  const topGenres = await getGroupedMetrics({ metric, groupBy: "genre", limit: 10 });
  return topGenres.length > 0 ? (
    <GroupComparisonChart data={topGenres} description="Top genres by average score." />
  ) : (
    <EmptyState message="Sync games to compare genres." />
  );
}

async function CorrelationPanel() {
  const correlation = await getCriticVsUserCorrelation(300);
  return correlation.length > 0 ? (
    <CorrelationScatter data={correlation} description="Critic and user score scatter plot." />
  ) : (
    <EmptyState message="Scrape Metacritic scores to compare critic vs user." />
  );
}
