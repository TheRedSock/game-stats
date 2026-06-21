import { afterEach, describe, expect, it, vi } from "vitest";
import {
  batchLog,
  getBatchLogLevel,
  isBatchLogVerbose,
} from "@/lib/jobs/batch-log";

describe("batch-log", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBatchLog = process.env.BATCH_JOB_LOG;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalBatchLog === undefined) {
      delete process.env.BATCH_JOB_LOG;
    } else {
      process.env.BATCH_JOB_LOG = originalBatchLog;
    }
  });

  it("defaults to verbose in development", () => {
    process.env.NODE_ENV = "development";
    delete process.env.BATCH_JOB_LOG;
    expect(getBatchLogLevel()).toBe("verbose");
    expect(isBatchLogVerbose()).toBe(true);
  });

  it("defaults to off in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.BATCH_JOB_LOG;
    expect(getBatchLogLevel()).toBe("off");
  });

  it("respects BATCH_JOB_LOG=off in development", () => {
    process.env.NODE_ENV = "development";
    process.env.BATCH_JOB_LOG = "off";
    expect(isBatchLogVerbose()).toBe(false);
  });

  it("respects BATCH_JOB_LOG=verbose in production", () => {
    process.env.NODE_ENV = "production";
    process.env.BATCH_JOB_LOG = "verbose";
    expect(isBatchLogVerbose()).toBe(true);
  });

  it("writes to console when verbose", () => {
    process.env.NODE_ENV = "development";
    delete process.env.BATCH_JOB_LOG;
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    batchLog("test message", { ok: true });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
