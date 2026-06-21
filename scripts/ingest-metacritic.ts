#!/usr/bin/env tsx
import "dotenv/config";
import { runMetacriticScrapeBatch } from "@/lib/metacritic/scraper";

async function main() {
  const retry = process.argv.includes("--retry");
  const stats = await runMetacriticScrapeBatch({ retryFailed: retry });
  console.log("Metacritic scrape complete:", stats);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
