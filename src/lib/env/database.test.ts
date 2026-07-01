import { afterEach, describe, expect, it } from "vitest";
import { getRawDatabaseUrls, resolveDatabaseEnv } from "@/lib/env/database";

describe("resolveDatabaseEnv", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("points Prisma at DATABASE_LOCAL when USE_LOCAL_DB=true", () => {
    process.env.USE_LOCAL_DB = "true";
    process.env.DATABASE_LOCAL =
      "postgresql://postgres:postgres@localhost:5432/game_stats?schema=public";
    process.env.DATABASE_URL =
      "postgresql://prod:prod@ep-xxx-pooler.neon.tech/neondb?sslmode=require";

    resolveDatabaseEnv();

    expect(process.env.DATABASE_URL).toBe(process.env.DATABASE_LOCAL);
    expect(process.env.DIRECT_DATABASE_URL).toBe(process.env.DATABASE_LOCAL);
  });

  it("uses DATABASE_LOCAL_DIRECT for direct URL when provided", () => {
    process.env.USE_LOCAL_DB = "true";
    process.env.DATABASE_LOCAL =
      "postgresql://postgres:postgres@localhost:5432/game_stats?schema=public";
    process.env.DATABASE_LOCAL_DIRECT =
      "postgresql://postgres:postgres@localhost:5433/game_stats?schema=public";

    resolveDatabaseEnv();

    expect(process.env.DIRECT_DATABASE_URL).toBe(process.env.DATABASE_LOCAL_DIRECT);
  });

  it("maps DATABASE_URL_DIRECT to DIRECT_DATABASE_URL when not using local DB", () => {
    process.env.USE_LOCAL_DB = "false";
    process.env.DATABASE_URL =
      "postgresql://prod:prod@ep-xxx-pooler.neon.tech/neondb?sslmode=require";
    process.env.DATABASE_URL_DIRECT =
      "postgresql://prod:prod@ep-xxx.neon.tech/neondb?sslmode=require";
    delete process.env.DIRECT_DATABASE_URL;

    resolveDatabaseEnv();

    expect(process.env.DATABASE_URL).toBe(
      "postgresql://prod:prod@ep-xxx-pooler.neon.tech/neondb?sslmode=require",
    );
    expect(process.env.DIRECT_DATABASE_URL).toBe(process.env.DATABASE_URL_DIRECT);
  });

  it("getRawDatabaseUrls returns untoggled prod and local URLs", () => {
    process.env.DATABASE_LOCAL =
      "postgresql://postgres:postgres@localhost:5432/game_stats?schema=public";
    process.env.DATABASE_URL =
      "postgresql://prod:prod@ep-xxx-pooler.neon.tech/neondb?sslmode=require";
    process.env.DATABASE_URL_DIRECT =
      "postgresql://prod:prod@ep-xxx.neon.tech/neondb?sslmode=require";

    resolveDatabaseEnv();

    const raw = getRawDatabaseUrls();
    expect(raw.local).toBe(process.env.DATABASE_LOCAL);
    expect(raw.prodPooled).toBe(
      "postgresql://prod:prod@ep-xxx-pooler.neon.tech/neondb?sslmode=require",
    );
    expect(raw.prodDirect).toBe(process.env.DATABASE_URL_DIRECT);
  });
});
