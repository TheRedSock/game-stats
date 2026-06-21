import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatScore(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat().format(value);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function igdbTimestampToDate(ts?: number | null): Date | null {
  if (!ts) return null;
  return new Date(ts * 1000);
}

export function getReleaseYear(date: Date | null, fallback?: number | null): number | null {
  if (date) return date.getUTCFullYear();
  return fallback ?? null;
}

/** Fixed-format datetime for SSR/client consistency. */
export function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
