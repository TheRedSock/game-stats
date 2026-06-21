type BatchLogLevel = "off" | "verbose";

export function getBatchLogLevel(): BatchLogLevel {
  const env = process.env.BATCH_JOB_LOG?.toLowerCase();
  if (env === "off" || env === "0" || env === "false") return "off";
  if (env === "verbose" || env === "1" || env === "true" || env === "debug") return "verbose";
  if (process.env.NODE_ENV === "development") return "verbose";
  return "off";
}

export function isBatchLogVerbose(): boolean {
  return getBatchLogLevel() === "verbose";
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export function batchLog(message: string, data?: Record<string, unknown>): void {
  if (!isBatchLogVerbose()) return;
  const prefix = `[batch ${timestamp()}]`;
  if (data && Object.keys(data).length > 0) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
}

export function batchLogProgress(
  job: string,
  current: number,
  total: number | string,
  data?: Record<string, unknown>,
): void {
  batchLog(`${job} progress ${current}/${total}`, data);
}

export function batchLogError(message: string, data?: Record<string, unknown>): void {
  if (!isBatchLogVerbose()) return;
  const prefix = `[batch ${timestamp()}]`;
  if (data) {
    console.error(prefix, message, data);
  } else {
    console.error(prefix, message);
  }
}
