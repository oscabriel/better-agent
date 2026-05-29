# React 19 + Tailwind v4 + shadcn/Base UI study for Better Chat UI salvage into Better Agent

Date: 2026-05-27

## Executive recommendations

1. **Use Better Agent's `packages/ui` as the destination for reusable primitives, not app-local copies.** Better Agent already exposes `@better-agent/ui/components/*`, `@better-agent/ui/lib/*`, `@better-agent/ui/globals.css`, and is configured for React 19, Tailwind v4, shadcn tokens, `tw-animate-css`, and Base UI (`/Users/oscargabriel/Developer/projects/better-agent/packages/ui/package.json`).
2. **Keep the new Better Agent primitive strategy Base UI-first unless the PR explicitly adds `radix-ui` to `@better-agent/ui`.** Better Chat's UI components are current shadcn/Radix-style (`import { Dialog as DialogPrimitive } from "radix-ui"`, `data-slot`, named functions, `React.ComponentProps`), but Better Agent has already implemented Button/Input/Checkbox/Dropdown with `@base-ui/react` (`button.tsx`, `input.tsx`, `checkbox.tsx`, `dropdown-menu.tsx`). Mixing Radix and Base UI is feasible but should be an explicit dependency/architecture decision.
3. **Salvage in layers:**
   - **Low-risk atoms:** `alert`, `badge`, `textarea`, `separator`, card refinements, empty-state layout snippets.
   - **Medium-risk primitives:** `dialog`, `select`, `switch`, `tooltip`, `progress`, `avatar`; either port to Base UI API/data attributes or add/standardize on `radix-ui`.
   - **High-risk composites:** `sidebar` and settings routes; salvage visual layout and interaction patterns, not copy wholesale until primitives and routing/data contracts exist.
4. **Preserve React 19 component shape:** named functions or const components using `React.ComponentProps`, `data-slot`, no new `forwardRef` unless required. React 19 supports `ref` as a regular prop and shadcn v4 docs explicitly moved components away from `forwardRef`.
5. **Keep Tailwind v4 CSS-first tokens as the contract.** Better Agent `globals.css` already uses `@import "tailwindcss"`, `@source`, `@custom-variant dark`, `:root`/`.dark` OKLCH tokens, and `@theme inline`; this matches Tailwind v4 and shadcn v4 guidance.

## Local state and integration seams

### Better Agent UI package

Current reusable components under `/Users/oscargabriel/Developer/projects/better-agent/packages/ui/src/components`:

- `button.tsx`: Base UI `ButtonPrimitive` wrapper, CVA variants, `data-slot="button"`, `data-*` styling, no `forwardRef`.
- `card.tsx`: pure div composition with `data-slot`, compact square/terminal-flavored styling, `size?: "default" | "sm"`.
- `checkbox.tsx`: Base UI checkbox using `data-checked`, `data-unchecked`-style state classes rather than Radix `data-[state=checked]`.
- `dropdown-menu.tsx`: Base UI `Menu` wrapper with `Portal` + `Positioner` + `Popup`; uses Base UI positioning CSS vars such as `--available-height`, `--anchor-width`, and `--transform-origin`.
- `input.tsx`: Base UI input wrapper, compact `h-8 text-xs` styling.
- `label.tsx`: native `<label>` wrapper with required `htmlFor: string`.
- `skeleton.tsx`, `sonner.tsx`.

