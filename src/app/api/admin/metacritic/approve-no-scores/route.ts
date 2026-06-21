import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { approveNoMetacriticScores } from "@/lib/metacritic/scraper";

const bodySchema = z.object({
  gameId: z.string().min(1),
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

  await approveNoMetacriticScores(parsed.data.gameId);
  return NextResponse.json({ ok: true });
}
