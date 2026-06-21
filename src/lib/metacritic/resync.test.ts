import { describe, expect, it } from "vitest";
import {
  isDueForMetacriticResync,
  metacriticRefreshIntervalDays,
  metacriticResyncPriority,
} from "@/lib/metacritic/resync";

const now = new Date("2026-06-21T12:00:00Z");

describe("metacriticRefreshIntervalDays", () => {
  it("uses short intervals for recent releases", () => {
    expect(metacriticRefreshIntervalDays(2025, now)).toBe(7);
  });

  it("uses long intervals for classic releases", () => {
    expect(metacriticRefreshIntervalDays(1998, now)).toBe(180);
  });
});

describe("metacriticResyncPriority", () => {
  it("ranks stale recent titles above fresh classics", () => {
    const recentStale = metacriticResyncPriority({
      releaseYear: 2025,
      lastSuccessAt: new Date("2026-06-01T00:00:00Z"),
      now,
    });
    const classicFresh = metacriticResyncPriority({
      releaseYear: 1998,
      lastSuccessAt: new Date("2026-05-01T00:00:00Z"),
      now,
    });
    expect(recentStale).toBeGreaterThan(classicFresh);
    expect(
      isDueForMetacriticResync({
        releaseYear: 2025,
        lastSuccessAt: new Date("2026-06-01T00:00:00Z"),
        now,
      }),
    ).toBe(true);
  });

  it("does not mark a recently synced classic as due", () => {
    expect(
      isDueForMetacriticResync({
        releaseYear: 1998,
        lastSuccessAt: new Date("2026-06-15T00:00:00Z"),
        now,
      }),
    ).toBe(false);
  });
});
