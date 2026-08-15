import { describe, it, expect } from 'vitest';
import { InMemoryAuditLogStore } from './auditLog';

describe('InMemoryAuditLogStore', () => {
  it('records and lists events for an org, most-recent first', async () => {
    const log = new InMemoryAuditLogStore();
    await log.record({ orgId: 'org-1', actorUserId: 'u1', actorEmail: 'a@co.com', action: 'integration.connected', target: 'crm' });
    await log.record({ orgId: 'org-1', actorUserId: 'u1', actorEmail: 'a@co.com', action: 'role.changed', target: 'user-2' });
    const events = await log.list('org-1');
    expect(events).toHaveLength(2);
    expect(events[0]!.action).toBe('role.changed');
    expect(events[1]!.action).toBe('integration.connected');
  });

  it('isolates events by org', async () => {
    const log = new InMemoryAuditLogStore();
    await log.record({ orgId: 'org-1', actorUserId: 'u1', actorEmail: 'a@co.com', action: 'integration.connected', target: 'crm' });
    expect(await log.list('org-2')).toEqual([]);
  });
});
