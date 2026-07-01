"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClientOnly } from "@/components/ui/client-only";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";

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
          className="space-y-4"
        >
          <Card>
            <Field label="Password">
              <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              aria-invalid={error ? "true" : "false"}
              aria-describedby={error ? "admin-login-error" : undefined}
              required
              />
            </Field>
            {error ? (
              <p id="admin-login-error" className="mt-3 text-sm text-red-400" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={loading} className="mt-4 w-full">
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </Card>
        </form>
      </ClientOnly>
    </div>
  );
}
