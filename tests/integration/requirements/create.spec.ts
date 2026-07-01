import { expect, test } from '@playwright/test'

test.describe('Requirement creation', () => {
  for (const viewport of [
    { width: 375, height: 812, label: 'mobile' },
    { width: 1280, height: 800, label: 'desktop' },
  ]) {
    test(`LIFE-01: form submit redirects to list with inline detail open (${viewport.label})`, async ({
      page,
      request,
    }) => {
      await test.step('prepare form data', async () => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        })

        // Get a valid requirement area for selection
        const areasRes = await request.get('/api/requirement-areas')
        expect(areasRes.ok()).toBe(true)
        const areasData = (await areasRes.json()) as {
          areas: { id: number; name: string }[]
        }
        expect(areasData.areas.length).toBeGreaterThan(0)
        const area = areasData.areas[0]

        await page.goto('/sv/requirements/new')

        // Select requirement area
        await page.selectOption('#areaId', String(area.id))

        // Fill description
        await page.fill('#description', 'Playwright UI test requirement')
      })

      await test.step('submit and return to the selected row', async () => {
        // Submit the form
        await page.click('button[type="submit"]')

        // Should redirect to the list (not /requirements/undefined)
        await expect(page).toHaveURL(/\/sv\/requirements(?:\?|$)/)
        expect(page.url()).not.toContain('undefined')

        // The inline detail panel should contain the requirement description.
        await expect(
          page.locator('[data-expanded-detail-cell="true"]').first(),
        ).toContainText('Playwright UI test requirement')
      })
    })
  }
})
