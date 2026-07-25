import { expect, test } from '@playwright/test'

test.describe('Requirements Library list recovery', () => {
  test.use({ viewport: { height: 720, width: 1280 } })

  test('REQ-19: initial failure suppresses the empty state and Retry confirms an empty result', async ({
    page,
  }) => {
    let listRequests = 0
    await page.route('**/api/requirements?*', async route => {
      listRequests += 1
      if (listRequests <= 2) {
        await route.fulfill({
          contentType: 'application/json',
          json: { error: 'Temporary failure' },
          status: 503,
        })
        return
      }

      await route.fulfill({
        contentType: 'application/json',
        json: {
          pagination: { hasMore: false, nextCursor: null },
          requirements: [],
        },
        status: 200,
      })
    })

    const alert = page.getByRole('alert').filter({
      hasText: 'Informationen i kravbiblioteket är inte tillgänglig.',
    })
    const retryButton = alert.getByRole('button', { name: 'Försök igen' })

    await test.step('verify the initial list failure', async () => {
      await page.goto('/sv/requirements')

      await expect(alert).toHaveCount(1)
      await expect(
        page.getByRole('table', { name: 'Lista över krav' }),
      ).toHaveCount(0)
      await expect(page.getByText('Inga resultat hittades')).toHaveCount(0)
    })

    await test.step('retry the failed list request', async () => {
      await retryButton.click()

      await expect(retryButton).toBeFocused()
      expect(listRequests).toBe(2)
    })

    await test.step('verify the successful retry', async () => {
      await retryButton.click()

      await expect(
        page.getByRole('table', { name: 'Lista över krav' }),
      ).toHaveCount(1)
      await expect(page.getByText('Inga resultat hittades')).toHaveCount(1)
      await expect(alert).toHaveCount(0)
      expect(listRequests).toBe(3)
    })
  })

  test('REQ-20: populated rows survive a stale refresh warning and recover', async ({
    page,
  }) => {
    await page.goto('/sv/requirements')
    const seededRow = page.getByRole('button', { name: /^INT0001\b/u })
    await expect(seededRow).toHaveCount(1)

    const baseline = await page.evaluate(async () => {
      const response = await fetch(
        '/api/requirements?limit=200&locale=sv&sortBy=uniqueId&sortDirection=asc&statuses=3',
      )
      if (!response.ok) {
        throw new Error(`Could not load recovery baseline: ${response.status}`)
      }
      return response.json() as Promise<unknown>
    })

    let refreshRequests = 0
    await page.route('**/api/requirements?*', async route => {
      refreshRequests += 1
      if (refreshRequests === 1) {
        await route.fulfill({
          contentType: 'application/json',
          json: { error: 'Temporary refresh failure' },
          status: 503,
        })
        return
      }

      await route.fulfill({
        contentType: 'application/json',
        json: baseline,
        status: 200,
      })
    })

    const alert = page.getByRole('alert').filter({
      hasText:
        'Kraven som visas kan vara inaktuella eller inte stämma med aktiva filter',
    })

    await test.step('verify the refresh failure', async () => {
      await page.getByRole('button', { name: 'Sortera efter Krav-ID' }).click()

      await expect(alert).toHaveCount(1)
      await expect(seededRow).toHaveCount(1)
    })

    await test.step('retry and recover the stale list', async () => {
      await alert.getByRole('button', { name: 'Försök igen' }).click()

      await expect(alert).toHaveCount(0)
      await expect(seededRow).toHaveCount(1)
      expect(refreshRequests).toBe(2)
    })
  })
})
