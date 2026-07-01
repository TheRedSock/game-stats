import { afterEach, describe, expect, it } from "vitest";
import { getJobMaxBatches, getJobMaxTotalItems, getIgdbSeedTotal } from "@/lib/jobs/limits";

describe("job limits", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("uses defaults when env is unset", () => {
    delete process.env.JOB_MAX_BATCHES;
    delete process.env.JOB_MAX_TOTAL_ITEMS;
    delete process.env.IGDB_SEED_TOTAL;
    expect(getJobMaxBatches()).toBe(100);
    expect(getJobMaxTotalItems()).toBe(5000);
    expect(getIgdbSeedTotal()).toBe(200);
  });

  it("reads positive integers from env", () => {
    process.env.JOB_MAX_BATCHES = "25";
    process.env.JOB_MAX_TOTAL_ITEMS = "1000";
    process.env.IGDB_SEED_TOTAL = "500";
    expect(getJobMaxBatches()).toBe(25);
    expect(getJobMaxTotalItems()).toBe(1000);
    expect(getIgdbSeedTotal()).toBe(500);
  });

  it("falls back for invalid env values", () => {
    process.env.JOB_MAX_BATCHES = "0";
    expect(getJobMaxBatches()).toBe(100);
  });
});
