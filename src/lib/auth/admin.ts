import { SignJWT, jwtVerify } from "jose";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getRedis } from "@/lib/redis";

const COOKIE_NAME = "game-stats-admin-session";
const SESSION_DURATION = 60 * 60 * 8; // 8 hours
const LOGIN_RATE_LIMIT = 5;
const LOGIN_RATE_WINDOW_SECONDS = 15 * 60;

const globalForRateLimit = globalThis as unknown as {
  adminLoginAttempts?: Map<string, { count: number; resetAt: number }>;
};

function loginAttemptsStore(): Map<string, { count: number; resetAt: number }> {
  globalForRateLimit.adminLoginAttempts ??= new Map();
  return globalForRateLimit.adminLoginAttempts;
}

function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET must be set");
  }
  return new TextEncoder().encode(secret);
}

function hashForCompare(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function timingSafeStringEqual(actual: string, expected: string): boolean {
  return timingSafeEqual(hashForCompare(actual), hashForCompare(expected));
}

function requestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

function loginRateKey(request: Request): string {
  return `admin:login:${requestIp(request)}`;
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
  return timingSafeStringEqual(password, expected);
}

export async function requireAdmin(): Promise<void> {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    throw new Error("Unauthorized");
  }
}

export async function assertAdminLoginAllowed(request: Request): Promise<void> {
  const key = loginRateKey(request);
  const redis = getRedis();
  if (redis) {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, LOGIN_RATE_WINDOW_SECONDS);
    }
    if (count > LOGIN_RATE_LIMIT) {
      throw new Error("Too many login attempts. Try again later.");
    }
    return;
  }

  const now = Date.now();
  const resetAt = now + LOGIN_RATE_WINDOW_SECONDS * 1000;
  const store = loginAttemptsStore();
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt });
    return;
  }

  current.count += 1;
  if (current.count > LOGIN_RATE_LIMIT) {
    throw new Error("Too many login attempts. Try again later.");
  }
}

export async function clearAdminLoginAttempts(request: Request): Promise<void> {
  const key = loginRateKey(request);
  const redis = getRedis();
  if (redis) {
    await redis.del(key);
  }
  loginAttemptsStore().delete(key);
}
