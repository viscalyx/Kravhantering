---
applyTo: 'lib/**/*.ts'
---

# Utilities

## Naming

- Files: `kebab-case.ts`
- JSON type defs: `*.json.d.ts`

## Exports

```ts
export const utilityFunction = (): ReturnType => {}
export interface UtilityOptions {}
```

## TypeScript

- Explicit return types
- Interfaces for complex objects
- Avoid `any`, use `unknown` if needed

## Testing

Create tests in `lib/__tests__/utility-name.test.ts`

## Security

- Use `sanitize-html` for any user/external HTML content
- Validate file paths before dynamic imports
- Run `npm run test:security` after changes to sanitization logic
