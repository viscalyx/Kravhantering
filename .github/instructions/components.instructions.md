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
- Reference examples: `RequirementsClient`, `RequirementDetailClient`.

## Required

- `useTranslations('section')` for all UI text (client components only; server components use `getTranslations`)
- Developer Mode labels stay in English. Follow
  `.github/instructions/developer-mode.instructions.md` for that surface.

## Animation Patterns

- Use Framer Motion with `AnimatePresence` for enter/exit transitions (modals, overlays).
- Respect `prefers-reduced-motion` for every Framer Motion surface. Import
  `useReducedMotion()` and route props through `lib/reduced-motion.ts` so
  reduced motion removes scale, slide, height, offset, and repeating movement.
- See `ConfirmModal.tsx` for a reference implementation.

```tsx
const shouldReduceMotion = useReducedMotion()

<AnimatePresence>
  {isOpen && (
    <motion.div
      {...dialogPanelMotion(shouldReduceMotion)}
    >
      {children}
    </motion.div>
  )}
</AnimatePresence>
```

## Images

- Use `next/image` for product UI images.
- Report PDF renderers may use the image primitive required by `@react-pdf/renderer`
  instead of `next/image`.
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
