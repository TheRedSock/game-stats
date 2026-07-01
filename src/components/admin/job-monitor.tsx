"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type JobRow = {
  id: string;
  type: string;
  status: string;
  startedAtDisplay: string;
  message: string | null;
  error: string | null;
  stats: unknown;
};

type JobMonitorProps = {
  initialJobs: JobRow[];
  onQueueMessage?: (message: string) => void;
};

const POLL_MS = 2000;

function isActiveStatus(status: string): boolean {
  return status === "PENDING" || status === "RUNNING";
}

function formatJobDetails(job: JobRow): string {
  if (job.error) return job.error;
  if (job.message && job.message !== "CANCEL_REQUESTED") return job.message;
  if (job.stats && typeof job.stats === "object") return JSON.stringify(job.stats);
  return "—";
}

export function JobMonitor({ initialJobs, onQueueMessage }: JobMonitorProps) {
  const [jobs, setJobs] = useState<JobRow[]>(initialJobs);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/jobs/status", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { recent: JobRow[] };
      setJobs(data.recent);
    } catch {
      // Keep last known state on transient errors
    }
  }, []);

  useEffect(() => {
    void refreshJobs();
  }, [refreshJobs]);

  useEffect(() => {
    const hasActive = jobs.some((job) => isActiveStatus(job.status));

    if (hasActive && pollRef.current == null) {
      pollRef.current = setInterval(() => {
        void refreshJobs();
      }, POLL_MS);
    }

    if (!hasActive && pollRef.current != null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current != null) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [jobs, refreshJobs]);

  async function cancelJob(jobId: string) {
    setCancellingId(jobId);
    try {
      const response = await fetch(`/api/admin/jobs/${jobId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Cancel failed");
      onQueueMessage?.("Cancellation requested — job will stop after the current batch.");
      await refreshJobs();
    } catch (error) {
      onQueueMessage?.(
        error instanceof Error ? error.message : "Failed to cancel job",
      );
    } finally {
      setCancellingId(null);
    }
  }

  const activeJobs = jobs.filter((job) => isActiveStatus(job.status));

  return (
    <div className="space-y-4">
      {activeJobs.length > 0 ? (
        <div className="rounded-xl border border-accent/30 bg-accent-soft/20 px-4 py-3 text-sm" aria-live="polite">
          <p className="font-medium text-accent">
            {activeJobs.length} job{activeJobs.length === 1 ? "" : "s"} running
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {activeJobs.map((job) => (
              <li key={job.id} className="flex flex-wrap items-center gap-2">
                <span>
                  {job.type} · {job.message ?? job.status}
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={cancellingId === job.id}
                  onClick={() => cancelJob(job.id)}
                >
                  {cancellingId === job.id ? "Cancelling…" : "Cancel"}
                </Button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Progress updates automatically — you can navigate away without stopping jobs.
          </p>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Recent admin background jobs</caption>
          <thead className="text-muted">
            <tr>
              <th scope="col" className="pb-2 pr-4">Type</th>
              <th scope="col" className="pb-2 pr-4">Status</th>
              <th scope="col" className="pb-2 pr-4">Started</th>
              <th scope="col" className="pb-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-t border-card-border/60">
                <td className="py-2 pr-4">{job.type}</td>
                <td className="py-2 pr-4">
                  <Badge variant="status">{job.status}</Badge>
                </td>
                <td className="py-2 pr-4">{job.startedAtDisplay}</td>
                <td className="py-2 text-muted">{formatJobDetails(job)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
