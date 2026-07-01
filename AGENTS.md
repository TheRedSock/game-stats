# AGENTS.md — Game Stats repository guide

This file describes how automated agents and contributors should work in this repository.

## Project summary

Game Stats is a Next.js analytics app with PostgreSQL (Prisma), IGDB ingestion, Metacritic scraping, a public read-only dashboard, and a password-protected admin area for operational jobs.

## Git usage

- **Do not commit** `.env`, credentials, or local database files
- **Do not force-push** to `main`
- **Do not amend** pushed commits unless explicitly requested
- Only create commits when the user asks
- Keep commits focused: one logical change per commit
- Write commit messages in imperative mood, explaining *why* (e.g. `Add Metacritic retry job for ambiguous targets`)

## Branching

- `main` is deployable
- Use short-lived feature branches for non-trivial work: `feat/…`, `fix/…`, `chore/…`
- Open PRs against `main`; CI must pass before merge

## Code conventions

- **TypeScript** everywhere in `src/`
- Path alias: `@/*` → `src/*`
- Match existing patterns: server components for data pages, client components only for interactivity
- Prefer Prisma for DB access via `src/lib/db.ts` singleton
- Keep ingestion logic in `src/lib/igdb/` and `src/lib/metacritic/`, not in route handlers
- Avoid new paid/third-party SaaS unless explicitly requested
- Inngest runs admin batch jobs; Upstash Redis stores cancel flags when configured
- Minimize scope — no drive-by refactors

## Testing expectations

- Run `pnpm test` before finishing ingestion/analytics changes
- Add tests for:
  - Data mapping and normalization
  - URL resolution and title verification
  - Metric aggregation and filtering
- Skip trivial UI snapshot tests unless requested
- CI runs lint, test, and build on PRs

## CI expectations

Workflow: `.github/workflows/ci.yml`

- PostgreSQL service container
- `prisma migrate deploy`
- `pnpm lint`, `pnpm test`, `pnpm build`

Fix CI failures in the same PR when possible.

## Deployment considerations

- Target: **Vercel** + **PostgreSQL** (Neon, Vercel Postgres, etc.)
- `DATABASE_URL` required in all environments (Neon pooler in prod; local dev may use `USE_LOCAL_DB` + `DATABASE_LOCAL`)
- `DIRECT_DATABASE_URL` or `DATABASE_URL_DIRECT` required for Neon (Prisma migrations, db sync)
- `prisma generate` runs on `postinstall`
- Run `prisma migrate deploy` for production schema updates
- Admin jobs enqueue Inngest events — do not run long sync loops in route handlers
- Respect `JOB_MAX_BATCHES` and `JOB_MAX_TOTAL_ITEMS` when adding new orchestrated jobs
- Tune `IGDB_SYNC_BATCH_SIZE` and `METACRITIC_SCRAPE_BATCH_SIZE` for serverless timeouts

## Data ingestion / sync behavior

- **IGDB is canonical** for game metadata
- Store only analytics-useful fields — no story summaries or long text
- Ingestion must be **idempotent** (upserts, safe re-runs)
- IGDB client throttles to ~4 req/s; batch via admin/CLI
- Each synced game gets a `METACRITIC` scrape target (pending)
- IGDB user ratings map to `MetricSource` key `igdb_user`

## Metacritic scraping

- Scraper lives in `src/lib/metacritic/`
- Always verify page title against game name before accepting scores
- Track status in `ExternalScrapeTarget`: PENDING, SUCCESS, FAILED, AMBIGUOUS
- Support `manualUrl` override from admin
- Do not assume 100% match rate

## Admin job safety

- All `/api/admin/*` routes (except auth) require admin session
- Never expose secrets in admin UI or API responses
- Jobs log to `JobRun` table
- Failed jobs should record `error` and not leave partial inconsistent state when avoidable
- Prefer batch limits over unbounded loops in serverless

## Adding new metric sources

1. Add row to `MetricSource` (seed/migration or upsert in sync code)
2. Implement ingestion in appropriate lib module
3. Extend filter options in `src/lib/metrics/aggregation.ts` and explore UI if needed
4. Add tests for normalization/aggregation

## Useful commands

```bash
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm db:migrate
pnpm db:studio
pnpm ingest:igdb
pnpm ingest:metacritic
pnpm db:up
pnpm db:down
pnpm db:sync:from-prod
pnpm db:sync:to-prod
pnpm inngest:dev
```

## When uncertain

- Prefer simplest working solution
- Prefer explicit schemas and documented env vars
- Prefer resumable/idempotent pipelines over clever abstractions
- Read IGDB docs at https://api-docs.igdb.com/ before changing IGDB queries
