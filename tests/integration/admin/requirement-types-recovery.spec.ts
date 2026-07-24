import { expect, test } from '@playwright/test'

test.describe('Requirement types catalog recovery', () => {
  test('ADMIN-16: retains types and retries unavailable quality characteristics', async ({
    page,
  }) => {
    let qualityCharacteristicsRequests = 0
    let releaseRecoveryRequest = () => {}
    let markRecoveryRequestStarted = () => {}
    const recoveryRequestStarted = new Promise<void>(resolve => {
      markRecoveryRequestStarted = resolve
    })
    await page.route('**/api/quality-characteristics', async route => {
      qualityCharacteristicsRequests += 1
      if (qualityCharacteristicsRequests === 1) {
        await route.fulfill({
          body: JSON.stringify({ error: 'simulated upstream detail' }),
          contentType: 'application/json',
          status: 503,
        })
        return
      }
      markRecoveryRequestStarted()
      await new Promise<void>(resolve => {
        releaseRecoveryRequest = resolve
      })
      await route.continue()
    })

    await page.goto('/sv/requirement-types')

    await expect(
      page.getByRole('heading', { level: 1, name: 'Typer' }),
    ).toHaveCount(1)
    await expect(
      page.getByRole('heading', { level: 2, name: 'Funktionellt' }).first(),
    ).toHaveText('Funktionellt')
    const alert = page.getByRole('alert').filter({
      hasText: 'Vissa katalogdata kunde inte läsas in',
    })
    await expect(alert).toContainText('Kvalitetsegenskaper')
    await expect(alert).toContainText('Tjänsten är tillfälligt otillgänglig.')
    await expect(alert).not.toContainText('simulated upstream detail')
    await expect(page.getByText('Inga resultat hittades')).toHaveCount(0)
    await expect(
      page.getByText('Kvalitetsegenskaper är inte tillgängliga.'),
    ).toHaveCount(2)

    const retry = alert.getByRole('button')
    await expect(retry).toHaveText('Försök igen')
    await retry.click()
    await recoveryRequestStarted
    await expect(retry).toBeDisabled()
    await expect(retry).toHaveText('Försöker igen…')
    releaseRecoveryRequest()

    await expect(page.getByText('Funktionell lämplighet')).toHaveCount(1)
    await expect(
      page.getByRole('status').filter({
        hasText: 'Katalogdata är tillgängliga igen.',
      }),
    ).toHaveCount(1)
    await expect(alert).toHaveCount(0)
    expect(qualityCharacteristicsRequests).toBe(2)
  })
})
