import { cn } from "@/lib/utils";

const controlClass =
  "w-full rounded-xl border border-card-border bg-card/80 px-3 py-2 text-sm text-foreground outline-none transition focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50";

type FieldProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  label: string;
};

export function Field({ label, className, children, ...props }: FieldProps) {
  return (
    <label className={cn("space-y-1 text-sm", className)} {...props}>
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(controlClass, props.className)} />;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(controlClass, props.className)} />;
}