Current CSS at `/Users/oscargabriel/Developer/projects/better-agent/packages/ui/src/styles/globals.css` already follows Tailwind v4/shadcn v4 shape:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@source "../../../apps/**/*.{ts,tsx}";
@source "../**/*.{ts,tsx}";
@custom-variant dark (&:is(.dark *));
:root { ... OKLCH tokens ... }
.dark { ... }
@theme inline { --color-background: var(--background); ... }
```

Current Better Agent app components are minimal: `header.tsx`, auth forms, `user-menu.tsx`, loader. Routes are also minimal: root renders a dark shell with `Header` + `Outlet`; dashboard is plain text; AI route has a basic empty state (`Ask me anything to get started!`) and input bar.

### Better Chat salvage source

Better Chat UI under `/Users/oscargabriel/Developer/projects/better-chat/apps/web/src/components/ui` is already shadcn v4-like:

- Components are named functions, typed with `React.ComponentProps`, and emit `data-slot`.
- Radix components use the unified `radix-ui` package, e.g. `Dialog`, `Select`, `Switch`, `Tooltip`, `Avatar`, `Progress`, `ScrollArea`, `Separator`.
- `button.tsx` and `badge.tsx` use `SlotPrimitive.Slot` and `asChild`; Better Agent's Base UI button uses a `render` prop instead, so `asChild` call sites must be migrated.
- `tanstack-form.tsx` provides an accessible form abstraction with generated ids, `aria-describedby`, and `aria-invalid`, but it imports Radix `Slot` and Better Chat aliases. It is a good pattern to re-create in `@better-agent/ui`, not a direct copy.

Better Chat settings components (`routes/settings/-components`) are a good source for concrete UI states: model/provider/MCP rows, API-key dialogs, profile edit/delete dialogs, usage stats/progress/tooltip patterns, and settings error state. They assume Better Chat server types, auth hooks, and `@/web/*` aliases, so PRD scope should treat them as **design/reference salvage**, not drop-in code.

## Upstream dependency findings

### React 19 / 19.2

Evidence from latest React source/docs study:

- React recommends upgrading to **18.3.1 first** because it is identical to 18.2 but emits warnings for APIs that break in React 19 (`facebook/react CHANGELOG.md:137-146`). Better Agent is already on React `^19.2.6`; Better Chat is on `^19.2.3`, so version alignment is close.
- React 19 requires the **new JSX transform** for features like `ref` as prop (`CHANGELOG.md:184-187`). Vite/React plugin config should remain automatic JSX runtime.
- Removed APIs to avoid during salvage: `ReactDOM.render`, `hydrate`, `findDOMNode`, string refs, function `defaultProps`, legacy context, most `react-dom/test-utils` (`CHANGELOG.md:189-206`; `packages/react-dom/src/client/ReactDOMClient.js:9-50`).
- React 19 supports **`ref` as a regular prop**, reducing the need for `forwardRef`, but `forwardRef` still exists (`CHANGELOG.md:158-159`; `packages/react/src/ReactClient.js:20-24`, `63-70`). This aligns with shadcn v4's no-`forwardRef` component output.
- Actions and form APIs are stable enough for future form mutation UX: `useActionState(action, initialState, permalink?)` returns `[state, dispatch, isPending]`; `useFormStatus` comes from `react-dom` and reports `pending`, `data`, `method`, `action`; `<form action>` resets uncontrolled inputs after success; `useOptimistic` supports transition-time optimistic UI (`CHANGELOG.md:150-170`; `packages/react/src/ReactHooks.js:223-237`; `packages/react-dom-bindings/src/shared/ReactDOMFormActions.js:13-35`). Current Better Agent auth forms use TanStack Form; React Actions are optional, not a migration blocker.
- StrictMode in React 19 double-invokes ref callbacks on initial mount and reuses first-pass memoized values for `useMemo`/`useCallback` (`CHANGELOG.md:215-218`, `267-277`). New callback refs and cleanup effects must be idempotent.
- TypeScript migration issues: `useRef` requires an initial argument, ref callback returns must be cleanup functions or void, global `JSX` namespace is removed in favor of React's JSX types, and removed aliases include `ReactChild`, `VFC`, etc. (`CHANGELOG.md:228-250`).

### Tailwind CSS v4

Evidence from Tailwind source/docs study:

- `@import "tailwindcss"` expands to theme/base/utilities cascade layers (`tailwindlabs/tailwindcss packages/tailwindcss/index.css:1-5`). Better Agent already uses this.
- v4 theme configuration is CSS-first. Default theme tokens are CSS variables under `@theme default`; Tailwind recognizes `@theme` options like `reference`, `inline`, `default`, `static`, and `prefix(...)`, and enforces that `@theme` contains only custom properties or keyframes (`packages/tailwindcss/theme.css`; `packages/tailwindcss/src/index.ts:85-103`, `541-582`). Better Agent's `@theme inline` bridge from shadcn vars to `--color-*` and `--radius-*` is correct.
- `@source` is critical for monorepo component packages and installed component libraries. Tailwind v4 ignores `node_modules` by default unless overridden; source directives support explicit paths and inline candidates (`packages/tailwindcss/src/index.ts:106-114`, `162-221`, `255-300`; `CHANGELOG.md:356-359`). Better Agent's `@source "../../../apps/**/*.{ts,tsx}"` and `@source "../**/*.{ts,tsx}"` should catch local app and package classes.
- Dark mode defaults to media if not customized; shadcn class-based dark mode should define `@custom-variant dark (&:is(.dark *))` or a data-theme variant. Tailwind tests show default `dark:` compiles to `prefers-color-scheme`, while custom variants can target `[data-theme='dark']` (`packages/tailwindcss/src/index.test.ts:15-51`; `packages/tailwindcss/src/at-import.test.ts:605-632`). Better Agent already has `.dark` custom variant.
- v4 first-party integration should use `@tailwindcss/vite` or `@tailwindcss/postcss`, not the old v3 PostCSS plugin assumption (`packages/@tailwindcss-vite/README.md:39-70`; `packages/@tailwindcss-postcss/README.md:39-116`). Better Agent app uses `@tailwindcss/vite`.
- Compatibility risks: OKLCH/P3 palette changes, stricter directives, invalid/removed utilities, CSS-level prefixing, and automatic content detection misses installed packages (`CHANGELOG.md:617-627`, `356-361`, `465-468`; `packages/tailwindcss/src/index.ts:500-510`).

