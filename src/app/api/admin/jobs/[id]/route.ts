import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getJob, requestJobCancel } from "@/lib/jobs/control";
import { formatDateTime } from "@/lib/utils";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
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
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    await requestJobCancel(id);
    return NextResponse.json({ ok: true, jobId: id, status: "cancel_requested" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cancel job";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
