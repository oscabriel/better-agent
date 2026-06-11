---
name: Better Agent
description: Scoped agents for durable thinking work.
colors:
  ink: "oklch(0.985 0 0)"
  ink-muted: "oklch(0.708 0 0)"
  surface: "oklch(0.145 0 0)"
  surface-raised: "oklch(0.205 0 0)"
  surface-muted: "oklch(0.269 0 0)"
  surface-active: "oklch(0.371 0 0)"
  border: "oklch(1 0 0 / 10%)"
  primary: "oklch(0.87 0 0)"
  primary-foreground: "oklch(0.205 0 0)"
  destructive: "oklch(0.704 0.191 22.216)"
  sage: "oklch(0.65 0.06 148)"
  sage-muted: "oklch(0.72 0.03 148)"
typography:
  display:
    fontFamily: "'Inter Variable', sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "'Inter Variable', sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  title:
    fontFamily: "'Inter Variable', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
  body:
    fontFamily: "'Inter Variable', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Inter Variable', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  full: "9999px"
shadows:
  overlay: "0 1px 2px var(--shadow-color), 0 4px 8px -2px var(--shadow-color)"
  shadow-color-dark: "oklch(0 0 0 / 32%)"
  shadow-color-light: "oklch(0 0 0 / 6%)"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "32px"
  xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "oklch(0.87 0 0 / 80%)"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.ink}"
  input-default:
    backgroundColor: "oklch(1 0 0 / 15%)"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "4px 10px"
    height: "32px"
  card-default:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  badge-default:
    rounded: "{rounded.full}"
    height: "20px"
---

# Design System: Better Agent

## 1. Overview

**Creative North Star: "The Workbench"**

A clean, purpose-made surface where every tool has a fixed place. Nothing decorative; everything functional. The Workbench is not a dashboard with dials and readouts. It is the surface you compose on: you place a Goal, attach Sources, grant Permissions, and the Thinkspace Agent works while you step away. When you return, the Artifacts and Audit Trail are laid out where you left them.

The system is achromatic by default. Color enters only with intention: destructive red for danger, sage green for deliberate accent, and nothing else. Surfaces are calm and softly rounded (6–10px, full-pill for badges), with no gradients and no decorative blur. Depth is conveyed primarily through tonal layering (surface → surface-raised → surface-active) and border opacity; floating surfaces (menus, popovers, dialogs) may additionally carry one small overlay shadow to separate from content beneath.

The Workbench rejects orchestration theater. There are no agent-count badges, no throughput graphs, no node graphs, no encouragement to scale. The interface shows what the user needs to judge (the Review Queue) and what the agent produced (Artifacts, Memory), not what the agent is doing. PRODUCT.md's framing holds: "Activity is not the value; reviewed outcomes are."

**Key Characteristics:**

- Achromatic palette with sage accent (provisional, restrained use)
- Soft rounded corners on a tight scale: 6px (compact controls), 8px (controls), 10px (containers), full-pill (badges)
- Tonal layering as the primary depth cue; one small overlay shadow reserved for floating surfaces
- Not dense: generous whitespace, 14px body text, legible at a glance
- One typeface (Inter Variable) across all roles
- Dark mode as the primary theme; light mode tokens exist and must be kept in parity (no dark-only styling decisions)

**Reference anchors:** two melior.design pieces set the bar. The _document page_ (Atrium "Spruce" customer view): a centered single-column brief with title, metadata pills, and structured cards inline with prose. The _projects index_ (dark "Projects" page): display heading, one toolbar row, and a teaching empty state with ghost cards. Both are codified in §7 Patterns.

## 2. Colors: The Workbench Palette

Achromatic with surgical restraint. The palette is a greyscale ramp in OKLCH at zero chroma, with one provisional accent (sage) and one semantic color (destructive red). Color is not decoration; it is signal.

**Themes.** Dark is the primary theme and the values documented below are the dark ramp. A light token block exists in `globals.css` (`:root`) as a supported option — not yet user-togglable, but every styling decision must hold in both themes. Use semantic tokens (`bg-background`, `text-foreground`, `ring-foreground/10`), never raw dark-ramp values, so light mode stays one provider-wire away.

