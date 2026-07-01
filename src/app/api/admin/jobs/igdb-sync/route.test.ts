import { JobType } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { JobAlreadyActiveError } from "@/lib/jobs/control";
import { dispatchAdminJob } from "@/lib/jobs/dispatch";
import { requireAdmin } from "@/lib/auth/admin";

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/jobs/dispatch", () => ({
  dispatchAdminJob: vi.fn(),
}));

const mockedRequireAdmin = vi.mocked(requireAdmin);
const mockedDispatchAdminJob = vi.mocked(dispatchAdminJob);

describe("POST /api/admin/jobs/igdb-sync", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the admin session is missing", async () => {
    mockedRequireAdmin.mockRejectedValue(new Error("Unauthorized"));

    const response = await POST();

    expect(response.status).toBe(401);
  });

  it("returns 409 for active job conflicts", async () => {
    mockedRequireAdmin.mockResolvedValue();
    mockedDispatchAdminJob.mockRejectedValue(
      new JobAlreadyActiveError(JobType.IGDB_SYNC, "active-job-id"),
    );

    const response = await POST();

    expect(response.status).toBe(409);
  });

  it("queues a continuous incremental sync", async () => {
    mockedRequireAdmin.mockResolvedValue();
    mockedDispatchAdminJob.mockResolvedValue({ id: "job-1" } as never);

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, jobId: "job-1", status: "queued" });
    expect(mockedDispatchAdminJob).toHaveBeenCalledWith("IGDB_SYNC", "admin/job.igdb-sync", {
      continuous: true,
    });
  });
});
