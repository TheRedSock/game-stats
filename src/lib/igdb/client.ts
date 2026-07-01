import { sleep } from "@/lib/utils";

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const API_BASE = "https://api.igdb.com/v4";

/** IGDB allows 4 requests/second — stay slightly under. */
const MIN_REQUEST_INTERVAL_MS = 260;
const MAX_RETRIES = 5;

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

/** Serializes all IGDB API calls process-wide so concurrent callers share one queue. */
let requestQueue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function enqueueRequest<T>(fn: () => Promise<T>): Promise<T> {
  const task = requestQueue.then(async () => {
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
    }
    lastRequestAt = Date.now();
    return fn();
  });

  requestQueue = task.then(
    () => undefined,
    () => undefined,
  );

  return task;
}

/** Reset queue state — for tests only. */
export function resetIgdbRequestQueueForTests(): void {
  requestQueue = Promise.resolve();
  lastRequestAt = 0;
  tokenCache = null;
}

export class IgdbClient {
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(clientId?: string, clientSecret?: string) {
    this.clientId = clientId ?? process.env.TWITCH_APP_CLIENT_ID ?? "";
    this.clientSecret = clientSecret ?? process.env.TWITCH_APP_CLIENT_SECRET ?? "";
    if (!this.clientId || !this.clientSecret) {
      throw new Error("TWITCH_APP_CLIENT_ID and TWITCH_APP_CLIENT_SECRET are required");
    }
  }

  private async getAccessToken(): Promise<string> {
    if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
      return tokenCache.accessToken;
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "client_credentials",
    });

    const response = await fetch(`${TOKEN_URL}?${params.toString()}`, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Twitch OAuth failed: ${response.status}`);
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    tokenCache = {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return tokenCache.accessToken;
  }

  async query<T>(endpoint: string, body: string): Promise<T[]> {
    return enqueueRequest(async () => {
      const token = await this.getAccessToken();

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const response = await fetch(`${API_BASE}/${endpoint}`, {
          method: "POST",
          headers: {
            "Client-ID": this.clientId,
            Authorization: `Bearer ${token}`,
            "Content-Type": "text/plain",
          },
          body,
        });

        if (response.status === 429) {
          const retryAfterHeader = response.headers.get("Retry-After");
          const retryMs = retryAfterHeader
            ? Math.max(Number(retryAfterHeader) * 1000, 1000)
            : 1000 * 2 ** attempt;
          await sleep(retryMs);
          continue;
        }

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`IGDB ${endpoint} failed (${response.status}): ${text}`);
        }

        return (await response.json()) as T[];
      }

      throw new Error(`IGDB ${endpoint} failed (429): rate limit exceeded after ${MAX_RETRIES} retries`);
    });
  }

  async count(endpoint: string, where?: string): Promise<number> {
    const body = where ? `where ${where};` : "";
    const result = await this.query<{ count: number }>(`${endpoint}/count`, body);
    return result[0]?.count ?? 0;
  }
}

export type IgdbGame = {
  id: number;
  name: string;
  slug?: string;
  cover?: {
    image_id?: string;
  };
  first_release_date?: number;
  status?: number;
  updated_at?: number;
  rating?: number;
  rating_count?: number;
  genres?: number[];
  themes?: number[];
  platforms?: number[];
  game_modes?: number[];
  player_perspectives?: number[];
  franchises?: number[];
  involved_companies?: Array<{
    company: number;
    developer?: boolean;
    publisher?: boolean;
    porting?: boolean;
    supporting?: boolean;
  }>;
};

export type IgdbNamedEntity = {
  id: number;
  name: string;
  slug?: string;
};

export const IGDB_GAME_FIELDS = [
  "id",
  "name",
  "slug",
  "cover.image_id",
  "first_release_date",
  "status",
  "updated_at",
  "rating",
  "rating_count",
  "genres",
  "themes",
  "platforms",
  "game_modes",
  "player_perspectives",
  "franchises",
  "involved_companies.company",
  "involved_companies.developer",
  "involved_companies.publisher",
  "involved_companies.porting",
  "involved_companies.supporting",
].join(",");
