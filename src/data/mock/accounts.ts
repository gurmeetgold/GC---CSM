import type { Account, Contact, Interaction, Segment, UsageSnapshot } from '../../domain';
import { daysAgo, daysAhead } from './referenceTime';

/**
 * 25 deterministic mock accounts, each engineered to exercise specific branches
 * of the signal engine. The `expected` risk level in the comment beside each is
 * asserted by the table-driven test in mockAccounts.test.ts — if a signal or
 * threshold changes, that test catches the drift.
 *
 * Archetype coverage:
 *   - healthy greens
 *   - single-weak-signal yellows (adoption / champion / support each alone)
 *   - stacked reds (critical, or ≥2 warnings, or renewal-amplified)
 *   - expansion / growth opportunities (green risk + positive signal)
 *   - cold-start accounts (thin data must never read red)
 *   - a renewal-proximate-but-healthy account (proximity alone ≠ risk)
 */

// --- builder ---------------------------------------------------------------

interface Spec {
  id: string;
  name: string;
  segment: Segment;
  arr: number;
  renewalInDays: number;
  seats: number;
  active: number;
  /** activeUsers at [120d, 90d, 60d, 30d] ago; omit for thin/empty history. */
  usage?: [number, number, number, number] | number[];
  championLastContactDays: number | null; // null = never; undefined handled below
  hasChampion?: boolean; // default true
  openTickets?: number;
  criticalTickets?: number;
  createdDaysAgo?: number; // default 500 (established)
  interactionSummaries?: string[];
}

function usageFrom(spec: Spec): UsageSnapshot[] {
  if (!spec.usage || spec.usage.length === 0) return [];
  const offsets = [120, 90, 60, 30];
  return spec.usage.map((activeUsers, i) => ({
    asOf: daysAgo(offsets[i] ?? 30 - i),
    activeUsers,
  }));
}

function contactsFrom(spec: Spec): Contact[] {
  const hasChampion = spec.hasChampion ?? true;
  const champion: Contact[] = hasChampion
    ? [
        {
          id: `${spec.id}-champ`,
          name: championNames[spec.id] ?? 'Alex Rivera',
          title: 'VP of Operations',
          isChampion: true,
          lastContactedAt:
            spec.championLastContactDays === null
              ? null
              : daysAgo(spec.championLastContactDays ?? 15),
        },
      ]
    : [];
  const secondary: Contact = {
    id: `${spec.id}-user`,
    name: 'Jordan Lee',
    title: 'Program Manager',
    isChampion: false,
    lastContactedAt: daysAgo(12),
  };
  return [...champion, secondary];
}

function interactionsFrom(spec: Spec): Interaction[] {
  const summaries = spec.interactionSummaries ?? [];
  const kinds: Interaction['kind'][] = ['call', 'email', 'meeting'];
  return summaries.map((summary, i) => ({
    id: `${spec.id}-int-${i}`,
    occurredAt: daysAgo(7 + i * 14),
    kind: kinds[i % kinds.length]!,
    summary,
  }));
}

const championNames: Record<string, string> = {
  contosopharma: 'Priya Nair',
  bestforyou: 'Marcus Bell',
  vanarsdel: 'Dana Whitfield',
  relecloud: 'Sofia Marin',
};

function build(spec: Spec): Account {
  return {
    id: spec.id,
    name: spec.name,
    segment: spec.segment,
    arr: spec.arr,
    renewalDate: daysAhead(spec.renewalInDays),
    licensedSeats: spec.seats,
    activeUsers: spec.active,
    usageHistory: usageFrom(spec),
    contacts: contactsFrom(spec),
    interactions: interactionsFrom(spec),
    openTickets: spec.openTickets ?? 1,
    criticalTickets: spec.criticalTickets ?? 0,
    createdAt: daysAgo(spec.createdDaysAgo ?? 500),
  };
}

// --- the book of business --------------------------------------------------