### Primary

- **Primary** (oklch(0.87 0 0)): The primary action surface. Buttons, toggles, active states. Light grey on the dark base, high enough contrast to read as "the thing to press" without shouting.
- **Primary Foreground** (oklch(0.205 0 0)): Text on primary surfaces. Near-black for sharp legibility.

### Neutral

- **Ink** (oklch(0.985 0 0)): Primary text. Near-white, not pure white, to reduce glare on dark surfaces.
- **Ink Muted** (oklch(0.708 0 0)): Secondary text, descriptions, metadata. Sufficient contrast against surface-raised (4.7:1).
- **Surface** (oklch(0.145 0 0)): The application background. Near-black.
- **Surface Raised** (oklch(0.205 0 0)): Cards, popovers, dialogs. One step up from the base.
- **Surface Muted** (oklch(0.269 0 0)): Secondary and muted backgrounds. Hover states on ghost buttons.
- **Surface Active** (oklch(0.371 0 0)): Active/selected backgrounds. Accent surfaces in menus and nav.
- **Border** (oklch(1 0 0 / 10%)): White at 10% opacity. Dividers, card outlines, input borders. The opacity approach means borders adapt to whatever surface they sit on.

### Accent (provisional)

- **Sage** (oklch(0.65 0.06 148)): The accent color. Low chroma, restrained. Used for affirmative indicators, success states, and deliberate pops of life on an otherwise achromatic surface. This color is provisional and expected to change.
- **Sage Muted** (oklch(0.72 0.03 148)): A barely-there tint for backgrounds and subtle highlights. Almost achromatic; the chroma is just enough to register.

### Semantic

- **Destructive** (oklch(0.704 0.191 22.216)): Error states, delete actions, danger. The only high-chroma color in the system.

### Named Rules

**The Achromatic Default Rule.** Sage is the only non-greyscale, non-destructive color in the system. If you reach for a second accent hue, you are wrong. One accent, restrained use (≤5% of any surface), or none.

**The 10% Border Rule.** Borders use `oklch(1 0 0 / 10%)`, not a fixed grey. This keeps them adaptive: lighter on darker surfaces, proportional everywhere. Do not introduce opaque grey border values.

## 3. Typography

**Body Font:** Inter Variable (with system-ui, sans-serif fallback)

**Character:** One family, four weights, five roles. Inter is the entire typographic system. Hierarchy is built through size and weight contrast, not typeface contrast. The scale is compact (ratio ~1.4 between major steps), appropriate for a product surface where many type roles coexist.

### Hierarchy

- **Display** (600, 2.25rem / 36px, line-height 1.1, letter-spacing -0.025em): Page-level headings only. The largest text in the system. Used on route-level titles like "Settings" or "Thinkspaces." Not fluid; fixed at 36px across breakpoints.
- **Headline** (600, 1.25rem / 20px, line-height 1.3, letter-spacing -0.02em): Section headings within a page. Card group titles, settings section labels.
- **Title** (500, 0.875rem / 14px, line-height 1.4): Component-level headings. Card titles, dialog titles, nav labels. Medium weight distinguishes it from body at the same size.
- **Body** (400, 0.875rem / 14px, line-height 1.6): The default. Descriptions, paragraphs, form help text. Generous line-height for readability. Cap line length at 65ch for prose blocks.
- **Label** (500, 0.75rem / 12px, line-height 1.3): Badges, metadata timestamps, button text, input labels. The smallest text in the system. Reserved for short strings that don't need to be read as sentences.

### Named Rules

**The One Family Rule.** Inter Variable is the only typeface. Do not introduce a display font, a serif, or a mono family. If you need typographic contrast, use weight (400 vs 600) and size, not a second font.

**The Fixed Scale Rule.** No `clamp()` on type sizes. Product UI runs at consistent viewport sizes; fluid typography creates more problems than it solves in app shells.

## 4. Shape & Elevation

