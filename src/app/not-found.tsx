import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function NotFound() {
  return (
    <Card className="mx-auto max-w-2xl text-center">
      <p className="text-sm uppercase tracking-[0.2em] text-accent">404</p>
      <h1 className="mt-3 text-3xl font-semibold">Page not found</h1>
      <p className="mt-2 text-muted">The page or game you are looking for does not exist.</p>
      <Link href="/" className={buttonVariants({ className: "mt-6" })}>
        Back to dashboard
      </Link>
    </Card>
  );
}
