import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getActiveJobs, getRecentJobs } from "@/lib/jobs/control";
import { formatDateTime } from "@/lib/utils";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [active, recent] = await Promise.all([getActiveJobs(), getRecentJobs(20)]);

  const mapJob = (job: (typeof recent)[number]) => ({
    id: job.id,
    type: job.type,
    status: job.status,
    startedAt: job.startedAt.toISOString(),
    startedAtDisplay: formatDateTime(job.startedAt),
    completedAt: job.completedAt?.toISOString() ?? null,
    message: job.message,
    error: job.error,
    stats: job.stats,
  });

  return NextResponse.json({
    active: active.map(mapJob),
    recent: recent.map(mapJob),
  });
}
