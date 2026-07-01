"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClientOnly } from "@/components/ui/client-only";
import { JobMonitor, type JobRow } from "@/components/admin/job-monitor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/field";

type ScrapeTarget = {
  id: string;
  gameId: string;
  gameName: string;
  status: string;
  manualUrl: string | null;
  resolvedUrl: string | null;
  verifiedTitle: string | null;
  lastError: string | null;
  attemptCount: number;
};

type AdminDashboardProps = {
  jobs: JobRow[];
  scrapeTargets: ScrapeTarget[];
  gameCount: number;
};

const SEED_JOB_LABEL = "Seed IGDB (200 games)";

export function AdminDashboard({ jobs, scrapeTargets, gameCount }: AdminDashboardProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [manualUrls, setManualUrls] = useState<Record<string, string>>({});

  async function queueJob(endpoint: string, label: string, body?: object) {
    setLoading(label);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to queue job");
      setMessage(
        `${label} queued (job ${String(data.jobId).slice(0, 8)}…). Running in background via Inngest.`,
      );
    } catch (error) {
      setMessage(
        `${label} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setLoading(null);
    }
  }

  async function approveMatch(gameId: string) {
    setLoading(`match-${gameId}`);
    try {
      const response = await fetch("/api/admin/metacritic/approve-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed");
      setMessage(`Approved Metacritic match (${data.status ?? "done"})`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to approve match");
    } finally {
      setLoading(null);
    }
  }

  async function approveNoScores(gameId: string) {
    setLoading(`approve-${gameId}`);
    try {
      const response = await fetch("/api/admin/metacritic/approve-no-scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed");
      setMessage("Marked as no Metacritic scores available");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to approve");
    } finally {
      setLoading(null);
    }
  }

  async function saveManualUrl(gameId: string) {
    const url = manualUrls[gameId];
    if (!url) return;
    setLoading(`manual-${gameId}`);
    try {
      const response = await fetch("/api/admin/metacritic/manual-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed");
      setMessage(`Manual URL saved for game ${gameId}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save URL");
    } finally {
      setLoading(null);
    }
  }

  async function logout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  const jobButtons = [
    {
      label: SEED_JOB_LABEL,
      endpoint: "/api/admin/jobs/igdb-seed",
      body: {},
    },
    { label: "IGDB sync batch", endpoint: "/api/admin/jobs/igdb-sync" },
    { label: "Metacritic scrape batch", endpoint: "/api/admin/jobs/metacritic-scrape" },
    { label: "Retry failed Metacritic", endpoint: "/api/admin/jobs/metacritic-retry" },
    {
      label: "Resync Metacritic scores",
      endpoint: "/api/admin/jobs/metacritic-resync",
    },
    { label: "Repair game relations", endpoint: "/api/admin/jobs/repair" },
  ] as const;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Admin</h1>
          <p className="text-sm text-muted">
            {gameCount} games indexed · jobs run asynchronously via Inngest
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={logout}
        >
          Sign out
        </Button>
      </div>

      {message ? (
        <div
          className="rounded-xl border border-accent/40 bg-accent-soft/30 px-4 py-3 text-sm"
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Run jobs</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap gap-3">
          {jobButtons.map((job) => (
            <Button
              key={job.endpoint}
              disabled={loading === job.label}
              onClick={() =>
                queueJob(
                  job.endpoint,
                  job.label,
                  "body" in job ? job.body : undefined,
                )
              }
            >
              {loading === job.label ? "Queueing…" : job.label}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Jobs queue immediately and run in the background. Limits: JOB_MAX_BATCHES and
          JOB_MAX_TOTAL_ITEMS env vars cap runaway loops.
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent jobs</CardTitle>
        </CardHeader>
        <JobMonitor initialJobs={jobs} onQueueMessage={setMessage} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Metacritic scrape targets</CardTitle>
          <CardDescription>
            Failed means no Metacritic page was found. Ambiguous means a page was found but the
            title did not match; approve the match or set a manual URL.
          </CardDescription>
        </CardHeader>
        <ClientOnly
          fallback={
            <div className="space-y-4">
              {scrapeTargets.slice(0, 3).map((target) => (
                <div
                  key={target.id}
                  className="h-24 animate-pulse rounded-xl border border-card-border bg-card/40"
                />
              ))}
            </div>
          }
        >
          <div className="space-y-4">
            {scrapeTargets.length === 0 ? (
              <p className="text-sm text-muted">No pending or failed targets.</p>
            ) : (
              scrapeTargets.map((target) => {
                const isAmbiguous = target.status === "AMBIGUOUS";
                const isFailed = target.status === "FAILED";

                return (
                  <div
                    key={target.id}
                    className="rounded-xl border border-card-border p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{target.gameName}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-muted">
                          <Badge variant="status">{target.status}</Badge>
                          <span>{target.attemptCount} attempts</span>
                        </p>
                        {target.lastError ? (
                          <p
                            className={`mt-1 text-xs ${isAmbiguous ? "text-amber-300" : isFailed ? "text-red-300" : "text-muted"}`}
                          >
                            {target.lastError}
                          </p>
                        ) : null}
                        {target.verifiedTitle ? (
                          <p className="mt-1 text-xs text-muted">
                            Metacritic title: {target.verifiedTitle}
                          </p>
                        ) : null}
                        {target.resolvedUrl ? (
                          <p className="mt-1 text-xs text-muted">
                            Resolved: {target.resolvedUrl}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {isAmbiguous && target.resolvedUrl ? (
                        <Button
                          size="sm"
                          onClick={() => approveMatch(target.gameId)}
                          disabled={loading != null}
                        >
                          Approve match
                        </Button>
                      ) : null}
                      <Input
                        type="text"
                        placeholder="slug or https://www.metacritic.com/game/..."
                        value={manualUrls[target.gameId] ?? target.manualUrl ?? ""}
                        onChange={(e) =>
                          setManualUrls((prev) => ({
                            ...prev,
                            [target.gameId]: e.target.value,
                          }))
                        }
                        autoComplete="off"
                        data-1p-ignore
                        data-lpignore="true"
                        className="min-w-[280px] flex-1 text-xs"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => saveManualUrl(target.gameId)}
                        disabled={loading != null}
                      >
                        Save URL
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => approveNoScores(target.gameId)}
                        disabled={loading != null}
                      >
                        Approve no scores
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ClientOnly>
      </Card>
    </div>
  );
}
