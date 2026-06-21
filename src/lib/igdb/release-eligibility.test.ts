import { describe, expect, it } from "vitest";
import {
  IGDB_STATUS_CANCELLED,
  IGDB_STATUS_RELEASED,
  isEligibleForMetacriticScrape,
} from "@/lib/igdb/release-eligibility";

describe("isEligibleForMetacriticScrape", () => {
  const now = new Date("2026-06-21T12:00:00Z");

  it("allows released games with a past release date", () => {
    expect(
      isEligibleForMetacriticScrape({
        igdbStatus: IGDB_STATUS_RELEASED,
        releaseDate: new Date("1992-01-01T00:00:00Z"),
        now,
      }),
    ).toBe(true);
  });

  it("skips cancelled games even when IGDB has ratings", () => {
    expect(
      isEligibleForMetacriticScrape({
        igdbStatus: IGDB_STATUS_CANCELLED,
        releaseDate: null,
        now,
      }),
    ).toBe(false);
  });

  it("skips games without a release date when status is unknown", () => {
    expect(
      isEligibleForMetacriticScrape({
        igdbStatus: null,
        releaseDate: null,
        now,
      }),
    ).toBe(false);
  });

  it("skips future releases", () => {
    expect(
      isEligibleForMetacriticScrape({
        igdbStatus: IGDB_STATUS_RELEASED,
        releaseDate: new Date("2030-01-01T00:00:00Z"),
        now,
      }),
    ).toBe(false);
  });
});
