import {
  completeJob,
  completeJobCancelled,
  failJob,
  isJobCancelled,
  markJobRunning,
  updateJobProgress,
} from "@/lib/jobs/control";
import { getJobMaxBatches, getJobMaxTotalItems } from "@/lib/jobs/limits";
import type { Prisma } from "@prisma/client";

/** Inngest step tools — typed loosely to match SDK Jsonify return types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InngestStep = any;

type BatchOutcome<TStats, TState> = {
  batch: TStats;
  state: TState;
};

type BatchLoopOptions<TStats extends Record<string, unknown>, TState> = {
  jobRunId: string;
  step: InngestStep;
  label: string;
  initialStats: TStats;
  initialState: TState;
  runBatch: (batchIndex: number, state: TState) => Promise<BatchOutcome<TStats, TState>>;
  mergeStats: (total: TStats, batch: TStats) => TStats;
  itemsProcessed: (stats: TStats) => number;
  isBatchComplete: (batch: TStats, batchIndex: number, state: TState) => boolean;
  sleepMsBetweenBatches?: number;
  onComplete?: (stats: TStats) => string;
};

export async function runSteppedBatchJob<TStats extends Record<string, unknown>, TState>(
  options: BatchLoopOptions<TStats, TState>,
): Promise<TStats> {
  const {
    jobRunId,
    step,
    label,
    initialStats,
    initialState,
    runBatch,
    mergeStats,
    itemsProcessed,
    isBatchComplete,
    sleepMsBetweenBatches = 0,
    onComplete,
  } = options;

  const maxBatches = getJobMaxBatches();
  const maxTotalItems = getJobMaxTotalItems();

  await step.run(`${label}-mark-running`, () => markJobRunning(jobRunId));

  let totalStats = initialStats;
  let state = initialState;

  try {
    for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
      const cancelled = await step.run(`${label}-cancel-check-${batchIndex}`, () =>
        isJobCancelled(jobRunId),
      );
      if (cancelled) {
        await step.run(`${label}-cancelled-${batchIndex}`, () =>
          completeJobCancelled(jobRunId, totalStats as Prisma.InputJsonValue),
        );
        return totalStats;
      }

      const outcome = await step.run(`${label}-batch-${batchIndex}`, () =>
        runBatch(batchIndex, state),
      );
      totalStats = mergeStats(totalStats, outcome.batch);
      state = outcome.state;

      const processed = itemsProcessed(totalStats);
      await step.run(`${label}-progress-${batchIndex}`, () =>
        updateJobProgress(
          jobRunId,
          totalStats as Prisma.InputJsonValue,
          `${processed} processed (batch ${batchIndex + 1})`,
        ),
      );

      if (isBatchComplete(outcome.batch, batchIndex, state)) break;
      if (processed >= maxTotalItems) break;

      if (sleepMsBetweenBatches > 0 && batchIndex + 1 < maxBatches) {
        await step.sleep(`${label}-sleep-${batchIndex}`, `${sleepMsBetweenBatches}ms`);
      }
    }

    const message =
      onComplete?.(totalStats) ??
      `${label} finished (${itemsProcessed(totalStats)} processed)`;

    await step.run(`${label}-complete`, () =>
      completeJob(jobRunId, totalStats as Prisma.InputJsonValue, message),
    );

    return totalStats;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await step.run(`${label}-fail`, () => failJob(jobRunId, message));
    throw error;
  }
}

export function mergeIgdbSyncStats(
  total: {
    processed: number;
    upserted: number;
    skipped: number;
    errors: number;
    nextOffset: number;
    nextCursor?: unknown;
  },
  batch: {
    processed: number;
    upserted: number;
    skipped: number;
    errors: number;
    nextOffset: number;
    nextCursor?: unknown;
  },
) {
  return {
    processed: total.processed + batch.processed,
    upserted: total.upserted + batch.upserted,
    skipped: total.skipped + batch.skipped,
    errors: total.errors + batch.errors,
    nextOffset: batch.nextOffset,
    nextCursor: batch.nextCursor ?? total.nextCursor ?? null,
  };
}

export function mergeScrapeStats(
  total: {
    processed: number;
    success: number;
    failed: number;
    ambiguous: number;
    skipped: number;
    due?: number;
  },
  batch: {
    processed: number;
    success: number;
    failed: number;
    ambiguous: number;
    skipped: number;
    due?: number;
  },
) {
  return {
    processed: total.processed + batch.processed,
    success: total.success + batch.success,
    failed: total.failed + batch.failed,
    ambiguous: total.ambiguous + batch.ambiguous,
    skipped: total.skipped + batch.skipped,
    due: (total.due ?? 0) + (batch.due ?? 0),
  };
}

export function emptyScrapeStats() {
  return { processed: 0, success: 0, failed: 0, ambiguous: 0, skipped: 0, due: 0 };
}
