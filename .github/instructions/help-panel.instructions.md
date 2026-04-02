---
applyTo: "{components/HelpPanel.tsx,app/[locale]/**/*-client.tsx}"
---

# Help Panel

## Overview

Every `*-client.tsx` view registers its help content via `useHelpContent(HELP_CONSTANT)`.
The module-scope constant (type `HelpContent`) uses keys relative to the `help` namespace in
`messages/en.json` and `messages/sv.json`.

## Rules

- When adding a new client view, add `useHelpContent(...)` at the top of the component
  and define the `HelpContent` constant at module scope.
- When changing a view's features, workflow steps, or UI controls, update the matching
  `HelpContent` constant in the same file and the corresponding keys in both message files.
- When removing a view, remove its `help.*` keys from both message files.
- Keep `HelpContent` constants at module scope (not inside the component function).
- New `help` translation keys must be added to BOTH `messages/en.json` and `messages/sv.json`.
- `HelpContent.sections` is a discriminated union:
  - text sections use `kind: 'text'`, `headingKey`, and `bodyKey`
  - visual sections use `kind: 'visual'`, `headingKey`, optional `bodyKey`, and `visualId`
- Keep help visuals translation-driven; do not pass arbitrary JSX through `HelpContent`.

## Pattern

```tsx
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'

const MY_VIEW_HELP: HelpContent = {
  titleKey: 'myView.title',
  sections: [
    {
      kind: 'text',
      headingKey: 'myView.overview.heading',
      bodyKey: 'myView.overview.body',
    },
  ],
}

export default function MyViewClient() {
  useHelpContent(MY_VIEW_HELP)
  // ...
}
```
