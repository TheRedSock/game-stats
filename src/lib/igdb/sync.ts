import { CompanyRole, MetricKind, Prisma, ScrapeProvider, ScrapeStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  IGDB_GAME_FIELDS,
  IgdbClient,
  IgdbGame,
  IgdbNamedEntity,
} from "@/lib/igdb/client";
import {
  isEligibleForMetacriticScrape,
  UNRELEASED_METACRITIC,
} from "@/lib/igdb/release-eligibility";
import { batchLog, batchLogError, batchLogProgress } from "@/lib/jobs/batch-log";
import { getReleaseYear, igdbTimestampToDate } from "@/lib/utils";

const SYNC_CURSOR_KEY = "igdb_games_updated_at";
const DEFAULT_BATCH = 100;
/** Per-game upsert runs many relation writes; Neon + serverless needs more than Prisma's 5s default. */
const GAME_UPSERT_TX = { maxWait: 10_000, timeout: 30_000 } as const;

type SyncOptions = {
  batchSize?: number;
  maxGames?: number;
  startOffset?: number;
  fullResync?: boolean;
  updateSyncState?: boolean;
  cursor?: IgdbSyncCursor | null;
};

export type SyncStats = {
  processed: number;
  upserted: number;
  skipped: number;
  errors: number;
  nextOffset: number;
  nextCursor: IgdbSyncCursor | null;
};

export type IgdbSyncCursor = {
  updatedAt: number;
  igdbId: number;
};

async function upsertEntity(
  tx: Prisma.TransactionClient,
  model: "genre" | "theme" | "platform" | "gameMode" | "playerPerspective" | "franchise" | "company",
  item: IgdbNamedEntity,
): Promise<{ id: string }> {
  const data = {
    where: { igdbId: item.id },
    create: { igdbId: item.id, name: item.name, slug: item.slug ?? null },
    update: { name: item.name, slug: item.slug ?? null },
  };

  switch (model) {
    case "genre":
      return tx.genre.upsert(data);
    case "theme":
      return tx.theme.upsert(data);
    case "platform":
      return tx.platform.upsert(data);
    case "gameMode":
      return tx.gameMode.upsert(data);
    case "playerPerspective":
      return tx.playerPerspective.upsert(data);
    case "franchise":
      return tx.franchise.upsert(data);
    case "company":
      return tx.company.upsert(data);
  }
}

async function upsertNamedEntities(
  tx: Prisma.TransactionClient,
  model: "genre" | "theme" | "platform" | "gameMode" | "playerPerspective" | "franchise" | "company",
  items: IgdbNamedEntity[],
): Promise<Map<number, string>> {
  const idMap = new Map<number, string>();
  for (const item of items) {
    const record = await upsertEntity(tx, model, item);
    idMap.set(item.id, record.id);
  }
  return idMap;
}

function uniqueNumbers(ids: number[]): number[] {
  return [...new Set(ids)];
}

export function rolesForInvolvedCompany(
  involved: NonNullable<IgdbGame["involved_companies"]>[number],
): CompanyRole[] {
  const roles: CompanyRole[] = [];
  if (involved.developer) roles.push(CompanyRole.DEVELOPER);
  if (involved.publisher) roles.push(CompanyRole.PUBLISHER);
  if (involved.porting) roles.push(CompanyRole.PORTING);
  if (involved.supporting) roles.push(CompanyRole.SUPPORTING);
  if (roles.length === 0) roles.push(CompanyRole.SUPPORTING);
  return roles;
}

function compareSyncCursor(a: IgdbSyncCursor | null, b: IgdbSyncCursor): number {
  if (!a) return -1;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
  return a.igdbId - b.igdbId;
}

function encodeSyncCursor(cursor: IgdbSyncCursor): string {
  return JSON.stringify(cursor);
}

