# Copilot Instructions

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript strict
- Tailwind CSS 4
- next-intl (`en`/`sv`)
- Framer Motion
- Vitest
- Self-hosted Next.js runtime
- Database: Microsoft SQL Server + TypeORM (sole stack; SQLite + Drizzle have been removed)

## Commands

- `npm run check` - all checks (`type-check`, `lint:py`,
  `format:check`, `spell:check`, `lint`, `lint:md`, `test`)
- `npm run test` - run tests
- `npm run dev` - start dev server

## General Rules

- After changes, update relevant `docs/*.md` when behavior or workflows change.
- Follow `docs/sql-server-developer-workflow.md` for database setup, migrations, seeding, and developer browse workflow expectations.
- For visible UI element, label, role, or layout surface changes, see `.github/instructions/developer-mode.instructions.md`.
- Developer Mode is a desktop-only developer tool. Its overlay, chips, badge, and toast do **not** need to follow WCAG touch-target sizes, mobile responsiveness, or accessibility guidelines. Keep chips compact so they don't obscure the underlying UI.
- When adding or changing outward-facing lifecycle, package-item status, MCP tool, report column, or admin-default behavior, update `tests/quality/QUALITY.md` and add a matching scenario in `tests/quality/functional.test.ts`. See `.github/instructions/quality-spec.instructions.md`.

## Database Schema Changes

- See `.github/instructions/database-schema.instructions.md` for all schema, migration, seed, naming, versioning, and lifecycle rules.

## UI Dialogs

<!-- markdownlint-disable MD013 -->

- Never use native `confirm()`, `alert()`, or `window.confirm()`. Use `useConfirmModal()` from `components/ConfirmModal`.
- `confirm(options)` returns `Promise<boolean>`. Options: `message` (required), `title?`, `confirmText?`, `cancelText?`, `showCancel?` (default `true`), `variant?` (`'default'` | `'danger'`), `icon?` (`'info'` | `'warning'` | `'caution'` | `LucideIcon`), `anchorEl?` (`HTMLElement`).
- Destructive actions (delete, archive) must use `variant: 'danger'` and `icon: 'caution'`.
- Alert-style dialogs (no cancel) use `showCancel: false`.
- Pass `anchorEl` for popover positioning near the trigger button. For arrow-wrapper onClick: `onClick={(e) => handler(id, e.currentTarget as HTMLElement)}`. For direct-ref onClick: add `e?: React.MouseEvent<HTMLButtonElement>` to handler, capture `e?.currentTarget` before any `await`.
- `ConfirmModalProvider` is already mounted in `app/[locale]/layout.tsx`.

<!-- markdownlint-enable MD013 -->
