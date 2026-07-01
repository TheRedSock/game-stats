import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  PENDING: "border-warning/40 bg-warning/10 text-yellow-200",
  RUNNING: "border-accent/40 bg-accent/10 text-indigo-100",
  COMPLETED: "border-success/40 bg-success/10 text-emerald-200",
  SUCCESS: "border-success/40 bg-success/10 text-emerald-200",
  FAILED: "border-red-400/40 bg-red-500/10 text-red-200",
  AMBIGUOUS: "border-warning/40 bg-warning/10 text-yellow-200",
  SKIPPED: "border-card-border bg-card/70 text-muted",
};

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "status";
};

export function Badge({ className, variant = "default", children, ...props }: BadgeProps) {
  const value = typeof children === "string" ? children : "";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        variant === "status"
          ? (statusStyles[value] ?? "border-card-border bg-card/70 text-muted")
          : "border-card-border bg-card/70 text-muted",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
