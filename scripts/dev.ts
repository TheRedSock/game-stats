#!/usr/bin/env tsx
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import "dotenv/config";
import { resolveDatabaseEnv } from "@/lib/env/database";

resolveDatabaseEnv();

const children: ChildProcess[] = [];

function isTruthy(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function run(name: string, command: string, args: string[]): ChildProcess {
  console.log(`[dev] starting ${name}: ${command} ${args.join(" ")}`);
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[dev] ${name} exited (${signal})`);
    } else if (code !== 0 && code != null) {
      console.error(`[dev] ${name} exited with code ${code}`);
      shutdown(code);
    }
  });
  children.push(child);
  return child;
}

function shutdown(code = 0): void {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

async function ensureLocalDatabase(): Promise<void> {
  if (!isTruthy(process.env.USE_LOCAL_DB)) return;

  console.log("[dev] USE_LOCAL_DB=true — ensuring Docker Postgres is up…");
  const up = spawnSync("docker", ["compose", "up", "-d", "postgres"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (up.status !== 0) {
    console.error("[dev] docker compose up failed — start Postgres manually or set USE_LOCAL_DB=false");
    process.exit(up.status ?? 1);
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const ready = spawnSync(
      "docker",
      ["compose", "exec", "-T", "postgres", "pg_isready", "-U", "postgres", "-d", "game_stats"],
      { stdio: "pipe", shell: process.platform === "win32" },
    );
    if (ready.status === 0) {
      console.log("[dev] Postgres is ready");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.error("[dev] Postgres did not become ready in time");
  process.exit(1);
}

async function main(): Promise<void> {
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  await ensureLocalDatabase();

  if (isTruthy(process.env.INNGEST_DEV)) {
    const origin =
      process.env.INNGEST_SERVE_ORIGIN ?? "http://127.0.0.1:3000";
    const serveUrl = `${origin.replace(/\/$/, "")}/api/inngest`;
    run("inngest", "npx", [
      "inngest-cli@latest",
      "dev",
      "-u",
      serveUrl,
    ]);
  } else {
    console.log("[dev] INNGEST_DEV not set — skipping local Inngest dev server");
  }

  run("next", "next", ["dev"]);
}

main().catch((error) => {
  console.error(error);
  shutdown(1);
});
