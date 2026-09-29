import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow mb-2">{eyebrow}</p>
        <h1 className="text-3xl font-semibold">{title}</h1>
        {description && (
          <p className="mt-2 max-w-[60ch] text-muted-foreground">{description}</p>
        )}
      </div>
      {actions}
    </div>
  );
}

const status = cva(
  "inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide",
  {
    variants: {
      tone: {
        ok: "bg-status-ok-soft text-status-ok",
        warn: "bg-status-warn-soft text-status-warn",
        urgent: "bg-status-urgent-soft text-status-urgent",
        info: "bg-status-info-soft text-status-info",
        idle: "bg-status-idle-soft text-status-idle",
      },
    },
    defaultVariants: { tone: "idle" },
  },
);

export function StatusBadge({
  tone,
  children,
}: VariantProps<typeof status> & { children: ReactNode }) {
  return (
    <span className={status({ tone })}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed bg-card/60 px-6 py-10 text-center",
        className,
      )}
    >
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-[52ch] text-sm text-muted-foreground">{description}</p>
      {children && <div className="mt-5 flex justify-center gap-2">{children}</div>}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="py-8">
      <h2 className="eyebrow mb-4">{title}</h2>
      {children}
    </section>
  );
}
