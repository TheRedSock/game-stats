import { MetricKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { MetricFilter } from "@/lib/metrics/aggregation";

export const DEFAULT_METRIC_PARAM = "all_user";

export function parseMetricParam(value: string | null | undefined): MetricFilter {
  if (!value || value === DEFAULT_METRIC_PARAM) return { mode: "all_user" };
  if (value === "all_critic") return { mode: "all_critic" };
  if (value.startsWith("source:")) {
    return { mode: "source", sourceKey: value.replace("source:", "") };
  }
  return { mode: "all_user" };
}

/** Pick a metric filter that matches seeded data when no URL param is set. */
export async function resolveMetricParam(
  searchParam: string | null | undefined,
): Promise<{ filter: MetricFilter; param: string }> {
  if (searchParam) {
    return { filter: parseMetricParam(searchParam), param: searchParam };
  }

  const [criticCount, igdbCount] = await Promise.all([
    prisma.gameMetric.count({
      where: { source: { metricKind: MetricKind.CRITIC_SCORE } },
    }),
    prisma.gameMetric.count({
      where: { source: { key: "igdb_user" } },
    }),
  ]);

  if (criticCount > 0) {
    return { filter: { mode: "all_critic" }, param: "all_critic" };
  }
  if (igdbCount > 0) {
    return { filter: { mode: "source", sourceKey: "igdb_user" }, param: "source:igdb_user" };
  }
  return { filter: { mode: "all_user" }, param: DEFAULT_METRIC_PARAM };
}

export function emptyChartHint(metric: MetricFilter, chart: "metric" | "correlation"): string {
  if (chart === "correlation") {
    return "Critic vs user needs both Metacritic and IGDB scores. Run Metacritic scrape from admin.";
  }
  if (metric.mode === "all_critic") {
    return "No critic scores yet. Run Metacritic scrape from admin, or switch metric to IGDB user.";
  }
  if (metric.mode === "source" && metric.sourceKey.includes("metacritic")) {
    return "No Metacritic data for this source yet. Run Metacritic scrape from admin.";
  }
  return "No data for current filters. Try adjusting filters or sync more games from admin.";
}
