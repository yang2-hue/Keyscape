# Design System — Keyscape

> Read this before changing anything in `src/style.css` or `src/App.tsx`.
> Format follows the [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) DESIGN.md convention: drop it in the repository root and a coding agent can generate UI that belongs to this project.

## 1. Visual Theme & Atmosphere

Keyscape is an exhibition, not an app. Three keycaps sit on a paper field, each one a
working diorama with its own weather and hour, and the piece runs itself on a twenty
second loop. The 3D scene is the entire visual content; the interface exists to say
*what you are looking at* and *where in the loop you are*, then get out of the way.

The chrome is built the way a museum wall label is built: one edge rule, one line of
type at reading size, a scale of hairlines under it, and nothing enclosed in a box.
No panel, no card, no shadow, no accent colour. Paper and ink are the only two
colours, and both belong to the *state* — a dawn sky is a different paper than a
night sea — so the chrome is never "on top of" the scene, it is printed on it.

The atmosphere is editorial and quiet, closer to a film title card than to a product
UI. Density is low, whitespace is large, and every element is one of exactly four
sizes. What the layout refuses to do is the important half of the design: there is no
title block, no caption over the artwork, no settings sheet, no invented metadata.

**Key characteristics**

- Artwork dominant; chrome at the four edges, never over the object
- Two colours per state (paper, ink) plus a hairline derived from ink
- One display size, one reading size, two label sizes — nothing between 15px and 11px
- Monospace reserved for numerals (loop position, work ordinal), never for prose
- Rules instead of borders; a gradient scrim instead of a panel; zero shadows
- 20 s auto-cycle, damped cross-fades between states, `prefers-reduced-motion` respected

## 2. Color Palette & Roles

Every surface follows the active state. The `.gallery` element carries the state
class (`weather-clear`, `night`, `observatory-dusk`, `space-noon`, …) and re-declares
the same token names; no component hard-codes a colour.

### Base tokens (`:root`, clear morning)

| Token | Value | Role |
|---|---|---|
| `--paper` | `#f4f4f2` | Page field, scrim base, plate ground |
| `--ink` | `#141516` | Wordmark, current moment, active work, icons |
| `--ink-muted` | `#5c6065` | Labels: inactive works, gesture hint, loading text |
| `--ink-faint` | `#73787d` | Elapsed segments of the loop scale |
| `--hairline` | `#181a1c22` | Internal dividers |
| `--hairline-strong` | `#181a1c44` | Caption edge rule, future segments |
| `--veil` | `#f4f4f2ed` | Loading curtain |
| `--accent` | `#25282b` | Focus ring only — never a fill |
| `--surface-hover` / `--surface-press` | `#1517190d` / `#15171918` | Control states |

### Derived token

| Token | Value | Role |
|---|---|---|
| `--ink-meta` | `color-mix(in srgb, var(--ink) 80%, var(--paper))` | Counters and ordinals |

`--ink-meta` is declared on `.gallery`, not on `:root`, so it resolves against the
state's own ink and paper. It exists because a fixed grey cannot survive both a dawn
cream (`#d8e5ee`) and a night ink (`#060708`) at 10px. Measured range 5.8:1–11.4:1
across every state.

### State pairs

| State class | `--paper` | `--ink` | `--ink-muted` | Field |
|---|---|---|---|---|
| `weather-clear` (day) | `#f4f4f2` | `#141516` | `#5c6065` | flat paper |
| `weather-rain` | `#e5e9e9` | `#141516` | `#5c6065` | flat, cooler |
| `weather-mist` | `#efefec` | `#141516` | `#5c6065` | flat |
| `night` | `#09121a` | `#f2f4f6` | `#a3adb8` | radial, sea horizon |
| `observatory-dawn` | `#d8e5ee` | `#25333d` | `#46596a` | vertical sky gradient |
| `observatory-dusk` | `#464f66` | `#f3eee8` | `#d0cbd0` | vertical sky gradient |
| `observatory-wind` | `#d9d5c9` | `#34382f` | `#686b60` | vertical sky gradient |
| `space` | `#0a0b0e` | `#eceef0` | `#9aa0a8` | radial void |

