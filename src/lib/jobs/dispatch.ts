import { JobType } from "@prisma/client";
import { inngest } from "@/inngest/client";
import type { AdminJobEventName } from "@/inngest/events";
import { createQueuedJob } from "@/lib/jobs/control";

export async function dispatchAdminJob(
  type: JobType,
  eventName: AdminJobEventName,
  eventData: Record<string, unknown> = {},
) {
  const job = await createQueuedJob(type);

  await inngest.send({
    name: eventName,
    data: { jobRunId: job.id, ...eventData },
    id: `job-${job.id}`,
  });

  return job;
}
