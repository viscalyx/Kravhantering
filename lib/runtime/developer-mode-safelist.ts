/**
 * Tailwind v4 safelist for the @viscalyx/developer-mode-react overlay.
 *
 * Tailwind v4 excludes node_modules from automatic source detection, so the
 * Tailwind utility classes hard-coded inside the published package's
 * `dist/index.js` would otherwise never be generated and the badge/chip/toast
 * would render unstyled. We mirror those class strings verbatim here and
 * `@source` this file from `app/globals.css`. Keeping the safelist in our
 * own source tree means the production bundle is independent of whether
 * the developer-mode packages are installed at build time.
 *
 * If the upstream package adds new classes, copy the literal strings here.
 * The accompanying unit test in
 * `tests/unit/developer-mode-safelist.test.ts` guards against silent drift.
 *
 * The file deliberately exports nothing functional — its sole purpose is to
 * surface class strings to Tailwind's source scanner.
 */

export const DEVELOPER_MODE_OVERLAY_CLASSES = [
  // overlay root
  'pointer-events-none fixed inset-0 z-[100]',
  // hover outline
  'fixed rounded-lg border-2 border-primary-500/80 bg-primary-500/8 shadow-[0_0_0_1px_rgba(59,130,246,0.18)]',
  // badge ("Developer Mode")
  'pointer-events-none fixed right-4 top-20 rounded-full border border-primary-300/70 bg-white/92 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary-700 shadow-sm backdrop-blur-sm dark:border-primary-700/60 dark:bg-secondary-900/92 dark:text-primary-300',
  // hovered-element chip (copy-to-clipboard pill)
  'pointer-events-auto fixed max-w-64 truncate rounded-full border border-primary-300/80 bg-white/96 px-2.5 py-1 text-[11px] font-medium text-primary-900 shadow-[0_12px_24px_-18px_rgba(15,23,42,0.65)] backdrop-blur-sm transition hover:-translate-y-px hover:z-10 hover:border-primary-500 hover:bg-primary-50 focus-visible:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-primary-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-primary-700/70 dark:bg-secondary-900/96 dark:text-primary-200 dark:hover:bg-secondary-800',
  // toast container (always-on classes)
  'pointer-events-none fixed bottom-4 right-4 max-w-md rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur-sm',
  // toast — success tone
  'border-emerald-300/80 bg-emerald-50/95 text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-950/85 dark:text-emerald-100',
  // toast — error tone
  'border-red-300/80 bg-red-50/95 text-red-900 dark:border-red-700/60 dark:bg-red-950/85 dark:text-red-100',
] as const
