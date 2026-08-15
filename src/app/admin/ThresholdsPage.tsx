import { useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { adminApi } from './adminApi';
import { DEFAULT_THRESHOLDS, type ThresholdConfig, type ThresholdOverride } from '../../domain';

type Key = keyof ThresholdConfig;

const FIELD_LABELS: Record<string, string> = {
  windowDays: 'Window (days)', dropPct: 'Drop (%)', minActivePctOfSeats: 'Min active seats (%)',
  maxDaysSinceContact: 'Max days since contact', withinDays: 'Within (days)', criticalWithinDays: 'Critical within (days)',
  highArr: 'High ARR ($)', criticalConcurrentRisks: 'Critical concurrent risks (#)', maxOpenTickets: 'Max open tickets',
  maxCriticalTickets: 'Max critical tickets', nearLimitPctOfSeats: 'Near-limit seats (%)', recentWindowDays: 'Recent window (days)',
  priorWindowDays: 'Prior window (days)', minPriorTouchpoints: 'Min prior touchpoints', maxMedianReplyHours: 'Max median reply (hrs)',
  minReplyRatePct: 'Min reply rate (%)', minPriorUses: 'Min prior uses', abandonedMaxUses: 'Abandoned at (uses)',
  minBaselineLoginsPerUser: 'Min baseline logins/user', targetActivationDays: 'Target activation (days)',
  staleUntilDays: 'Stale until (days)', minUsageSnapshots: 'Min usage snapshots', minAgeDays: 'Min account age (days)',
};

const EXPLANATIONS: Record<Key, { title: string; blurb: string }> = {
  usageDecline: { title: 'Usage decline', blurb: 'Fires when active-user count drops more than this % over the window. Firing looks like: a real usage cliff, not noise.' },
  adoptionGap: { title: 'Adoption gap', blurb: 'Fires when active users fall below this % of licensed seats (after the cold-start window). Firing looks like: seats paid for but not adopted.' },
  championSilence: { title: 'Champion silence', blurb: 'Fires when the freshest champion contact is older than this many days. Firing looks like: your one warm relationship has gone quiet.' },
  renewalRisk: { title: 'Renewal risk (jeopardy)', blurb: 'Renewal proximity only becomes risk when stacked with another firing signal. Tune the window, the "critical" tier proximity, the ARR bar, and how many concurrent risks force critical.' },
  supportStrain: { title: 'Support strain', blurb: 'Fires when open or critical ticket counts exceed these caps. Firing looks like: the help desk is genuinely overloaded for this account.' },
  growth: { title: 'Growth opportunity', blurb: 'Fires (as an opportunity, never risk) when active users approach this % of licensed seats — a seat-expansion conversation cue.' },
  engagementCadence: { title: 'Engagement cadence', blurb: 'Fires when recent touchpoints dropped this % vs. the prior window (given enough prior activity to compare against). Firing looks like: engagement quietly cooling.' },
  emailResponsiveness: { title: 'Email responsiveness', blurb: 'Fires when reply latency or reply rate crosses these bars over the window. Firing looks like: the customer has stopped responding promptly.' },
  featureDepth: { title: 'Feature depth', blurb: 'Fires when a feature with meaningful prior use drops to near-zero. Firing looks like: real feature abandonment, not a light user.' },
  stickiness: { title: 'Stickiness', blurb: 'Fires when logins-per-active-user falls this % below a real baseline. Firing looks like: users are still "active" but barely opening the product.' },
  onboarding: { title: 'Onboarding stalled', blurb: 'Fires for a not-yet-activated account past the target activation window (but still within the new-account horizon). Firing looks like: onboarding has genuinely stalled, not "still early".' },
  coldStart: { title: 'Cold-start guard', blurb: 'Accounts below this usage-snapshot count or younger than this many days are treated as data-thin — data-dependent signals abstain rather than guess.' },
};

export function ThresholdsPage() {
  const [override, setOverride] = useState<ThresholdOverride | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, number>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Key | null>(null);

  async function load() {
    const res = await adminApi.getThresholds();
    setOverride(res.override);
  }

  useEffect(() => {
    void load();
  }, []);

  function effective(key: Key): Record<string, number> {
    const draft = drafts[key];
    if (draft) return draft;
    return { ...DEFAULT_THRESHOLDS[key], ...(override?.[key] ?? {}) } as Record<string, number>;
  }

  function setField(key: Key, field: string, value: number) {
    setDrafts((d) => ({ ...d, [key]: { ...effective(key), [field]: value } }));
  }

  async function save(key: Key) {
    setSaving(key);
    setError(null);
    try {
      const res = await adminApi.setThresholds({ [key]: effective(key) } as ThresholdOverride);
      setOverride(res.override);
      setDrafts((d) => {
        const { [key]: _removed, ...rest } = d;
        return rest;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  async function reset(key: Key) {
    setSaving(key);
    setError(null);
    try {
      const res = await adminApi.resetThreshold(key);
      setOverride(res.override);
      setDrafts((d) => {
        const { [key]: _removed, ...rest } = d;
        return rest;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  if (!override) return <p className="text-sm text-ink-soft">Loading thresholds…</p>;

  const keys = Object.keys(DEFAULT_THRESHOLDS) as Key[];

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        Changes here become configuration the signal engine reads — the engine's logic never changes. Each control shows the
        current value, the shipped default, and lets you reset independently.
      </p>
      {error && (
        <p role="alert" className="rounded-lg border border-risk-red/40 bg-risk-redBg px-3 py-2 text-sm text-risk-red">{error}</p>
      )}
      {keys.map((key) => {
        const current = effective(key);
        const shipped = DEFAULT_THRESHOLDS[key] as unknown as Record<string, number>;
        const isOverridden = !!override[key];
        const isDirty = !!drafts[key];
        return (
          <Card key={key} title={EXPLANATIONS[key].title} subtitle={EXPLANATIONS[key].blurb}>
            <div className="flex flex-wrap items-end gap-4 px-5 pb-5">
              {Object.keys(shipped).map((field) => (
                <label key={field} className="block">
                  <span className="mb-1 block text-xs font-medium text-ink-soft">{FIELD_LABELS[field] ?? field}</span>
                  <input
                    type="number"
                    value={current[field]}
                    onChange={(e) => setField(key, field, Number(e.target.value))}
                    className="w-32 rounded-lg border border-line bg-surface-sunken px-3 py-1.5 text-sm text-ink nums focus-visible:border-brand focus-visible:bg-surface"
                  />
                  <span className="mt-0.5 block text-[11px] text-ink-faint">default {shipped[field]}</span>
                </label>
              ))}
              <div className="flex gap-2 pb-0.5">
                <button
                  type="button"
                  disabled={saving === key || !isDirty}
                  onClick={() => void save(key)}
                  className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {saving === key ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  disabled={saving === key || (!isOverridden && !isDirty)}
                  onClick={() => void reset(key)}
                  className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink disabled:opacity-40"
                >
                  Reset to default
                </button>
                {isOverridden && !isDirty && <span className="self-center text-xs font-medium text-brand">Customized</span>}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
