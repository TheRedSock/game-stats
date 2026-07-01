import { Redis } from "@upstash/redis";

let redis: Redis | null | undefined;

/**
 * Upstash Redis REST client. Returns null when UPSTASH_REDIS_REST_URL / TOKEN are unset.
 */
export function getRedis(): Redis | null {
  if (redis !== undefined) {
    return redis;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    redis = null;
    return redis;
  }

  redis = new Redis({ url, token });
  return redis;
}
