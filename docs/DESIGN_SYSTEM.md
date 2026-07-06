# Nonrevy Design System Audit

_Last updated: 2026-07-06 19:32 UTC_

This audit documents the current Nonrevy visual system so Product/UX polish can move safely without changing itinerary generation, scoring, provider integrations, or standby-availability legal wording.

## Sprint scope

- Audited existing colors, spacing, card styles, badges, typography, and mobile layout patterns.
- Created a reusable design-system plan for future frontend polish.
- Preserved current appearance.
- Made no UI, app-logic, provider, itinerary-generation, or scoring changes.
- Deferred token/class centralization because the current CSS already has root `--nonrevy-*` tokens plus a broad theme implementation layer; further centralization should happen only with screenshot coverage or a focused visual QA pass.

## Current design direction

The current visual direction is a premium dark travel interface: midnight blue surfaces, aqua/sky-blue action emphasis, glassy cards, rounded capsules, conservative warning states, and dense itinerary information optimized for mobile scanning.

The app already describes this implementation in CSS as: Midnight Blue / Apple x Flighty x Airbnb.

## Existing color tokens

Defined in `app/globals.css` under `:root`:

| Token | Current value | Role |
| --- | --- | --- |
| `--nonrevy-bg` | `#071424` | primary app background |
| `--nonrevy-bg-deep` | `#04101f` | deepest background / page base |
| `--nonrevy-bg-soft` | `#0b1b31` | softened background gradient stop |
| `--nonrevy-card` | `rgba(13, 29, 52, 0.74)` | glass card surface |
| `--nonrevy-card-strong` | `rgba(15, 35, 63, 0.9)` | stronger panel surface |
| `--nonrevy-border` | `rgba(132, 184, 255, 0.18)` | default blue-tinted border |
| `--nonrevy-border-strong` | `rgba(125, 211, 252, 0.34)` | stronger border/focus emphasis |
| `--nonrevy-text` | `#f6f9ff` | primary text |
| `--nonrevy-text-muted` | `#9fb3cb` | secondary text |
| `--nonrevy-accent-blue` | `#2f9bff` | primary action blue |
| `--nonrevy-accent-blue-bright` | `#60c7ff` | bright aqua accent |
| `--nonrevy-success` | `#32d583` | positive/success status |
| `--nonrevy-warning` | `#f5c542` | caution/warning status |
| `--nonrevy-danger` | `#fb923c` | danger/error/disruption status |
| `--nonrevy-shadow` | `0 20px 70px rgba(0, 8, 22, 0.36)` | primary elevated shadow |
| `--nonrevy-glass-blur` | `blur(22px) saturate(145%)` | glass panel blur |

Additional aliases appear later in `app/globals.css`:

- `--nonrevy-sky` → `--nonrevy-accent-blue`
- `--nonrevy-aqua` → `--nonrevy-accent-blue-bright`
- `--nonrevy-line` → `--nonrevy-border`
- `--nonrevy-panel` → `--nonrevy-card`
- `--nonrevy-panel-strong` → `--nonrevy-card-strong`
- `--nonrevy-purple` → `#7c8cff`
- `--nonrevy-pink` → `#fb7185`
- `--nonrevy-green` → `--nonrevy-success`
- `--nonrevy-gold` → `--nonrevy-warning`
- `--nonrevy-muted` → `--nonrevy-text-muted`

### Color audit notes

- The semantic root tokens are good enough for near-term Product/UX work.
- Some local hard-coded Tailwind-like colors remain in component-specific CSS blocks, especially older navigation, beta feedback, compact rows, and mobile itinerary sections.
- Future cleanup should convert repeated hard-coded values to existing tokens only when visual parity can be verified.

## Spacing patterns

Current spacing is mostly direct CSS values plus responsive `clamp()` values:

- tight mobile gaps: `4px`, `5px`, `6px`, `7px`, `8px`
- common internal padding: `8px`, `9px`, `10px`, `12px`, `14px`, `16px`
- card/panel padding: `18px`, `20px`, `22px`, `24px`
- responsive shell padding: `clamp(8px, 3vw, 14px)`, `clamp(16px, 4vw, 32px)`
- mobile form input height: `clamp(42px, 11.6vw, 54px)`

