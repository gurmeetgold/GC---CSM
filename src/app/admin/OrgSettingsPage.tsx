import { useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { adminApi } from './adminApi';
import type { OrgSettings, AlertType } from '../../admin/orgSettingsStore';

const ALERT_LABELS: Record<AlertType, string> = {
  critical_risk: 'An account turns critical (red)',
  renewal_jeopardy: 'A renewal enters jeopardy',
  sla_breach: 'A support ticket breaches SLA',
  new_champion_silence: 'A champion goes silent',
};

export function OrgSettingsPage() {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void adminApi.getOrgSettings().then((r) => setSettings(r.settings));
  }, []);

  async function save(patch: Partial<Omit<OrgSettings, 'orgId'>>) {
    setSaving(true);
    setSaved(false);
    try {
      const res = await adminApi.updateOrgSettings(patch);
      setSettings(res.settings);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <p className="text-sm text-ink-soft">Loading…</p>;

  return (
    <div className="space-y-4">
      <Card title="Organization">
        <div className="flex flex-wrap gap-4 px-5 pb-5">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Org name</span>
            <input
              defaultValue={settings.name}
              onBlur={(e) => void save({ name: e.target.value })}
              className="w-64 rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink focus-visible:border-brand focus-visible:bg-surface"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Timezone</span>
            <input
              defaultValue={settings.timezone}
              onBlur={(e) => void save({ timezone: e.target.value })}
              className="w-52 rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink focus-visible:border-brand focus-visible:bg-surface"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Logo</span>
            <button type="button" disabled className="rounded-lg border border-line px-3 py-2 text-sm text-ink-faint">
              Upload (coming soon)
            </button>
          </label>
        </div>
        {saving && <p className="px-5 pb-3 text-xs text-ink-faint">Saving…</p>}
        {saved && !saving && <p className="px-5 pb-3 text-xs text-brand">Saved.</p>}
      </Card>

      <Card title="Notification preferences" subtitle="Who gets alerted, tied to the existing alert types.">
        <ul className="space-y-2 px-5 pb-5">
          {(Object.keys(ALERT_LABELS) as AlertType[]).map((type) => (
            <li key={type} className="flex items-center justify-between border-t border-line pt-2 first:border-t-0 first:pt-0">
              <span className="text-sm text-ink">{ALERT_LABELS[type]}</span>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.notifyOn[type]}
                  onChange={(e) => void save({ notifyOn: { ...settings.notifyOn, [type]: e.target.checked } })}
                  className="h-4 w-4 rounded border-line text-brand focus-visible:ring-brand"
                />
                <span className="text-xs text-ink-soft">Notify</span>
              </label>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Billing & plan">
        <div className="px-5 pb-5">
          <span className="inline-block rounded-full bg-ink-faint/20 px-3 py-1 text-xs font-semibold text-ink-soft">Coming soon</span>
          <p className="mt-2 text-sm text-ink-soft">Billing and plan management aren't built this phase — this is a visual placeholder only.</p>
        </div>
      </Card>
    </div>
  );
}
