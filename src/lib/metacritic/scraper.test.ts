import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

describe("scrapeMetacriticTarget URL resolution", () => {
  it("does not pass resolvedUrl into resolveMetacriticUrl (would skip slug fallbacks)", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/metacritic/scraper.ts"), "utf8");
    expect(src).not.toMatch(/manualUrl\s*\?\?\s*target\.resolvedUrl/);
    expect(src).toMatch(/resolveMetacriticUrl\([\s\S]*?target\.manualUrl,/);
  });

  it("does not title-match admin manual URLs", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/metacritic/scraper.ts"), "utf8");
    const manualBlock = src.match(/if \(manualUrl\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(manualBlock).not.toContain("Manual URL title mismatch");
    expect(manualBlock).not.toMatch(/titlesMatch\(gameName, title\)/);
  });

  it("records slug page hits as ambiguous title mismatches", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/metacritic/scraper.ts"), "utf8");
    expect(src).toContain("slugPageHit");
    expect(src).toContain("RESOLUTION_ERRORS.slugTitleMismatch");
    expect(src).toContain("RESOLUTION_ERRORS.noPage");
    expect(src).toContain("approveAmbiguousMetacriticMatch");
    expect(src).toContain("pickMetacriticSearchResult");
    expect(src).not.toMatch(/results\[0\]\?\.url/);
  });
});
