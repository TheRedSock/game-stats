import Link from "next/link";
import { BarChart3, Shield } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-card-border/80 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20 text-accent">
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
          </span>
          Game Stats
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted sm:gap-6" aria-label="Primary">
          <Link href="/" className="transition hover:text-foreground">
            Dashboard
          </Link>
          <Link href="/games" className="transition hover:text-foreground">
            Games
          </Link>
          <Link href="/explore" className="transition hover:text-foreground">
            Explore
          </Link>
          <Link
            href="/admin"
            className="flex items-center gap-1 transition hover:text-foreground"
          >
            <Shield className="h-3.5 w-3.5" aria-hidden="true" />
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
