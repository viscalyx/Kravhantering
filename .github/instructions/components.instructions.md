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

## High-Frequency Interactions

- For drag, resize, slider, or scrubber interactions, avoid controlled React state updates on every `pointermove`; use refs and throttled preview updates, then commit final state on interaction end

## After Changes

1. Add/update test: `tests/unit/component-name.test.tsx`
2. Add translations to `messages/en.json` AND `messages/sv.json`
3. Run `npm run check`
