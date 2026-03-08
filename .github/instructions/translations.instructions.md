---
applyTo: 'messages/*.json'
---

# Translations

## Files

- `messages/en.json` (primary)
- `messages/sv.json` (Swedish)
- Page-specific: `{cookies,privacy,terms}.{en,sv}.json`

## Key Format

`section.item.property` → e.g., `hero.cta.label`

## Rules

- Always update BOTH `en.json` AND `sv.json`
- Nested objects for related content
- No trailing commas (JSON)
- Interpolation: `"Hello, {name}!"`
