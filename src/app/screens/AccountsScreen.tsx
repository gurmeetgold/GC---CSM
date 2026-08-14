import { useState } from 'react';
import type { EvaluatedAccount } from '../../answer';
import { PageHeader } from '../ui/PageHeader';
import { HealthOverview } from './HealthOverview';
import { RedAccounts } from './RedAccounts';

type View = 'all' | 'at_risk';

export function AccountsScreen({
  book, now, reasoning, onSelect,
}: {
  book: EvaluatedAccount[];
  now: Date;
  reasoning: Record<string, string>;
  onSelect: (id: string) => void;
}) {
  const [view, setView] = useState<View>('all');
  const redCount = book.filter((e) => e.evaluation.riskLevel === 'red').length;

  return (
    <>
      <PageHeader title="Accounts" subtitle="Your whole book — sortable health, and the at-risk accounts with the reasons behind each." />

      <div className="mb-5 inline-flex rounded-lg border border-line bg-surface p-0.5" role="tablist" aria-label="Accounts view">
        <Tab active={view === 'all'} onClick={() => setView('all')}>All accounts</Tab>
        <Tab active={view === 'at_risk'} onClick={() => setView('at_risk')}>
          At-risk <span className="nums ml-1 rounded-full bg-risk-redBg px-1.5 text-xs font-semibold text-risk-red">{redCount}</span>
        </Tab>
      </div>

      {view === 'all' ? (
        <HealthOverview book={book} now={now} onSelect={onSelect} />
      ) : (
        <RedAccounts book={book} focusId={null} reasoning={reasoning} onSelect={onSelect} />
      )}
    </>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${active ? 'bg-brand text-white' : 'text-ink-soft hover:text-ink'}`}>
      {children}
    </button>
  );
}
