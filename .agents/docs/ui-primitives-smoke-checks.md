# UI primitive smoke checks

Issue #10 added Base UI-first primitives to `@better-agent/ui`. Use these checks when a route first wires each primitive into the app.

## Dialog

- Tab from the trigger opens a visible focus ring.
- Enter or Space opens the dialog.
- Focus moves into the dialog and stays trapped while open.
- `DialogTitle` is present; `DialogDescription` is present when explanatory copy exists.
- Escape closes the dialog and returns focus to the trigger.
- The close button is keyboard reachable and exposes the screen-reader label `Close`.
- Destructive or submitting actions prevent duplicate submission while pending.

## Select

- The trigger has a visible label or an `aria-label`.
- Enter or Space opens the popup.
- Arrow keys move the highlighted item.
- Enter selects the highlighted item.
- Escape closes the popup without changing the current value.
- Disabled items are skipped or announced disabled.
- The selected item indicator is visible and the hidden input submits the selected value when `name` is provided.

## Switch

- The switch has a visible label or an `aria-label`.
- Space toggles checked state.
- Controlled `checked` plus `onCheckedChange` and uncontrolled `defaultChecked` both work.
- Disabled switches do not toggle and are announced disabled.
- When `name` is provided, the hidden input participates in form submission.

## Tooltip

- Hover and keyboard focus both show the tooltip after the provider delay.
- Escape dismisses an open tooltip.
- Tooltip content is supplemental only; the trigger remains understandable without it.
- The popup does not steal focus.

## Styling/build

- State styling uses Base UI attributes such as `data-open`, `data-closed`, `data-checked`, `data-unchecked`, `data-highlighted`, and `data-disabled`.
- Do not add Radix selectors such as `data-[state=checked]` or `--radix-*` variables to Base UI wrappers.
- Run `bun run check-types`, `bun x ultracite check`, and `bun run build` before merging.
