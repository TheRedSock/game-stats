import { describe, expect, it } from "vitest";
import {
  buildMetacriticSlugCandidates,
  buildMetacriticUrls,
  extractMetacriticScores,
  normalizeTitle,
  titlesMatch,
} from "@/lib/metacritic/parser";
import { averageMetricsByGame } from "@/lib/metrics/aggregation";
import { MetricKind } from "@prisma/client";
import { slugify, getReleaseYear } from "@/lib/utils";

describe("slugify", () => {
  it("creates url-safe slugs", () => {
    expect(slugify("The Legend of Zelda: Breath of the Wild")).toBe(
      "the-legend-of-zelda-breath-of-the-wild",
    );
  });
});

describe("getReleaseYear", () => {
  it("extracts year from date", () => {
    expect(getReleaseYear(new Date("2017-03-03T00:00:00Z"))).toBe(2017);
  });
});

describe("Metacritic URL helpers", () => {
  it("builds slug candidates from name and igdb slug", () => {
    const slugs = buildMetacriticSlugCandidates("Halo: Combat Evolved", "halo-combat-evolved");
    expect(slugs).toContain("halo-combat-evolved");
    expect(slugs).toContain("halo");
  });

  it("builds metacritic urls from slugs", () => {
    expect(buildMetacriticUrls(["halo"])).toEqual(["https://www.metacritic.com/game/halo/"]);
  });
});

describe("titlesMatch", () => {
  it("matches exact normalized titles", () => {
    expect(titlesMatch("Halo: Combat Evolved", "Halo Combat Evolved")).toBe(true);
  });

  it("rejects unrelated titles", () => {
    expect(titlesMatch("Halo", "God of War")).toBe(false);
  });

  it("normalizes punctuation", () => {
    expect(normalizeTitle("The Witcher 3: Wild Hunt")).toBe("the witcher 3 wild hunt");
  });
});

describe("extractMetacriticScores", () => {
  it("parses critic and user scores from html snippets", () => {
    const html = `
      data-testid="global-score-header">Metascore</div>
      title="Metascore 92 out of 100"
      data-testid="global-score-value">92</span>
      Based on 40 Critic Reviews
      data-testid="global-score-header">User score</div>
      title="User score 8.5 out of 10"
      data-testid="global-score-value">8.5</span>
      Based on 100 User Ratings
    `;
    const scores = extractMetacriticScores(html);
    expect(scores.critic).toBe(92);
    expect(scores.user).toBe(8.5);
  });
});

describe("averageMetricsByGame", () => {
  it("averages critic scores across sources", () => {
    const metrics = [
      {
        gameId: "g1",
        value: 80,
        source: { key: "metacritic_critic", metricKind: MetricKind.CRITIC_SCORE },
      },
      {
        gameId: "g1",
        value: 90,
        source: { key: "other_critic", metricKind: MetricKind.CRITIC_SCORE },
      },
      {
        gameId: "g2",
        value: 70,
        source: { key: "metacritic_critic", metricKind: MetricKind.CRITIC_SCORE },
      },
    ];

    const result = averageMetricsByGame(metrics, { mode: "all_critic" });
    expect(result.get("g1")).toBe(85);
    expect(result.get("g2")).toBe(70);
  });

  it("filters by specific source", () => {
    const metrics = [
      {
        gameId: "g1",
        value: 80,
        source: { key: "metacritic_critic", metricKind: MetricKind.CRITIC_SCORE },
      },
      {
        gameId: "g1",
        value: 90,
        source: { key: "other_critic", metricKind: MetricKind.CRITIC_SCORE },
      },
    ];

    const result = averageMetricsByGame(metrics, {
      mode: "source",
      sourceKey: "metacritic_critic",
    });
    expect(result.get("g1")).toBe(80);
  });
});