function decodeSyncCursor(value: string | null | undefined): IgdbSyncCursor | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<IgdbSyncCursor>;
    const updatedAt = parsed.updatedAt;
    const igdbId = parsed.igdbId;
    if (
      Number.isInteger(updatedAt) &&
      Number.isInteger(igdbId) &&
      updatedAt != null &&
      igdbId != null &&
      updatedAt > 0 &&
      igdbId > 0
    ) {
      return { updatedAt, igdbId };
    }
  } catch {
    // Fall through to legacy cursor formats below.
  }

  const asNumber = Number(value);
  if (Number.isInteger(asNumber) && asNumber > 0) {
    return { updatedAt: asNumber, igdbId: 0 };
  }

  const asDate = Date.parse(value);
  if (Number.isFinite(asDate)) {
    return { updatedAt: Math.floor(asDate / 1000), igdbId: 0 };
  }

  return null;
}

export async function getIgdbSyncCursor(): Promise<IgdbSyncCursor | null> {
  const row = await prisma.syncState.findUnique({
    where: { key: SYNC_CURSOR_KEY },
    select: { value: true },
  });
  return decodeSyncCursor(row?.value);
}

export async function setIgdbSyncCursor(cursor: IgdbSyncCursor): Promise<void> {
  await prisma.syncState.upsert({
    where: { key: SYNC_CURSOR_KEY },
    create: { key: SYNC_CURSOR_KEY, value: encodeSyncCursor(cursor) },
    update: { value: encodeSyncCursor(cursor) },
  });
}

function buildIncrementalWhere(cursor: IgdbSyncCursor | null): string {
  const base = "rating != null & rating_count > 0";
  if (!cursor) return base;
  return `${base} & (updated_at > ${cursor.updatedAt} | (updated_at = ${cursor.updatedAt} & id > ${cursor.igdbId}))`;
}

async function ensureMetricSources(): Promise<void> {
  await prisma.metricSource.upsert({
    where: { key: "igdb_user" },
    create: {
      key: "igdb_user",
      name: "IGDB User Rating",
      metricKind: MetricKind.USER_SCORE,
      maxValue: 100,
    },
    update: {},
  });
  await prisma.metricSource.upsert({
    where: { key: "metacritic_critic" },
    create: {
      key: "metacritic_critic",
      name: "Metacritic Critic",
      metricKind: MetricKind.CRITIC_SCORE,
      maxValue: 100,
    },
    update: {},
  });
  await prisma.metricSource.upsert({
    where: { key: "metacritic_user" },
    create: {
      key: "metacritic_user",
      name: "Metacritic User",
      metricKind: MetricKind.USER_SCORE,
      maxValue: 10,
      description: "Metacritic user score is on a 0-10 scale",
    },
    update: {},
  });
}

async function fetchEntityBatch(client: IgdbClient, endpoint: string, ids: number[]): Promise<IgdbNamedEntity[]> {
  if (ids.length === 0) return [];
  const unique = [...new Set(ids)];
  const chunks: IgdbNamedEntity[] = [];
  for (let i = 0; i < unique.length; i += 500) {
    const slice = unique.slice(i, i + 500);
    const rows = await client.query<IgdbNamedEntity>(
      endpoint,
      `fields id,name,slug; where id = (${slice.join(",")}); limit 500;`,
    );
    chunks.push(...rows);
  }
  return chunks;
}

/** Shared cache — genres/platforms/companies repeat across many games. */
const entityCache = new Map<string, Map<number, IgdbNamedEntity>>();

function getEntityCache(endpoint: string): Map<number, IgdbNamedEntity> {
  let cache = entityCache.get(endpoint);
  if (!cache) {
    cache = new Map();
    entityCache.set(endpoint, cache);
  }
  return cache;
}

async function fetchEntitiesCached(
  client: IgdbClient,
  endpoint: string,
  ids: number[],
): Promise<IgdbNamedEntity[]> {
  if (ids.length === 0) return [];

  const cache = getEntityCache(endpoint);
  const missing = [...new Set(ids)].filter((id) => !cache.has(id));

  if (missing.length > 0) {
    const fetched = await fetchEntityBatch(client, endpoint, missing);
    for (const entity of fetched) {
      cache.set(entity.id, entity);
    }
  }

  return ids
    .map((id) => cache.get(id))
    .filter((entity): entity is IgdbNamedEntity => entity != null);
}

/** Clear entity cache — for tests only. */
export function clearEntityCacheForTests(): void {
  entityCache.clear();
}