const SPECS: Spec[] = [
  // ---- Healthy greens ----
  {
    id: 'northwind', name: 'Northwind Traders', segment: 'enterprise', arr: 480_000,
    renewalInDays: 240, seats: 200, active: 150, usage: [140, 145, 148, 150],
    championLastContactDays: 10, openTickets: 3,
    interactionSummaries: ['QBR went well; expanding to a new region next quarter.', 'Champion confirmed strong internal adoption.'],
  }, // expected: green
  {
    id: 'contoso', name: 'Contoso Ltd', segment: 'mid_market', arr: 96_000,
    renewalInDays: 180, seats: 80, active: 60, usage: [58, 59, 60, 60],
    championLastContactDays: 20, openTickets: 2,
    interactionSummaries: ['Routine check-in, no concerns raised.'],
  }, // expected: green
  {
    id: 'fabrikam', name: 'Fabrikam Inc', segment: 'enterprise', arr: 300_000,
    renewalInDays: 300, seats: 120, active: 88, usage: [85, 86, 87, 88],
    championLastContactDays: 15, openTickets: 1,
    interactionSummaries: ['Team trained on new reporting module.'],
  }, // expected: green
  {
    id: 'tailspin', name: 'Tailspin Toys', segment: 'smb', arr: 24_000,
    renewalInDays: 150, seats: 25, active: 18, usage: [17, 17, 18, 18],
    championLastContactDays: 30, openTickets: 0,
    interactionSummaries: ['Support resolved a minor billing question.'],
  }, // expected: green
  {
    id: 'schooloffine', name: 'School of Fine Art', segment: 'smb', arr: 22_000,
    renewalInDays: 130, seats: 20, active: 15, usage: [14, 14, 15, 15],
    championLastContactDays: 22, openTickets: 1,
    interactionSummaries: ['Renewed enthusiasm after onboarding refresh.'],
  }, // expected: green
  {
    id: 'worldwide', name: 'World Wide Importers', segment: 'enterprise', arr: 420_000,
    renewalInDays: 280, seats: 250, active: 180, usage: [175, 178, 179, 180],
    championLastContactDays: 14, openTickets: 4,
    interactionSummaries: ['Executive sponsor reaffirmed multi-year commitment.'],
  }, // expected: green
  {
    id: 'wideworld', name: 'Wide World Traders', segment: 'mid_market', arr: 78_000,
    renewalInDays: 175, seats: 55, active: 30, usage: [29, 30, 30, 30],
    championLastContactDays: 40, openTickets: 5,
    interactionSummaries: ['Adoption steady near the healthy floor; watch utilization.'],
  }, // expected: green (54.5% adoption, just above the 50% floor)

  // ---- Renewal-proximate but healthy: proximity alone must NOT read as risk ----
  {
    id: 'humongous', name: 'Humongous Insurance', segment: 'enterprise', arr: 340_000,
    renewalInDays: 50, seats: 140, active: 110, usage: [106, 108, 109, 110],
    championLastContactDays: 30, openTickets: 3,
    interactionSummaries: ['Renewal paperwork in motion; account healthy.'],
  }, // expected: green (renews in 50d but nothing else fires → renewal_risk stays silent)

  // ---- Expansion / growth opportunities (green risk + growth signal) ----
  {
    id: 'adventureworks', name: 'Adventure Works', segment: 'mid_market', arr: 120_000,
    renewalInDays: 200, seats: 100, active: 96, usage: [80, 85, 90, 96],
    championLastContactDays: 12, openTickets: 1,
    interactionSummaries: ['Usage climbing fast; asked about additional seats.', 'New team onboarded in the marketing org.'],
  }, // expected: green + growth_opportunity
  {
    id: 'wingtip', name: 'Wingtip Toys', segment: 'enterprise', arr: 360_000,
    renewalInDays: 220, seats: 150, active: 150, usage: [120, 130, 140, 150],
    championLastContactDays: 8, openTickets: 2,
    interactionSummaries: ['At seat capacity — expansion conversation opened.', 'Two new departments requesting access.'],
  }, // expected: green + growth_opportunity (at limit)
  {
    id: 'coho', name: 'Coho Vineyard', segment: 'smb', arr: 26_000,
    renewalInDays: 100, seats: 25, active: 23, usage: [18, 20, 22, 23],
    championLastContactDays: 16, openTickets: 0,
    interactionSummaries: ['Power users pushing near the seat ceiling.'],
  }, // expected: green + growth_opportunity

  // ---- Single-weak-signal yellows ----
  {
    id: 'proseware', name: 'Proseware Inc', segment: 'mid_market', arr: 72_000,
    renewalInDays: 190, seats: 100, active: 42, usage: [44, 44, 43, 42],
    championLastContactDays: 20, openTickets: 2,
    interactionSummaries: ['Only part of the org has rolled out; adoption stalling.'],
  }, // expected: yellow (adoption gap only)
  {
    id: 'litware', name: 'Litware Inc', segment: 'smb', arr: 30_000,
    renewalInDays: 160, seats: 40, active: 28, usage: [27, 27, 28, 28],
    championLastContactDays: 60, openTickets: 1,
    interactionSummaries: ['Champion has gone quiet since the reorg.'],
  }, // expected: yellow (champion silence only)
  {
    id: 'fourthcoffee', name: 'Fourth Coffee', segment: 'smb', arr: 20_000,
    renewalInDays: 170, seats: 30, active: 21, usage: [20, 20, 21, 21],
    championLastContactDays: 25, openTickets: 10,
    interactionSummaries: ['Spike in how-to tickets around the new UI.'],
  }, // expected: yellow (support volume only)
  {
    id: 'blueyonder', name: 'Blue Yonder Airlines', segment: 'enterprise', arr: 260_000,
    renewalInDays: 75, seats: 110, active: 70, usage: [90, 85, 82, 70],
    championLastContactDays: 50, openTickets: 6,
    interactionSummaries: ['Champion travel-heavy; hard to reach lately.'],
  }, // expected: yellow (champion silence; 17.6% usage dip is below the 20% decline bar)
  {
    id: 'fabrikamresidences', name: 'Fabrikam Residences', segment: 'smb', arr: 16_000,
    renewalInDays: 120, seats: 15, active: 4, usage: [5, 4, 4, 4],
    championLastContactDays: 30, openTickets: 1,
    interactionSummaries: ['Rollout stalled at a single team.'],
  }, // expected: yellow (adoption gap only)

  // ---- Stacked reds ----
  {
    id: 'contosopharma', name: 'Contoso Pharma', segment: 'enterprise', arr: 250_000,
    renewalInDays: 200, seats: 100, active: 62, usage: [95, 90, 80, 62],
    championLastContactDays: 15, openTickets: 3,
    interactionSummaries: ['Sharp usage drop after a key team switched tools.', 'Escalation raised with the exec sponsor.'],
  }, // expected: red (usage decline, critical)
  {
    id: 'graphicdesign', name: 'Graphic Design Institute', segment: 'mid_market', arr: 84_000,
    renewalInDays: 140, seats: 60, active: 24, usage: [26, 25, 24, 24],
    championLastContactDays: 70, openTickets: 3,
    interactionSummaries: ['Low adoption and champion has gone dark.'],
  }, // expected: red (adoption + champion silence = 2 warnings)
  {
    id: 'vanarsdel', name: 'VanArsdel Ltd', segment: 'enterprise', arr: 200_000,
    renewalInDays: 30, seats: 100, active: 40, usage: [41, 40, 40, 40],
    championLastContactDays: 20, openTickets: 4,
    interactionSummaries: ['Renewal a month out with weak adoption — needs a save plan.'],
  }, // expected: red (renewal proximity amplifies adoption gap)
  {
    id: 'alpineski', name: 'Alpine Ski House', segment: 'mid_market', arr: 110_000,
    renewalInDays: 180, seats: 70, active: 50, usage: [49, 49, 50, 50],
    championLastContactDays: 18, openTickets: 5, criticalTickets: 2,
    interactionSummaries: ['Two sev-1 outages this month; trust is shaken.'],
  }, // expected: red (critical support tickets)
  {
    id: 'bestforyou', name: 'Best For You Organics', segment: 'enterprise', arr: 220_000,
    renewalInDays: 90, seats: 120, active: 55, usage: [92, 85, 70, 55],
    championLastContactDays: 80, openTickets: 4,
    interactionSummaries: ['Everything trending the wrong way — usage, adoption, engagement.', 'Champion unreachable for weeks.'],
  }, // expected: red (usage decline + adoption + champion silence)
  {
    id: 'relecloud', name: 'Relecloud', segment: 'mid_market', arr: 90_000,
    renewalInDays: 45, seats: 50, active: 32, usage: [31, 31, 32, 32],
    championLastContactDays: 65, openTickets: 2,
    interactionSummaries: ['Renewal near and the champion has gone silent.'],
  }, // expected: red (renewal proximity amplifies champion silence)
  {
    id: 'margiestravel', name: "Margie's Travel", segment: 'smb', arr: 28_000,
    renewalInDays: 40, seats: 30, active: 10, usage: [11, 10, 10, 10],
    championLastContactDays: 20, openTickets: 2,
    interactionSummaries: ['Small deployment, renewal looming, adoption thin.'],
  }, // expected: red (renewal proximity amplifies adoption gap)

  // ---- Cold-start: thin data must never read red ----
  {
    id: 'treyresearch', name: 'Trey Research', segment: 'smb', arr: 18_000,
    renewalInDays: 350, seats: 40, active: 6, usage: [6],
    championLastContactDays: null, createdDaysAgo: 15, openTickets: 0,
    interactionSummaries: [],
  }, // expected: green (15 days old, one snapshot — every data-dependent signal abstains)
  {
    id: 'lucerne', name: 'Lucerne Publishing', segment: 'mid_market', arr: 54_000,
    renewalInDays: 340, seats: 60, active: 12, usage: [],
    championLastContactDays: 18, createdDaysAgo: 20, openTickets: 1,
    interactionSummaries: ['Kickoff call held; rollout just beginning.'],
  }, // expected: green (20 days old, no usage history yet — cold-start guard holds)
];

export const MOCK_ACCOUNTS: Account[] = SPECS.map(build);