### shadcn/ui current patterns

Evidence from latest shadcn/ui study:

- shadcn v4 docs state components were updated for React 19/Tailwind v4: remove `forwardRef`, use `React.ComponentProps`, add `data-slot`, deprecate `default` style in favor of `new-york`, and convert HSL tokens to OKLCH (`shadcn-ui/ui apps/v4/content/docs/(root)/tailwind-v4.mdx:10-21`, `232-243`).
- v4 `components.json` uses `style: "new-york"`, `tsx: true`, `baseColor: "neutral"`, CSS variables enabled, Tailwind config blank for v4, aliases, and lucide icons (`apps/v4/components.json:1-21`; `components-json.mdx:6-13`, `24-90`).
- Current registry components use named functions with `React.ComponentProps` and `data-slot`, e.g. `Button`, `Dialog`, `Select`, `Switch`, and `Field` (`apps/v4/registry/new-york-v4/ui/button.tsx:44-59`; `dialog.tsx:9-31`; `select.tsx:9-28`; `switch.tsx:8-24`; `field.tsx:81-92`). Better Agent already follows this shape.
- Latest generated Radix registry output depends on unified `radix-ui`; migration command exists from individual packages to unified Radix (`apps/v4/public/r/styles/new-york-v4/registry.json:6-14`, `298-300`, `565-567`, `720-722`; `changelog/2026-02-radix-ui.mdx:7-15`, `23-38`). Better Chat already uses unified `radix-ui`.
- shadcn has Base UI support positioned as “same abstraction, different primitives”: choose Radix or Base UI, same import/API surface and look/behavior, implementation changes underneath (`changelog/2026-01-base-ui.mdx:22-39`). This validates a Base UI-first rewrite of Better Chat shadcn components.
- shadcn form guidance prefers `Field` components with `FieldLabel htmlFor`, control `id`, `aria-invalid`, optional description, and `FieldError`; `FieldError` renders `role="alert"` (`forms/react-hook-form.mdx:40-62`, `197-220`; `registry/new-york-v4/ui/field.tsx:81-92`, `186-231`).
- shadcn globals import `tailwindcss`, `tw-animate-css`, and `shadcn/tailwind.css`; tokens are outside `@layer`, then bridged with `@theme inline` (`apps/v4/styles/globals.css:1-3`, `18-77`, `75-160`, `162-199`; `tailwind-v4.mdx:170-192`, `280-295`). Better Agent already mirrors this.

### Base UI current practices

Evidence from Base UI docs/search:

