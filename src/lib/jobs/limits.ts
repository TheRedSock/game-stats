const DEFAULT_MAX_BATCHES = 100;
const DEFAULT_MAX_TOTAL_ITEMS = 5000;
const DEFAULT_IGDB_SEED_TOTAL = 200;
const DEFAULT_IGDB_SEED_CHUNK = 10;
const DEFAULT_REPAIR_BATCH = 50;

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Max Inngest step loops per job invocation — prevents infinite runs. */
export function getJobMaxBatches(): number {
  return readInt("JOB_MAX_BATCHES", DEFAULT_MAX_BATCHES);
}

/** Max items processed across all batches in one job. */
export function getJobMaxTotalItems(): number {
  return readInt("JOB_MAX_TOTAL_ITEMS", DEFAULT_MAX_TOTAL_ITEMS);
}

export function getIgdbSeedTotal(): number {
  return readInt("IGDB_SEED_TOTAL", DEFAULT_IGDB_SEED_TOTAL);
}

export function getIgdbSeedChunkSize(): number {
  return readInt("IGDB_SEED_CHUNK_SIZE", DEFAULT_IGDB_SEED_CHUNK);
}

export function getRepairBatchSize(): number {
  return readInt("JOB_REPAIR_BATCH_SIZE", DEFAULT_REPAIR_BATCH);
}
