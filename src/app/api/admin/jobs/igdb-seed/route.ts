import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { completeJob, failJob, startJob } from "@/lib/jobs/runner";
import { syncIgdbGames } from "@/lib/igdb/sync";

export const maxDuration = 300;

const bodySchema = z.object({
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  jobId: z.string().optional(),
  finalize: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const offset = parsed.data.offset ?? 0;
  const limit = parsed.data.limit ?? 200;
  const isChunked = parsed.data.limit != null || parsed.data.offset != null;

  const job =
    parsed.data.jobId != null
      ? { id: parsed.data.jobId }
      : await startJob("IGDB_SYNC");

  try {
    const stats = await syncIgdbGames({
      maxGames: limit,
      startOffset: offset,
      batchSize: Math.min(limit, 50),
      updateSyncState: !isChunked || parsed.data.finalize === true,
    });

    const done = stats.processed === 0 || stats.processed < limit;

    if (!isChunked || parsed.data.finalize === true || done) {
      await completeJob(
        job.id,
        stats,
        `Seeded ${stats.upserted} games (${stats.processed} processed)`,
      );
    }

    return NextResponse.json({
      ok: true,
      stats,
      nextOffset: stats.nextOffset,
      jobId: job.id,
      done,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Seed failed";
    await failJob(job.id, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
