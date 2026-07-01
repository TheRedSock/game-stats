ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'IGDB_SEED';

ALTER TABLE "Game"
  ADD COLUMN "coverImageId" TEXT,
  ADD COLUMN "igdbUpdatedAt" INTEGER;

CREATE INDEX "Game_igdbUpdatedAt_igdbId_idx" ON "Game"("igdbUpdatedAt", "igdbId");
