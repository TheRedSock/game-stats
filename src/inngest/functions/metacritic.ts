import { inngest } from "@/inngest/client";
import { runMetacriticResyncBatch, runMetacriticScrapeBatch } from "@/lib/metacritic/scraper";
import {
  emptyScrapeStats,
  mergeScrapeStats,
  runSteppedBatchJob,
} from "@/inngest/lib/orchestrate";

export const metacriticScrapeJob = inngest.createFunction(
  {
    id: "admin-metacritic-scrape",
    concurrency: { limit: 1, key: "admin-metacritic-scrape" },
    retries: 2,
  },
  { event: "admin/job.metacritic-scrape" },
  async ({ event, step }) => {
    const continuous = event.data.continuous ?? true;
    const jobRunId = event.data.jobRunId;

    return runSteppedBatchJob({
      jobRunId,
      step,
      label: "metacritic-scrape",
      initialStats: emptyScrapeStats(),
      initialState: null,
      runBatch: async () => ({
        batch: await runMetacriticScrapeBatch({ retryFailed: false }),
        state: null,
      }),
      mergeStats: mergeScrapeStats,
      itemsProcessed: (s) => s.processed,
      isBatchComplete: (batch) => !continuous || batch.processed === 0,
      sleepMsBetweenBatches: 2000,
      onComplete: (s) =>
        `Scraped ${s.success}/${s.processed} (${s.failed} failed, ${s.ambiguous} ambiguous)`,
    });
  },
);

export const metacriticRetryJob = inngest.createFunction(
  {
    id: "admin-metacritic-retry",
    concurrency: { limit: 1, key: "admin-metacritic-retry" },
    retries: 2,
  },
  { event: "admin/job.metacritic-retry" },
  async ({ event, step }) => {
    const continuous = event.data.continuous ?? true;
    const jobRunId = event.data.jobRunId;

    return runSteppedBatchJob({
      jobRunId,
      step,
      label: "metacritic-retry",
      initialStats: emptyScrapeStats(),
      initialState: null,
      runBatch: async () => ({
        batch: await runMetacriticScrapeBatch({ retryFailed: true }),
        state: null,
      }),
      mergeStats: mergeScrapeStats,
      itemsProcessed: (s) => s.processed,
      isBatchComplete: (batch) => !continuous || batch.processed === 0,
      sleepMsBetweenBatches: 2000,
      onComplete: (s) =>
        `Retried ${s.success}/${s.processed} (${s.failed} failed)`,
    });
  },
);

export const metacriticResyncJob = inngest.createFunction(
  {
    id: "admin-metacritic-resync",
    concurrency: { limit: 1, key: "admin-metacritic-resync" },
    retries: 2,
  },
  { event: "admin/job.metacritic-resync" },
  async ({ event, step }) => {
    const continuous = event.data.continuous ?? true;
    const jobRunId = event.data.jobRunId;

    return runSteppedBatchJob({
      jobRunId,
      step,
      label: "metacritic-resync",
      initialStats: emptyScrapeStats(),
      initialState: null,
      runBatch: async () => ({
        batch: await runMetacriticResyncBatch(),
        state: null,
      }),
      mergeStats: mergeScrapeStats,
      itemsProcessed: (s) => s.processed,
      isBatchComplete: (batch) => !continuous || batch.processed === 0,
      sleepMsBetweenBatches: 2000,
      onComplete: (s) =>
        `Resynced ${s.success}/${s.processed} due titles`,
    });
  },
);
