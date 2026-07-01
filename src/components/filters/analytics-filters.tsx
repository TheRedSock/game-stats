"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
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

const BASE_METRIC_MODES = [
  { value: "all_critic", label: "Avg all critic scores" },
  { value: "all_user", label: "Avg all user scores" },
];

export function AnalyticsFilters({ options, defaultMetric = DEFAULT_METRIC_PARAM }: AnalyticsFiltersProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const metricModes = useMemo(
    () => [
      ...BASE_METRIC_MODES,
      ...options.sources.map((source) => ({
        value: `source:${source.key}`,
        label: `${source.name} only`,
      })),
    ],
    [options.sources],
  );

  const update = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      startTransition(() => {
        router.push(`?${next.toString()}`);
      });
    },
    [params, router, startTransition],
  );

  return (
    <Card
      className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
      aria-busy={isPending}
      aria-live="polite"
    >
      <Field label="Metric">
        <Select
          value={params.get("metric") ?? defaultMetric}
          onChange={(e) => update("metric", e.target.value)}
        >
          {metricModes.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Group by">
        <Select
          value={params.get("groupBy") ?? "genre"}
          onChange={(e) => update("groupBy", e.target.value)}
        >
          {GROUP_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Year from">
        <Select
          value={params.get("yearFrom") ?? ""}
          onChange={(e) => update("yearFrom", e.target.value)}
        >
          <option value="">Any</option>
          {options.years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Year to">
        <Select
          value={params.get("yearTo") ?? ""}
          onChange={(e) => update("yearTo", e.target.value)}
        >
          <option value="">Any</option>
          {options.years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Genre filter" className="md:col-span-2">
        <Select
          value={params.get("genreId") ?? ""}
          onChange={(e) => update("genreId", e.target.value)}
        >
          <option value="">All genres</option>
          {options.genres.map((genre) => (
            <option key={genre.id} value={genre.id}>
              {genre.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Platform filter" className="md:col-span-2">
        <Select
          value={params.get("platformId") ?? ""}
          onChange={(e) => update("platformId", e.target.value)}
        >
          <option value="">All platforms</option>
          {options.platforms.map((platform) => (
            <option key={platform.id} value={platform.id}>
              {platform.name}
            </option>
          ))}
        </Select>
      </Field>
      {isPending ? <p className="text-xs text-muted lg:col-span-4">Updating charts...</p> : null}
    </Card>
  );
}
