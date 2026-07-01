#!/usr/bin/env tsx
import "dotenv/config";
import { resolveDatabaseEnv } from "@/lib/env/database";
import { runMetacriticScrapeBatch } from "@/lib/metacritic/scraper";

resolveDatabaseEnv();

async function main() {
  const retry = process.argv.includes("--retry");
  const stats = await runMetacriticScrapeBatch({ retryFailed: retry });
  console.log("Metacritic scrape complete:", stats);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
