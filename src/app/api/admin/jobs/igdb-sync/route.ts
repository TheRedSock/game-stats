import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { completeJob, failJob, startJob } from "@/lib/jobs/runner";
import { syncIgdbGames } from "@/lib/igdb/sync";

export const maxDuration = 300;

export async function POST() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = await startJob("IGDB_SYNC");
  try {
    const stats = await syncIgdbGames();
    await completeJob(job.id, stats, `Synced ${stats.upserted} games`);
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    await failJob(job.id, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
