import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title?: string;
  message: string;
  className?: string;
};

export function EmptyState({ title, message, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-card-border p-6 text-center",
        className,
      )}
    >
      {title ? <p className="font-medium text-foreground">{title}</p> : null}
      <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
    </div>
  );
}
