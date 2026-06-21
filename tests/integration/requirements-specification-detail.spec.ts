import { expect, type Page, test } from '@playwright/test'

const specificationSlug = 'ETJANST-UPP-2026'

async function warmSpecificationDetailApi(page: Page): Promise<void> {
  const url = `/api/requirements-specifications/${specificationSlug}/available-requirements?limit=5&locale=sv&sortBy=uniqueId&sortDirection=asc`
  const response = await page.request.get(url, {
    headers: { Accept: 'application/json' },
  })
  if (response.ok()) return

  throw new Error(
    `Specification detail API warmup failed for ${url}: ${response.status()} ${(
      await response.text()
    ).slice(0, 500)}`,
  )
}

async function gotoSpecificationDetail(page: Page): Promise<void> {
  await warmSpecificationDetailApi(page)
  await page.goto(`/sv/specifications/${specificationSlug}`)
  await expect(
    page.getByText(/^Det gick inte att läsa in tillgängliga krav:/),
  ).toBeHidden({ timeout: 10_000 })
}

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 720 },
]

for (const viewport of viewports) {
  test.describe(`Requirements specification detail edit action — ${viewport.name} (${viewport.width}×${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test('opens the specification edit dialog from the title action', async ({
      page,
    }) => {
      await gotoSpecificationDetail(page)

      await expect(
        page.getByRole('heading', {
          level: 1,
          name: 'Upphandling av e-tjänstplattform',
        }),
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Nytt unikt krav' }),
      ).toBeVisible()

      const splitPanel = page.locator(
        '[data-specification-detail-split-panel="true"]',
      )
      const splitPanelClassesBefore = await splitPanel.getAttribute('class')
      expect(splitPanelClassesBefore).not.toBeNull()
      if (splitPanelClassesBefore === null) {
        throw new Error('Specification detail split panel has no class list.')
      }

      await page.getByRole('button', { name: 'Redigera kravunderlag' }).click()

      const editDialog = page.getByRole('dialog', {
        name: 'Redigera kravunderlag',
      })
      await expect(editDialog).toBeVisible()
      await expect(editDialog.getByLabel('Namn *')).toHaveValue(
        'Upphandling av e-tjänstplattform',
      )
      await expect(splitPanel).toHaveAttribute('class', splitPanelClassesBefore)
      const editForm = editDialog.locator('form#requirement-specification-form')
      const nameInput = editDialog.getByLabel('Namn *')
      const saveButton = editForm.getByRole('button', { name: 'Spara' })
      await expect(saveButton).toBeDisabled()
      await expect(saveButton).toHaveAttribute(
        'title',
        'Inga ändringar att spara',
      )
      await nameInput.fill('Upphandling av e-tjänstplattform ändrad')
      await expect(saveButton).toBeEnabled()
      await page.mouse.click(2, 2)
      await expect(editDialog).toBeVisible()
      await expect(
        page.getByRole('alertdialog', {
          name: 'Du har osparade ändringar. Vill du förkasta dem?',
        }),
      ).toBeHidden()
      await editDialog.getByRole('button', { name: 'Stäng' }).click()
      const discardDialog = page.getByRole('alertdialog', {
        name: 'Du har osparade ändringar. Vill du förkasta dem?',
      })
      await expect(discardDialog).toBeVisible()
      await discardDialog.getByRole('button', { name: 'Avbryt' }).click()
      await expect(discardDialog).toBeHidden()
      await expect(editDialog).toBeVisible()
      await expect(nameInput).toHaveValue(
        'Upphandling av e-tjänstplattform ändrad',
      )
      await nameInput.fill('Upphandling av e-tjänstplattform')
      await expect(saveButton).toBeDisabled()
      const responsibleInput = editForm.getByRole('textbox', {
        name: 'Kravunderlagsansvarigs HSA-id',
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
          name: 'Förra kravunderlagsansvarigs HSA-id',
        }),
      ).toHaveValue(currentResponsibleHsaId)
      await expect(
        changeDialog.getByRole('textbox', {
          name: 'Nya kravunderlagsansvarigs HSA-id',
        }),
      ).toBeVisible()
    })

    if (viewport.name === 'desktop') {
      test('lets the specification-detail lists scroll independently while keeping the sticky title bars visible', async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: 560 })
        await gotoSpecificationDetail(page)
        const activeViewport = page.viewportSize()
        const activeViewportWidth = activeViewport?.width ?? viewport.width
        const activeViewportHeight = activeViewport?.height ?? 560

        const leftPanel = page.locator(
          '[data-specification-detail-list-panel="items"]',
        )
        const leftEmptyState = page.getByText(
          'Det finns inga krav kopplade till detta kravunderlag.',
        )
        const rightPanel = page.locator(
          '[data-specification-detail-list-panel="available"]',
        )
        const leftTopBar = leftPanel.locator(
          '[data-requirements-sticky-top-bar="true"]',
        )
        const leftTrigger = leftPanel.locator(
          '[data-column-picker-trigger="true"]',
        )
        const leftItemsTab = leftPanel.getByRole('tab', {
          name: /Krav i underlaget/,
        })
        const leftNeedsReferencesTab = leftPanel.getByRole('tab', {
          name: /Behovsreferenser/,
        })
        const leftHeaderLabel = leftPanel.locator(
          '[data-requirement-header-label="uniqueId"]',
        )
        const rightTopBar = rightPanel.locator(
          '[data-requirements-sticky-top-bar="true"]',
        )
        const rightTrigger = rightPanel.locator(
          '[data-column-picker-trigger="true"]',
        )
        const rightAvailableTab = rightTopBar.getByRole('tab', {
          name: /Tillgängliga krav/,
        })
        const rightQuestionsTab = rightTopBar.getByRole('tab', {
          name: /Kravurvalsfrågor/,
        })
        const requirementSelectionSwitch = rightTopBar.getByRole('switch', {
          name: 'Filtrera med kravurvalsfrågor',
        })
        const rightHeaderLabel = rightPanel.locator(
          '[data-requirement-header-label="uniqueId"]',
        )

        await expect(rightPanel).toBeVisible()
        await expect(rightTopBar).toBeVisible()
        await expect(rightTrigger).toBeVisible()
        await expect(rightAvailableTab).toBeVisible()
        await expect(rightQuestionsTab).toBeVisible()
        await expect(requirementSelectionSwitch).toBeVisible()
        await expect(requirementSelectionSwitch).not.toBeChecked()
        await requirementSelectionSwitch.click()
        await expect(requirementSelectionSwitch).toBeChecked()
        await expect(rightHeaderLabel).toBeVisible()
        const hasLeftPanel = (await leftPanel.count()) > 0
        if (hasLeftPanel) {
          await expect(leftPanel).toBeVisible()
          await expect(leftTopBar).toBeVisible()
          await expect(leftTrigger).toBeVisible()
          await expect(leftItemsTab).toBeVisible()
          await expect(leftNeedsReferencesTab).toBeVisible()
          await expect(leftHeaderLabel).toBeVisible()
        } else {
          await expect(leftEmptyState).toBeVisible()
        }
        await expect
          .poll(async () => page.evaluate(() => Math.round(window.scrollY)))
          .toBe(0)

        let leftHasOverflow = hasLeftPanel
          ? await leftPanel.evaluate(
              node => node.scrollHeight > node.clientHeight + 50,
            )
          : false
        let rightHasOverflow = await rightPanel.evaluate(
          node => node.scrollHeight > node.clientHeight + 50,
        )

        if (!leftHasOverflow && !rightHasOverflow && hasLeftPanel) {
          const firstLeftRow = leftPanel.locator('tbody tr').first()
          await firstLeftRow.click()
          await expect(
            leftPanel.locator('[data-expanded-detail-cell="true"]'),
          ).toBeVisible()

          ;[leftHasOverflow, rightHasOverflow] = await Promise.all([
            leftPanel.evaluate(
              node => node.scrollHeight > node.clientHeight + 50,
            ),
            rightPanel.evaluate(
              node => node.scrollHeight > node.clientHeight + 50,
            ),
          ])
        }

        const beforeLeftScrollTop = hasLeftPanel
          ? await leftPanel.evaluate(node => node.scrollTop)
          : 0
        const beforeRightScrollTop = await rightPanel.evaluate(
          node => node.scrollTop,
        )
        const desktopNavRailBox = await page
          .locator('[data-global-navigation-rail="desktop"]')
          .boundingBox()
        const rightPanelBox = await rightPanel.boundingBox()

        expect(desktopNavRailBox).not.toBeNull()
        if (!desktopNavRailBox) {
          throw new Error('Desktop side navigation rail did not expose a box.')
        }
        expect(rightPanelBox).not.toBeNull()
        if (!rightPanelBox) {
          throw new Error(
            'Available requirements split panel did not expose a bounding box.',
          )
        }

        expect(rightPanelBox.x + rightPanelBox.width).toBeGreaterThanOrEqual(
          activeViewportWidth - 8,
        )
        expect(rightPanelBox.y + rightPanelBox.height).toBeLessThanOrEqual(
          activeViewportHeight,
        )
        if (hasLeftPanel) {
          const leftPanelBox = await leftPanel.boundingBox()

          expect(leftPanelBox).not.toBeNull()
          if (!leftPanelBox) {
            throw new Error('Items split panel did not expose a bounding box.')
          }

          expect(leftPanelBox.x).toBeGreaterThanOrEqual(
            desktopNavRailBox.x + desktopNavRailBox.width - 1,
          )
          expect(leftPanelBox.y + leftPanelBox.height).toBeLessThanOrEqual(
            activeViewportHeight,
          )
        }
        // If neither panel overflows (e.g. in CI with a small fixture dataset
        // or a large viewport) the scroll-sync behaviour cannot be exercised.
        // Skip rather than assert on a precondition that isn't met.
        if (!rightHasOverflow && !leftHasOverflow) {
          return
        }

        const scrollPanel = rightHasOverflow ? rightPanel : leftPanel
        const beforeScrollTop = rightHasOverflow
          ? beforeRightScrollTop
          : beforeLeftScrollTop
        const beforeTopBarBox = await rightTopBar.boundingBox()
        expect(beforeTopBarBox).not.toBeNull()
        if (!beforeTopBarBox) {
          throw new Error(
            'Available requirements sticky title bar did not expose a bounding box.',
          )
        }

        await scrollPanel.evaluate(node => {
          node.scrollTop = 520
          node.dispatchEvent(new Event('scroll'))
        })

        await expect
          .poll(async () => scrollPanel.evaluate(node => node.scrollTop))
          .toBeGreaterThan(beforeScrollTop)
        if (hasLeftPanel && rightHasOverflow) {
          await expect
            .poll(async () => leftPanel.evaluate(node => node.scrollTop))
            .toBe(beforeLeftScrollTop)
        }
        await expect
          .poll(async () => page.evaluate(() => Math.round(window.scrollY)))
          .toBe(0)
        await expect(rightTopBar).toBeVisible()
        await expect(rightTrigger).toBeVisible()
        await expect(rightAvailableTab).toBeVisible()
        await expect(rightQuestionsTab).toBeVisible()
        await expect(rightHeaderLabel).toBeVisible()

        const afterTopBarBox = await rightTopBar.boundingBox()

        expect(afterTopBarBox).not.toBeNull()
        if (!afterTopBarBox) {
          throw new Error(
            'Available requirements sticky title bar lost its bounding box after panel scrolling.',
          )
        }

        expect(Math.round(afterTopBarBox.y)).toBe(Math.round(beforeTopBarBox.y))
      })

      test('shows configured usage statuses in the editable status column', async ({
        page,
      }) => {
        await page.addInitScript(() => {
          globalThis.localStorage.clear()
        })
        await gotoSpecificationDetail(page)

        const leftPanel = page.locator(
          '[data-specification-detail-list-panel="items"]',
        )
        await expect(leftPanel).toBeVisible()

        await leftPanel.locator('[data-column-picker-trigger="true"]').click()

        const popover = page.locator('[data-column-picker-popover="true"]')
        const statusCheckbox = popover.locator(
          '[data-column-picker-option="specificationItemStatus"] input[type="checkbox"]',
        )
        await expect(popover).toBeVisible()
        if (!(await statusCheckbox.isChecked())) {
          await statusCheckbox.check()
        }

        await leftPanel
          .locator('[data-requirements-scroll-container="true"]')
          .evaluate(node => {
            node.scrollLeft = node.scrollWidth
          })

        const statusSelect = leftPanel
          .getByRole('combobox', { name: 'Användningsstatus' })
          .first()
        const optionLabels = await statusSelect
          .locator('option')
          .evaluateAll(options =>
            options.map(option => option.textContent?.trim() ?? ''),
          )
        const optionValues = await statusSelect
          .locator('option')
          .evaluateAll(options =>
            options.map(option => option.getAttribute('value') ?? ''),
          )

        expect(optionLabels).toContain('Inkluderad')
        expect(optionLabels).toContain('Pågående')
        expect(optionLabels).not.toContain('—')
        expect(optionValues).not.toContain('')
      })
    }
  })
}