- Base UI components expose `className`, `style`, and a **`render` prop** that accepts an element or render function; state is available to styling via data attributes. Button docs list `focusableWhenDisabled`, `nativeButton`, `render`, and `data-disabled`; loading buttons should set `focusableWhenDisabled` to avoid focus loss when disabled.
- Base UI Button docs note that unlike a native button, `type="submit"` must be specified for submit behavior. Better Agent auth forms already pass `type="submit"`.
- Base UI styling docs emphasize state data attributes and Tailwind classes; examples style Menu with `data-[popup-open]`, `data-[highlighted]`, `data-[starting-style]`, and `data-[ending-style]`.
- Base UI Select anatomy is `Select.Root`, `Label`, `Trigger`, `Value`, `Icon`, `Portal`, `Backdrop`, `Positioner`, `Popup`, `ScrollUpArrow`, `Arrow`, `List`, `Item`, `ItemText`, `ItemIndicator`, `Separator`, `Group`, `GroupLabel`; Positioner defaults include `alignItemWithTrigger`, `align`, `alignOffset`, and exposes `data-open`, `data-align`, `data-side`.
- Base UI Menu anatomy is `Menu.Root`, `Trigger`, `Portal`, `Backdrop`, `Positioner`, `Popup`, `Item`, `LinkItem`, `Separator`, submenus, groups, radio/checkbox items, and `Viewport`; checkbox items have `closeOnClick`, items expose `data-highlighted`, popups expose `data-open`.
- Base UI Switch source states `SwitchRoot` renders a `<span>` plus hidden `<input>`, supports `checked`, `defaultChecked`, `disabled`, `inputRef`, `name`, `onCheckedChange`, `readOnly`, `required`, `value`, and `uncheckedValue` (`mui/base-ui packages/react/src/switch/root/SwitchRoot.tsx`). This is good for accessible form integration but has different markup/data attributes from Radix Switch.

## Component salvage plan

### Destination package shape

Recommended `@better-agent/ui` additions:

```text
packages/ui/src/components/
  alert.tsx
  avatar.tsx            # if Base UI has no avatar equivalent, implement native fallback or add Radix explicitly
  badge.tsx
  dialog.tsx            # Base UI Dialog wrapper, not Radix copy, unless dependency decision changes
  field.tsx             # shadcn v4 Field-style form primitive or TanStack adapter
  progress.tsx          # native div or Base/Radix depending dependency decision
  select.tsx            # Base UI Select wrapper
  separator.tsx
  switch.tsx            # Base UI Switch wrapper
  textarea.tsx
  tooltip.tsx           # Base UI Tooltip wrapper or Radix dependency
```

Also consider `packages/ui/src/hooks/use-mobile.ts` only if `sidebar` is salvaged into the package.

### Low-risk direct/adapted copies

- **Alert:** Better Chat `alert.tsx` is pure div/CVA. Replace `@/web/utils/cn` with `@better-agent/ui/lib/utils`. Adjust rounded/border style to Better Agent's square visual language if desired.
- **Badge:** Pure CVA plus Radix Slot. If Better Agent wants Base UI semantics, replace `asChild`/`Slot` with either a simple `span` only or a Base UI-compatible `render` pattern. If kept as `asChild`, add an explicit Slot dependency (currently not present in `@better-agent/ui`).
- **Textarea:** pure native textarea; adjust `h-9 text-base rounded-md shadow-xs` to Better Agent compact `h-8 text-xs rounded-none` if consistency matters.
- **Separator:** can be a pure `div`/`hr` with `role="separator"` and `aria-orientation`, avoiding Radix.
- **Progress:** can be implemented as native divs with `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`; no Radix needed.

### Medium-risk primitive ports

