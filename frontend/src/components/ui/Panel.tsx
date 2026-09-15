import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  children: ReactNode;
  className?: string;
}

/** Labeled section used throughout the Smart Inspector. */
export default function Panel({ title, children, className = "" }: PanelProps) {
  return (
    <section className={`border-b border-border px-3 py-3 ${className}`}>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
        {title}
      </h3>
      {children}
    </section>
  );
}
