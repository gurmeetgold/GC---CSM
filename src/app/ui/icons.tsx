/**
 * A compact inline icon set (stroke style, matched to the screenshots). No external
 * dependency. Each icon inherits `currentColor` and sizes via width/height.
 */
type P = { className?: string; size?: number };
const base = (size = 18) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
});

export const IconHome = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>
);
export const IconAccounts = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 9h16M9 9v11" /></svg>
);
export const IconRenewals = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v4h-4" /></svg>
);
export const IconOpportunities = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M3 17l6-6 4 4 7-8" /><path d="M21 7v5h-5" /></svg>
);
export const IconTech = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M9 6 3 12l6 6M15 6l6 6-6 6" /></svg>
);
export const IconPlaybook = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M9 7h7M9 11h7" /></svg>
);
export const IconAlert = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M12 3a6 6 0 0 0-6 6c0 5-2 6-2 6h16s-2-1-2-6a6 6 0 0 0-6-6Z" /><path d="M10.5 20a1.8 1.8 0 0 0 3 0" /></svg>
);
export const IconExec = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M4 19V5M4 19h16" /><path d="m7 14 3-3 3 2 5-6" /></svg>
);
export const IconSettings = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 6 19.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H2a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 3.3 6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H8a1.7 1.7 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V8a1.7 1.7 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>
);
export const IconAsk = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3 2.5v1" /></svg>
);
export const IconSearch = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
);
export const IconBell = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M10.5 20a1.8 1.8 0 0 0 3 0" /></svg>
);
export const IconCalendar = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>
);
export const IconDollar = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.8 7 7s2 3 5 3.5 5 1.6 5 3.7-2.2 3.3-5 3.3-5-1.1-5-3" /></svg>
);
export const IconShield = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z" /></svg>
);
export const IconWarning = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M12 3 2 20h20z" /><path d="M12 9v5M12 17h.01" /></svg>
);
export const IconTrendUp = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M3 17l6-6 4 4 8-9" /><path d="M21 6v5h-5" /></svg>
);
export const IconUsers = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.5a3 3 0 0 1 0 5.8M18 20a6 6 0 0 0-3-5.2" /></svg>
);
export const IconTicket = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4z" /><path d="M13 6v12" /></svg>
);
export const IconSpark = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></svg>
);
export const IconChevron = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="m6 9 6 6 6-6" /></svg>
);