async function upsertGameRelations(
  tx: Prisma.TransactionClient,
  gameId: string,
  game: IgdbGame,
  maps: {
    genres: Map<number, string>;
    themes: Map<number, string>;
    platforms: Map<number, string>;
    gameModes: Map<number, string>;
    perspectives: Map<number, string>;
    franchises: Map<number, string>;
    companies: Map<number, string>;
  },
): Promise<void> {
  await tx.gameGenre.deleteMany({ where: { gameId } });
  await tx.gameTheme.deleteMany({ where: { gameId } });
  await tx.gamePlatform.deleteMany({ where: { gameId } });
  await tx.gameGameMode.deleteMany({ where: { gameId } });
  await tx.gamePlayerPerspective.deleteMany({ where: { gameId } });
  await tx.gameFranchise.deleteMany({ where: { gameId } });
  await tx.gameCompany.deleteMany({ where: { gameId } });

  const genreRows = uniqueNumbers(game.genres ?? [])
    .map((igdbId) => maps.genres.get(igdbId))
    .filter((id): id is string => id != null)
    .map((genreId) => ({ gameId, genreId }));

  const themeRows = uniqueNumbers(game.themes ?? [])
    .map((igdbId) => maps.themes.get(igdbId))
    .filter((id): id is string => id != null)
    .map((themeId) => ({ gameId, themeId }));

  const platformRows = uniqueNumbers(game.platforms ?? [])
    .map((igdbId) => maps.platforms.get(igdbId))
    .filter((id): id is string => id != null)
    .map((platformId) => ({ gameId, platformId }));

  const gameModeRows = uniqueNumbers(game.game_modes ?? [])
    .map((igdbId) => maps.gameModes.get(igdbId))
    .filter((id): id is string => id != null)
    .map((gameModeId) => ({ gameId, gameModeId }));

  const perspectiveRows = uniqueNumbers(game.player_perspectives ?? [])
    .map((igdbId) => maps.perspectives.get(igdbId))
    .filter((id): id is string => id != null)
    .map((playerPerspectiveId) => ({ gameId, playerPerspectiveId }));

  const franchiseRows = uniqueNumbers(game.franchises ?? [])
    .map((igdbId) => maps.franchises.get(igdbId))
    .filter((id): id is string => id != null)
    .map((franchiseId) => ({ gameId, franchiseId }));

  const companySeen = new Set<string>();
  const companyRows: Array<{ gameId: string; companyId: string; role: CompanyRole }> = [];
  for (const involved of game.involved_companies ?? []) {
    const companyId = maps.companies.get(involved.company);
    if (!companyId) continue;
    for (const role of rolesForInvolvedCompany(involved)) {
      const key = `${companyId}:${role}`;
      if (companySeen.has(key)) continue;
      companySeen.add(key);
      companyRows.push({ gameId, companyId, role });
    }
  }

  if (genreRows.length) await tx.gameGenre.createMany({ data: genreRows, skipDuplicates: true });
  if (themeRows.length) await tx.gameTheme.createMany({ data: themeRows, skipDuplicates: true });
  if (platformRows.length) await tx.gamePlatform.createMany({ data: platformRows, skipDuplicates: true });
  if (gameModeRows.length) await tx.gameGameMode.createMany({ data: gameModeRows, skipDuplicates: true });
  if (perspectiveRows.length) {
    await tx.gamePlayerPerspective.createMany({ data: perspectiveRows, skipDuplicates: true });
  }
  if (franchiseRows.length) await tx.gameFranchise.createMany({ data: franchiseRows, skipDuplicates: true });
  if (companyRows.length) await tx.gameCompany.createMany({ data: companyRows, skipDuplicates: true });
}

async function upsertMetacriticScrapeTarget(
  tx: Prisma.TransactionClient,
  gameId: string,
  eligible: boolean,
): Promise<void> {
  const existing = await tx.externalScrapeTarget.findUnique({
    where: { gameId_provider: { gameId, provider: ScrapeProvider.METACRITIC } },
  });

  if (!existing) {
    await tx.externalScrapeTarget.create({
      data: {
        gameId,
        provider: ScrapeProvider.METACRITIC,
        status: eligible ? ScrapeStatus.PENDING : ScrapeStatus.SKIPPED,
        lastError: eligible ? null : UNRELEASED_METACRITIC,
      },
    });
    return;
  }

  if (!eligible) {
    if (existing.status === ScrapeStatus.PENDING || existing.status === ScrapeStatus.FAILED) {
      await tx.externalScrapeTarget.update({
        where: { id: existing.id },
        data: { status: ScrapeStatus.SKIPPED, lastError: UNRELEASED_METACRITIC },
      });
    }
    return;
  }

  if (existing.status === ScrapeStatus.SKIPPED && existing.lastError === UNRELEASED_METACRITIC) {
    await tx.externalScrapeTarget.update({
      where: { id: existing.id },
      data: { status: ScrapeStatus.PENDING, lastError: null },
    });
  }
}

