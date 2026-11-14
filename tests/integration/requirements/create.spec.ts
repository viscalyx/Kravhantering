import { expect, test } from '@playwright/test'
import { expectApiResponseOk } from '@/tests/support/api-response-assertions'
import { DESKTOP_VIEWPORT } from '../../helpers/desktop-viewport'

test.describe('Requirement creation', () => {
  for (const viewport of [{ ...DESKTOP_VIEWPORT, label: 'desktop' }]) {
    test(`LIFE-01: form submit opens the saved requirement and records its action history (${viewport.label})`, async ({
      page,
      request,
    }) => {
      let created: { id: number; uniqueId: string }
      await test.step('prepare form data', async () => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        })

        // Get a valid requirement area for selection
        const areasRes = await request.get('/api/requirement-areas')
        await expectApiResponseOk(areasRes, 'GET requirement areas')
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
        const responsePromise = page.waitForResponse(
          response =>
            new URL(response.url()).pathname === '/api/requirements' &&
            response.request().method() === 'POST',
        )
        await page.click('button[type="submit"]')
        const response = await responsePromise
        await expectApiResponseOk(response, 'Create requirement')
        created = (await response.json()).requirement

        // Should redirect to the list (not /requirements/undefined)
        await expect(page).toHaveURL(/\/sv\/requirements(?:\?|$)/)
        expect(page.url()).not.toContain('undefined')

        // The inline detail panel should contain the requirement description.
        await expect(
          page.locator('[data-expanded-detail-cell="true"]').first(),
        ).toContainText('Playwright UI test requirement')
      })

      await test.step('find the saved requirement in the action log', async () => {
        await page.goto(
          `/sv/admin/audit-log?action=requirement.create&target_kind=Requirement&target_id=${created.id}`,
        )
        const rows = page.getByRole('row').filter({
          has: page.getByRole('cell', {
            name: 'requirement.create',
            exact: true,
          }),
        })
        await expect(rows).toHaveCount(1)
        await expect(rows).toContainText(created.uniqueId)
        await expect(rows).toContainText('Tillåten')
      })
    })
  }
})
