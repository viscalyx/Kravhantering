---
applyTo: '{components,app}/**/*.tsx'
---

# UI and User Experience

## Responsive Design

- Mobile-first: base styles for small screens, add `sm:`, `md:`, `lg:` for larger
- All layouts must work from 320px to 1440px+ (single-column mobile, multi-column desktop)
- Touch targets: buttons and links need `min-h-[44px] min-w-[44px]`
- No fixed widths — use responsive/fluid sizing (`w-full`, `max-w-*`, `flex`, `grid`)
- Test layout mentally at mobile and desktop before submitting

## Dark Mode

- Every visual element needs `dark:` Tailwind class variants (backgrounds, text, borders, hover states)

## Accessibility

- Follow Web Content Accessibility Guidelines (WCAG) 2.2 Level AA compliance (AAA as an aspirational goal where feasible)
- Semantic HTML elements over `<div>`/`<span>` + ARIA roles (Biome `a11y/useSemanticElements`)
- Proper heading order (`h1` > `h2` > `h3`)
- ARIA labels on all interactive elements
- Visible focus rings on keyboard-navigable elements
- Decorative icons: `aria-hidden="true"`

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
