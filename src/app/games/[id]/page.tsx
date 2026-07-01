import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getGameDetail } from "@/lib/games/queries";
import { formatDateTime, formatNumber, formatScore } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const game = await getGameDetail(id);
  if (!game) return { title: "Game not found - Game Stats" };
  return {
    title: `${game.name} - Game Stats`,
    description: `Ratings and metadata for ${game.name}.`,
  };
}

function names<T>(rows: T[], getName: (row: T) => string): string[] {
  return rows.map(getName).filter(Boolean);
}

function MetadataList({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.16em] text-muted">{label}</dt>
      <dd className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => (
          <Badge key={value}>{value}</Badge>
        ))}
      </dd>
    </div>
  );
}

export default async function GameDetailPage({ params }: PageProps) {
  const { id } = await params;
  const game = await getGameDetail(id);
  if (!game) notFound();

  const developers = game.companies
    .filter((row) => row.role === "DEVELOPER")
    .map((row) => row.company.name);
  const publishers = game.companies
    .filter((row) => row.role === "PUBLISHER")
    .map((row) => row.company.name);

  return (
    <div className="space-y-8">
      <Link href="/games" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        Back to games
      </Link>

      <section className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="overflow-hidden p-0">
          <div className="aspect-[3/4] bg-card/80">
            {game.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={game.coverUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted">
                No cover art
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-semibold tracking-tight">{game.name}</h1>
              {game.releaseYear ? <Badge>{game.releaseYear}</Badge> : null}
            </div>
            {game.headlineScore ? (
              <p className="text-lg text-muted">
                {game.headlineScore.label}:{" "}
                <span className="font-semibold text-foreground">
                  {formatScore(game.headlineScore.value, 0)}
                </span>
              </p>
            ) : (
              <p className="text-muted">No ratings imported yet.</p>
            )}
          </div>

          <Card>
            <dl className="grid gap-5 md:grid-cols-2">
              <MetadataList label="Genres" values={names(game.genres, (row) => row.genre.name)} />
              <MetadataList
                label="Platforms"
                values={names(game.platforms, (row) => row.platform.name)}
              />
              <MetadataList label="Developers" values={developers} />
              <MetadataList label="Publishers" values={publishers} />
              <MetadataList
                label="Franchises"
                values={names(game.franchises, (row) => row.franchise.name)}
              />
              <MetadataList
                label="Perspectives"
                values={names(game.perspectives, (row) => row.playerPerspective.name)}
              />
            </dl>
          </Card>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Metric sources</CardTitle>
            <CardDescription>Scores normalized to a 0-100 scale for comparison.</CardDescription>
          </CardHeader>
          {game.normalizedMetrics.length > 0 ? (
            <div className="space-y-3">
              {game.normalizedMetrics.map((metric) => (
                <div key={metric.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span>{metric.source}</span>
                    <span className="font-mono">{formatScore(metric.normalizedValue, 1)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.max(0, Math.min(metric.normalizedValue, 100))}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted">
                    Raw {formatScore(metric.value)} ·{" "}
                    {metric.sampleSize ? `${formatNumber(metric.sampleSize)} samples` : "No sample count"} ·{" "}
                    fetched {formatDateTime(metric.fetchedAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="Run IGDB or Metacritic sync to import metrics for this game." />
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scrape targets</CardTitle>
            <CardDescription>External enrichment status for this game.</CardDescription>
          </CardHeader>
          {game.scrapeTargets.length > 0 ? (
            <div className="space-y-3">
              {game.scrapeTargets.map((target) => (
                <div key={target.id} className="rounded-xl border border-card-border p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span>{target.provider}</span>
                    <Badge variant="status">{target.status}</Badge>
                  </div>
                  {target.verifiedTitle ? (
                    <p className="mt-2 text-muted">Verified title: {target.verifiedTitle}</p>
                  ) : null}
                  {target.resolvedUrl ? (
                    <p className="mt-1 break-all text-xs text-muted">{target.resolvedUrl}</p>
                  ) : null}
                  {target.lastError ? (
                    <p className="mt-2 text-xs text-red-200">{target.lastError}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No scrape targets have been created yet." />
          )}
        </Card>
      </section>
    </div>
  );
}
