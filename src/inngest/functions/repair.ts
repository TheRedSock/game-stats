import { inngest } from "@/inngest/client";
import { repairGameRelations } from "@/lib/igdb/sync";
import { getRepairBatchSize } from "@/lib/jobs/limits";
import { runSteppedBatchJob } from "@/inngest/lib/orchestrate";

export const repairJob = inngest.createFunction(
  {
    id: "admin-repair",
    concurrency: { limit: 1, key: "admin-repair" },
    retries: 2,
  },
  { event: "admin/job.repair" },
  async ({ event, step }) => {
    const batchSize = event.data.batchSize ?? getRepairBatchSize();
    const jobRunId = event.data.jobRunId;

    return runSteppedBatchJob({
      jobRunId,
      step,
      label: "repair",
      initialStats: { repaired: 0 },
      initialState: null,
      runBatch: async () => ({
        batch: await repairGameRelations(batchSize),
        state: null,
      }),
      mergeStats: (total, batch) => ({
        repaired: total.repaired + batch.repaired,
      }),
      itemsProcessed: (s) => s.repaired,
      isBatchComplete: (batch) => batch.repaired === 0,
      onComplete: (s) => `Repaired ${s.repaired} games`,
    });
  },
);
