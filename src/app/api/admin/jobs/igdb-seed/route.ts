import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { dispatchAdminJob } from "@/lib/jobs/dispatch";
import { JobAlreadyActiveError } from "@/lib/jobs/control";
import { getIgdbSeedTotal } from "@/lib/jobs/limits";

const bodySchema = z.object({
  totalGames: z.number().int().min(1).max(5000).optional(),
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

  try {
    const job = await dispatchAdminJob("IGDB_SEED", "admin/job.igdb-seed", {
      totalGames: parsed.data.totalGames ?? getIgdbSeedTotal(),
    });
    return NextResponse.json({ ok: true, jobId: job.id, status: "queued" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to queue job";
    const status = error instanceof JobAlreadyActiveError ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
