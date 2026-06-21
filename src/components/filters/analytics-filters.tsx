"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { GroupByDimension } from "@/lib/metrics/aggregation";
import { DEFAULT_METRIC_PARAM } from "@/lib/metrics/filters";

type FilterOptions = {
  genres: Array<{ id: string; name: string }>;
  platforms: Array<{ id: string; name: string }>;
  sources: Array<{ id: string; key: string; name: string; metricKind: string }>;
  years: number[];
};

type AnalyticsFiltersProps = {
  options: FilterOptions;
  defaultMetric?: string;
};

const GROUP_OPTIONS: Array<{ value: GroupByDimension; label: string }> = [
  { value: "genre", label: "Genre" },
  { value: "platform", label: "Platform" },
  { value: "developer", label: "Developer" },
  { value: "publisher", label: "Publisher" },
  { value: "franchise", label: "Franchise" },
  { value: "perspective", label: "Perspective" },
  { value: "releaseYear", label: "Release year" },
];

const METRIC_MODES = [
  { value: "all_critic", label: "Avg all critic scores" },
  { value: "all_user", label: "Avg all user scores" },
  { value: "source:metacritic_critic", label: "Metacritic critic only" },
  { value: "source:metacritic_user", label: "Metacritic user only" },
  { value: "source:igdb_user", label: "IGDB user only" },
];

export function AnalyticsFilters({ options, defaultMetric = DEFAULT_METRIC_PARAM }: AnalyticsFiltersProps) {
  const router = useRouter();
  const params = useSearchParams();

  const update = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.push(`?${next.toString()}`);
    },
    [params, router],
  );

  const selectClass =
    "w-full rounded-xl border border-card-border bg-card/80 px-3 py-2 text-sm text-foreground outline-none focus:border-accent";

  return (
    <div className="grid gap-4 rounded-2xl border border-card-border bg-card/50 p-4 md:grid-cols-2 lg:grid-cols-4">
      <label className="space-y-1 text-sm">
        <span className="text-muted">Metric</span>
        <select
          className={selectClass}
          value={params.get("metric") ?? defaultMetric}
          onChange={(e) => update("metric", e.target.value)}
        >
          {METRIC_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-sm">
        <span className="text-muted">Group by</span>
        <select
          className={selectClass}
          value={params.get("groupBy") ?? "genre"}
          onChange={(e) => update("groupBy", e.target.value)}
        >
          {GROUP_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-sm">
        <span className="text-muted">Year from</span>
        <select
          className={selectClass}
          value={params.get("yearFrom") ?? ""}
          onChange={(e) => update("yearFrom", e.target.value)}
        >
          <option value="">Any</option>
          {options.years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-sm">
        <span className="text-muted">Year to</span>
        <select
          className={selectClass}
          value={params.get("yearTo") ?? ""}
          onChange={(e) => update("yearTo", e.target.value)}
        >
          <option value="">Any</option>
          {options.years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-sm md:col-span-2">
        <span className="text-muted">Genre filter</span>
        <select
          className={selectClass}
          value={params.get("genreId") ?? ""}
          onChange={(e) => update("genreId", e.target.value)}
        >
          <option value="">All genres</option>
          {options.genres.map((genre) => (
            <option key={genre.id} value={genre.id}>
              {genre.name}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-sm md:col-span-2">
        <span className="text-muted">Platform filter</span>
        <select
          className={selectClass}
          value={params.get("platformId") ?? ""}
          onChange={(e) => update("platformId", e.target.value)}
        >
          <option value="">All platforms</option>
          {options.platforms.map((platform) => (
            <option key={platform.id} value={platform.id}>
              {platform.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
