import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { completeJob, failJob, startJob } from "@/lib/jobs/runner";
import { runMetacriticScrapeBatch } from "@/lib/metacritic/scraper";

export const maxDuration = 300;

export async function POST() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = await startJob("METACRITIC_SCRAPE");
  try {
    const stats = await runMetacriticScrapeBatch({ retryFailed: true });
    await completeJob(job.id, stats, `Retried ${stats.processed}, success ${stats.success}`);
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Retry failed";
    await failJob(job.id, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
