const MS_PER_DAY = 86_400_000;

/** Days between Metacritic refreshes — newer releases checked more often. */
export function metacriticRefreshIntervalDays(releaseYear: number | null, now = new Date()): number {
  if (releaseYear == null) return 60;

  const ageYears = now.getUTCFullYear() - releaseYear;
  if (ageYears <= 2) return 7;
  if (ageYears <= 10) return 30;
  return 180;
}

/** Higher = more overdue for refresh (>= 1 means due). */
export function metacriticResyncPriority(input: {
  lastSuccessAt?: Date | null;
  lastAttemptAt?: Date | null;
  releaseYear?: number | null;
  now?: Date;
}): number {
  const now = input.now ?? new Date();
  const reference = input.lastSuccessAt ?? input.lastAttemptAt;
  const daysSince = reference
    ? (now.getTime() - reference.getTime()) / MS_PER_DAY
    : 365 * 10;
  const interval = metacriticRefreshIntervalDays(input.releaseYear ?? null, now);
  return daysSince / interval;
}

export function isDueForMetacriticResync(input: {
  lastSuccessAt?: Date | null;
  lastAttemptAt?: Date | null;
  releaseYear?: number | null;
  now?: Date;
}): boolean {
  return metacriticResyncPriority(input) >= 1;
}