**Corners are soft, on a tight scale.** `--radius: 0.625rem` drives the Tailwind scale: `rounded-sm` (6px) for compact controls and menu items, `rounded-md` (8px) for buttons, inputs, and tooltips, `rounded-lg` (10px) for cards, popovers, menus, and dialogs, `rounded-full` for badges and pills. Nothing rounder than 10px on a container — over-rounding (24px+) is as wrong as sharp-everything was austere.

**Tonal layering is still the primary depth cue:** `surface` (0.145) → `surface-raised` (0.205) → `surface-muted` (0.269) → `surface-active` (0.371). Each step is a deliberate lightness increment in OKLCH. Borders at `oklch(1 0 0 / 10%)` reinforce edges where tonal contrast alone is insufficient.

**One shadow exists:** `shadow-overlay` (`0 1px 2px var(--shadow-color), 0 4px 8px -2px var(--shadow-color)`), theme-aware via `--shadow-color` (6% black in light, 32% black in dark). It belongs only on floating surfaces — dropdown menus, select popups, popovers, dialogs — where it separates the layer from content beneath. Static surfaces (cards, buttons, inputs, headers) never carry it.

### Named Rules

**The Radius Ceiling Rule.** Containers top out at `rounded-lg` (10px). Badges and pills are the only `rounded-full` elements. If you reach for `rounded-xl` or beyond on a card, dialog, or section, you are over-rounding.

**The Floating Shadow Rule.** `shadow-overlay` is the only shadow token, and it applies only to surfaces that float above the page (menus, popovers, dialogs). Never on static cards, never on buttons, never on hover states, never a larger blur. Elevation on static surfaces is still tonal: lighter background + `ring-1` border.

## 5. Components

The component vocabulary is precise, austere, and restrained. Every component uses the soft radius scale (§4), the achromatic palette, and tonal depth (overlay shadow on floating surfaces only). Components feel purposefully placed, not packed. Generous padding and whitespace prevent density from creeping in.

All components are built on Base UI React primitives with CVA (class-variance-authority) for variant management.

### Buttons

- **Shape:** `rounded-md` (8px) at default/lg sizes, `rounded-sm` (6px) at sm/xs; height 32px (default), border-transparent by default.
- **Primary:** `bg-primary text-primary-foreground` (light grey on near-black text). The only button that reads as "the action." Hover reduces opacity to 80%.
- **Outline:** Transparent background, `border-border`, ink text. Hover fills with `surface-muted`.
- **Ghost:** Transparent, muted text. Hover fills with `surface-muted` and text shifts to full ink. Used in nav, menus, toolbars.
- **Destructive:** `bg-destructive/10 text-destructive` (tinted background, not solid). Low-key until needed.
- **Focus:** `border-ring ring-1 ring-ring/50`. Visible, not decorative.
- **Sizes:** xs (24px), sm (28px), default (32px), lg (36px). Icon-only variants at matching heights.
- **Label text:** 12px (label scale), medium weight. Buttons use the label size, not body size, even with the 14px body default.

### Cards / Containers

- **Shape:** `rounded-lg` (10px).
- **Background:** `surface-raised` (oklch(0.205 0 0)). One tonal step above the page.
- **Border:** `ring-1 ring-foreground/10`. Subtle outline, not a heavy stroke.
- **Shadow:** None. Cards are static surfaces; depth is tonal.
- **Internal padding:** 16px (md spacing). Compact variant at 12px.
- **Content text:** Body scale (14px). Card descriptions in muted ink.

### Inputs / Fields

- **Shape:** `rounded-md` (8px). Height 32px.
- **Border:** `border-input` (oklch(1 0 0 / 15%)).
- **Background:** `bg-input/30` in dark mode (subtle transparency).
- **Focus:** `border-ring ring-1 ring-ring/50`. Same treatment as buttons.
- **Error:** `border-destructive ring-1 ring-destructive/20`. Red border + subtle red ring.
- **Disabled:** `bg-input/50 opacity-50`. Pointer-events none.
- **Text:** Body scale (14px). Placeholder in `ink-muted`.

### Navigation

