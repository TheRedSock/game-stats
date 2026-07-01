#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "dotenv/config";
import { getRawDatabaseUrls } from "@/lib/env/database";

type SyncDirection = "prod-to-local" | "local-to-prod";

function run(command: string, args: string[], env: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function assertPgTools(): void {
  const check = spawnSync("pg_dump", ["--version"], {
    shell: process.platform === "win32",
    stdio: "pipe",
  });
  if (check.status !== 0) {
    throw new Error(
      "pg_dump was not found. Install PostgreSQL client tools and ensure pg_dump/pg_restore are on PATH.",
    );
  }
}

function parseArgs(): { direction: SyncDirection; confirmed: boolean } {
  const directionArg = process.argv[2];
  const confirmed = process.argv.includes("--confirm");

  if (directionArg !== "prod-to-local" && directionArg !== "local-to-prod") {
    console.error(
      "Usage: tsx scripts/db-sync.ts <prod-to-local|local-to-prod> [--confirm]\n\n" +
        "  prod-to-local  Copy production data into local Docker Postgres\n" +
        "  local-to-prod  Copy local data into production (requires --confirm)",
    );
    process.exit(1);
  }

  return { direction: directionArg, confirmed };
}

async function main(): Promise<void> {
  assertPgTools();

  const { direction, confirmed } = parseArgs();
  const { local, prodDirect } = getRawDatabaseUrls();

  const source = direction === "prod-to-local" ? prodDirect : local;
  const target = direction === "prod-to-local" ? local : prodDirect;
  const targetLabel = direction === "prod-to-local" ? "local" : "production";

  if (direction === "local-to-prod" && !confirmed) {
    console.error(
      "Refusing to overwrite production without --confirm.\n" +
        "Run: pnpm db:sync:to-prod -- --confirm",
    );
    process.exit(1);
  }

  console.log(`Syncing ${direction}...`);
  console.log(`  source: ${maskUrl(source)}`);
  console.log(`  target (${targetLabel}): ${maskUrl(target)}`);

  const workDir = mkdtempSync(join(tmpdir(), "game-stats-db-sync-"));
  const dumpPath = join(workDir, "dump.dump");

  try {
    console.log("\n1/2 Dumping source database...");
    run(
      "pg_dump",
      [
        source,
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--file",
        dumpPath,
      ],
      process.env,
    );

    console.log(`\n2/2 Restoring into ${targetLabel} (--clean --if-exists)...`);
    run(
      "pg_restore",
      [
        "--dbname",
        target,
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-acl",
        "--verbose",
        dumpPath,
      ],
      process.env,
    );

    console.log("\nDatabase sync complete.");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url.replace(/^postgresql:/, "http:"));
    if (parsed.password) {
      parsed.password = "****";
    }
    return parsed.toString().replace(/^http:/, "postgresql:");
  } catch {
    return "(invalid url)";
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
