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
| `DATABASE_URL` | Yes | Production Neon pooler URL (used by local dev when `USE_LOCAL_DB=false`) |
| `DATABASE_URL_DIRECT` or `DIRECT_DATABASE_URL` | Yes (Neon) | Non-pooler URL for Prisma migrations and `pg_dump` |
| `DATABASE_LOCAL` | Yes (local Docker) | Local Postgres URL (`docker compose` default) |
| `USE_LOCAL_DB` | No | `true` = dev/CLI use `DATABASE_LOCAL`; `false` = use Neon (default) |
| `TWITCH_APP_CLIENT_ID` | Yes | Twitch app client ID (IGDB auth) |
| `TWITCH_APP_CLIENT_SECRET` | Yes | Twitch app client secret |
| `ADMIN_PASSWORD` | Yes (prod) | Password for `/admin` |
| `SESSION_SECRET` | Yes (prod) | JWT signing secret for admin sessions |
| `INNGEST_SIGNING_KEY` | No | Inngest webhook signing (Vercel integration) |
| `INNGEST_EVENT_KEY` | No | Send events to Inngest Cloud |
| `UPSTASH_REDIS_REST_URL` | No | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash Redis REST token |
| `IGDB_SYNC_BATCH_SIZE` | No | Games per IGDB sync batch (default 100) |
| `METACRITIC_SCRAPE_BATCH_SIZE` | No | Targets per scrape batch (default 20) |

## Local development

### Option A — local Docker Postgres

```bash
pnpm install
# Set USE_LOCAL_DB=true in .env (pnpm dev auto-starts Docker Postgres)
pnpm db:migrate
pnpm dev
```

Set `USE_LOCAL_DB=true` in `.env`. `pnpm dev` runs Next.js and, when `INNGEST_DEV=1`, the Inngest dev server concurrently.

### Option B — production Neon from your machine

Point `DATABASE_URL` and `DATABASE_URL_DIRECT` at Neon in `.env`, set `USE_LOCAL_DB=false`, then:

```bash
pnpm install
pnpm db:migrate:deploy   # apply pending migrations to Neon
pnpm dev
```

For local Inngest (recommended with async admin jobs):

```env
INNGEST_DEV=1
INNGEST_ENV=development
INNGEST_SERVE_ORIGIN=http://127.0.0.1:3000
```

Open [http://localhost:3000](http://localhost:3000). Inngest dev UI: [http://localhost:8288](http://localhost:8288).

### Sync data between prod and local

Requires PostgreSQL client tools (`pg_dump`, `pg_restore`) on PATH.

```bash
pnpm db:sync:from-prod              # Neon → local Docker
pnpm db:sync:to-prod -- --confirm   # local Docker → Neon (destructive)
```

Useful after running seed/scrape jobs in production so local matches prod without re-ingesting.

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

## Background jobs (Inngest) and Redis

Admin ingestion jobs (IGDB sync/seed, Metacritic scrape/retry/resync, repair) run **asynchronously** via Inngest:

- Queue from `/admin` — returns immediately with a job id
- Progress tracked in `JobRun` (polled by the admin UI every 2s while jobs are active)
- Cancel via the admin job monitor (Redis flag when configured, else DB)
- Safeguards: `JOB_MAX_BATCHES`, `JOB_MAX_TOTAL_ITEMS`, one active job per type, Inngest step memoization for resume

Implementation:

- Client: `src/inngest/client.ts`
- Functions: `src/inngest/functions/`
- Serve route: `/api/inngest`
- Redis: `src/lib/redis.ts` (`getRedis()`) for cancel flags

Set `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY`, and Upstash vars in Vercel. Locally use `INNGEST_DEV=1` (see `.env.example`).

## Admin operations

The admin area (`/admin`) supports:

- IGDB seed and sync batches (background)
- Metacritic scrape, retry, and resync (background, continuous until queue empty or caps hit)
- Manual Metacritic URL overrides (synchronous)
- Game relation repair (background)

Jobs no longer block the browser — navigate freely while Inngest runs batches on Vercel functions.

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
3. Add a PostgreSQL database (Vercel Postgres, Neon, etc.) and set `DATABASE_URL` plus `DIRECT_DATABASE_URL` / `DATABASE_URL_DIRECT`
4. Set Twitch, admin, and session env vars in Vercel
5. Optionally set Inngest and Upstash Redis vars (see `.env.example`)
6. Deploy — `postinstall` runs `prisma generate`; run migrations via `pnpm exec prisma migrate deploy` in a build step or manually

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