`--accent` flips to a light value (`#eef1f5` / `#eef2f6`) wherever `--ink` is light,
so the focus ring always contrasts.

### Contrast floor

Measured from rendered pixels (text colour against the sampled background, including
the footer scrim):

- Reading size (15px) and labels (11px): **≥ 4.5:1**. Observed 5.6:1–17.9:1.
- Counters (10px, `aria-hidden`, duplicated by the scale): **≥ 3:1**. Observed 5.8:1–11.4:1.
- Never achieve a de-emphasised state with `opacity`. Inactive work labels used to be
  `--ink-muted` at 50%, which is 1.9:1 on paper — invisible to anyone with normal
  low-contrast tolerance, let alone low vision.

## 3. Typography Rules

### Families

| Role | Stack |
|---|---|
| Prose, labels, all CJK | `"Inter", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif` |
| Numerals only | `ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace` |

One family carries every word. The monospace is a *material*, not a second voice: it
appears only where a number is a measurement (loop position `03 / 05`, work ordinal
`01`), and it is always `font-variant-numeric: tabular-nums`.

### Hierarchy

| Token | Size | Weight | Tracking | Case | Use |
|---|---|---|---|---|---|
| `--text-mark` | 30px | 480 | `-1.65px` | lowercase | Wordmark only |
| `--text-title` | 15px | 450 | `-0.15px` | as written | Current moment (`早上 · 晴天`) |
| `--text-label` | 11px | 400 | `0.13em` | as written | Work names, gesture hint, loading |
| `--text-index` | 10px | 400 mono | `0.08em` | digits | Loop counter, work ordinal |

### Principles

- **The hinge is between 15px and 11px.** Inside the exhibition chrome nothing is 12,
  13 or 14px — either a line is the thing you are looking at, or it is a label about
  that thing. The WebGL fallback (17px / 12px) is a separate error surface and the only
  place that breaks the rule, because it is not part of the piece.
- **Weight is a scalpel.** 480 for the wordmark, 450 for the moment title, 400
  everywhere else. No 600, no 700 — bold text would out-shout a hand-built diorama.
- **Tight display, open labels.** Display sizes carry negative tracking (CJK included:
  `-0.15px` reads tighter without touching the glyphs); labels carry positive tracking
  because uppercase and 11px need air.
- **Line height 1.1 at display, 1.9 for the only paragraph** (`.scene-fallback span`).
- Numerals never appear in the prose stack; if a number can change, it is monospace
  and tabular so the layout cannot twitch.

## 4. Component Stylings

### Wordmark
`30px / 480 / -1.65px`, pinned top-left at 40px (24px on phones). It is an `<a>` to
`/`, and the only element in the masthead. The masthead reserves the right side and
leaves it empty — see the first Don't.

### Work switch (three keys)
Horizontal group, 26px gaps, each item `[ordinal] [name]`.

- Ordinal: mono 10px, `--ink-meta`, `aria-hidden`.
- Name: 11px, `0.13em` tracking, `--ink-muted` when inactive, `--ink` when current.
- Current item also draws a **1px rule** across its full width, 9px above the 44px
  box bottom. Colour alone is not an acceptable state cue.
- 44px minimum height, `padding: 8px 0`; on phones the whole group is `position: fixed`
  at `top: 84px`.
- Ordinals drop out below 1240px (`display: none`) before any name is truncated.

### Caption plate (moment + transport)
The centre of the footer. Not a card: a 1px `--hairline-strong` top rule, 11px/16px
padding, and a scrim underneath — no border, no radius, no fill, no shadow.

```
┌──────────────────────────────────────────────────┐  ← 1px rule, plate width
  早上 · 晴天                        01 / 05        ← title 15px + counter 10px mono
  ▬▬▬▬ ▬▬▬▬ ▬▬▬▬ ▬▬▬▬ ▬▬▬▬                       ← 5 equal 2px segments
  │  ⏸  ↺                                          ← 20px divider, 44px buttons
```

