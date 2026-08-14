import type { ReactNode } from 'react';

/** The page title block: big bold title + one-line subtitle + right-aligned actions. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[1.7rem] font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A secondary action button (outline) for page headers. */
export function GhostButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink">
      {children}
    </button>
  );
}

/** The primary action button (brand). */
export function PrimaryButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white shadow-card hover:bg-brand-hover">
      {children}
    </button>
  );
}
