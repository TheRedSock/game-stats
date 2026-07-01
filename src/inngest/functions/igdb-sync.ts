import { inngest } from "@/inngest/client";
import { syncIgdbGames, type IgdbSyncCursor, type SyncStats } from "@/lib/igdb/sync";
import { mergeIgdbSyncStats, runSteppedBatchJob } from "@/inngest/lib/orchestrate";

type SyncState = { cursor?: IgdbSyncCursor | null };

export const igdbSyncJob = inngest.createFunction(
  {
    id: "admin-igdb-sync",
    concurrency: { limit: 1, key: "admin-igdb-sync" },
    retries: 2,
  },
  { event: "admin/job.igdb-sync" },
  async ({ event, step }) => {
    const continuous = event.data.continuous ?? false;
    const jobRunId = event.data.jobRunId;

    return runSteppedBatchJob({
      jobRunId,
      step,
      label: "igdb-sync",
      initialStats: {
        processed: 0,
        upserted: 0,
        skipped: 0,
        errors: 0,
        nextOffset: 0,
        nextCursor: null,
      } as SyncStats,
      initialState: { cursor: undefined } as SyncState,
      runBatch: async (_batchIndex, state) => {
        const batch = await syncIgdbGames({
          cursor: state.cursor,
          updateSyncState: true,
        });
        return {
          batch,
          state: { cursor: batch.nextCursor },
        };
      },
      mergeStats: mergeIgdbSyncStats,
      itemsProcessed: (s) => s.processed,
      isBatchComplete: (batch) => !continuous || batch.processed === 0,
      onComplete: (s) => `Synced ${s.upserted} games (${s.errors} errors)`,
    });
  },
);
