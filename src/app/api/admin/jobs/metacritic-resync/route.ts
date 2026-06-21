import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { completeJob, failJob, startJob } from "@/lib/jobs/runner";
import { runMetacriticResyncBatch } from "@/lib/metacritic/scraper";

export const maxDuration = 300;

export async function POST() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = await startJob("METACRITIC_RESYNC");
  try {
    const stats = await runMetacriticResyncBatch();
    await completeJob(
      job.id,
      stats,
      `Resynced ${stats.success}/${stats.processed} due titles (${stats.due ?? 0} selected)`,
    );
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Resync failed";
    await failJob(job.id, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
