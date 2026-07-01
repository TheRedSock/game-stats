import { inngest } from "@/inngest/client";
import {
  getIgdbSeedChunkSize,
  getIgdbSeedTotal,
} from "@/lib/jobs/limits";
import {
  setIgdbSyncCursor,
  syncIgdbGames,
  type IgdbSyncCursor,
  type SyncStats,
} from "@/lib/igdb/sync";
import { mergeIgdbSyncStats, runSteppedBatchJob } from "@/inngest/lib/orchestrate";

type SeedState = {
  cursor: IgdbSyncCursor | null;
  gamesProcessed: number;
};

export const igdbSeedJob = inngest.createFunction(
  {
    id: "admin-igdb-seed",
    concurrency: { limit: 1, key: "admin-igdb-seed" },
    retries: 2,
  },
  { event: "admin/job.igdb-seed" },
  async ({ event, step }) => {
    const totalGames = event.data.totalGames ?? getIgdbSeedTotal();
    const chunkSize = event.data.chunkSize ?? getIgdbSeedChunkSize();
    const jobRunId = event.data.jobRunId;

    const stats = await runSteppedBatchJob({
      jobRunId,
      step,
      label: "igdb-seed",
      initialStats: {
        processed: 0,
        upserted: 0,
        skipped: 0,
        errors: 0,
        nextOffset: 0,
        nextCursor: null,
      } as SyncStats,
      initialState: { cursor: null, gamesProcessed: 0 } as SeedState,
      runBatch: async (_batchIndex, state) => {
        const remaining = totalGames - state.gamesProcessed;
        const limit = Math.min(chunkSize, remaining);
        const batch = await syncIgdbGames({
          maxGames: limit,
          cursor: state.cursor,
          batchSize: Math.min(limit, 50),
          updateSyncState: false,
        });
        return {
          batch,
          state: {
            cursor: batch.nextCursor,
            gamesProcessed: state.gamesProcessed + batch.processed,
          },
        };
      },
      mergeStats: mergeIgdbSyncStats,
      itemsProcessed: (s) => s.processed,
      isBatchComplete: (batch, _batchIndex, state) =>
        batch.processed === 0 ||
        state.gamesProcessed >= totalGames ||
        batch.processed < chunkSize,
      onComplete: (s) =>
        `Seeded ${s.upserted} games (${s.processed} processed, ${s.errors} errors)`,
    });

    if (stats.nextCursor) {
      await step.run("igdb-seed-sync-state", async () => {
        await setIgdbSyncCursor(stats.nextCursor as IgdbSyncCursor);
      });
    }

    return stats;
  },
);