### Proposed spacing scale

Use this scale for future work, without mass refactors yet:

| Token candidate | Value | Use |
| --- | --- | --- |
| `--space-1` | `4px` | smallest dense row gaps |
| `--space-2` | `6px` | compact chip/metadata gaps |
| `--space-3` | `8px` | default small gap |
| `--space-4` | `10px` | compact mobile padding |
| `--space-5` | `12px` | form/control padding |
| `--space-6` | `16px` | default card spacing |
| `--space-7` | `20px` | larger panel padding |
| `--space-8` | `24px` | desktop card padding |

Do not introduce these globally until a UI sprint explicitly validates visual parity.

## Radius patterns

Observed radius values:

- pills/actions/chips: `999px`
- compact rows/details: `4px`, `5px`, `7px`, `8px`, `9px`, `10px`, `11px`, `12px`
- standard controls/cards: `13px`, `14px`, `16px`, `18px`
- larger premium panels: `20px`, `22px`, `24px`, `26px`, `28px`, `34px`
- responsive card radius: `clamp(18px, 5vw, 26px)`

### Proposed radius scale

| Token candidate | Value | Use |
| --- | --- | --- |
| `--radius-xs` | `6px` | tiny labels and compact metadata |
| `--radius-sm` | `8px` | compact row internals |
| `--radius-md` | `12px` | form fields and detail panels |
| `--radius-lg` | `16px` | standard cards/controls |
| `--radius-xl` | `22px` | premium panels |
| `--radius-2xl` | `24px` | itinerary cards / large mobile cards |
| `--radius-pill` | `999px` | badges, chips, primary pill actions |

## Card and panel styles

Current card system:

- glassy midnight gradient surfaces
- blue-tinted borders
- deep blue shadows
- inset one-pixel highlight for premium depth
- backdrop blur for app shell panels
- stronger border/background on selected or hovered itinerary rows

Important current card classes:

- `app-shell`
- `nonrevy-plan-shell`
- `nonrevy-results-shell`
- `nonrevy-planner-card`
- `nonrevy-flight-board`
- `nonrevy-flight-board-row`
- `nonrevy-production-empty`
- `nonrevy-premium-details`
- `nonrevy-itinerary-intel-panel`
- `nonrevy-community-loads__card`
- `nonrevy-home__search-card`
- `nonrevy-beta-feedback__card`

### Card guidance

- Preserve glassy depth and conservative blue palette.
- Avoid flattening itinerary cards until trust labels and route details have browser screenshot coverage.
- Keep selected/expanded states visually stronger but not visually equivalent to confirmed availability.

## Badge, chip, and status patterns

Current patterns:

- Primary actions use aqua-to-blue gradients.
- Secondary actions use translucent midnight surfaces with blue borders.
- Pills/chips use high border radius, compact padding, strong font weight, and muted text.
- Warning states use `--nonrevy-warning` and yellow/brown translucent backgrounds.
- Success/danger colors are semantic, but must not imply standby clearance or confirmed availability.

Important badge/action classes:

- `nonrevy-primary-action`
- `nonrevy-secondary-action`
- `nonrevy-row-action-pill`
- `nonrevy-home__chip`
- `nonrevy-home__quick-pill`
- `nonrevy-flight-board-row__carrier-badge`
- `nonrevy-flight-board-row__availability`
- `nonrevy-search-trust-receipt__topline`

### Badge guidance

- Confidence badges should communicate evidence quality, not trip success certainty.
- Availability badges must preserve legal/conservative wording around standby availability.
- Framework, stored, cached, demo, historical, or advisory states must not look like current live availability.

## Typography patterns

Current typography:

