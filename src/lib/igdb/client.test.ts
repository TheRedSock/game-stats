import { afterEach, describe, expect, it, vi } from "vitest";
import { IgdbClient, resetIgdbRequestQueueForTests } from "@/lib/igdb/client";

describe("IgdbClient rate limiting", () => {
  afterEach(() => {
    resetIgdbRequestQueueForTests();
    vi.restoreAllMocks();
  });

  it("serializes requests with minimum interval between them", async () => {
    const timestamps: number[] = [];

    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), {
          status: 200,
        });
      }

      timestamps.push(Date.now());
      return new Response(JSON.stringify([{ id: 1, name: "Test" }]), { status: 200 });
    });

    const client = new IgdbClient("id", "secret");

    await Promise.all([
      client.query("genres", "fields id,name; limit 1;"),
      client.query("themes", "fields id,name; limit 1;"),
      client.query("platforms", "fields id,name; limit 1;"),
    ]);

    expect(timestamps).toHaveLength(3);
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i] - timestamps[i - 1]).toBeGreaterThanOrEqual(250);
    }
  });

  it("retries on 429 responses", async () => {
    let attempts = 0;

    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), {
          status: 200,
        });
      }

      attempts += 1;
      if (attempts === 1) {
        return new Response(JSON.stringify({ message: "Too Many Requests" }), { status: 429 });
      }
      return new Response(JSON.stringify([{ id: 1, name: "Test" }]), { status: 200 });
    });

    const client = new IgdbClient("id", "secret");
    const result = await client.query<{ id: number; name: string }>("genres", "fields id,name; limit 1;");

    expect(attempts).toBe(2);
    expect(result).toEqual([{ id: 1, name: "Test" }]);
  });
});
