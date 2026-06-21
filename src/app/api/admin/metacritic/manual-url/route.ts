import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { normalizeMetacriticGameUrl } from "@/lib/metacritic/parser";
import { setManualMetacriticUrl } from "@/lib/metacritic/scraper";

const bodySchema = z.object({
  gameId: z.string().min(1),
  url: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const url = normalizeMetacriticGameUrl(parsed.data.url);
  if (!url) {
    return NextResponse.json({ error: "Invalid Metacritic game URL or slug" }, { status: 400 });
  }

  await setManualMetacriticUrl(parsed.data.gameId, url);
  return NextResponse.json({ ok: true, url });
}
