"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClientOnly } from "@/components/ui/client-only";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (response.ok) {
      router.push("/admin");
      router.refresh();
    } else {
      setError("Invalid password");
    }
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-md space-y-6 pt-16">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">Admin login</h1>
        <p className="text-sm text-muted">Operational tasks require authentication.</p>
      </div>
      <ClientOnly
        fallback={
          <div className="h-48 animate-pulse rounded-2xl border border-card-border bg-card/40" />
        }
      >
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-card-border bg-card/60 p-6"
        >
          <label className="block space-y-1 text-sm">
            <span className="text-muted">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-xl border border-card-border bg-background px-3 py-2 outline-none focus:border-accent"
              required
            />
          </label>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-accent px-4 py-2 font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </ClientOnly>
    </div>
  );
}
