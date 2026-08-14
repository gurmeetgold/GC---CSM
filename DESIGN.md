# Design System

The visual identity for CS Copilot. Documented so the language is repeatable, not
vibes. The feeling we're after: **calm confidence** — a premium operator tool the
user opens every morning and a screen we demo to buyers. The data is the hero; the
design makes it legible and trustworthy.

## Identity in one line

A cool, considered slate-neutral canvas with a single confident **indigo** brand
accent, where the **health state (red/yellow/green) and the money numbers are the
two loudest things on every screen** — health via triple-encoding (color + shape +
label), money via the largest, tightest type in the app.

## Tokens (defined in `tailwind.config.js`, applied everywhere)

### Color
- **Neutrals (cool slate, not framework gray):** `ink` `#15202e` (primary text /
  hero numbers), `ink.soft` `#4c5768`, `ink.faint` `#8b95a6`; surfaces `#ffffff`
  (raised) over `#f3f6fb` (page); hairlines `line` `#e5eaf1`.
- **Brand — indigo `#3f4fbf`** (`.hover`, `.soft` tint, `.ring`): nav active state,
  primary buttons, links, focus rings. One accent, used with restraint.
- **Health (status) — the validated palette:** red `#d1344b`, yellow `#c77700`,
  green `#1f9d55`, plus a growth blue `#2563a8`, each with a soft tint for fills.
  Chosen by running the dataviz validator (`validate_palette.js`) — this trio
  **passes** the lightness band, chroma floor, normal-vision separation, and
  contrast checks; the one green↔yellow CVD warning is in the "legal with secondary
  encoding" band, which we satisfy everywhere (labels, dots, gaps).

### Type
- **Inter**, with `font-feature-settings` for the cleaner glyph variants.
- **Hero scale:** `text-hero` (2.5rem / 600 / −0.02em tracking) for the boldest money
  numbers (ARR at risk), `text-stat` (1.875rem) for secondary metrics (NRR, GRR).
- **Tabular figures** (`.nums`) on every number so columns align and values don't
  jitter on change.
- Headings carry −0.011em tracking for a tighter, more considered feel.

### Space, radius, elevation
- 4px spacing rhythm; generous card padding (`p-5`) and section gaps (`space-y-6/8`).
- Radius: `rounded-xl` (14px) cards, `rounded-lg` (10px) controls, `rounded-[3px]`
  chart marks.
- Elevation tokens: `shadow-card` (resting), `shadow-cardHover`, `shadow-lift` — soft,
  low-spread shadows tuned to the ink color, never heavy drop shadows.
- Motion: a single `ease-calm` curve; all transitions ≤200ms and killed under
  `prefers-reduced-motion`.

## Health state reads instantly (never color alone)

`RiskBadge` triple-encodes every state:
- **color** (red/yellow/green fill + tint),
- **shape/glyph** — `▲` red (alert), `●` yellow (watch), `✓` green (healthy),
- **text label** — "At risk" / "Watch" / "Healthy".

So the state survives colorblindness, grayscale, and a two-second scan. The same
trio drives the health-column badges, the leadership distribution, and the answer
results — one language across all screens.

## Charts (dataviz method)

Charts are clean and honest — no chartjunk, no 3-D, no gratuitous motion:
- **Portfolio health** — a horizontal stacked bar in *dollars* (what a leader cares
  about), 2px surface gaps between segments, in-segment value labels, and a
  labeled legend below. Part-to-whole done honestly.
- **Renewals by quarter** — a per-quarter bar with the at-risk portion in red and
  the on-track portion in muted ink; the timeline of exposure.
- **Churn reasons / book balance / health-by-CSM** — magnitude bars with rounded
  data-ends, recessive tracks, and labels/legends so identity is never color-alone.
- **Usage sparklines** on account rows — decorative trend context, aria-hidden, the
  real signal lives in the badge.

Every color-coded chart carries a label or legend; the green↔yellow pair (the one
CVD-flagged adjacency) always ships with a text label or count beside it.

## The money numbers are the hero

"$1.1M ARR at risk", NRR, GRR — the boldest, tightest type on their pages, in
`text-hero`/`text-stat` with tabular figures, and the red at-risk number gets a card
top-accent so a buyer's eye lands there first.

## Quality floor (met without being asked)

- **Responsive** — tables scroll inside their own container; cards reflow to one
  column on mobile; the body never scrolls horizontally.
- **Keyboard** — visible brand focus ring on every interactive element; rows are
  real buttons operable with Enter/Space; a skip-to-content link.
- **Contrast** — text meets WCAG AA on its surface; status fills pass 3:1; state
  never relies on color alone.
- **Reduced motion** — a global `prefers-reduced-motion` block neutralizes
  animation and smooth-scroll.
- **No layout shift** — skeleton loaders match final dimensions; numbers are
  tabular so they don't reflow when they change.

## Before / after — the three highest-impact changes

1. **The money became the hero.** Before, "ARR at risk" was a small colored word in a
   subtitle. Now it's a `text-hero` red number, top-right on the At-risk screen and in
   its own top-accented tile on Leadership — the first thing the eye lands on. This is
   the number that justifies the price, so it earns the boldest type in the app.
2. **Health state went from color-only-ish to triple-encoded.** Before, badges leaned
   on a colored dot + label. Now each state has a distinct **shape** (`▲`/`●`/`✓`),
   so red is unmistakable at a glance and the whole system survives colorblindness and
   grayscale — the single most important signal in the product made bulletproof.
3. **A real identity replaced framework defaults.** Before, generic grays and a
   default look. Now a cool slate palette, one deliberate indigo accent, a tuned
   elevation/radius system, a hero type scale with tabular figures, and honest
   dataviz — so moving between the CSM and leadership screens feels like one
   premium product a well-funded team shipped.
