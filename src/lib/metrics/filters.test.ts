import { describe, expect, it } from "vitest";
import { parseMetricParam } from "@/lib/metrics/filters";

describe("parseMetricParam", () => {
  it("defaults to user scores when param is missing", () => {
    expect(parseMetricParam(null)).toEqual({ mode: "all_user" });
    expect(parseMetricParam(undefined)).toEqual({ mode: "all_user" });
  });

  it("parses critic and source modes", () => {
    expect(parseMetricParam("all_critic")).toEqual({ mode: "all_critic" });
    expect(parseMetricParam("source:igdb_user")).toEqual({
      mode: "source",
      sourceKey: "igdb_user",
    });
  });
});