- **Dialog:** Do not directly copy Better Chat Radix `Dialog` if the package remains Base UI-first. Implement a shadcn-shaped wrapper over Base UI Dialog (`Root`, `Trigger`, `Portal`, `Backdrop`, `Popup`, title/description/close equivalents). Preserve external API names (`Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`) so settings component salvage is mostly import-compatible. Validate focus trap, Escape close, outside click, labelled-by/description wiring, and close button `sr-only` text.
- **Select:** Radix copy uses `data-[state]`, `--radix-select-*` variables, `SelectPrimitive.Viewport`, and `position="popper"`. Base UI Select uses `Positioner`, `Popup`, `List`, `ItemText`, `ItemIndicator`, `data-open`, `data-side`, `data-align`, `--available-height`/`--anchor-width`-style positioning. Port classes and API carefully; do not leave Radix CSS vars in a Base UI wrapper.
- **Switch:** Better Chat Radix uses `data-[state=checked]`; Better Agent Base UI checkbox already uses `data-checked`. A Base UI Switch should use `data-checked`/`data-unchecked`, pass `checked`, `defaultChecked`, `onCheckedChange`, and preserve hidden input support for forms.
- **Tooltip:** Better Chat Radix Tooltip uses `TooltipProvider`, `TooltipTrigger asChild`, Radix Portal/Content/Arrow. Base UI Tooltip must use Base UI's render/data attribute API. Settings usage often wraps `TooltipProvider` redundantly; package API should make a single provider pattern clear.
- **Form/TanStack adapter:** Better Chat `tanstack-form.tsx` is valuable: generated ids, `aria-describedby`, `aria-invalid`, error messages. Recreate it with Better Agent aliases and either no Slot dependency or a Base UI-compatible `render`/composition API. Consider adding a shadcn `Field` primitive first, then a TanStack adapter.

### High-risk composites

- **Sidebar:** Better Chat `sidebar.tsx` is a large composite with cookies, mobile sheet, tooltip, `useIsMobile`, and many subcomponents. It depends on `Sheet`, `Tooltip`, `Separator`, `Input`, `Button`, `Skeleton`, and app behavior. Salvage only after Dialog/Sheet/Tooltip/Separator exist. For Better Agent's current dashboard, a simpler app-shell sidebar may be cheaper than copying the entire shadcn sidebar.
- **Settings rows/dialogs:** Good source for row layout, badges, toggles, destructive dialogs, API-key forms, usage cards. They depend on Better Chat server types (`RouterOutputs`), auth hooks, and ORPC routes. Treat as UI reference until Better Agent has equivalent data contracts.

## Accessible form/dialog/select/switch criteria

### Forms

- Each field has a stable id from `useId` or field context.
- Label `htmlFor` matches control `id`. For custom controls, ensure hidden input/id semantics work or wrap with appropriate label support.
- Controls set `aria-invalid={true}` on error.
- Descriptions and errors are included in `aria-describedby`; errors use `role="alert"` or equivalent live announcement.
- Submit buttons explicitly set `type="submit"` when using Base UI Button.
- Pending buttons use `disabled` plus `focusableWhenDisabled` where focus retention matters.
- Better Agent's current `Label` requiring `htmlFor` is good for basic inputs but too strict for generic label usage; package should either loosen `htmlFor?: string` or add `FieldLabel` that enforces correct usage via context.

### Dialogs / sheets

- Content has an accessible title (`DialogTitle`) and optional description (`DialogDescription`); if visually hidden, still present for screen readers.
- Overlay/content are portalled; focus is trapped and restored to trigger on close.
- Escape and outside-click behavior are tested.
- Close button has visible focus styles and `<span className="sr-only">Close</span>`.
- Destructive actions are separated in `DialogFooter`; pending state prevents duplicate submission.

### Select

- Trigger is labelled by `Label htmlFor` or component label.
- Placeholder state is styled via the primitive's real placeholder data attribute, not stale Radix selectors after a Base UI port.
- Keyboard navigation, typeahead, disabled items, scroll buttons/arrows, and selected item indicator work.
- Positioning classes use the right CSS variables for the chosen primitive.

### Switch

- `checked`/`defaultChecked` and `onCheckedChange` are supported.
- `name`, `value`, `required`, `disabled`, and form submission are preserved through Base UI's hidden input.
- Use `aria-label` when no visible label exists; otherwise pair with a visible label.
- Styling uses `data-checked`/`data-unchecked` for Base UI, not Radix `data-[state=checked]`.

## Styling compatibility risks