- Title: `--text-title`, `font-weight: 450`, `white-space: nowrap`, `aria-live="polite"`.
- Counter: `[step+1] / [moments]`, zero-padded, mono, `--ink-meta`, `aria-hidden`.
- Scale: exactly one `<li>` per moment, `flex: 1 1 0`, 2px tall, 5px gaps, **equal
  widths at every step**. The current segment holds `.moment-fill`, which sweeps
  `scaleX(0 → 1)` over `--dwell`. The active segment must never be wider than the
  others: a wider "now" tick reflows the whole row every 20 seconds.
- Elapsed segments use `--ink-faint`; future segments `--hairline-strong`.
- Controls: two 44×44 targets, `5px` radius, 18px glyphs, 2px gap, preceded by a 1px
  divider 20px tall. The divider is drawn by `.controls::before`, not by a container
  border, so it does not stretch with the tap targets.
- Hover `--surface-hover`, pressed `scale(.95)`, paused keeps `--surface-press`.
- Padding is symmetric (16px both sides). Asymmetric padding pushed the plate 13px off
  the viewport centre — the whole composition reads as crooked at that point.

### Footer scrim
`linear-gradient(to bottom, transparent, paper 62% @42%, paper 90% @68%, paper 96%)`,
breathing 72px above and 24px below the footer, full bleed. It is the only "surface" in
the interface. It exists because a bordered panel read as a sticker pasted over the sky
gradient, and because the caption has to stay legible on paper, on dusk slate and on
night ink without a per-state override.

### Loading
Full-stage `--veil` curtain, 11px tracked label, mono percentage, 180×1px track with an
ink fill. Centred, `pointer-events: none`, `role="status"`; degrades to `--paper` under
`prefers-reduced-transparency`.

### Scene fallback
`17px` line, `12px / 1.9` explanation capped at 280px, and one 44px-tall bordered
button. This is the only bordered rectangle left in the interface, and it only appears
when WebGL is unavailable.

## 5. Layout Principles

### Spacing

Base 2px. Used steps: 2, 5, 9, 10, 11, 12, 14, 16, 20, 24, 26, 28, 40.

### Frame

- Masthead: `top: 28px`, `left/right: 40px`
- Artwork stage: `inset: 3% 4% 6%` — the object is never cropped, and the footer band
  is reserved so chrome cannot overlap it
- Footer: `left/right: 40px`, `bottom: 24px`, `grid-template-columns: 1fr auto 1fr`
  (works │ caption │ hint); the centre column is genuinely centred at 1fr/1fr
- Phones: 20px edges, footer collapses to `display: flex; justify-content: center`

### Composition

The artwork is framed by whitespace, not by a container. It sits slightly above the
optical centre; the caption band occupies the bottom sixth. A scrim grounds the bottom
edge; nothing else touches the field.

### Z-order

`canvas (z auto) → loading (2) → masthead / footer (3)`. The footer's scrim paints at
`z-index: -1` *inside* the footer's stacking context, which keeps it above the canvas
and below every glyph.

## 6. Depth & Elevation

| Level | Treatment | Use |
|---|---|---|
| 0 | nothing | the artwork |
| 1 | 1px hairline | caption edge rule, control divider |
| 2 | gradient scrim | footer legibility floor |
| 3 | `--veil` full-screen | loading curtain, scene fallback |

There are **no box-shadows and no elevation metaphors**. Depth in this product comes
from the 3D scene's own lighting, SSAO and vignette. The interface adds none of its
own; a shadow on a wall label would be a lie about what is hanging on the wall.

## 7. Do's and Don'ts

