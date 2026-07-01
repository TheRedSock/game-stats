import { JobStatus, JobType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getRedis } from "@/lib/redis";

const CANCEL_MESSAGE = "CANCEL_REQUESTED";
const CANCEL_REDIS_PREFIX = "job:cancel:";
const CANCEL_REDIS_TTL_SECONDS = 60 * 60 * 24 * 7;

export class JobAlreadyActiveError extends Error {
  constructor(
    public readonly type: JobType,
    public readonly activeJobId: string,
  ) {
    super(`A ${type} job is already active (${activeJobId.slice(0, 8)}...)`);
    this.name = "JobAlreadyActiveError";
  }
}

function cancelRedisKey(jobId: string): string {
  return `${CANCEL_REDIS_PREFIX}${jobId}`;
}

export async function getActiveJobByType(type: JobType) {
  return prisma.jobRun.findFirst({
    where: {
      type,
      status: { in: [JobStatus.PENDING, JobStatus.RUNNING] },
    },
    orderBy: { startedAt: "desc" },
  });
}

export async function createQueuedJob(type: JobType) {
  const existing = await getActiveJobByType(type);
  if (existing) {
    throw new JobAlreadyActiveError(type, existing.id);
  }

  return prisma.jobRun.create({
    data: { type, status: JobStatus.PENDING },
  });
}

export async function markJobRunning(id: string) {
  return prisma.jobRun.update({
    where: { id },
    data: { status: JobStatus.RUNNING },
  });
}

export async function updateJobProgress(
  id: string,
  stats: Prisma.InputJsonValue,
  message?: string,
) {
  return prisma.jobRun.update({
    where: { id },
    data: {
      stats,
      ...(message != null ? { message } : {}),
    },
  });
}

export async function requestJobCancel(jobId: string) {
  const job = await prisma.jobRun.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new Error("Job not found");
  }
  if (job.status !== JobStatus.PENDING && job.status !== JobStatus.RUNNING) {
    throw new Error("Job is not active");
  }

  await prisma.jobRun.update({
    where: { id: jobId },
    data: { message: CANCEL_MESSAGE },
  });

  const redis = getRedis();
  if (redis) {
    await redis.set(cancelRedisKey(jobId), "1", { ex: CANCEL_REDIS_TTL_SECONDS });
  }
}

export async function isJobCancelled(jobId: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    const flag = await redis.get(cancelRedisKey(jobId));
    if (flag) return true;
  }

  const job = await prisma.jobRun.findUnique({
    where: { id: jobId },
    select: { message: true },
  });
  return job?.message === CANCEL_MESSAGE;
}

export async function completeJobCancelled(
  id: string,
  stats?: Prisma.InputJsonValue,
) {
  return prisma.jobRun.update({
    where: { id },
    data: {
      status: JobStatus.COMPLETED,
      completedAt: new Date(),
      message: "Cancelled by user",
      stats: stats ?? undefined,
    },
  });
}

export async function completeJob(
  id: string,
  stats?: Prisma.InputJsonValue,
  message?: string,
) {
  return prisma.jobRun.update({
    where: { id },
    data: {
      status: JobStatus.COMPLETED,
      completedAt: new Date(),
      stats: stats ?? undefined,
      message,
    },
  });
}

export async function failJob(id: string, error: string) {
  return prisma.jobRun.update({
    where: { id },
    data: {
      status: JobStatus.FAILED,
      completedAt: new Date(),
      error,
    },
  });
}

export async function getJob(jobId: string) {
  return prisma.jobRun.findUnique({ where: { id: jobId } });
}

export async function getActiveJobs() {
  return prisma.jobRun.findMany({
    where: { status: { in: [JobStatus.PENDING, JobStatus.RUNNING] } },
    orderBy: { startedAt: "desc" },
  });
}

export async function getRecentJobs(limit = 20) {
  return prisma.jobRun.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}
