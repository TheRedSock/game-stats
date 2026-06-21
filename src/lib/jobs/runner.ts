import { JobStatus, JobType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function startJob(type: JobType) {
  return prisma.jobRun.create({
    data: { type, status: JobStatus.RUNNING },
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

export async function getRecentJobs(limit = 20) {
  return prisma.jobRun.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}
