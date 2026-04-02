---
applyTo: "{components/HelpPanel.tsx,app/[locale]/**/*-client.tsx}"
---

## Help Panel

### Overview

- Call `useHelpContent(HELP_CONSTANT)` at the top of each `*-client.tsx` view.
- Define `HELP_CONSTANT` at module scope with type `HelpContent`.
- Keep help keys relative to the `help` namespace.
- Keep `messages/en.json` and `messages/sv.json` aligned.

### Message Files

- Add matching `help.*` keys to `messages/en.json`.

```json
{
  "help": {
    "myView": {
      "title": "My view",
      "overview": {
        "heading": "Overview",
        "body": "Describe the workflow."
      }
    }
  }
}
```

- Add matching `help.*` keys to `messages/sv.json`.

```json
{
  "help": {
    "myView": {
      "title": "Min vy",
      "overview": {
        "heading": "Sammanfattning",
        "body": "Beskriv arbetsgangen."
      }
    }
  }
}
```

## Rules

- When adding a new client view, add `useHelpContent(...)` at the top of the component
  and define the `HelpContent` constant at module scope.
- When changing a view's features, workflow steps, or UI controls, update the matching
  `HelpContent` constant in the same file and the corresponding keys in both message files.
- When removing a view, remove its `help.*` keys from both message files.
- Keep `HelpContent` constants at module scope (not inside the component function).
- New `help` translation keys must be added to BOTH `messages/en.json` and `messages/sv.json`.
- Use text sections with `kind: 'text'`, `headingKey`, and `bodyKey`.
- Use visual sections with `kind: 'visual'`, `headingKey`, optional `bodyKey`, and `visualId`.
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
