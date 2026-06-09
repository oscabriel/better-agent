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
  none: "0"
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
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "oklch(0.87 0 0 / 80%)"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "32px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "32px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.ink}"
  input-default:
    backgroundColor: "oklch(1 0 0 / 15%)"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "4px 10px"
    height: "32px"
  card-default:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "16px"
---

# Design System: Better Agent

## 1. Overview

**Creative North Star: "The Workbench"**

A clean, purpose-made surface where every tool has a fixed place. Nothing decorative; everything functional. The Workbench is not a dashboard with dials and readouts. It is the surface you compose on: you place a Goal, attach Sources, grant Permissions, and the Thinkspace Agent works while you step away. When you return, the Artifacts and Audit Trail are laid out where you left them.

The system is achromatic by default. Color enters only with intention: destructive red for danger, sage green for deliberate accent, and nothing else. Surfaces are flat and sharp-cornered. There are no shadows, no gradients, no rounded edges. Depth is conveyed through tonal layering (surface → surface-raised → surface-active) and border opacity, never through elevation.

The Workbench rejects orchestration theater. There are no agent-count badges, no throughput graphs, no node graphs, no encouragement to scale. The interface shows what the user needs to judge (the Review Queue) and what the agent produced (Artifacts, Memory), not what the agent is doing. PRODUCT.md's framing holds: "Activity is not the value; reviewed outcomes are."

**Key Characteristics:**
- Achromatic palette with sage accent (provisional, restrained use)
- Sharp corners on every surface and control (border-radius: 0)
- Flat: no shadows, no elevation, no blur-as-decoration
- Not dense: generous whitespace, 14px body text, legible at a glance
- One typeface (Inter Variable) across all roles
- Dark mode as the primary theme

## 2. Colors: The Workbench Palette

Achromatic with surgical restraint. The palette is a greyscale ramp in OKLCH at zero chroma, with one provisional accent (sage) and one semantic color (destructive red). Color is not decoration; it is signal.

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

## 4. Elevation

There is no elevation. The Workbench is flat.

Depth is conveyed entirely through tonal layering: `surface` (0.145) → `surface-raised` (0.205) → `surface-muted` (0.269) → `surface-active` (0.371). Each step is a deliberate lightness increment in OKLCH. Borders at `oklch(1 0 0 / 10%)` reinforce edges where tonal contrast alone is insufficient.

No box-shadow values exist in the system. No blur-as-depth, no ambient glow, no elevation tokens.

### Named Rules

**The No Shadow Rule.** Shadows are prohibited. Not "flat by default with shadows on hover." Not "shadows only on popovers." Zero shadows, zero exceptions. If a surface needs to feel elevated, it gets a lighter background and a `ring-1` border. If that's not enough, the layout is wrong.

## 5. Components

The component vocabulary is precise, austere, and restrained. Every component uses sharp corners (border-radius: 0), flat surfaces (no shadows), and the achromatic palette. Components feel purposefully placed, not packed. Generous padding and whitespace prevent density from creeping in.

All components are built on Base UI React primitives with CVA (class-variance-authority) for variant management.

### Buttons

- **Shape:** Sharp corners (border-radius: 0), height 32px (default), border-transparent by default.
- **Primary:** `bg-primary text-primary-foreground` (light grey on near-black text). The only button that reads as "the action." Hover reduces opacity to 80%.
- **Outline:** Transparent background, `border-border`, ink text. Hover fills with `surface-muted`.
- **Ghost:** Transparent, muted text. Hover fills with `surface-muted` and text shifts to full ink. Used in nav, menus, toolbars.
- **Destructive:** `bg-destructive/10 text-destructive` (tinted background, not solid). Low-key until needed.
- **Focus:** `border-ring ring-1 ring-ring/50`. Visible, not decorative.
- **Sizes:** xs (24px), sm (28px), default (32px), lg (36px). Icon-only variants at matching heights.
- **Label text:** 12px (label scale), medium weight. Buttons use the label size, not body size, even with the 14px body default.

### Cards / Containers

- **Shape:** Sharp corners. No border-radius on any card, ever.
- **Background:** `surface-raised` (oklch(0.205 0 0)). One tonal step above the page.
- **Border:** `ring-1 ring-foreground/10`. Subtle outline, not a heavy stroke.
- **Shadow:** None. Prohibited.
- **Internal padding:** 16px (md spacing). Compact variant at 12px.
- **Content text:** Body scale (14px). Card descriptions in muted ink.

