import { expect, test } from '@playwright/test'
import en from '../../../messages/en.json'
import sv from '../../../messages/sv.json'

for (const [locale, messages] of [
  ['en', en],
  ['sv', sv],
] as const) {
  test(`EXPORT-01: ${locale} explains actor, service and network admission failures`, async ({
    page,
  }) => {
    let code = 'actor_rate_limit'
    await page.route('**/api/privacy/data-subject-export', route =>
      route.fulfill({
        status: code === 'quota_check_unavailable' ? 503 : 429,
        json: {
          code,
          details: { output: 'json', retryAfterSeconds: 1 },
          error: 'Internal diagnostic that must not be displayed',
        },
        headers: { 'Cache-Control': 'no-store', 'Retry-After': '1' },
      }),
    )
    await page.goto(`/${locale}/privacy`)
    // PrivacyClient registers help in its mount effect. Wait for that effect
    // so Strict Mode's initial cleanup cannot abort the first export.
    await expect(
      page.getByRole('button', { name: messages.common.help, exact: true }),
    ).toHaveAttribute('aria-pressed', 'false')
    for (const [reason, key] of [
      ['actor_rate_limit', 'actorRate'],
      ['actor_concurrency_limit', 'actorActive'],
      ['capacity_busy', 'capacity'],
      ['quota_check_unavailable', 'unavailable'],
      ['edge_rate_limit', 'edge'],
    ] as const) {
      code = reason
      await page
        .getByRole('button', {
          name: locale === 'sv' ? 'Exportera JSON' : 'Export JSON',
          exact: true,
        })
        .click()
      const dialog = page.getByRole('alertdialog')
      await expect(dialog).toContainText(
        messages.generatedOutput.limits[key].replace('{seconds}', '1'),
      )
      await expect(dialog).not.toContainText('Internal diagnostic')
      await dialog
        .getByRole('button', { name: messages.common.close, exact: true })
        .click()
    }
  })
}
