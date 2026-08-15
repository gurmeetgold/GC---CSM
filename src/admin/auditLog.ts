/**
 * A simple audit trail: who changed what, when. Starts narrow — integration
 * connect/disconnect and role changes, per the phase brief — not exhaustive yet.
 */
export type AuditAction =
  | 'integration.connected'
  | 'integration.disconnected'
  | 'role.changed'
  | 'user.invited'
  | 'threshold.changed'
  | 'threshold.reset';

export interface AuditEvent {
  id: string;
  orgId: string;
  actorUserId: string;
  actorEmail: string;
  action: AuditAction;
  target: string;
  at: string;
}

export interface AuditLogStore {
  record(input: Omit<AuditEvent, 'id' | 'at'>): Promise<AuditEvent>;
  list(orgId: string): Promise<AuditEvent[]>;
}

export class InMemoryAuditLogStore implements AuditLogStore {
  private events: AuditEvent[] = [];
  private seq = 0;

  async record(input: Omit<AuditEvent, 'id' | 'at'>): Promise<AuditEvent> {
    const event: AuditEvent = { ...input, id: `audit-${++this.seq}`, at: new Date().toISOString() };
    this.events.push(event);
    return event;
  }

  async list(orgId: string): Promise<AuditEvent[]> {
    return this.events.filter((e) => e.orgId === orgId).slice().reverse(); // most recent first
  }
}
