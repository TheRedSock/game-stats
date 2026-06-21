# Game Stats

A read-mostly analytics site for exploring video game metadata and multi-source ratings. Built with Next.js, PostgreSQL, and Prisma. Data is sourced from IGDB (canonical metadata) with optional Metacritic enrichment via scraping.

## Architecture

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | Next.js App Router + React | First-class Vercel support, server components for fast dashboards |
| Styling | Tailwind CSS v4 | Lightweight, consistent design system |
| Charts | Recharts | Simple React charts with good defaults |
| Database | PostgreSQL + Prisma | Relational model fits normalized metadata + flexible metrics |
| IGDB | Twitch OAuth client credentials | Official auth flow per [IGDB API docs](https://api-docs.igdb.com/) |
| Metacritic | Fetch + Cheerio-style HTML parsing | No official API; resilient scrape workflow with manual overrides |
| Admin auth | Password + signed HTTP-only session cookie | No user accounts; single operational secret |

### Data model highlights

- **Normalized metadata**: games, companies, genres, platforms, franchises, etc. with many-to-many joins
- **Flexible metrics**: `MetricSource` + `GameMetric` supports multiple critic/user sources per title
- **Scrape tracking**: `ExternalScrapeTarget` records Metacritic resolution status, attempts, and manual URLs

## Requirements

- Node.js 20+
- pnpm 9+
- PostgreSQL 14+ (local Docker, Neon, Supabase, or Vercel Postgres)

## Environment variables

Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `TWITCH_APP_CLIENT_ID` | Yes | Twitch app client ID (IGDB auth) |
| `TWITCH_APP_CLIENT_SECRET` | Yes | Twitch app client secret |
| `ADMIN_PASSWORD` | Yes (prod) | Password for `/admin` |
| `SESSION_SECRET` | Yes (prod) | JWT signing secret for admin sessions |
| `IGDB_SYNC_BATCH_SIZE` | No | Games per IGDB sync batch (default 100) |
| `METACRITIC_SCRAPE_BATCH_SIZE` | No | Targets per scrape batch (default 20) |

## Local development

```bash
pnpm install

# Start PostgreSQL (example with Docker)
docker run --name game-stats-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=game_stats -p 5432:5432 -d postgres:16

# Apply schema
pnpm db:migrate

# Run dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Ingestion

### Via admin UI

1. Go to `/admin/login` and sign in with `ADMIN_PASSWORD`
2. Run **Seed IGDB (200 games)** for an initial dataset
3. Run **Metacritic scrape batch** to enrich ratings
4. Use manual URL overrides for failed/ambiguous targets

### Via CLI scripts

```bash
pnpm ingest:igdb              # seed 200 rated games
pnpm ingest:igdb sync         # incremental sync batch
pnpm ingest:metacritic        # scrape pending targets
pnpm ingest:metacritic --retry  # retry failed/ambiguous
```

All ingestion is **idempotent** — safe to re-run.

## Admin operations

The admin area (`/admin`) supports:

- IGDB seed and sync batches
- Metacritic scrape and retry
- Manual Metacritic URL overrides
- Game relation repair (re-fetch from IGDB)

Jobs run synchronously in the request. On Vercel, keep batch sizes modest using env vars to stay within function timeouts.

## Public app

- `/` — dashboard with overview stats, distributions, trends, correlations
- `/explore` — interactive filters for metric source, grouping, year range, genre/platform

## Testing

```bash
pnpm test
pnpm lint
pnpm build
```

Tests focus on URL resolution, title matching, score parsing, and metric aggregation logic.

## Deployment (GitHub + Vercel)

1. Push to GitHub
2. Import project in Vercel
3. Add a PostgreSQL database (Vercel Postgres, Neon, etc.) and set `DATABASE_URL`
4. Set Twitch, admin, and session env vars in Vercel
5. Deploy — `postinstall` runs `prisma generate`; run migrations via `pnpm exec prisma migrate deploy` in a build step or manually

Recommended Vercel env setup mirrors `.env.example`. Never commit secrets.

## IGDB rate limits

The client throttles to ~4 requests/second per [IGDB docs](https://api-docs.igdb.com/). Large syncs should be batched via admin/CLI.

## Metacritic scraping notes

- No official API — HTML parsing may break if Metacritic changes layout
- Automatic URL resolution uses IGDB slugs, slugified titles, and search fallback
- Titles are verified before accepting scores
- Failed/ambiguous targets can be overridden manually in admin

## License

Private / internal use. IGDB data subject to [Twitch Developer Service Agreement](https://www.twitch.tv/p/en/legal/developer-agreement/).
