import { expect, test } from '@playwright/test'

test.describe('Requirement selection question detail preview', () => {
  test.use({ viewport: { height: 720, width: 1280 } })

  test('REQ-14c: opens a library-style read-only requirement detail card from the answer modal', async ({
    page,
  }) => {
    await test.step('open a seeded requirement-selection answer for editing', async () => {
      await page.goto('/sv/requirements/stewardship?tab=questions')

      await expect(
        page.getByRole('heading', { level: 1, name: 'Kravurvalsfrågor' }),
      ).toBeVisible()
      await page.getByRole('button', { name: /SÄK-KUF001/ }).click()

      const answerRow = page
        .getByText('Grundskydd för intern information', { exact: true })
        .locator('xpath=ancestor::li[1]')
      await expect(answerRow).toContainText('Grundskydd för intern information')
      await answerRow.getByRole('button', { name: 'Redigera' }).click()

      await expect(
        page.getByRole('dialog', { name: 'Redigera kravurvalsvar' }),
      ).toBeVisible()
    })

    const dialog = page.getByRole('dialog', {
      name: 'Redigera kravurvalsvar',
    })
    const requirementId = 'SÄK0042'

    await test.step('expand a requirement in the selection preview', async () => {
      const requirementButton = dialog.getByRole('button', {
        name: `Öppna kravdetaljer ${requirementId}`,
      })

      await expect(requirementButton).toHaveAttribute('aria-expanded', 'false')
      await requirementButton.click()
      await expect(requirementButton).toHaveAttribute('aria-expanded', 'true')
    })

    await test.step('verify the library-style read-only detail card layout', async () => {
      const expandedRequirement = dialog
        .getByRole('button', {
          name: `Öppna kravdetaljer ${requirementId}`,
        })
        .locator('xpath=ancestor::li[1]')

      await expect(
        expandedRequirement.getByRole('heading', { name: 'Kravtext' }),
      ).toHaveCount(1)

      await expect(
        expandedRequirement.getByRole('heading', { name: 'Kravtext' }),
      ).toBeVisible()
      await expect(expandedRequirement).toContainText(
        'Skyddade routes ska returnera 302',
      )
      await expect(
        expandedRequirement.getByRole('heading', { name: requirementId }),
      ).toHaveCount(0)
      await expect(
        dialog.getByRole('button', { name: 'Arkivera' }),
      ).toHaveCount(0)
    })
  })

  test('REQ-14d: keeps answer-editor removal controls at least 24 CSS pixels', async ({
    page,
  }) => {
    for (const viewport of [
      { height: 720, name: 'desktop', width: 1280 },
      { height: 812, name: 'mobile', width: 375 },
    ]) {
      await test.step(`open the seeded answer at ${viewport.name} size`, async () => {
        await page.setViewportSize(viewport)
        await page.goto('/sv/requirements/stewardship?tab=questions')

        await expect(
          page.getByRole('heading', { level: 1, name: 'Kravurvalsfrågor' }),
        ).toBeVisible()
        await page.getByRole('button', { name: /SÄK-KUF001/ }).click()

        const answerRow = page
          .getByText('Grundskydd för intern information', { exact: true })
          .locator('xpath=ancestor::li[1]')
        await answerRow.getByRole('button', { name: 'Redigera' }).click()
      })

      await test.step(`measure both removal targets at ${viewport.name} size`, async () => {
        const dialog = page.getByRole('dialog', {
          name: 'Redigera kravurvalsvar',
        })
        const removalControls = [
          dialog.getByRole('button', { name: /^Ta bort paket / }),
          dialog.getByRole('button', { name: 'Ta bort krav SÄK0042' }),
        ]

        for (const control of removalControls) {
          const pill = control.locator('xpath=parent::span')
          const neighboringLabel = control.locator(
            'xpath=preceding-sibling::span[1]',
          )

          await control.scrollIntoViewIfNeeded()
          await expect
            .poll(async () => (await control.boundingBox())?.height ?? 0)
            .toBeGreaterThanOrEqual(24)
          await expect
            .poll(async () => (await control.boundingBox())?.width ?? 0)
            .toBeGreaterThanOrEqual(24)
          await expect
            .poll(async () => {
              const [controlBounds, pillBounds, neighboringLabelBounds] =
                await Promise.all([
                  control.boundingBox(),
                  pill.boundingBox(),
                  neighboringLabel.boundingBox(),
                ])

              if (!controlBounds || !pillBounds || !neighboringLabelBounds) {
                return false
              }

              const controlIsInsidePill =
                controlBounds.x >= pillBounds.x &&
                controlBounds.y >= pillBounds.y &&
                controlBounds.x + controlBounds.width <=
                  pillBounds.x + pillBounds.width &&
                controlBounds.y + controlBounds.height <=
                  pillBounds.y + pillBounds.height
              const overlapsNeighboringLabel =
                controlBounds.x <
                  neighboringLabelBounds.x + neighboringLabelBounds.width &&
                controlBounds.x + controlBounds.width >
                  neighboringLabelBounds.x &&
                controlBounds.y <
                  neighboringLabelBounds.y + neighboringLabelBounds.height &&
                controlBounds.y + controlBounds.height >
                  neighboringLabelBounds.y

              return controlIsInsidePill && !overlapsNeighboringLabel
            })
            .toBe(true)
        }
      })
    }
  })
})