1. **Radix vs Base UI data attributes:** Better Chat uses Radix selectors such as `data-[state=open]`, `data-[state=checked]`, `data-[disabled]`, and `--radix-select-*`. Better Agent Base UI components use selectors such as `data-open`, `data-closed`, `data-checked`, `data-disabled`, `data-highlighted`, `data-popup-open`, and CSS vars like `--available-height`, `--anchor-width`, `--transform-origin`. Direct copy will silently lose styling.
2. **`asChild` vs `render`:** Better Chat uses `asChild` with Radix Slot; Better Agent Base UI uses `render={<Button />}` patterns (`UserMenu` currently uses `DropdownMenuTrigger render={<Button variant="outline" />}`). PRD should require call-site migration or a compatibility wrapper.
3. **Package dependencies:** `@better-agent/ui` currently has `@base-ui/react` but not `radix-ui`; Better Chat has `radix-ui`. Adding Radix to Better Agent should be intentional. Also align `lucide-react` versions between app/package if icons are re-exported through UI.
4. **Tailwind scanning:** Better Agent's local `@source` paths cover app/package source. If `@better-agent/ui` is ever published/consumed from `node_modules`, consuming apps need `@source` for package files or inline safelisted classes.
5. **Visual language mismatch:** Better Agent components are compact, square, text-xs, ring-based. Better Chat shadcn components are rounded-md/xl, text-sm/base, shadow-xs. Decide whether salvage should keep Better Agent's dense style or import Better Chat's softer shadcn style. Do not mix at random.
6. **Dark mode:** Better Agent root hard-codes `<html className="dark">`; globals define `.dark` custom variant. This works, but a future theme toggle needs `next-themes` provider or equivalent around the app before relying on `Toaster`'s `useTheme`.
7. **Tailwind v4 syntax:** Classes like `max-h-(--available-height)`, `w-(--anchor-width)`, `origin-(--transform-origin)`, `has-data-*`, and `not-data-*` depend on v4. Keep `@tailwindcss/vite` and v4 versions aligned.

## Route shell and dashboard empty-state recommendations

### Root/header shell

- Replace the current plain header (`text-lg`, `<hr />`) with a compact app shell using `border-b`, `bg-background/95`, `backdrop-blur`, active route styles, and `Button`/`DropdownMenu` for user actions.
- Add a `main` landmark around `Outlet` in root layout for accessibility.
- Use `h-svh` grid as-is, but ensure child routes set `overflow-hidden` or `overflow-auto` intentionally.
- Title/meta should change from `"My App"` to `"Better Agent"`.

### Dashboard empty state

Current dashboard only renders `Dashboard`, `Welcome`, and private API text. Recommended PRD target:

- Center a `Card size="sm"` or full dashboard grid with:
  - heading: “Welcome back, {name}”
  - muted description: “Create an agent, start a chat, or configure providers to begin.”
  - primary CTA: “Open AI Chat” linking to `/ai`
  - secondary CTA: “Configure providers/settings” when route exists
  - status badge/card for API health/private data
- Use `Skeleton` for query loading and `Alert variant="destructive"` for errors.
- Empty states should have an icon, concise copy, and one primary action; avoid a blank dashboard.

### AI route empty state

- Replace plain text with a centered card/panel containing suggestions (“Summarize a document”, “Draft a plan”, “Debug an error”) as buttons that fill the input.
- Keep the input bar sticky at bottom with `border-t bg-background` and label it for screen readers.
- Message bubbles should use `Card`/token colors consistently and preserve markdown/streamdown readability.

## Concrete PRD acceptance criteria

### Dependency/version alignment

- Better Agent remains on React 19 and automatic JSX runtime.
- `@better-agent/ui` primitive dependencies are explicitly documented: either Base UI-first with no `radix-ui`, or a deliberate `radix-ui` addition.
- Tailwind v4 CSS entry remains `@import "tailwindcss"` + `@theme inline` token bridge + explicit `@source` paths.
- `tw-animate-css` is used; no new `tailwindcss-animate` dependency.

### Component package

