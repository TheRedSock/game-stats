import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "game-stats-admin-session";
const SESSION_DURATION = 60 * 60 * 8; // 8 hours

function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET ?? process.env.ADMIN_PASSWORD;
  if (!secret) {
    throw new Error("SESSION_SECRET or ADMIN_PASSWORD must be set");
  }
  return new TextEncoder().encode(secret);
}

export async function createAdminSession(): Promise<void> {
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(getSessionSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION,
  });
}

export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return false;

  try {
    await jwtVerify(token, getSessionSecret());
    return true;
  } catch {
    return false;
  }
}

export function verifyAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return password === expected;
}

export async function requireAdmin(): Promise<void> {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    throw new Error("Unauthorized");
  }
}
