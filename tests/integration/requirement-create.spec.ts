import { expect, test } from '@playwright/test'

test.describe('Requirement creation', () => {
  test('POST /api/requirements persists a new requirement', async ({
    request,
  }) => {
    // Get a valid area
    const areasRes = await request.get('/api/requirement-areas')
    expect(areasRes.ok()).toBe(true)
    const areasData = (await areasRes.json()) as {
      areas: { id: number; name: string }[]
    }
    const area = areasData.areas[0]
    expect(area).toBeDefined()

    // Create requirement via API
    const createRes = await request.post('/api/requirements', {
      data: {
        areaId: area.id,
        description: 'Integration test requirement',
        requiresTesting: false,
      },
    })

    expect(createRes.status()).toBe(201)
    const created = (await createRes.json()) as {
      requirement: { id: number; uniqueId: string }
      version: { id: number; description: string }
    }
    expect(created.requirement.id).toBeGreaterThan(0)
    expect(created.requirement.uniqueId).toBeTruthy()
    expect(created.version.description).toBe('Integration test requirement')

    // Verify it persists — fetch it back
    const getRes = await request.get(
      `/api/requirements/${created.requirement.id}`,
    )
    expect(getRes.ok()).toBe(true)
    const fetched = (await getRes.json()) as {
      id: number
      uniqueId: string
    }
    expect(fetched.id).toBe(created.requirement.id)
    expect(fetched.uniqueId).toBe(created.requirement.uniqueId)
  })

  for (const viewport of [
    { width: 375, height: 812, label: 'mobile' },
    { width: 1280, height: 800, label: 'desktop' },
  ]) {
    test(`form submit redirects to list with inline detail open (${viewport.label})`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      })
      // Get a valid area for selection
      const areasRes = await request.get('/api/requirement-areas')
      const areasData = (await areasRes.json()) as {
        areas: { id: number; name: string }[]
      }
      const area = areasData.areas[0]

      await page.goto('/sv/kravkatalog/ny')

      // Select area
      await page.selectOption('#areaId', String(area.id))

      // Fill description
      await page.fill('#description', 'Playwright UI test requirement')

      // Submit the form
      await page.click('button[type="submit"]')

      // Should redirect to the list (not /kravkatalog/undefined)
      await page.waitForURL(/\/sv\/kravkatalog(?:\?|$)/, { timeout: 10000 })
      expect(page.url()).not.toContain('undefined')

      // The inline detail panel should be visible with the requirement description
      await expect(
        page.getByText('Playwright UI test requirement'),
      ).toBeVisible({
        timeout: 10000,
      })
    })
  }
})
