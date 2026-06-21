"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClientOnly } from "@/components/ui/client-only";

type Job = {
  id: string;
  type: string;
  status: string;
  startedAtDisplay: string;
  message: string | null;
  error: string | null;
  stats: unknown;
};

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
  jobs: Job[];
  scrapeTargets: ScrapeTarget[];
  gameCount: number;
};

const SEED_JOB_LABEL = "Seed IGDB (200 games)";
const SEED_TOTAL = 200;
const SEED_CHUNK_SIZE = 10;

export function AdminDashboard({ jobs, scrapeTargets, gameCount }: AdminDashboardProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [seedProgress, setSeedProgress] = useState(0);
  const [manualUrls, setManualUrls] = useState<Record<string, string>>({});

  async function runSeedJob() {
    setLoading(SEED_JOB_LABEL);
    setSeedProgress(0);
    setMessage("");

    let offset = 0;
    let jobId: string | undefined;
    let totalProcessed = 0;
    let totalUpserted = 0;
    let totalErrors = 0;

    try {
      while (totalProcessed < SEED_TOTAL) {
        const limit = Math.min(SEED_CHUNK_SIZE, SEED_TOTAL - totalProcessed);
        const finalize = totalProcessed + limit >= SEED_TOTAL;

        const response = await fetch("/api/admin/jobs/igdb-seed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset, limit, jobId, finalize }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Seed failed");

        jobId = data.jobId;
        totalProcessed += data.stats.processed;
        totalUpserted += data.stats.upserted;
        totalErrors += data.stats.errors;
        setSeedProgress(Math.min(totalProcessed, SEED_TOTAL));

        if (data.done || data.stats.processed === 0) break;
        offset = data.nextOffset;
      }

      setMessage(
        `${SEED_JOB_LABEL}: ${totalUpserted} upserted, ${totalErrors} errors (${totalProcessed} processed)`,
      );
      router.refresh();
    } catch (error) {
      setMessage(
        `${SEED_JOB_LABEL} failed at ${totalProcessed}/${SEED_TOTAL}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    } finally {
      setLoading(null);
      setSeedProgress(0);
    }
  }

  async function runJob(endpoint: string, label: string) {
    setLoading(label);
    setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Job failed");
      setMessage(`${label}: ${JSON.stringify(data.stats ?? data.message ?? "done")}`);
      router.refresh();
    } catch (error) {
      setMessage(`${label} failed: ${error instanceof Error ? error.message : "Unknown error"}`);
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
    { label: SEED_JOB_LABEL, endpoint: "/api/admin/jobs/igdb-seed", isSeed: true },
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
            {gameCount} games indexed · operational jobs only
          </p>
        </div>
        <button
          onClick={logout}
          className="rounded-xl border border-card-border px-4 py-2 text-sm transition hover:border-accent"
        >
          Sign out
        </button>
      </div>

      {message ? (
        <div className="rounded-xl border border-accent/40 bg-accent-soft/30 px-4 py-3 text-sm">
          {message}
        </div>
      ) : null}

      <section className="rounded-2xl border border-card-border bg-card/50 p-5">
        <h2 className="mb-4 text-lg font-medium">Run jobs</h2>
        <div className="flex flex-wrap gap-3">
          {jobButtons.map((job) => (
            <button
              key={job.endpoint}
              disabled={loading != null}
              onClick={() =>
                "isSeed" in job && job.isSeed
                  ? runSeedJob()
                  : runJob(job.endpoint, job.label)
              }
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-50"
            >
              {loading === job.label
                ? job.label === SEED_JOB_LABEL
                  ? `Running… ${seedProgress} / ${SEED_TOTAL}`
                  : "Running…"
                : job.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Jobs run synchronously in this request. On Vercel, keep batch sizes modest via env vars.
        </p>
      </section>

      <section className="rounded-2xl border border-card-border bg-card/50 p-5">
        <h2 className="mb-4 text-lg font-medium">Recent jobs</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Started</th>
                <th className="pb-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-card-border/60">
                  <td className="py-2 pr-4">{job.type}</td>
                  <td className="py-2 pr-4">{job.status}</td>
                  <td className="py-2 pr-4">{job.startedAtDisplay}</td>
                  <td className="py-2 text-muted">
                    {job.error ?? job.message ?? JSON.stringify(job.stats ?? "")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-card-border bg-card/50 p-5">
        <h2 className="mb-4 text-lg font-medium">Metacritic scrape targets</h2>
        <p className="mb-4 text-sm text-muted">
          Failed means no Metacritic page was found. Ambiguous means a page was found but the title
          did not match — use Approve match to import scores from that page, or set a manual URL.
        </p>
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
                      <p className="text-muted">
                        {target.status} · {target.attemptCount} attempts
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
                        <p className="mt-1 text-xs text-muted">Resolved: {target.resolvedUrl}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {isAmbiguous && target.resolvedUrl ? (
                      <button
                        type="button"
                        onClick={() => approveMatch(target.gameId)}
                        disabled={loading != null}
                        className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition hover:bg-accent/90"
                      >
                        Approve match
                      </button>
                    ) : null}
                    <input
                      type="text"
                      placeholder="slug or https://www.metacritic.com/game/..."
                      value={manualUrls[target.gameId] ?? target.manualUrl ?? ""}
                      onChange={(e) =>
                        setManualUrls((prev) => ({ ...prev, [target.gameId]: e.target.value }))
                      }
                      autoComplete="off"
                      data-1p-ignore
                      data-lpignore="true"
                      className="min-w-[280px] flex-1 rounded-lg border border-card-border bg-background px-3 py-2 text-xs outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={() => saveManualUrl(target.gameId)}
                      disabled={loading != null}
                      className="rounded-lg border border-card-border px-3 py-2 text-xs transition hover:border-accent"
                    >
                      Save URL
                    </button>
                    <button
                      type="button"
                      onClick={() => approveNoScores(target.gameId)}
                      disabled={loading != null}
                      className="rounded-lg border border-card-border px-3 py-2 text-xs text-muted transition hover:border-accent hover:text-foreground"
                    >
                      Approve no scores
                    </button>
                  </div>
                </div>
              );
              })
            )}
          </div>
        </ClientOnly>
      </section>
    </div>
  );
}
