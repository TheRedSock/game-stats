-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CompanyRole" AS ENUM ('DEVELOPER', 'PUBLISHER', 'PORTING', 'SUPPORTING');
CREATE TYPE "ScrapeProvider" AS ENUM ('METACRITIC');
CREATE TYPE "ScrapeStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'AMBIGUOUS', 'SKIPPED');
CREATE TYPE "MetricKind" AS ENUM ('CRITIC_SCORE', 'USER_SCORE', 'RATING');
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "JobType" AS ENUM ('IGDB_SYNC', 'METACRITIC_SCRAPE', 'REPAIR', 'BACKFILL');

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "igdbId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "releaseDate" TIMESTAMP(3),
    "releaseYear" INTEGER,
    "igdbRating" DOUBLE PRECISION,
    "igdbRatingCount" INTEGER,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "igdbId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameCompany" (
    "gameId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "CompanyRole" NOT NULL,

    CONSTRAINT "GameCompany_pkey" PRIMARY KEY ("gameId","companyId","role")
);

CREATE TABLE "Genre" (
    "id" TEXT NOT NULL,
    "igdbId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,

    CONSTRAINT "Genre_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameGenre" (
    "gameId" TEXT NOT NULL,
    "genreId" TEXT NOT NULL,

    CONSTRAINT "GameGenre_pkey" PRIMARY KEY ("gameId","genreId")
);

CREATE TABLE "Theme" (
    "id" TEXT NOT NULL,
    "igdbId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,

    CONSTRAINT "Theme_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameTheme" (
    "gameId" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,

    CONSTRAINT "GameTheme_pkey" PRIMARY KEY ("gameId","themeId")
);

CREATE TABLE "Platform" (
    "id" TEXT NOT NULL,
    "igdbId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,

    CONSTRAINT "Platform_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GamePlatform" (
    "gameId" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,

    CONSTRAINT "GamePlatform_pkey" PRIMARY KEY ("gameId","platformId")
);

CREATE TABLE "GameMode" (
    "id" TEXT NOT NULL,
    "igdbId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,

    CONSTRAINT "GameMode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameGameMode" (
    "gameId" TEXT NOT NULL,
    "gameModeId" TEXT NOT NULL,

    CONSTRAINT "GameGameMode_pkey" PRIMARY KEY ("gameId","gameModeId")
);

CREATE TABLE "PlayerPerspective" (
    "id" TEXT NOT NULL,
    "igdbId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,

    CONSTRAINT "PlayerPerspective_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GamePlayerPerspective" (
    "gameId" TEXT NOT NULL,
    "playerPerspectiveId" TEXT NOT NULL,

    CONSTRAINT "GamePlayerPerspective_pkey" PRIMARY KEY ("gameId","playerPerspectiveId")
);

CREATE TABLE "Franchise" (
    "id" TEXT NOT NULL,
    "igdbId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,

    CONSTRAINT "Franchise_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameFranchise" (
    "gameId" TEXT NOT NULL,
    "franchiseId" TEXT NOT NULL,

    CONSTRAINT "GameFranchise_pkey" PRIMARY KEY ("gameId","franchiseId")
);

CREATE TABLE "MetricSource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metricKind" "MetricKind" NOT NULL,
    "maxValue" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "description" TEXT,

    CONSTRAINT "MetricSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameMetric" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "GameMetric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalScrapeTarget" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "provider" "ScrapeProvider" NOT NULL,
    "resolvedUrl" TEXT,
    "manualUrl" TEXT,
    "status" "ScrapeStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "verifiedTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalScrapeTarget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SyncState" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "message" TEXT,
    "stats" JSONB,
    "error" TEXT,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Game_igdbId_key" ON "Game"("igdbId");
CREATE INDEX "Game_releaseYear_idx" ON "Game"("releaseYear");
CREATE INDEX "Game_name_idx" ON "Game"("name");

CREATE UNIQUE INDEX "Company_igdbId_key" ON "Company"("igdbId");
CREATE INDEX "Company_name_idx" ON "Company"("name");
CREATE INDEX "GameCompany_companyId_idx" ON "GameCompany"("companyId");

CREATE UNIQUE INDEX "Genre_igdbId_key" ON "Genre"("igdbId");
CREATE INDEX "GameGenre_genreId_idx" ON "GameGenre"("genreId");

CREATE UNIQUE INDEX "Theme_igdbId_key" ON "Theme"("igdbId");
CREATE INDEX "GameTheme_themeId_idx" ON "GameTheme"("themeId");

CREATE UNIQUE INDEX "Platform_igdbId_key" ON "Platform"("igdbId");
CREATE INDEX "GamePlatform_platformId_idx" ON "GamePlatform"("platformId");

CREATE UNIQUE INDEX "GameMode_igdbId_key" ON "GameMode"("igdbId");
CREATE INDEX "GameGameMode_gameModeId_idx" ON "GameGameMode"("gameModeId");

CREATE UNIQUE INDEX "PlayerPerspective_igdbId_key" ON "PlayerPerspective"("igdbId");
CREATE INDEX "GamePlayerPerspective_playerPerspectiveId_idx" ON "GamePlayerPerspective"("playerPerspectiveId");

CREATE UNIQUE INDEX "Franchise_igdbId_key" ON "Franchise"("igdbId");
CREATE INDEX "GameFranchise_franchiseId_idx" ON "GameFranchise"("franchiseId");

CREATE UNIQUE INDEX "MetricSource_key_key" ON "MetricSource"("key");

CREATE UNIQUE INDEX "GameMetric_gameId_sourceId_key" ON "GameMetric"("gameId", "sourceId");
CREATE INDEX "GameMetric_sourceId_idx" ON "GameMetric"("sourceId");
CREATE INDEX "GameMetric_value_idx" ON "GameMetric"("value");

CREATE UNIQUE INDEX "ExternalScrapeTarget_gameId_provider_key" ON "ExternalScrapeTarget"("gameId", "provider");
CREATE INDEX "ExternalScrapeTarget_status_idx" ON "ExternalScrapeTarget"("status");
CREATE INDEX "ExternalScrapeTarget_provider_idx" ON "ExternalScrapeTarget"("provider");

CREATE UNIQUE INDEX "SyncState_key_key" ON "SyncState"("key");

CREATE INDEX "JobRun_type_startedAt_idx" ON "JobRun"("type", "startedAt");

-- AddForeignKey
ALTER TABLE "GameCompany" ADD CONSTRAINT "GameCompany_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameCompany" ADD CONSTRAINT "GameCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameGenre" ADD CONSTRAINT "GameGenre_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameGenre" ADD CONSTRAINT "GameGenre_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "Genre"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameTheme" ADD CONSTRAINT "GameTheme_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameTheme" ADD CONSTRAINT "GameTheme_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GamePlatform" ADD CONSTRAINT "GamePlatform_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GamePlatform" ADD CONSTRAINT "GamePlatform_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameGameMode" ADD CONSTRAINT "GameGameMode_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameGameMode" ADD CONSTRAINT "GameGameMode_gameModeId_fkey" FOREIGN KEY ("gameModeId") REFERENCES "GameMode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GamePlayerPerspective" ADD CONSTRAINT "GamePlayerPerspective_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GamePlayerPerspective" ADD CONSTRAINT "GamePlayerPerspective_playerPerspectiveId_fkey" FOREIGN KEY ("playerPerspectiveId") REFERENCES "PlayerPerspective"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameFranchise" ADD CONSTRAINT "GameFranchise_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameFranchise" ADD CONSTRAINT "GameFranchise_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameMetric" ADD CONSTRAINT "GameMetric_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameMetric" ADD CONSTRAINT "GameMetric_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MetricSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalScrapeTarget" ADD CONSTRAINT "ExternalScrapeTarget_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
