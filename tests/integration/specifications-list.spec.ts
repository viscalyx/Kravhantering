import { expect, test } from '@playwright/test'

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 720 },
]

for (const viewport of viewports) {
  test.describe(`Requirements specifications list filter — ${viewport.name} (${viewport.width}×${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test('filters the table by specification name and clears the search', async ({
      page,
    }) => {
      await page.goto('/specifications')

      await expect(page).toHaveURL(/\/sv\/specifications$/)
      await expect(page).toHaveTitle(/Kravunderlag/)
      await expect(
        page.getByRole('heading', { level: 1, name: 'Kravunderlag' }),
      ).toBeVisible()

      const nameFilter = page.getByRole('textbox', {
        name: 'Filtrera på namn',
      })
      await expect(nameFilter).toBeVisible()
      const createButton = page.getByRole('button', {
        name: 'Nytt kravunderlag',
      })
      await expect(createButton).toBeVisible()
      const areaPill = page
        .locator('[data-specification-requirement-area-pill="true"]')
        .first()
      await expect(areaPill).toBeVisible()
      await expect(areaPill).toHaveJSProperty('tagName', 'SPAN')
      await expect(areaPill).toHaveClass(/text-\[11px\]/)
      const editAction = page.getByRole('button', { name: 'Redigera' }).first()
      const deleteAction = page.getByRole('button', { name: 'Ta bort' }).first()
      await expect(editAction).toBeVisible()
      await expect(deleteAction).toBeVisible()
      await expect(editAction).not.toContainText('Redigera')
      await expect(deleteAction).not.toContainText('Ta bort')
      await expect(editAction.locator('svg')).toBeVisible()
      await expect(deleteAction.locator('svg')).toBeVisible()

      if (viewport.name === 'desktop') {
        const tableSurface = page.getByRole('table')

        await expect(tableSurface).toHaveCount(1)

        const buttonBox = await createButton.boundingBox()
        const tableBox = await tableSurface.boundingBox()

        expect(buttonBox).not.toBeNull()
        expect(tableBox).not.toBeNull()
        expect(buttonBox?.x ?? 0).toBeGreaterThan(
          (tableBox?.x ?? 0) + (tableBox?.width ?? 0) - 60,
        )
        expect(
          Math.abs((buttonBox?.y ?? 0) - ((tableBox?.y ?? 0) + 4)),
        ).toBeLessThanOrEqual(12)
        await expect(
          page.locator('[data-floating-action-rail-placement="fixed-right"]'),
        ).toBeVisible()
        await expect(
          createButton.locator(
            'xpath=ancestor::*[@data-floating-action-rail="true"]',
          ),
        ).toHaveAttribute('data-floating-action-rail-placement', 'fixed-right')
      }

      await test.step('show the signed-in specification lead when creating', async () => {
        await createButton.click()

        const createForm = page.locator(
          '[data-developer-mode-context="specifications"][data-developer-mode-value="create"]',
        )
        await expect(createForm).toBeVisible()
        const responsibleInput = createForm.getByRole('textbox', {
          name: 'Kravunderlagsansvarigs HSA-ID',
        })
        await expect(responsibleInput).toHaveValue('SE5560000001-admin1')
        await expect(responsibleInput).toHaveAttribute('readonly', '')
        await expect(
          createForm.getByRole('button', { name: 'Hämta' }),
        ).toBeVisible()
        await expect(createForm.getByText(/Ada Admin/)).toBeVisible()

        await createForm.getByRole('button', { name: 'Avbryt' }).click()
        await expect(createForm).toBeHidden()
      })

      await test.step('open responsible change modal from the list edit form', async () => {
        const row = page.getByRole('row', {
          name: /Upphandling av e-tjänstplattform/,
        })
        await row.getByRole('button', { name: 'Redigera' }).click()

        const editForm = page.locator(
          '[data-developer-mode-context="specifications"][data-developer-mode-name="crud form"][data-developer-mode-value="edit"]',
        )
        await expect(editForm).toBeVisible()
        const responsibleInput = editForm.getByRole('textbox', {
          name: 'Kravunderlagsansvarigs HSA-ID',
        })
        await expect(responsibleInput).toHaveAttribute('readonly', '')
        await expect(editForm.getByText('Emma Lindqvist')).toBeVisible()

        const currentResponsibleHsaId = await responsibleInput.inputValue()
        await editForm
          .getByRole('button', { name: 'Byt kravunderlagsansvarig' })
          .click()

        const changeDialog = page.getByRole('dialog', {
          name: 'Byt kravunderlagsansvarig',
        })
        await expect(changeDialog).toBeVisible()
        await expect(
          changeDialog.getByRole('textbox', {
            name: 'Förra kravunderlagsansvarigs HSA-ID',
          }),
        ).toHaveValue(currentResponsibleHsaId)
        const newResponsibleInput = changeDialog.getByRole('textbox', {
          name: 'Nya kravunderlagsansvarigs HSA-ID',
        })
        await expect(newResponsibleInput).toBeVisible()
        await expect(
          changeDialog.getByRole('button', { name: 'Hämta' }),
        ).toBeVisible()

        await newResponsibleInput.fill(currentResponsibleHsaId)
        await expect(changeDialog.getByRole('alert')).toContainText(
          'måste skilja sig',
        )
        await changeDialog.getByRole('button', { name: 'Avbryt' }).click()
        await expect(changeDialog).toBeHidden()
        await editForm.getByRole('button', { name: 'Avbryt' }).click()
        await expect(editForm).toBeHidden()
      })

      const hasMultiAreaSpecification = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll(
            '[data-specification-requirement-area-pills="true"]',
          ),
        ).some(
          group =>
            group.querySelectorAll(
              '[data-specification-requirement-area-pill="true"]',
            ).length > 1,
        ),
      )
      expect(hasMultiAreaSpecification).toBe(true)

      await page.evaluate(() => {
        const descriptor = Object.getOwnPropertyDescriptor(
          HTMLElement.prototype,
          'scrollHeight',
        )

        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
          configurable: true,
          get() {
            const element = this as HTMLElement
            if (
              element.dataset.specificationRequirementAreaPillList === 'true'
            ) {
              return 48
            }

            return descriptor?.get?.call(this) ?? 0
          },
        })

        window.dispatchEvent(new Event('resize'))
      })

      const areaToggle = page
        .locator('[data-specification-requirement-area-pill-toggle="true"]')
        .first()
      const areaList = areaToggle.locator(
        'xpath=../*[@data-specification-requirement-area-pill-list="true"]',
      )
      await expect(areaToggle).toBeVisible()
      await expect(areaToggle).toHaveAttribute('aria-expanded', 'false')
      await expect(areaList).toHaveClass(/max-h-6/)
      const areaToggleBox = await areaToggle.boundingBox()
      expect(areaToggleBox).not.toBeNull()
      expect(areaToggleBox?.height ?? 0).toBeGreaterThanOrEqual(44)
      expect(areaToggleBox?.width ?? 0).toBeGreaterThanOrEqual(44)

      await areaToggle.click()
      await expect(areaToggle).toHaveAttribute('aria-expanded', 'true')
      await expect(areaList).not.toHaveClass(/max-h-6/)

      await areaToggle.click()
      await expect(areaToggle).toHaveAttribute('aria-expanded', 'false')
      await expect(areaList).toHaveClass(/max-h-6/)

      await nameFilter.fill('e-tjänst')

      await expect(
        page.getByRole('link', { name: 'Upphandling av e-tjänstplattform' }),
      ).toBeVisible()
      await expect(
        page.getByRole('link', { name: 'Införande av säkerhetslyft Q2' }),
      ).toBeHidden()

      await page.getByRole('button', { name: 'Rensa sökning' }).click()

      await expect(nameFilter).toHaveValue('')
      await expect(
        page.getByRole('link', { name: 'Upphandling av e-tjänstplattform' }),
      ).toBeVisible()
      await expect(
        page.getByRole('link', { name: 'Införande av säkerhetslyft Q2' }),
      ).toBeVisible()
    })
  })
}