async function upsertSingleGame(client: IgdbClient, game: IgdbGame): Promise<boolean> {
  const genreIds = game.genres ?? [];
  const themeIds = game.themes ?? [];
  const platformIds = game.platforms ?? [];
  const modeIds = game.game_modes ?? [];
  const perspectiveIds = game.player_perspectives ?? [];
  const franchiseIds = game.franchises ?? [];
  const companyIds = (game.involved_companies ?? []).map((c) => c.company);

  const genres = await fetchEntitiesCached(client, "genres", genreIds);
  const themes = await fetchEntitiesCached(client, "themes", themeIds);
  const platforms = await fetchEntitiesCached(client, "platforms", platformIds);
  const gameModes = await fetchEntitiesCached(client, "game_modes", modeIds);
  const perspectives = await fetchEntitiesCached(client, "player_perspectives", perspectiveIds);
  const franchises = await fetchEntitiesCached(client, "franchises", franchiseIds);
  const companies = await fetchEntitiesCached(client, "companies", companyIds);

  const releaseDate = igdbTimestampToDate(game.first_release_date);
  const releaseYear = getReleaseYear(releaseDate);
  const metacriticEligible = isEligibleForMetacriticScrape({
    igdbStatus: game.status,
    releaseDate,
  });

  await prisma.$transaction(async (tx) => {
    const maps = {
      genres: await upsertNamedEntities(tx, "genre", genres),
      themes: await upsertNamedEntities(tx, "theme", themes),
      platforms: await upsertNamedEntities(tx, "platform", platforms),
      gameModes: await upsertNamedEntities(tx, "gameMode", gameModes),
      perspectives: await upsertNamedEntities(tx, "playerPerspective", perspectives),
      franchises: await upsertNamedEntities(tx, "franchise", franchises),
      companies: await upsertNamedEntities(tx, "company", companies),
    };

    const saved = await tx.game.upsert({
      where: { igdbId: game.id },
      create: {
        igdbId: game.id,
        name: game.name,
        slug: game.slug ?? null,
        coverImageId: game.cover?.image_id ?? null,
        releaseDate,
        releaseYear,
        igdbStatus: game.status ?? null,
        igdbUpdatedAt: game.updated_at ?? null,
        igdbRating: game.rating ?? null,
        igdbRatingCount: game.rating_count ?? null,
        syncedAt: new Date(),
      },
      update: {
        name: game.name,
        slug: game.slug ?? null,
        coverImageId: game.cover?.image_id ?? null,
        releaseDate,
        releaseYear,
        igdbStatus: game.status ?? null,
        igdbUpdatedAt: game.updated_at ?? null,
        igdbRating: game.rating ?? null,
        igdbRatingCount: game.rating_count ?? null,
        syncedAt: new Date(),
      },
    });

    await upsertGameRelations(tx, saved.id, game, maps);

    if (game.rating != null) {
      const source = await tx.metricSource.findUnique({ where: { key: "igdb_user" } });
      if (source) {
        await tx.gameMetric.upsert({
          where: { gameId_sourceId: { gameId: saved.id, sourceId: source.id } },
          create: {
            gameId: saved.id,
            sourceId: source.id,
            value: game.rating,
            sampleSize: game.rating_count ?? null,
            fetchedAt: new Date(),
          },
          update: {
            value: game.rating,
            sampleSize: game.rating_count ?? null,
            fetchedAt: new Date(),
          },
        });
      }
    }

    await upsertMetacriticScrapeTarget(tx, saved.id, metacriticEligible);
  }, GAME_UPSERT_TX);

  return true;
}

