import { describe, expect, it } from "vitest";
import {
  buildMetacriticSlugCandidates,
  extractPageTitle,
  metacriticSlugFromIgdb,
  normalizeMetacriticGameUrl,
  parseMetacriticPage,
  pickMetacriticSearchResult,
  shouldAutoSkipNoScores,
  titlesMatch,
} from "@/lib/metacritic/parser";
import { slugify } from "@/lib/utils";

describe("metacriticSlugFromIgdb", () => {
  it("converts IGDB underscore slugs to Metacritic-style slugs", () => {
    expect(metacriticSlugFromIgdb("baldur_s_gate")).toBe("baldurs-gate");
  });

  it("converts IGDB hyphen slugs with apostrophe segments", () => {
    expect(metacriticSlugFromIgdb("baldur-s-gate")).toBe("baldurs-gate");
  });
});

describe("buildMetacriticSlugCandidates", () => {
  it("prioritizes name-based slugs before raw igdb underscores", () => {
    const slugs = buildMetacriticSlugCandidates("Baldur's Gate", "baldur_s_gate");
    expect(slugs[0]).toBe("baldurs-gate");
    expect(slugs).toContain("baldurs-gate");
    expect(slugs.indexOf("baldurs-gate")).toBeLessThan(slugs.indexOf("baldur_s_gate"));
  });

  it("includes slugify output", () => {
    expect(buildMetacriticSlugCandidates("Baldur's Gate", "baldur_s_gate")).toContain(
      slugify("Baldur's Gate"),
    );
  });
});

describe("normalizeMetacriticGameUrl", () => {
  it("accepts a game slug", () => {
    expect(normalizeMetacriticGameUrl("space-quest-6-roger-wilco-in-the-spinal-frontier")).toBe(
      "https://www.metacritic.com/game/space-quest-6-roger-wilco-in-the-spinal-frontier/",
    );
  });

  it("accepts full and partial metacritic urls", () => {
    expect(normalizeMetacriticGameUrl("https://www.metacritic.com/game/baldurs-gate/")).toBe(
      "https://www.metacritic.com/game/baldurs-gate/",
    );
    expect(normalizeMetacriticGameUrl("/game/baldurs-gate/")).toBe(
      "https://www.metacritic.com/game/baldurs-gate/",
    );
  });

  it("rejects invalid input", () => {
    expect(normalizeMetacriticGameUrl("not a slug!")).toBeNull();
    expect(normalizeMetacriticGameUrl("https://example.com/game/foo/")).toBeNull();
  });
});

describe("pickMetacriticSearchResult", () => {
  it("does not fall back to unrelated first search links", () => {
    const results = [
      {
        url: "https://www.metacritic.com/game/the-adventures-of-elliot-the-millennium-tales/",
        title: "",
      },
      {
        url: "https://www.metacritic.com/game/dave-the-diver-in-the-jungle/",
        title: "",
      },
    ];
    expect(pickMetacriticSearchResult("Dune", results, "dune")).toBeNull();
  });

  it("accepts search hits with matching titles", () => {
    const results = [
      {
        url: "https://www.metacritic.com/game/dune/",
        title: "Dune",
      },
    ];
    expect(pickMetacriticSearchResult("Dune", results, "dune")?.url).toContain("/game/dune/");
  });

  it("accepts search hits whose url slug matches slug candidates", () => {
    const results = [
      {
        url: "https://www.metacritic.com/game/baldurs-gate/",
        title: "",
      },
    ];
    expect(pickMetacriticSearchResult("Baldur's Gate", results, "baldur-s-gate")?.url).toContain(
      "/game/baldurs-gate/",
    );
  });
});