### Do
- Let the state own the colour: read `--paper` / `--ink` / `--ink-muted`, never a literal hex.
- Keep the four-size scale; if a new element needs a size, reuse one of the four.
- Use `--ink-meta` for any small number that must survive both light and dark states.
- Draw structure with hairlines and rules; keep the plate open on all four sides.
- Keep tap targets at 44px and the focus ring at 2px / offset 3px / `--accent`.
- Pair every state with a non-colour cue (rule, scale position, weight).
- Measure contrast from rendered pixels in every state before shipping a colour change.
- Let the diorama be the loudest thing on screen. If the chrome reads first, it is wrong.

### Don't
- **Don't invent metadata.** An `INTERACTIVE STUDIES / 001` label once sat in the
  top-right corner asserting a series and an issue number nothing produced. A label
  that invents its own metadata is worse than an empty corner. The ordinals `01/02/03`
  are allowed because the app really does hold three keys.
- Don't put a card, panel or rounded container behind the caption. It reads as a widget.
- Don't add an accent colour. Paper, ink and hairlines are the whole vocabulary.
- Don't use `opacity` to de-emphasise text (see contrast floor).
- Don't change a segment's width to signal the current step — the row would reflow.
- Don't introduce a second sans. Bold weights above 500 are also off-limits.
- Don't add controls: two buttons, three works, one loop. Anything else is a settings panel.
- Don't place text over the artwork; no titles, no captions, no watermarks.

## 8. Responsive Behavior

| Breakpoint | Change |
|---|---|
| ≤ 1240px | Work ordinals hide; switch gap 26 → 18px |
| ≤ 1050px | Gesture hint hides |
| ≤ 650px | 20px edges, art stage `inset: 10% 0 14%`, footer becomes a centred flex row, switch pins at `top: 84px`, caption min-width 150px, title 14px |
| ≤ 420px | Switch label 10px / `0.1em`, gap 12px so three names still fit 312px |
| height ≤ 500px | Masthead 20px, footer 12px, art stage `inset: 0 14% 10%` |

Touch targets never drop below 44px; the caption plate never wraps. `prefers-reduced-motion`
kills every transition and animation and disables the auto-cycle; `prefers-contrast: more`
hardens hairlines and `--ink-muted`; `prefers-reduced-transparency` makes the loading
curtain opaque.

## 9. Agent Prompt Guide

### Quick reference
- Field / paper: `#f4f4f2` (clear) · `#09121a` (night) · `#d8e5ee` (dawn) · `#060708` (observatory night)
- Text: `#141516` on light, `#f2f4f6` on dark
- Labels: `--ink-muted`; counters: `--ink-meta` (derived)
- Hairlines: `--hairline` (internal) / `--hairline-strong` (edge rule)
- Type: 30 / 15 / 11 / 10 — Inter for words, `ui-monospace` for numerals
- Radius: 5px on controls only. Everything else is square.
- Shadows: none, ever.

### Example prompts
- "Add a fourth key to the exhibition: extend `WORKS` with `index: '04'`, add a frame entry in `FRAME`, and keep the switch on one line at 360px by relying on the existing ≤420px tracking step. Do not add a new control."
- "Restyle the caption plate without adding a container: 1px top rule, 11px/16px padding, 15px title, mono counter, five equal 2px segments. Verify the plate's centre offset is 0px at 1440."
- "A new state class needs colour: declare `--paper`, `--ink`, `--ink-muted` (and `--hairline*` if the state is dark) on `.gallery.<state>`, then measure contrast in that state for `.moment-label`, `.moment-index`, `.work-option`, `.gesture-hint`. Floor: 4.5:1 for labels, 3:1 for counters."
- "Audit the chrome: list every font-size, colour literal and border-radius under `src/style.css` and flag anything outside the token set."

### Guardrails already enforced by the harness
`scripts/verify.mjs` asserts: 44px controls with `5px` radius, five ticks with exactly
one live, `.moment-fill` running the `sweep` animation, a visible 2px/3px focus ring,
no `h1`/`h2`/`.art-caption` over the artwork, exactly one `.pill-button` and one
`.icon-button` in the footer, and no extra switcher or import affordances. `npm test`
covers the moment sequences, weather parameters and camera framing. Run both before
declaring a UI change finished.
