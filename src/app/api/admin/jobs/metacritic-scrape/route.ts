import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { dispatchAdminJob } from "@/lib/jobs/dispatch";
import { JobAlreadyActiveError } from "@/lib/jobs/control";

export async function POST() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const job = await dispatchAdminJob("METACRITIC_SCRAPE", "admin/job.metacritic-scrape", {
      continuous: true,
    });
    return NextResponse.json({ ok: true, jobId: job.id, status: "queued" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to queue job";
    const status = error instanceof JobAlreadyActiveError ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
