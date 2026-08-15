import { useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { adminApi } from './adminApi';
import type { IntegrationCard, IntegrationKind } from '../../admin/integrationsStore';

const STATUS_META: Record<IntegrationCard['status'], { label: string; color: string }> = {
  connected: { label: 'Connected', color: 'bg-risk-green text-white' },
  cold_start: { label: 'Cold start', color: 'bg-risk-yellow text-white' },
  not_connected: { label: 'Not connected', color: 'bg-ink-faint/30 text-ink-soft' },
  error: { label: 'Error', color: 'bg-risk-red text-white' },
};

export function IntegrationsPage() {
  const [cards, setCards] = useState<IntegrationCard[] | null>(null);
  const [busy, setBusy] = useState<IntegrationKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { integrations } = await adminApi.listIntegrations();
    setCards(integrations);
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggle(card: IntegrationCard) {
    setBusy(card.kind);
    setError(null);
    try {
      if (card.status === 'connected' || card.status === 'cold_start') {
        await adminApi.disconnectIntegration(card.kind);
      } else {
        await adminApi.connectIntegration(card.kind);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  if (!cards) return <p className="text-sm text-ink-soft">Loading integrations…</p>;

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-lg border border-risk-red/40 bg-risk-redBg px-3 py-2 text-sm text-risk-red">{error}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => {
          const meta = STATUS_META[card.status];
          const connected = card.status === 'connected' || card.status === 'cold_start';
          return (
            <Card key={card.kind} title={card.label} className="flex flex-col">
              <div className="flex items-center justify-between px-5 pb-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                {card.lastSyncedAt && (
                  <span className="text-xs text-ink-faint">Last synced {new Date(card.lastSyncedAt).toLocaleString()}</span>
                )}
              </div>
              <div className="px-5 pb-4">
                <p className="text-sm text-ink-soft">{card.powers}</p>
                {!card.liveFlowAvailable && (
                  <p className="mt-1 text-xs text-ink-faint">
                    No live connect flow is built for this integration yet — connecting here simulates the state for demos only.
                  </p>
                )}
                <button
                  type="button"
                  disabled={busy === card.kind}
                  onClick={() => void toggle(card)}
                  className={`mt-3 rounded-lg px-3.5 py-2 text-sm font-semibold disabled:opacity-60 ${
                    connected
                      ? 'border border-line bg-surface text-ink-soft hover:text-ink'
                      : 'bg-brand text-white hover:bg-brand-hover'
                  }`}
                >
                  {busy === card.kind ? 'Working…' : connected ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
