import { ScrapeStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { scrapeMetacriticTarget } from "@/lib/metacritic/scraper";

vi.mock("@/lib/db", () => ({
  prisma: {
    externalScrapeTarget: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    metricSource: {
      findUnique: vi.fn(),
    },
    gameMetric: {
      upsert: vi.fn(),
    },
  },
}));

const mockedPrisma = vi.mocked(prisma);

function gamePage(title: string): string {
  return `
    <html>
      <head><meta property="og:title" content="${title} | Metacritic" /></head>
      <body>
        <h1>${title}</h1>
        <div data-testid="global-score-header">Metascore</div>
        <span title="Metascore 90 out of 100" data-testid="global-score-value">90</span>
        Based on 12 Critic Reviews
        <div data-testid="global-score-header">User score</div>
        <span title="User score 8.2 out of 10" data-testid="global-score-value">8.2</span>
        Based on 45 User Ratings
      </body>
    </html>
  `;
}

function target(overrides: Record<string, unknown> = {}) {
  return {
    id: "target-1",
    gameId: "game-1",
    provider: "METACRITIC",
    resolvedUrl: "https://www.metacritic.com/game/old-bad-url/",
    manualUrl: null,
    status: ScrapeStatus.PENDING,
    attemptCount: 0,
    verifiedTitle: null,
    game: {
      id: "game-1",
      name: "Correct Game",
      slug: "correct-game",
      releaseDate: new Date("2020-01-01T00:00:00Z"),
      releaseYear: 2020,
      igdbStatus: 0,
    },
    ...overrides,
  };
}

describe("scrapeMetacriticTarget URL resolution", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not retry stale resolvedUrl before slug fallbacks", async () => {
    mockedPrisma.externalScrapeTarget.findUnique.mockResolvedValue(target());
    mockedPrisma.externalScrapeTarget.update.mockResolvedValue(target());
    mockedPrisma.metricSource.findUnique
      .mockResolvedValueOnce({ id: "critic-source" } as never)
      .mockResolvedValueOnce({ id: "user-source" } as never);
    mockedPrisma.gameMetric.upsert.mockResolvedValue({} as never);

    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://www.metacritic.com/game/correct-game/") {
        return new Response(gamePage("Correct Game"), { status: 200 });
      }
      return new Response("", { status: 404 });
    });

    await expect(scrapeMetacriticTarget("target-1")).resolves.toBe(ScrapeStatus.SUCCESS);
    const fetchedUrls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(fetchedUrls).not.toContain("https://www.metacritic.com/game/old-bad-url/");
    expect(fetchedUrls).toContain("https://www.metacritic.com/game/correct-game/");
  });

  it("trusts admin manual URLs without title matching", async () => {
    mockedPrisma.externalScrapeTarget.findUnique.mockResolvedValue(
      target({ manualUrl: "https://www.metacritic.com/game/manual-choice/" }),
    );
    mockedPrisma.externalScrapeTarget.update.mockResolvedValue(target());
    mockedPrisma.metricSource.findUnique
      .mockResolvedValueOnce({ id: "critic-source" } as never)
      .mockResolvedValueOnce({ id: "user-source" } as never);
    mockedPrisma.gameMetric.upsert.mockResolvedValue({} as never);

    vi.spyOn(global, "fetch").mockImplementation(
      async () => new Response(gamePage("Different Metacritic Title"), { status: 200 }),
    );

    await expect(scrapeMetacriticTarget("target-1")).resolves.toBe(ScrapeStatus.SUCCESS);
    expect(mockedPrisma.externalScrapeTarget.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ScrapeStatus.SUCCESS,
          resolvedUrl: "https://www.metacritic.com/game/manual-choice/",
        }),
      }),
    );
  });

  it("records slug page hits with title mismatches as ambiguous", async () => {
    mockedPrisma.externalScrapeTarget.findUnique.mockResolvedValue(target());
    mockedPrisma.externalScrapeTarget.update.mockResolvedValue(target());

    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://www.metacritic.com/game/correct-game/") {
        return new Response(gamePage("Wrong Game"), { status: 200 });
      }
      return new Response("", { status: 404 });
    });

    await expect(scrapeMetacriticTarget("target-1")).resolves.toBe(ScrapeStatus.AMBIGUOUS);
    expect(mockedPrisma.externalScrapeTarget.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ScrapeStatus.AMBIGUOUS,
          resolvedUrl: "https://www.metacritic.com/game/correct-game/",
        }),
      }),
    );
  });
});