export async function syncIgdbGames(options: SyncOptions = {}): Promise<SyncStats> {
  const client = new IgdbClient();
  await ensureMetricSources();

  const batchSize = options.batchSize ?? Number(process.env.IGDB_SYNC_BATCH_SIZE ?? DEFAULT_BATCH);
  const stats: SyncStats = {
    processed: 0,
    upserted: 0,
    skipped: 0,
    errors: 0,
    nextOffset: 0,
    nextCursor: null,
  };

  let offset = options.startOffset ?? 0;
  const maxGames = options.maxGames ?? Infinity;
  const incremental = options.fullResync !== true;
  const initialCursor =
    incremental && options.cursor !== undefined ? options.cursor : incremental ? await getIgdbSyncCursor() : null;
  let latestCursor = initialCursor;

  batchLog("IGDB sync started", {
    batchSize,
    startOffset: offset,
    cursor: initialCursor,
    fullResync: options.fullResync ?? false,
    maxGames: Number.isFinite(maxGames) ? maxGames : "all",
  });

  while (stats.processed < maxGames) {
    const limit = Math.min(batchSize, maxGames - stats.processed);
    const where = incremental ? buildIncrementalWhere(initialCursor) : "rating != null & rating_count > 0";
    const sort = incremental ? "updated_at asc, id asc" : "id asc";

    const games = await client.query<IgdbGame>(
      "games",
      `fields ${IGDB_GAME_FIELDS}; where ${where}; sort ${sort}; limit ${limit}; offset ${offset};`,
    );

    if (games.length === 0) break;

    batchLog("IGDB fetched page", { count: games.length, offset, limit });

    for (const game of games) {
      stats.processed += 1;
      try {
        const ok = await upsertSingleGame(client, game);
        if (ok) {
          stats.upserted += 1;
          if (incremental && game.updated_at != null) {
            const nextCursor = { updatedAt: game.updated_at, igdbId: game.id };
            if (compareSyncCursor(latestCursor, nextCursor) < 0) {
              latestCursor = nextCursor;
            }
          }
          batchLog("IGDB upserted", {
            igdbId: game.id,
            name: game.name,
            updatedAt: game.updated_at,
            releaseYear: getReleaseYear(igdbTimestampToDate(game.first_release_date)),
            genres: game.genres?.length ?? 0,
            companies: game.involved_companies?.length ?? 0,
          });
        } else {
          stats.skipped += 1;
          batchLog("IGDB skipped", { igdbId: game.id, name: game.name });
        }
      } catch (error) {
        stats.errors += 1;
        const message = error instanceof Error ? error.message : String(error);
        batchLogError("IGDB upsert failed", {
          igdbId: game.id,
          name: game.name,
          error: message,
        });
        console.error(`Failed to upsert game ${game.id}:`, error);
      }

      if (Number.isFinite(maxGames)) {
        batchLogProgress("IGDB sync", stats.processed, maxGames, {
          upserted: stats.upserted,
          errors: stats.errors,
        });
      }
    }

    offset += games.length;
    if (games.length < limit) break;
  }

  stats.nextOffset = offset;
  stats.nextCursor = latestCursor;

  batchLog("IGDB sync finished", { ...stats });

  if (options.updateSyncState !== false && incremental && latestCursor) {
    await setIgdbSyncCursor(latestCursor);
  }

  return stats;
}

export async function seedInitialGames(count = 200): Promise<SyncStats> {
  return syncIgdbGames({ maxGames: count, batchSize: Math.min(count, 100) });
}

export async function repairGameRelations(limit = 50): Promise<{ repaired: number }> {
  const client = new IgdbClient();
  batchLog("IGDB repair started", { limit });

  const games = await prisma.game.findMany({
    take: limit,
    orderBy: { syncedAt: "asc" },
    select: { igdbId: true },
  });

  let repaired = 0;
  for (const { igdbId } of games) {
    const rows = await client.query<IgdbGame>(
      "games",
      `fields ${IGDB_GAME_FIELDS}; where id = ${igdbId};`,
    );
    if (rows[0]) {
      await upsertSingleGame(client, rows[0]);
      repaired += 1;
      batchLog("IGDB repaired", { igdbId, name: rows[0].name });
    }
  }
  batchLog("IGDB repair finished", { repaired });
  return { repaired };
}
