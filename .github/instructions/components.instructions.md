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

- Components in `components/` are typically `'use client'` islands that receive data as props from server pages in `app/`.
- Keep them focused on interactivity. Data fetching and heavy processing belong in the server page.
- Reference examples: `KravkatalogClient`, `RequirementDetailClient`.

## Required

- `useTranslations('section')` for all UI text (client components only; server components use `getTranslations`)

## Animation Patterns

- Use Framer Motion with `AnimatePresence` for enter/exit transitions (modals, overlays).
- See `ConfirmModal.tsx` for a reference implementation.

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

## Images

- Always use `next/image` for all images
- Include `alt` text for accessibility

## Loading States

- Track an `isLoading` boolean for async work started by the component.
- Disable conflicting controls while work is pending, for example `disabled={isLoading}` on buttons.
- Show inline loading feedback in the UI text, for example `{isLoading ? t('saving') : t('save')}`.

## High-Frequency Interactions

- For drag, resize, slider, or scrubber interactions, avoid controlled React state updates during every pointer move; use refs and throttled preview updates, then commit final state on interaction end

## After Changes

1. Add/update test: `tests/unit/component-name.test.tsx`
2. Add translations to `messages/en.json` AND `messages/sv.json`
3. Run `npm run check`
