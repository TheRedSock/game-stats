import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { getGamesPage } from "@/lib/games/queries";
import { formatScore } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Games - Game Stats",
  description: "Browse indexed games with ratings, metadata, and platform filters.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function getString(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

export default async function GamesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const data = await getGamesPage({
    q: getString(params.q),
    genreId: getString(params.genreId),
    platformId: getString(params.platformId),
    year: getString(params.year) ? Number(getString(params.year)) : undefined,
    page: getString(params.page) ? Number(getString(params.page)) : 1,
  });

  const currentQuery = new URLSearchParams();
  for (const key of ["q", "genreId", "platformId", "year"] as const) {
    const value = getString(params[key]);
    if (value) currentQuery.set(key, value);
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <p className="text-sm uppercase tracking-[0.2em] text-accent">Library</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Games</h1>
        <p className="max-w-2xl text-muted">
          Browse indexed titles, compare headline scores, and open detail pages for source-level
          ratings and metadata.
        </p>
      </section>

      <Card>
        <form className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Field label="Search" className="lg:col-span-2">
            <Input name="q" defaultValue={getString(params.q) ?? ""} placeholder="Game name" />
          </Field>
          <Field label="Genre">
            <Select name="genreId" defaultValue={getString(params.genreId) ?? ""}>
              <option value="">All genres</option>
              {data.filters.genres.map((genre) => (
                <option key={genre.id} value={genre.id}>
                  {genre.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Platform">
            <Select name="platformId" defaultValue={getString(params.platformId) ?? ""}>
              <option value="">All platforms</option>
              {data.filters.platforms.map((platform) => (
                <option key={platform.id} value={platform.id}>
                  {platform.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Year">
            <Select name="year" defaultValue={getString(params.year) ?? ""}>
              <option value="">Any year</option>
              {data.filters.years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end gap-2 lg:col-span-5">
            <Button type="submit">Apply filters</Button>
            <Link href="/games" className={buttonVariants({ variant: "secondary" })}>
              Reset
            </Link>
          </div>
        </form>
      </Card>

      {data.games.length === 0 ? (
        <EmptyState
          title="No games found"
          message="Try loosening filters or run the IGDB sync job from admin."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.games.map((game) => (
              <Link
                key={game.id}
                href={`/games/${game.id}`}
                className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Card className="h-full overflow-hidden p-0 transition group-hover:border-accent">
                  <div className="aspect-[3/4] bg-card/80">
                    {game.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={game.coverUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted">
                        No cover art
                      </div>
                    )}
                  </div>
                  <div className="space-y-3 p-4">
                    <div>
                      <h2 className="line-clamp-2 font-medium tracking-tight group-hover:text-accent">
                        {game.name}
                      </h2>
                      <p className="text-sm text-muted">{game.releaseYear ?? "Unknown year"}</p>
                    </div>
                    {game.headlineScore ? (
                      <Badge>
                        {game.headlineScore.label}: {formatScore(game.headlineScore.value, 0)}
                      </Badge>
                    ) : (
                      <Badge>No score</Badge>
                    )}
                    <p className="line-clamp-2 text-xs text-muted">
                      {[...game.genres, ...game.platforms].join(" / ") || "No metadata yet"}
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          <Card className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              Page {data.page} of {data.totalPages} · {data.total} games
            </p>
            <div className="flex gap-2">
              {data.page > 1 ? (
                <Link
                  href={`/games?${new URLSearchParams({
                    ...Object.fromEntries(currentQuery),
                    page: String(data.page - 1),
                  })}`}
                  className={buttonVariants({ variant: "secondary" })}
                >
                  Previous
                </Link>
              ) : null}
              {data.page < data.totalPages ? (
                <Link
                  href={`/games?${new URLSearchParams({
                    ...Object.fromEntries(currentQuery),
                    page: String(data.page + 1),
                  })}`}
                  className={buttonVariants({ variant: "secondary" })}
                >
                  Next
                </Link>
              ) : null}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
