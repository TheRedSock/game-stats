import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getScoreDistribution } from "@/lib/metrics/aggregation";

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

const mockedPrisma = vi.mocked(prisma);

describe("SQL-backed score distribution", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("maps SQL bucket rows into chart labels", async () => {
    mockedPrisma.$queryRaw.mockResolvedValue([
      { bucket: 80, count: 2 },
      { bucket: 90, count: 3n },
    ] as never);

    await expect(
      getScoreDistribution({
        metric: { mode: "all_critic" },
        groupBy: "genre",
      }),
    ).resolves.toEqual([
      { bucket: "80-89", count: 2 },
      { bucket: "90-99", count: 3 },
    ]);
    expect(mockedPrisma.$queryRaw).toHaveBeenCalledOnce();
  });

  it("accepts source filters", async () => {
    mockedPrisma.$queryRaw.mockResolvedValue([] as never);

    await getScoreDistribution({
      metric: { mode: "source", sourceKey: "metacritic_critic" },
      groupBy: "genre",
    });

    expect(mockedPrisma.$queryRaw).toHaveBeenCalledOnce();
  });
});
