---
applyTo: '{components,app}/**/*.tsx'
---

# UI and User Experience

## Responsive Design

- Mobile-first: base styles for small screens, add `sm:`, `md:`, `lg:` for larger
- All layouts must work from 320px to 1440px+ (single-column mobile, multi-column desktop)
- Pointer targets default to at least 24 by 24 CSS pixels, for example
  `min-h-6 min-w-6`, under WCAG 2.2 SC 2.5.8.
- Smaller custom targets are allowed only through a documented SC 2.5.8
  `spacing`, `equivalent`, `inline`, `user-agent`, or `essential` exception.
  Density preference is not an exception.
- Put the exception and evidence immediately before the shared implementation:

  ```tsx
  {/* WCAG 2.5.8 target-size exception: spacing —
      24 CSS-pixel circles do not intersect; verified by compact-target.spec.ts. */}
  ```

- Require geometry tests for `spacing`, same-page alternative coverage for
  `equivalent`, and an ADR or authoritative source for `essential`. Add focused
  coverage for `inline` where practical. Confirm `user-agent` controls are
  native and author-unmodified.
- Ordinary inline text links and unmodified browser controls do not need
  repetitive annotations. Annotate a shared custom component once, not every
  rendered instance.
- Do not use 44 CSS pixels as a product-wide minimum or recommendation. A
  component may remain larger by design.
- Code review cannot approve a target that satisfies neither size nor an
  SC 2.5.8 exception. Link true nonconformance to the accountable operator's
  legal and contractual decision; never label it WCAG-conforming.
- `npm run lint:target-size` blocks new explicit sub-24 custom targets without
  the canonical annotation. See ADR 0040.
- Avoid fixed widths; use responsive/fluid sizing (`w-full`, `max-w-*`, `flex`, `grid`)
- Fixed-format controls and data grids may use constrained or persisted widths
  when layout semantics require them.
- Developer Mode overlays, chips, badges, and toasts are desktop-only developer
  surfaces. Follow `.github/instructions/developer-mode.instructions.md` for
  their size and responsive behavior.
- Test layout mentally at mobile and desktop before submitting

## Dark Mode

- Every visual element needs `dark:` Tailwind class variants (backgrounds, text, borders, hover states)

## Accessibility

- Follow Web Content Accessibility Guidelines (WCAG) 2.2 Level AA compliance (AAA as an aspirational goal where feasible)
- Developer Mode overlays, chips, badges, and toasts are exempt from product UI
  accessibility requirements. Keep the underlying app accessible.
- Semantic HTML elements over `<div>`/`<span>` + ARIA roles (Biome `a11y/useSemanticElements`)
- Proper heading order (`h1` > `h2` > `h3`)
- ARIA labels on all interactive elements
- Visible focus rings on keyboard-navigable elements
- Decorative icons: `aria-hidden="true"`
- Never convey state through color alone (WCAG 1.4.1 Level A). Status and state components must always pair color with an icon AND an explicit text label.
- DB-driven colors applied as text foreground must satisfy WCAG 1.4.3 Level AA (≥4.5:1 for normal text, ≥3:1 for large text ≥18pt/14pt bold) against their rendered background **in both light and dark mode**. For translucent fills (e.g. `${hex}20`) on the page background, use `getReadableTextColors()` from `lib/color-contrast.ts` and emit the `--sb-fg-light` / `--sb-fg-dark` CSS variables (see `components/StatusBadge.tsx` + the `.status-badge` rule in `app/globals.css` for the pattern). Use bare `clampForReadability()` only when the backdrop is theme-independent (e.g. printed reports on white paper).
- When text is rendered on a solid (non-translucent) DB-driven background, use `pickReadableTextOn(bgHex)` to choose between `#ffffff` and `#111827`. Never hardcode `text-white` / `text-black` over a configurable color — a yellow status would render white-on-yellow and fail 1.4.3.
- Status containers that can display dynamic state must carry `role="status"` (implicit `aria-live="polite"`, WCAG 4.1.3 Level AA) so assistive technology announces updates without requiring focus movement.
- Steppers and progress indicators must use `role="group"` with a translated `aria-label` on the container and `aria-current="step"` on the currently active step element (WCAG 4.1.2 Level A).

## Form Help Texts

- Every form field that accepts user input must include a help text button (the `?` icon) and a corresponding translatable help text in both `messages/en.json` and `messages/sv.json`
- The help text should explain the purpose of the field and guide the user on what to enter
- See `RequirementForm.tsx` for the pattern using `helpButton()` and `helpPanel()`

## Discoverability

- Active-state indicators on navigation links and selected filters
- Badge counts on filter buttons when filters are active
- Clear/reset affordances visible whenever filters or selections are applied
- Group related actions near their context (inline edit buttons, row-level actions)
- Contextual help or placeholder text in empty states

## Interaction Efficiency

- Minimize clicks: prefer inline actions, toggles, and popovers over page navigation
- Use modals/popovers for quick operations instead of navigating to separate pages
- Position popovers near trigger elements (`anchorEl` pattern)
- Batch operations where users commonly act on multiple items
- Preserve scroll position and filter state across interactions

## Persisted View State

- If UI view state is stored in browser storage and its semantics change materially, version the storage key instead of reusing incompatible stored data

## Visual Feedback

- Loading: disable buttons during async ops, swap label to loading text
- Transitions: animate enter/exit for modals, overlays, expanding sections
- Success/error: provide clear post-action cues (toast, status change, color shift)
- Disabled states: visually dim unavailable actions, add `title` or tooltip explaining why

## Integration Testing

- Cover UI changes with Playwright tests in `tests/integration/`
- Test user-visible flows end-to-end: navigation, form submission, filtering, status transitions
- Config auto-starts the dev server; run with `npx playwright test`
