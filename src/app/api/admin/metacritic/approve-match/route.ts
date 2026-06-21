import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { approveAmbiguousMetacriticMatch } from "@/lib/metacritic/scraper";

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

  try {
    const status = await approveAmbiguousMetacriticMatch(parsed.data.gameId);
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Approval failed" },
      { status: 400 },
    );
  }
}
