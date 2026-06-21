/** IGDB game_status values (https://api.igdb.com/v4/game_status) */
export const IGDB_STATUS_RELEASED = 0;
export const IGDB_STATUS_ALPHA = 1;
export const IGDB_STATUS_BETA = 2;
export const IGDB_STATUS_EARLY_ACCESS = 3;
export const IGDB_STATUS_OFFLINE = 4;
export const IGDB_STATUS_CANCELLED = 5;
export const IGDB_STATUS_RUMORED = 6;
export const IGDB_STATUS_DELISTED = 7;

export const UNRELEASED_METACRITIC = "Unreleased on IGDB — Metacritic scrape skipped";

export function isEligibleForMetacriticScrape(input: {
  igdbStatus?: number | null;
  releaseDate?: Date | null;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();

  if (input.igdbStatus != null) {
    const releasedStatus =
      input.igdbStatus === IGDB_STATUS_RELEASED || input.igdbStatus === IGDB_STATUS_DELISTED;
    if (!releasedStatus) return false;
  }

  if (!input.releaseDate) return false;
  return input.releaseDate <= now;
}
