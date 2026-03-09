---
applyTo: 'components/**/*.tsx'
---

# Components

## Structure

1. `'use client'` (only if hooks/events/animations)
2. Imports: Defer ordering to Biome's automatic import organization; use `@/*` aliases for project-internal imports to avoid relative paths
3. `interface ComponentProps { }`
4. Function declaration component
5. `export default`

## Client Islands

Components in `components/` are typically `'use client'` islands that receive data as props from server page components in `app/`. Keep them focused on interactivity — data fetching and heavy processing belong in the server page.

Examples:

- `KravkatalogClient` — server page renders it with no props; fetches requirement list client-side, handles filtering, pagination, and export
- `RequirementDetailClient` — receives `requirementId` from server page, handles status transitions, editing, and version history

## Required

- `useTranslations('section')` for all UI text (client components only; server components use `getTranslations`)
- `dark:` variants in Tailwind classes
- ARIA labels on interactive elements
- Semantic HTML, proper heading order
- Prefer semantic HTML elements over non-semantic elements with ARIA roles. Biome `a11y/useSemanticElements` enforces this (e.g. use `<output>` instead of `<div role="status">`). Do not replace a semantic element with a `<div>`/`<span>` + `role` attribute.

### Responsive (mobile + desktop)

- Mobile-first: base styles for small screens, add `sm:`, `md:`, `lg:` for larger viewports
- All layouts must work from 320px to 1440px+ (single-column mobile → multi-column desktop)
- Touch targets: buttons and links need `min-h-[44px] min-w-[44px]`
- No fixed widths — use responsive/fluid sizing (`w-full`, `max-w-*`, `flex`, `grid`)
- Test layout mentally at mobile and desktop before submitting

## Animation Patterns

Use Framer Motion with `AnimatePresence` for enter/exit transitions (e.g. modals, overlays):

```tsx
<AnimatePresence>
  {isOpen && (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
    >
      {children}
    </motion.div>
  )}
</AnimatePresence>
```

See `ConfirmModal.tsx` for a full example.

## Images

- Always use `next/image` for all images
- Include `alt` text for accessibility

## Loading States

- Implement `isLoading` state for async operations
- Disable buttons during loading: `disabled={isLoading}`
- Show loading feedback: `{isLoading ? t('saving') : t('save')}`

## After Changes

1. Add/update test: `tests/unit/component-name.test.tsx`
2. Add translations to `messages/en.json` AND `messages/sv.json`
3. Run `npm run check`