### Inputs / Fields

- **Shape:** Sharp corners. Height 32px.
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

- **Shape:** Sharp corners. No rounding.
- **Background:** `bg-popover` (surface-raised).
- **Border:** `ring-1 ring-foreground/10`.
- **Overlay:** `bg-black/10` with `backdrop-blur-xs`. Light, not heavy.
- **Animation:** Fade in + scale from 95% (100ms). `prefers-reduced-motion` falls back to instant.

### Badges

- **Shape:** Sharp corners. Height 20px.
- **Default:** `bg-primary text-primary-foreground`. Small, high-contrast.
- **Outline:** `border-border text-foreground`. For lower-emphasis labels.
- **Destructive:** `bg-destructive/10 text-destructive`. Tinted, not solid.

### Tooltips

- **Background:** `bg-foreground` (ink-colored). Inverted contrast.
- **Text:** `text-background`. 12px.
- **Arrow:** Square (sharp corners), matching background.

### Dropdown Menus

- **Background:** `bg-popover`.
- **Border:** `ring-1 ring-foreground/10`, `shadow-md` — **exception note:** dropdown menus currently use `shadow-md`; this should be removed to comply with the No Shadow Rule. Use `ring-1` alone.
- **Items:** 12px text, `focus:bg-accent focus:text-accent-foreground`. Keyboard-navigable.
- **Destructive items:** Red text, `bg-destructive/10` on focus.

## 6. Do's and Don'ts

### Do:

- **Do** use the achromatic palette as the default. Sage accent earns its place through deliberate, sparse use (success indicators, affirmative actions). If a screen has no sage, that is correct.
- **Do** use `ring-1 ring-foreground/10` for surface boundaries. The 10% white-opacity approach adapts to any tonal surface.
- **Do** keep body text at 14px (0.875rem) minimum. Legibility at a glance is a design principle, not a suggestion.
- **Do** use tonal layering (surface → surface-raised → surface-active) to create depth. Each step is a lightness increment, not a shadow.
- **Do** give every interactive element all six states: default, hover, focus, active, disabled, error. Ship none with half.
- **Do** use generous whitespace. Padding and gaps should feel spacious (16-32px between sections), not packed. "Restrained, not dense" means the absence of content is as intentional as its presence.
- **Do** use `text-wrap: balance` on display and headline text. Use `text-wrap: pretty` on body prose.
- **Do** respect `prefers-reduced-motion`: fall back to instant transitions or crossfades.

### Don't:

- **Don't** add shadows. Not on cards, not on buttons, not on popovers, not on hover. The No Shadow Rule has zero exceptions.
- **Don't** round corners. Every surface, button, input, badge, dialog, and tooltip uses border-radius: 0. No exceptions for "friendliness" or "approachability."
- **Don't** build a generic chat window with a sidebar. PRODUCT.md: "Better Agent is not a conversation list with a text input bar at the bottom. The input surface should feel like a full-page note or brief, not a chat prompt."
- **Don't** show agent metrics, running counts, or throughput graphs. PRODUCT.md: "No running-agent counts, no throughput graphs, no encouragement to scale up. Activity is not the value; reviewed outcomes are."
- **Don't** build node graphs, drag-and-drop pipelines, or visual orchestration. PRODUCT.md: "Delegation is a single intentional act, not a wiring diagram."
- **Don't** build busy multi-panel layouts. PRODUCT.md: "The user focuses on one Thinkspace at a time. Switching is discrete (tabs, sidebar), not simultaneous."
- **Don't** use more than one typeface. Inter Variable is the system. No display fonts, no serifs, no mono companions.
- **Don't** use `clamp()` for type sizing. Fixed rem values across breakpoints.
- **Don't** introduce opaque grey border values. Borders are `oklch(1 0 0 / 10%)` or nothing.
- **Don't** use `text-xs` (12px) as the default body size. 12px is for labels, badges, and button text only. Body and description text starts at 14px.
- **Don't** introduce a second accent color. Sage is provisional and singular. If you need a second hue, the design is wrong.
