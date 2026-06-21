import { redirect } from "next/navigation";
import { formatDateTime } from "@/lib/utils";
import { isAdminAuthenticated } from "@/lib/auth/admin";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { getRecentJobs } from "@/lib/jobs/runner";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const authed = await isAdminAuthenticated();
  if (!authed) {
    redirect("/admin/login");
  }

  const [jobs, scrapeTargets, gameCount] = await Promise.all([
    getRecentJobs(15),
    prisma.externalScrapeTarget.findMany({
      where: { status: { in: ["FAILED", "AMBIGUOUS", "PENDING"] } },
      include: { game: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
    prisma.game.count(),
  ]);

  return (
    <AdminDashboard
      jobs={jobs.map((j) => ({
        id: j.id,
        type: j.type,
        status: j.status,
        startedAtDisplay: formatDateTime(j.startedAt),
        message: j.message,
        error: j.error,
        stats: j.stats,
      }))}
      scrapeTargets={scrapeTargets.map((t) => ({
        id: t.id,
        gameId: t.gameId,
        gameName: t.game.name,
        status: t.status,
        manualUrl: t.manualUrl,
        resolvedUrl: t.resolvedUrl,
        verifiedTitle: t.verifiedTitle,
        lastError: t.lastError,
        attemptCount: t.attemptCount,
      }))}
      gameCount={gameCount}
    />
  );
}
