/**
 * Resolves DATABASE_URL and DIRECT_DATABASE_URL for Prisma / the app runtime.
 *
 * In .env, keep production Neon URLs in DATABASE_URL (+ direct alias) and local
 * Docker Postgres in DATABASE_LOCAL. Set USE_LOCAL_DB=true to point dev at local.
 */

function isTruthy(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function resolveDirectUrl(): string | undefined {
  return process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL_DIRECT;
}

/** Raw URLs from .env — not affected by USE_LOCAL_DB. Used by db sync scripts. */
export function getRawDatabaseUrls(): {
  local: string;
  prodPooled: string;
  prodDirect: string;
} {
  const local = process.env.DATABASE_LOCAL;
  const prodPooled = process.env.DATABASE_URL;
  const prodDirect = resolveDirectUrl() ?? prodPooled;

  if (!local) {
    throw new Error("DATABASE_LOCAL is required for database sync scripts.");
  }
  if (!prodPooled) {
    throw new Error("DATABASE_URL is required for database sync scripts.");
  }
  if (!prodDirect) {
    throw new Error(
      "DIRECT_DATABASE_URL or DATABASE_URL_DIRECT is required for database sync scripts.",
    );
  }

  return { local, prodPooled, prodDirect };
}

/**
 * Applies USE_LOCAL_DB toggle to process.env so Prisma and Next.js use the right DB.
 * Safe to call multiple times.
 */
export function resolveDatabaseEnv(): void {
  if (isTruthy(process.env.USE_LOCAL_DB)) {
    const local = process.env.DATABASE_LOCAL;
    if (!local) {
      throw new Error(
        "USE_LOCAL_DB=true but DATABASE_LOCAL is not set in the environment.",
      );
    }

    process.env.DATABASE_URL = local;
    process.env.DIRECT_DATABASE_URL =
      process.env.DATABASE_LOCAL_DIRECT ?? local;
    return;
  }

  const direct = resolveDirectUrl();
  if (direct) {
    process.env.DIRECT_DATABASE_URL = direct;
  }
}
