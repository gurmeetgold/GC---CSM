export type AlertType = 'critical_risk' | 'renewal_jeopardy' | 'sla_breach' | 'new_champion_silence';

export interface OrgSettings {
  orgId: string;
  name: string;
  timezone: string;
  /** Alert types → whether they notify (a stub checklist against existing signal families, not a full notification engine). */
  notifyOn: Record<AlertType, boolean>;
}

const DEFAULTS: Omit<OrgSettings, 'orgId'> = {
  name: 'My Organization',
  timezone: 'America/New_York',
  notifyOn: {
    critical_risk: true,
    renewal_jeopardy: true,
    sla_breach: true,
    new_champion_silence: false,
  },
};

export interface OrgSettingsStore {
  get(orgId: string): Promise<OrgSettings>;
  update(orgId: string, patch: Partial<Omit<OrgSettings, 'orgId'>>): Promise<OrgSettings>;
}

export class InMemoryOrgSettingsStore implements OrgSettingsStore {
  private rows = new Map<string, OrgSettings>();

  async get(orgId: string): Promise<OrgSettings> {
    return { ...(this.rows.get(orgId) ?? { orgId, ...DEFAULTS }) };
  }

  async update(orgId: string, patch: Partial<Omit<OrgSettings, 'orgId'>>): Promise<OrgSettings> {
    const current = await this.get(orgId);
    const merged: OrgSettings = {
      ...current,
      ...patch,
      notifyOn: { ...current.notifyOn, ...(patch.notifyOn ?? {}) },
    };
    this.rows.set(orgId, merged);
    return { ...merged };
  }
}
