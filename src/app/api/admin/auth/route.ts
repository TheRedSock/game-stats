import { NextResponse } from "next/server";
import {
  assertAdminLoginAllowed,
  clearAdminLoginAttempts,
  clearAdminSession,
  createAdminSession,
  verifyAdminPassword,
} from "@/lib/auth/admin";

export async function POST(request: Request) {
  const body = (await request.json()) as { password?: string };
  try {
    await assertAdminLoginAllowed(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Too many login attempts" },
      { status: 429 },
    );
  }

  if (!body.password || !verifyAdminPassword(body.password)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  await clearAdminLoginAttempts(request);
  await createAdminSession();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearAdminSession();
  return NextResponse.json({ ok: true });
}