describe("parseMetacriticPage", () => {
  it("parses critic score and review count", () => {
    const html = `
      data-testid="global-score-header">Metascore</div>
      title="Metascore 93 out of 100"
      data-testid="global-score-value">93</span>
      Based on 84 Critic Reviews
      data-testid="global-score-header">User score</div>
      title="User score 8.8 out of 10"
      data-testid="global-score-value">8.8</span>
      Based on 12 User Ratings
    `;
    const parsed = parseMetacriticPage(html);
    expect(parsed.critic).toBe(93);
    expect(parsed.criticReviewCount).toBe(84);
    expect(parsed.user).toBe(8.8);
    expect(parsed.userRatingCount).toBe(12);
  });

  it("parses comma-separated rating counts and aggregate user score", () => {
    const html = `
      data-testid="global-score-header">Metascore</div>
      title="Metascore 84 out of 100"
      data-testid="global-score-value">84</span>
      Based on 81 Critic Reviews
      data-testid="global-score-header">User score</div>
      Generally Favorable
      Based on 2,632 User Ratings
      title="User score 8.6 out of 10"
      data-testid="global-score-value">8.6</span>
      My Score
      tbd
      Latest User Reviews
      10 mursl
      This game is the best rpg
    `;
    const parsed = parseMetacriticPage(html);
    expect(parsed.critic).toBe(84);
    expect(parsed.criticReviewCount).toBe(81);
    expect(parsed.user).toBe(8.6);
    expect(parsed.userRatingCount).toBe(2632);
  });

  it("syncs partial scores when critic is tbd but user score exists", () => {
    const html = `
      data-testid="global-score-header">Metascore</div>
      title="Metascore TBD" aria-label="Metascore TBD"
      data-testid="global-score-tbd">tbd</span>
      Based on 0 Critic Reviews
      data-testid="global-score-header">User score</div>
      title="User score 8.2 out of 10"
      data-testid="global-score-value">8.2</span>
      Based on 5 User Ratings
      Latest User Reviews
    `;
    const parsed = parseMetacriticPage(html);
    expect(parsed.critic).toBeUndefined();
    expect(parsed.criticIsTbd).toBe(true);
    expect(parsed.user).toBe(8.2);
    expect(parsed.userRatingCount).toBe(5);
  });

  it("parses user score from Metacritic layout when score follows rating count", () => {
    const html = `
      data-testid="global-score-header">Metascore</div>
      title="Metascore TBD" aria-label="Metascore TBD"
      data-testid="global-score-tbd">tbd</span>
      data-testid="global-score-header">User score</div>
      Generally Favorable
      Based on 5 User Ratings
      title="User score 8.2 out of 10" aria-label="User score 8.2 out of 10"
      data-testid="global-score-value">8.2</span>
      Latest User Reviews
    `;
    const parsed = parseMetacriticPage(html);
    expect(parsed.critic).toBeUndefined();
    expect(parsed.criticIsTbd).toBe(true);
    expect(parsed.user).toBe(8.2);
    expect(parsed.userRatingCount).toBe(5);
    expect(parsed.userIsTbd).toBe(false);
  });

  it("parses both scores when hero review cards appear before aggregate headers", () => {
    const html = `
      title="User score 10 out of 10"><span>10</span>
      title="User score 8 out of 10"><span>8</span>
      data-testid="global-score-header">Metascore</div>
      Based on 18 Critic Reviews
      title="Metascore 87 out of 100"
      data-testid="global-score-value">87</span>
      data-testid="global-score-header">User score</div>
      Based on 301 User Ratings
      title="User score 8.8 out of 10"
      data-testid="global-score-value">8.8</span>
      Related Games
      title="Metascore 96 out of 100"><span>96</span>
    `;
    const parsed = parseMetacriticPage(html);
    expect(parsed.critic).toBe(87);
    expect(parsed.criticReviewCount).toBe(18);
    expect(parsed.user).toBe(8.8);
    expect(parsed.userRatingCount).toBe(301);
  });

  it("ignores related-game metascores when the title has no critic reviews", () => {
    const html = `
      data-testid="global-score-header">Metascore</div>
      title="Metascore TBD" aria-label="Metascore TBD"
      data-testid="global-score-tbd">tbd</span>
      data-testid="global-score-header">User score</div>
      Based on 5 User Ratings
      title="User score 8.2 out of 10"
      data-testid="global-score-value">8.2</span>
      Latest User Reviews
      Related Games
      title="Metascore 92 out of 100" aria-label="Metascore 92 out of 100"
      <span>92</span>
    `;
    const parsed = parseMetacriticPage(html);
    expect(parsed.critic).toBeUndefined();
    expect(parsed.criticReviewCount).toBeUndefined();
    expect(parsed.criticIsTbd).toBe(true);
    expect(parsed.user).toBe(8.2);
    expect(parsed.userRatingCount).toBe(5);
  });

  it("drops critic score without a review count", () => {
    const html = `
      data-testid="global-score-header">Metascore</div>
      title="Metascore 84 out of 100"
      data-testid="global-score-header">User score</div>
      8.6
      Based on 12 User Ratings
    `;
    const parsed = parseMetacriticPage(html);
    expect(parsed.critic).toBeUndefined();
    expect(parsed.user).toBe(8.6);
  });

  it("detects both aggregate scores as tbd", () => {
    const html = `
      data-testid="global-score-header">Metascore</div>
      title="Metascore TBD"
      data-testid="global-score-tbd">tbd</span>
      data-testid="global-score-header">User score</div>
      title="User score TBD"
      data-testid="global-score-tbd">tbd</span>
      Latest User Reviews
      10 someone
    `;
    const parsed = parseMetacriticPage(html);
    expect(parsed.criticIsTbd).toBe(true);
    expect(parsed.userIsTbd).toBe(true);
    expect(parsed.critic).toBeUndefined();
    expect(parsed.user).toBeUndefined();
  });
});

