import {
  CorrelationScatter,
  DistributionChart,
  GroupComparisonChart,
  TrendChart,
} from "@/components/charts/analytics-charts";
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
  const distribution = await getScoreDistribution({
    metric: defaultMetric,
    groupBy: "genre",
  });
  const trend = await getReleaseYearTrend({
    metric: defaultMetric,
    groupBy: "releaseYear",
    yearFrom: 2000,
  });
  const topGenres = await getGroupedMetrics({
    metric: defaultMetric,
    groupBy: "genre",
    limit: 10,
  });
  const correlation = await getCriticVsUserCorrelation(300);

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
          {distribution.length > 0 ? (
            <DistributionChart data={distribution} />
          ) : (
            <EmptyState message="Run IGDB sync from admin to populate data." />
          )}
        </Panel>
        <Panel title="Release year trend" subtitle="Average critic score by year since 2000">
          {trend.length > 0 ? (
            <TrendChart data={trend} />
          ) : (
            <EmptyState message="Not enough release year data yet." />
          )}
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Panel title="Top genres by critic score" subtitle="Minimum 3 titles per genre">
          {topGenres.length > 0 ? (
            <GroupComparisonChart data={topGenres} />
          ) : (
            <EmptyState message="Sync games to compare genres." />
          )}
        </Panel>
        <Panel title="Critic vs user correlation" subtitle="Normalized to 0–100 scale">
          {correlation.length > 0 ? (
            <CorrelationScatter data={correlation} />
          ) : (
            <EmptyState message="Scrape Metacritic scores to compare critic vs user." />
          )}
        </Panel>
      </section>

      <section className="rounded-2xl border border-card-border bg-card/40 p-5">
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
      </section>
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
    <div className="rounded-2xl border border-card-border bg-card/50 p-5">
      <div className="mb-4">
        <h2 className="text-lg font-medium">{title}</h2>
        <p className="text-sm text-muted">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed border-card-border text-sm text-muted">
      {message}
    </div>
  );
}