- **Header:** 48px height, `bg-background/95 backdrop-blur`, bottom border. Logo left, nav center-left, user menu right.
- **Nav links:** Ghost button style. Muted text at rest, `bg-muted text-foreground` when active. No underlines, no colored active indicators.
- **Settings sidebar:** Card surface with border, vertical nav using ghost buttons with description text.
- **Mobile:** Sidebar collapses; header stays. Standard responsive collapse, not a hamburger menu reinvention.

### Dialogs / Popovers

- **Shape:** `rounded-lg` (10px).
- **Background:** `bg-popover` (surface-raised).
- **Border:** `ring-1 ring-foreground/10` plus `shadow-overlay` (floating surface).
- **Overlay:** `bg-black/10` with `backdrop-blur-xs`. Light, not heavy.
- **Animation:** Fade in + scale from 95% (100ms). `prefers-reduced-motion` falls back to instant.

### Badges

- **Shape:** Full pill (`rounded-full`). Height 20px. The pill silhouette is the badge's identity — metadata chips, status indicators, counts (per the melior reference: "Public", view counts, "Positive"/"Churned").
- **Default:** `bg-primary text-primary-foreground`. Small, high-contrast.
- **Outline:** `border-border text-foreground`. For lower-emphasis labels.
- **Destructive:** `bg-destructive/10 text-destructive`. Tinted, not solid.

### Tooltips

- **Shape:** `rounded-md` (8px).
- **Background:** `bg-foreground` (ink-colored). Inverted contrast.
- **Text:** `text-background`. 12px.
- **Arrow:** Rotated square (kept sharp; rounding breaks the pointer shape), matching background.

### Dropdown Menus

- **Shape:** `rounded-lg` (10px) container, `rounded-sm` (6px) items.
- **Background:** `bg-popover`.
- **Border:** `ring-1 ring-foreground/10` plus `shadow-overlay` (floating surface).
- **Items:** 12px text, `focus:bg-accent focus:text-accent-foreground`. Keyboard-navigable.
- **Destructive items:** Red text, `bg-destructive/10` on focus.

## 6. Do's and Don'ts

### Do:

- **Do** use the achromatic palette as the default. Sage accent earns its place through deliberate, sparse use (success indicators, affirmative actions). If a screen has no sage, that is correct.
- **Do** use `ring-1 ring-foreground/10` for surface boundaries. The 10% white-opacity approach adapts to any tonal surface.
- **Do** keep body text at 14px (0.875rem) minimum. Legibility at a glance is a design principle, not a suggestion.
- **Do** use tonal layering (surface → surface-raised → surface-active) to create depth on static surfaces. Each step is a lightness increment, not a shadow.
- **Do** use `shadow-overlay` on floating surfaces (menus, popovers, dialogs) — it is the one sanctioned shadow, theme-aware via `--shadow-color`.
- **Do** follow the radius scale: `rounded-sm` compact controls, `rounded-md` controls, `rounded-lg` containers, `rounded-full` badges.
- **Do** give every interactive element all six states: default, hover, focus, active, disabled, error. Ship none with half.
- **Do** use generous whitespace. Padding and gaps should feel spacious (16-32px between sections), not packed. "Restrained, not dense" means the absence of content is as intentional as its presence.
- **Do** use `text-wrap: balance` on display and headline text. Use `text-wrap: pretty` on body prose.
- **Do** respect `prefers-reduced-motion`: fall back to instant transitions or crossfades.

### Don't:

