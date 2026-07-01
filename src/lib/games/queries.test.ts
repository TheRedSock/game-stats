import { MetricKind } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { pickHeadlineScore } from "@/lib/games/queries";

describe("pickHeadlineScore", () => {
  it("prefers critic scores and normalizes values to 100", () => {
    const score = pickHeadlineScore([
      {
        value: 8.5,
        source: {
          key: "metacritic_user",
          name: "Metacritic User",
          metricKind: MetricKind.USER_SCORE,
          maxValue: 10,
        },
      },
      {
        value: 91,
        source: {
          key: "metacritic_critic",
          name: "Metacritic Critic",
          metricKind: MetricKind.CRITIC_SCORE,
          maxValue: 100,
        },
      },
    ]);

    expect(score).toEqual({ label: "Metacritic Critic", value: 91 });
  });

  it("normalizes 0-10 user scores when no critic score exists", () => {
    const score = pickHeadlineScore([
      {
        value: 8.5,
        source: {
          key: "metacritic_user",
          name: "Metacritic User",
          metricKind: MetricKind.USER_SCORE,
          maxValue: 10,
        },
      },
    ]);

    expect(score).toEqual({ label: "Metacritic User", value: 85 });
  });
});