describe("shouldAutoSkipNoScores", () => {
  it("auto-skips old releases with both scores tbd using release date", () => {
    const parsed = parseMetacriticPage(`
      data-testid="global-score-header">Metascore</div>
      title="Metascore TBD"
      data-testid="global-score-tbd">tbd</span>
      data-testid="global-score-header">User score</div>
      title="User score TBD"
      data-testid="global-score-tbd">tbd</span>
    `);
    expect(shouldAutoSkipNoScores(new Date("1989-01-01T00:00:00Z"), null, parsed)).toBe(true);
  });

  it("auto-skips using release year when date is missing", () => {
    const parsed = parseMetacriticPage(`
      data-testid="global-score-header">Metascore</div>
      title="Metascore TBD"
      data-testid="global-score-tbd">tbd</span>
      data-testid="global-score-header">User score</div>
      title="User score TBD"
      data-testid="global-score-tbd">tbd</span>
    `);
    expect(shouldAutoSkipNoScores(null, 1989, parsed)).toBe(true);
  });

  it("does not auto-skip recent releases with tbd scores", () => {
    const parsed = parseMetacriticPage(`
      data-testid="global-score-header">Metascore</div>
      title="Metascore TBD"
      data-testid="global-score-tbd">tbd</span>
      data-testid="global-score-header">User score</div>
      title="User score TBD"
      data-testid="global-score-tbd">tbd</span>
    `);
    expect(shouldAutoSkipNoScores(new Date(), 2026, parsed)).toBe(false);
  });
});

describe("titlesMatch", () => {
  it("matches titles with punctuation differences", () => {
    expect(titlesMatch("Baldur's Gate", "Baldurs Gate")).toBe(true);
  });
});

describe("extractPageTitle", () => {
  it("decodes HTML entities in h1 titles", () => {
    const html = `<h1>Baldur&#39;s Gate II: Shadows of Amn</h1>`;
    expect(extractPageTitle(html)).toBe("Baldur's Gate II: Shadows of Amn");
    expect(titlesMatch("Baldur's Gate II: Shadows of Amn", extractPageTitle(html) ?? "")).toBe(true);
  });
});