- **Don't** add shadows to static surfaces — cards, buttons, inputs, headers, hover states. `shadow-overlay` on floating surfaces is the only exception; no other shadow value may exist.
- **Don't** exceed the radius ceiling. `rounded-lg` (10px) is the maximum for any container; `rounded-xl`+ on cards, dialogs, or sections is over-rounding. Don't return to `rounded-none` either — sharp corners were retired deliberately.
- **Don't** style against the dark ramp directly (raw oklch values, `dark:`-only fixes without a light counterpart). Light mode is a supported option; semantic tokens keep it viable.
- **Don't** build a generic chat window with a sidebar. PRODUCT.md: "Better Agent is not a conversation list with a text input bar at the bottom. The input surface should feel like a full-page note or brief, not a chat prompt."
- **Don't** show agent metrics, running counts, or throughput graphs. PRODUCT.md: "No running-agent counts, no throughput graphs, no encouragement to scale up. Activity is not the value; reviewed outcomes are."
- **Don't** build node graphs, drag-and-drop pipelines, or visual orchestration. PRODUCT.md: "Delegation is a single intentional act, not a wiring diagram."
- **Don't** build busy multi-panel layouts. PRODUCT.md: "The user focuses on one Thinkspace at a time. Switching is discrete (tabs, sidebar), not simultaneous."
- **Don't** use more than one typeface. Inter Variable is the system. No display fonts, no serifs, no mono companions.
- **Don't** use `clamp()` for type sizing. Fixed rem values across breakpoints.
- **Don't** introduce opaque grey border values. Borders are `oklch(1 0 0 / 10%)` or nothing.
- **Don't** use `text-xs` (12px) as the default body size. 12px is for labels, badges, and button text only. Body and description text starts at 14px.
- **Don't** introduce a second accent color. Sage is provisional and singular. If you need a second hue, the design is wrong.

## 7. Patterns

Two page-level patterns adopted from melior.design references (Atrium customer page; dark Projects index). These are build specs: new surfaces of these kinds follow them unless a deliberate decision is recorded here.

### The Document Page (detail views: Thinkspace, Artifact review)

The detail view is a brief, not a dashboard. Reference: melior's Atrium "Spruce" customer page.

- **Frame:** breadcrumb in the top bar (`Thinkspaces › {name}`), slim sidebar, then a centered single column, max-width ~720px (65–75ch at 14px). No second content panel.
- **Header block:** Title (display or headline scale per route depth) with an identifying icon, followed by one row of metadata pills — `rounded-full` badges carrying scope facts (source count, permission grants, status). Status pills may use sage (affirmative) or destructive-tinted (attention) per the Achromatic Default Rule.
- **Section navigation:** one tab row directly under the header (e.g. Goal / Artifacts / Audit Trail). Tabs, not accordion, not split panes.
- **Body rhythm:** prose paragraphs (body scale, 65ch cap) interleaved with structured cards. Each card: `rounded-lg`, `ring-1 ring-foreground/10`, a pill-shaped section label in its top-left, a quiet "More" affordance top-right, and internal rows of icon + text + trailing inline action. Rows are the unit of interaction; the card is just their container.
- **What this pattern forbids:** stat tiles, multi-column card grids, persistent side panels. The page reads top to bottom like a document.

### The Teaching Empty State (index views: Thinkspaces list)

An empty index teaches what a populated one looks like. Reference: melior's dark Projects page.

- **Frame:** display-scale page title + one muted-ink subtitle line, then a single toolbar row: search input left, segmented filter group center-left, primary action (+ secondary) right-aligned. Toolbar controls at the 32px height standard.
- **Empty state body:** one full-width panel (`rounded-lg`, `ring-1 ring-foreground/10`), split in two:
  - **Left — the invitation:** headline-scale heading naming the outcome ("Set up your first Thinkspace"), one body line of muted ink explaining what goes here, then primary button + ghost "How it works" button. Grounded copy per PRODUCT.md: name what it does, no aspiration.
  - **Right — the demonstration:** 1–2 ghost preview cards at reduced emphasis (muted borders, no interaction) on a subtly textured backdrop (dotted grid at border-level opacity, _not_ stripes/gradients). Each ghost card shows the real anatomy of a populated item: icon + name, metadata pills, created-date row. The user learns the card by seeing it.
- **Populated state:** the same card anatomy the ghosts demonstrated, in a responsive grid (`repeat(auto-fit, minmax(280px, 1fr))`). Card: icon + name + domain line, pill row (status, counts), muted footer row, overflow menu top-right.
- **What this pattern forbids:** a bare "No thinkspaces yet" line with a lone button; illustration-as-filler; onboarding modals. The empty state is layout, not apology.