- Base body font: `Arial, Helvetica, sans-serif`, then later app-level `var(--font-geist-sans), Inter, ui-sans-serif, system-ui, sans-serif`.
- Logo/brand font: `var(--font-brooklyn-display), Impact, "Arial Black", "Trebuchet MS", sans-serif`.
- Headings use responsive clamps, e.g. `h1` up to `5.1rem` and mobile-specific clamps.
- Dense itinerary rows use small text from about `0.58rem` to `1.18rem`, often with heavy weights from `800` to `1000`.
- Uppercase micro-labels use wide letter spacing and strong font weight.

### Typography guidance

- Preserve compact mobile hierarchy: route and time first, supporting evidence second.
- Reduce copy density through disclosure rather than smaller text.
- Do not use louder typography to make advisory signals feel definitive.
- Future i18n work should watch for overflow in uppercase labels, pills, and compact row metadata.

## Mobile layout patterns

Current mobile patterns:

- shell padding narrows to `8px`–`14px`
- cards reduce radius to `16px`–`18px`
- itinerary rows become compact single-column content blocks
- route/time/fare evidence uses dense stacked metadata
- chips wrap and truncate with ellipsis
- inputs use mobile-safe minimum heights and `16px` font sizing to avoid iOS zoom
- route-map and compact result areas use horizontal overflow/scroll patterns where needed

### Mobile guidance

- Prioritize route, date/time, source/freshness, and warning language above secondary intelligence.
- Keep complete leg display intact; never hide generated legs for aesthetics.
- Use progressive disclosure for trust details, not omission.
- Maintain tap targets of at least roughly `34px` for compact controls and preferably `42px` for primary actions.

## Accessibility notes

Existing positive patterns:

- reduced-motion media query is present
- focus-visible styles exist for form controls/actions
- origin coverage notice uses `aria-live="polite"`
- some expandable/details patterns preserve disclosure semantics

Future checks:

- confirm color contrast for muted blue-gray text on glass backgrounds
- ensure compact action pills have descriptive accessible names
- avoid relying on color alone for confidence/warning meaning
- validate keyboard expansion and focus order on itinerary cards
- ensure i18n-expanded copy does not break focusable controls or card layout

## Reusable design-system plan

### Phase 1 — Documentation and inventory

Status: complete for this sprint.

- Inventory root color tokens, aliases, card patterns, spacing, radius, typography, badges, and mobile patterns.
- Document Product/UX guardrails.
- Avoid UI changes until visual verification is available.

### Phase 2 — Token naming without visual drift

Future sprint.

- Add spacing and radius tokens only if the resulting CSS output remains visually equivalent.
- Prefer alias tokens over direct value replacement.
- Change one pattern family at a time: cards, then badges, then forms, then mobile rows.
- Run screenshot/browser verification when available.

### Phase 3 — Component-level consolidation

Future sprint.

- Consolidate repeated card/panel classes into shared utility classes only where class reuse does not alter specificity.
- Standardize badge variants for neutral, advisory, warning, danger, and unavailable states.
- Keep current legal wording and source/freshness labels unchanged.

### Phase 4 — Premium redesign exploration

Future sprint, not implementation.

- Explore a premium Nonrevy visual direction with calm dark surfaces, air-travel map affordances, crisp hierarchy, and high trust visibility.
- Prototype outside production UI first.
- Do not merge redesign changes without screenshot coverage, accessibility review, and itinerary-integrity checks.

## Safe centralization decision

No CSS or UI centralization was performed in this sprint.

Reasoning:

- Existing `app/globals.css` already centralizes the primary color, shadow, and glass tokens.
- Many repeated values are intertwined with responsive/mobile overrides and `!important` specificity.
- Refactoring those values without browser screenshot coverage could cause visual drift.
- The safest Product/UX move is to document the current system and queue a focused token consolidation sprint with validation.

## Recommended next Product/UX sprint

Mobile itinerary card polish.

Suggested scope:

- Use this audit as the source of truth.
- Improve scan hierarchy only within `app/plan` UI/shared UI components.
- Preserve route leg display, source/freshness labels, standby legal wording, and confidence semantics.
- Do not touch provider integrations, itinerary generation, or scoring.
