#!/usr/bin/env tsx
import "dotenv/config";
import { resolveDatabaseEnv } from "@/lib/env/database";
import { syncIgdbGames, seedInitialGames } from "@/lib/igdb/sync";

resolveDatabaseEnv();

async function main() {
  const mode = process.argv[2] ?? "seed";
  if (mode === "sync") {
    const stats = await syncIgdbGames();
    console.log("IGDB sync complete:", stats);
  } else {
    const count = Number(process.argv[3] ?? 200);
    const stats = await seedInitialGames(count);
    console.log(`IGDB seed (${count}) complete:`, stats);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
