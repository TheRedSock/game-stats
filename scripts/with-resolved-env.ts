#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import "dotenv/config";
import { resolveDatabaseEnv } from "@/lib/env/database";

resolveDatabaseEnv();

const command = process.argv.slice(2);
if (command.length === 0) {
  console.error("Usage: tsx scripts/with-resolved-env.ts <command> [args...]");
  process.exit(1);
}

const [bin, ...args] = command;
const result = spawnSync(bin, args, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});

process.exit(result.status ?? 1);
