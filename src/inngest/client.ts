import { EventSchemas, Inngest } from "inngest";
import type { AdminJobEvents } from "@/inngest/events";

/**
 * Inngest client for background admin jobs. Functions register in src/inngest/functions/
 * and are served at /api/inngest.
 *
 * Cloud (Vercel): INNGEST_SIGNING_KEY, INNGEST_EVENT_KEY
 * Local dev: INNGEST_DEV=1, INNGEST_SERVE_ORIGIN, run via `pnpm dev`
 */
export const inngest = new Inngest({
  id: "game-stats",
  schemas: new EventSchemas().fromRecord<AdminJobEvents>(),
});