- New or salvaged components live under `packages/ui/src/components` and import `cn` from `@better-agent/ui/lib/utils`.
- Components use React 19/shadcn v4 shape: named function/const components, `React.ComponentProps`, `data-slot`, no new `forwardRef` unless strictly needed.
- No Better Chat aliases (`@/web/*`) or server types leak into `@better-agent/ui`.
- If Base UI is chosen, no Radix-specific data selectors or CSS variables remain in Base UI wrappers.
- If Radix is chosen for a component, `@better-agent/ui/package.json` includes `radix-ui` and the decision is captured in the PRD.

### Accessibility

- Dialog, select, switch, checkbox, and dropdown pass keyboard smoke tests: Tab/Shift+Tab, Enter/Space, Escape, Arrow keys where applicable.
- Dialog focus is trapped and restored; content has title/description; close button has `sr-only` text.
- Select has a labelled trigger, keyboard navigation, visible selected indicator, disabled item styling.
- Switches have visible labels or `aria-label`, support controlled state, disabled state, and form submission if used in forms.
- Forms wire `label`/`id`, `aria-invalid`, `aria-describedby`, and error text; error text is announced.

### Styling/build

- `bun run check-types` and web build pass in Better Agent.
- Tailwind generates all classes used by package and app components; no missing animation/state classes in production build.
- Light/dark screenshots for Button, Card, Dialog, Select, Switch, Badge, Alert, Tooltip, and Dashboard empty state match the chosen visual language.
- No unintentional rounded/shadow mismatch between existing Better Agent primitives and salvaged Better Chat components.

### Route UX

- Root shell includes a `main` landmark and active nav styling.
- Dashboard no longer appears as raw text; it has a useful empty state with CTA(s), loading, and error states.
- AI route has a polished empty state and accessible input form.

## Citation index

- Local Better Agent UI: `/Users/oscargabriel/Developer/projects/better-agent/packages/ui/src/components/*.tsx`, `/packages/ui/src/styles/globals.css`, `/packages/ui/package.json`.
- Local Better Agent app/routes: `/Users/oscargabriel/Developer/projects/better-agent/apps/web/src/components/*.tsx`, `/apps/web/src/routes/*.tsx`, `/apps/web/package.json`.
- Local Better Chat UI/settings: `/Users/oscargabriel/Developer/projects/better-chat/apps/web/src/components/ui/*.tsx`, `/apps/web/src/routes/settings/-components/**/*.tsx`, `/apps/web/package.json`.
- React source/docs: `facebook/react CHANGELOG.md:137-250`, `packages/react/src/ReactClient.js:20-70`, `packages/react/src/ReactHooks.js:223-237`, `packages/react-dom/src/client/ReactDOMClient.js:9-50`, `packages/react-dom-bindings/src/shared/ReactDOMFormActions.js:13-35`.
- Tailwind source/docs: `tailwindlabs/tailwindcss packages/tailwindcss/index.css:1-5`, `theme.css`, `src/index.ts:85-114`, `162-300`, `350-378`, `500-582`, `CHANGELOG.md:356-359`, `617-627`, `packages/@tailwindcss-vite/README.md:39-70`, `packages/@tailwindcss-postcss/README.md:39-116`.
- shadcn/ui source/docs: `shadcn-ui/ui apps/v4/content/docs/(root)/tailwind-v4.mdx:10-21`, `170-192`, `232-243`, `280-295`; `apps/v4/components.json:1-21`; `apps/v4/registry/new-york-v4/ui/button.tsx`, `dialog.tsx`, `select.tsx`, `switch.tsx`, `field.tsx`; `apps/v4/content/docs/forms/react-hook-form.mdx:40-62`, `197-220`; `apps/v4/content/docs/changelog/2026-01-base-ui.mdx:22-39`; `2026-02-radix-ui.mdx:7-38`.
- Base UI docs/source: `https://base-ui.com/react/components/button`, `https://base-ui.com/react/components/select`, `https://base-ui.com/react/components/menu`, `https://mui-base-ui.mintlify.app/handbook/styling`, `mui/base-ui packages/react/src/switch/root/SwitchRoot.tsx`, `packages/react/src/use-button/useButton.ts`.
