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
- Database: Microsoft SQL Server + TypeORM (sole stack)

## Commands

- `npm run check` - all checks (`type-check`, `lint:py`,
  `dotenv:check`, `format:check`, `spell:check`, `lint`, `lint:md`,
  `test`)
- `npm run test` - run tests
- `npm run dev` - start dev server

## Authenticated HTTP requests against the dev server

- Never use plain `curl` against the running dev server. Every protected route returns `302 /api/auth/login`, so a bare `curl` only sees the redirect.
- Use `scripts/dev-curl.sh` instead. It logs in once via the dev Keycloak realm (default user `ada.admin` / password `devpass`), caches the cookie jar under `.auth/<user>.cookies`, and runs `curl -b <jar>` with the args you pass.
- Bare paths starting with `/` are resolved against `$DEV_LOGIN_BASE_URL` (default `http://localhost:3000`), so `scripts/dev-curl.sh -s /api/auth/me` works.
- Switch user with `DEV_LOGIN_USER=rita.reviewer scripts/dev-curl.sh ...`. Switch host with `DEV_LOGIN_BASE_URL=...`. Force re-login with `node scripts/dev-login.mjs --force`. See `docs/auth-developer-workflow.md` for details.


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
