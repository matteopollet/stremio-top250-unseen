# DESIGN.md — Top 250 Unseen

Visual world: **emission-line rail**. The product's mechanism — subtracting
watched films from a canonical ranked list — is drawn as a calibrated
continuum: 250 hairlines on a single rail. Rank is position; state is line
form, never hue alone. The rail is a quiet signature element — compact and
persistent — while the task content dominates.

Applies to the `/configure` surface (`src/http/configure-html.ts`,
`src/configure-page/main.ts` → `public/configure.js`).

## Grammar

- **The rail** is a slim sticky header (~66px): ranks 1→250 left to right,
  scale ticks at 1 · 50 · 100 · 150 · 200 · 250. Every film is one 1px
  vertical hairline anchored above the scale. It witnesses the work; it does
  not compete with it. An always-visible **legend row** beneath it decodes
  every line state in plain words, and every state is *also* named in the
  content itself ("marked seen", "counts as seen") — the rail never carries
  meaning alone.
- **Plates** hang beneath in reading sequence (Import → Live updates → Match
  → Review → Install). The active plate is open; completed plates collapse to
  stubs whose headers carry a short residue ("2 files · 10 entries",
  "6 struck · 2 contested").
- **Line states** (the state vocabulary):
  - live/unseen — full-height solid bone line
  - struck by CSV — collapsed stub (`scaleY(.32)`, dimmed)
  - struck by hand — line kept tall, dimmed, crossed by a 45° slash
  - contested — **doubled sodium-dashed line** (589nm), awaits ruling
  - next film — **doubled hydrogen-alpha line** (656nm), taller than all
- **The scan** is the signature motion: on match, a 486nm cyan hairline sweeps
  the rail and matched lines collapse behind it with rank-staggered delays.
- **Controls** are line-forms: a checkbox is a stub that rises to a full line
  when struck. Primary actions are solid bone fill; secondary actions are
  hairline-outlined ghosts. No rounded corners.

## Palette

Color exists only as hairlines and marks. Everything else is charcoal, ash,
bone.

| Token | Value | Use |
|---|---|---|
| ground | `#0D0D10` → `#131317`, faint procedural banding | page + rail continuum |
| `--plate` | `#16161B` | plate surfaces |
| `--well` | `#101014` | inputs, drop zone, list |
| `--bone` | `#E9E5D8` | primary ink, live lines, primary buttons |
| `--bone-72/50/32/16` | rgba steps | hierarchy by ink |
| `--w486` | `#29C8E8` | scan sweep, text caret |
| `--w589` | `#FFC53D` | contested lines + marks, `::selection` |
| `--w656` | `#FF3B30` | next-film outraker, error ticks |

## Type

**Barlow** (DIN-descended) throughout. Hierarchy by size, weight and ink —
tracking is reserved for the wordmark only.

- 11.5px micro — scale numerals, residues, legend counts
- 13px — secondary text, metadata, hints
- 15px — body, controls (default)
- 16px — lede, summary, entry titles
- 17px — plate titles
- 20–32px — count figures and the next-film climax

`font-feature-settings: "tnum"` everywhere — all numerals are instrument
readings. Copy is sentence case.

## Interaction

- Tick a strike-list row → its rail line is crossed instantly; the tally
  ("9 of 250 struck · 241 remain") and legend counts update live.
- Hover/focus a row → its rail line brightens (opacity only — interaction
  never changes a line's size; size is semantic).
- Contested entries: the logged title + year sits left, each possible Top 250
  film sits right as a pickable card with its year — the mismatch is visible
  at a glance; match confidence lives on the title attribute, not the layout.
- Confirm → unruled contested lines return to live; the first surviving film
  becomes the doubled red outraker and the rail scrolls it into view.
- `prefers-reduced-motion` → all sweeps and transitions become instant.

## Accessibility

- The rail is `aria-hidden`; a `role="status"` live region carries its truth
  ("9 of 250 struck, 1 contested, 241 remain").
- Every control is a real `<input>`/`<button>`; the strike mark is a styled
  sibling — keyboard and screen readers get native semantics.
- Bone on charcoal ≈ 13:1; secondary ≈ 6:1; state never relies on hue.
- `:focus-visible` draws a 1px bone outline, offset 3px. Rows ≥44px targets.

## Responsive

- ≤640px: the rail keeps line density and scrolls horizontally inside its
  window (band shortens, type never does); it auto-scrolls to the next film
  on install. Contested rows stack vertically. Max content width 840px.

## Anti-goals

No cards-with-icons, no hero metrics, no gradient text, no rounded pills, no
tracked-uppercase everywhere, no technical readouts as decoration. Emphasis
comes from size, weight, ink step — or a line form.
