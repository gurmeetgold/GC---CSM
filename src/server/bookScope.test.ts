import { describe, it, expect } from 'vitest';
import { scopeBookForUser } from './bookScope';
import type { EvaluatedAccount } from '../answer';
import type { User } from '../domain';

function acct(_id: string, ownerCsm: string): EvaluatedAccount {
  return {
    account: { ownerCsm } as EvaluatedAccount['account'],
    evaluation: { riskLevel: 'green', signals: [] } as unknown as EvaluatedAccount['evaluation'],
  } as unknown as EvaluatedAccount & { account: { id: string } };
}

function user(over: Partial<User>): User {
  return { id: 'u1', email: 'u@co.com', name: 'Maya Chen', role: 'csm', orgId: 'org-1', createdAt: '', lastActiveAt: null, ...over };
}

const book: EvaluatedAccount[] = [acct('a1', 'Maya Chen'), acct('a2', 'Devin Park'), acct('a3', 'Maya Chen')];

describe('scopeBookForUser', () => {
  it('csm sees only accounts where ownerCsm matches their own name', () => {
    const scoped = scopeBookForUser(book, user({ role: 'csm', name: 'Maya Chen' }));
    expect(scoped).toHaveLength(2);
    expect(scoped.every((e) => e.account.ownerCsm === 'Maya Chen')).toBe(true);
  });

  it('manager sees only accounts owned by their assigned CSM names', () => {
    const scoped = scopeBookForUser(book, user({ role: 'manager', managedCsmNames: ['Devin Park'] }));
    expect(scoped).toHaveLength(1);
    expect(scoped[0]!.account.ownerCsm).toBe('Devin Park');
  });

  it('manager with no assignments sees nothing (not the whole org by accident)', () => {
    const scoped = scopeBookForUser(book, user({ role: 'manager' }));
    expect(scoped).toHaveLength(0);
  });

  it('exec sees the whole org unscoped', () => {
    expect(scopeBookForUser(book, user({ role: 'exec' }))).toHaveLength(3);
  });

  it('admin sees the whole org unscoped', () => {
    expect(scopeBookForUser(book, user({ role: 'admin' }))).toHaveLength(3);
  });
});
