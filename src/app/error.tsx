"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-2xl text-center" role="alert">
      <p className="text-sm uppercase tracking-[0.2em] text-red-200">Something went wrong</p>
      <h1 className="mt-3 text-3xl font-semibold">Unable to load this view</h1>
      <p className="mt-2 text-muted">
        A data source or server operation failed. You can retry the request or check admin jobs.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </Card>
  );
}
