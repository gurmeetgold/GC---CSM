import type { ReactNode } from 'react';

/** The standard white content card — the building block of every screen. */
export function Card({
  title,
  subtitle,
  action,
  count,
  className = '',
  bodyClassName = '',
  children,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  count?: number;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-xl border border-line bg-surface shadow-card ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div>
            {title && (
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                {title}
                {typeof count === 'number' && (
                  <span className="nums rounded-full bg-surface-sunken px-1.5 py-0.5 text-xs font-medium text-ink-soft">{count}</span>
                )}
              </h3>
            )}
            {subtitle && <p className="mt-0.5 text-xs text-ink-soft">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0 text-sm">{action}</div>}
        </header>
      )}
      <div className={`px-5 pb-5 ${title ? 'pt-4' : 'pt-5'} ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** A subtle inline link-button ("View all →"). */
export function LinkAction({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-hover">
      {children}
    </button>
  );
}
