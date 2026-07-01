import { JobStatus, JobType } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  completeJob,
  createQueuedJob,
  failJob,
  JobAlreadyActiveError,
} from "@/lib/jobs/control";

vi.mock("@/lib/db", () => ({
  prisma: {
    jobRun: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/redis", () => ({
  getRedis: () => null,
}));

const mockedPrisma = vi.mocked(prisma);

describe("job control", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("throws a typed conflict when a job is already active", async () => {
    mockedPrisma.jobRun.findFirst.mockResolvedValue({
      id: "active-job-id",
      type: JobType.IGDB_SYNC,
      status: JobStatus.RUNNING,
    } as never);

    await expect(createQueuedJob(JobType.IGDB_SYNC)).rejects.toBeInstanceOf(JobAlreadyActiveError);
  });

  it("creates a pending job when no active job exists", async () => {
    mockedPrisma.jobRun.findFirst.mockResolvedValue(null);
    mockedPrisma.jobRun.create.mockResolvedValue({ id: "job-1" } as never);

    await expect(createQueuedJob(JobType.IGDB_SYNC)).resolves.toEqual({ id: "job-1" });
    expect(mockedPrisma.jobRun.create).toHaveBeenCalledWith({
      data: { type: JobType.IGDB_SYNC, status: JobStatus.PENDING },
    });
  });

  it("marks jobs complete or failed", async () => {
    mockedPrisma.jobRun.update.mockResolvedValue({ id: "job-1" } as never);

    await completeJob("job-1", { processed: 1 }, "done");
    await failJob("job-1", "boom");

    expect(mockedPrisma.jobRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({ status: JobStatus.COMPLETED }),
      }),
    );
    expect(mockedPrisma.jobRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({ status: JobStatus.FAILED, error: "boom" }),
      }),
    );
  });
});
