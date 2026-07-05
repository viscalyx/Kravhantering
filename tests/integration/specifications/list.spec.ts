import { expect, type Locator, test } from '@playwright/test'
import { escapeRegExp } from '@/tests/helpers/common'
import { expectApiResponseOk } from '../api-response-assertions'
import { seedAuthorizationResponsibilityPeople } from '../authorization/authorization-test-helpers'

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 720 },
]

function splitHsaId(hsaId: string): { prefix: string; suffix: string } {
  const separatorIndex = hsaId.indexOf('-')
  if (separatorIndex < 0) {
    throw new Error(`Expected full HSA-id with prefix and suffix: ${hsaId}`)
  }

  return {
    prefix: hsaId.slice(0, separatorIndex),
    suffix: hsaId.slice(separatorIndex + 1),
  }
}

async function fillEditableHsaId(
  scope: Locator,
  inputName: string,
  hsaId: string,
): Promise<void> {
  const { prefix, suffix } = splitHsaId(hsaId)
  await scope
    .getByRole('combobox', { name: 'HSA-id-prefix' })
    .selectOption(prefix)
  await scope.getByRole('textbox', { name: inputName }).fill(suffix)
}

async function expectRequiredFieldsHintInActionRow(
  form: Locator,
): Promise<void> {
  const actionRow = form.locator(':scope > [data-form-action-row="true"]')
  await expect(actionRow).toHaveCount(1)
  await expect(
    actionRow.getByText('Fält markerade med * är obligatoriska.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(actionRow.getByRole('button', { name: 'Spara' })).toBeVisible()
  await expect(actionRow.getByRole('button', { name: 'Avbryt' })).toBeVisible()

  const childOrder = await form.evaluate(element => {
    const children = Array.from(element.children)
    return {
      actionRowIndex: children.findIndex(
        child =>
          child instanceof HTMLElement &&
          child.dataset.formActionRow === 'true',
      ),
      gridIndex: children.findIndex(
        child =>
          child instanceof HTMLElement && child.classList.contains('grid'),
      ),
    }
  })
  expect(childOrder.gridIndex).toBeGreaterThanOrEqual(0)
  expect(childOrder.actionRowIndex).toBeGreaterThan(childOrder.gridIndex)
}

for (const viewport of viewports) {
  test.describe(`Requirements specifications list filter — ${viewport.name} (${viewport.width}×${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test('SPEC-01/SPEC-02: filters the table by specification name, clears the search, and opens create/edit forms', async ({
      page,
      request,
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
        const requirementAreasHeader = page.getByRole('columnheader', {
          name: 'Kravområden',
        })

        await expect(tableSurface).toHaveCount(1)

        const buttonBox = await createButton.boundingBox()
        const deleteActionBox = await deleteAction.boundingBox()
        const requirementAreasHeaderBox =
          await requirementAreasHeader.boundingBox()
        const tableBox = await tableSurface.boundingBox()
        const viewportSize = page.viewportSize()

        expect(buttonBox).not.toBeNull()
        expect(deleteActionBox).not.toBeNull()
        expect(requirementAreasHeaderBox).not.toBeNull()
        expect(tableBox).not.toBeNull()
        expect(viewportSize).not.toBeNull()
        expect(requirementAreasHeaderBox?.width ?? 0).toBeLessThanOrEqual(260)
        expect(
          (deleteActionBox?.x ?? 0) + (deleteActionBox?.width ?? 0),
        ).toBeLessThanOrEqual(
          (tableBox?.x ?? 0) + (tableBox?.width ?? viewport.width) + 1,
        )
        expect(buttonBox?.x ?? 0).toBeGreaterThanOrEqual(
          (viewportSize?.width ?? viewport.width) -
            (buttonBox?.width ?? 0) -
            16,
        )
        expect(
          (buttonBox?.x ?? 0) + (buttonBox?.width ?? 0),
        ).toBeLessThanOrEqual((viewportSize?.width ?? viewport.width) + 1)
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

        const createDialog = page.getByRole('dialog', {
          name: 'Nytt kravunderlag',
        })
        await expect(createDialog).toBeVisible()
        const createForm = createDialog.locator(
          'form#requirement-specification-form',
        )
        await expect(createForm).toBeVisible()
        await expectRequiredFieldsHintInActionRow(createForm)
        await expect(createForm.locator(':scope > div.grid')).toHaveClass(
          /lg:grid-cols-2/,
        )
        await expect(
          createDialog.getByRole('textbox', { name: 'Namn *' }),
        ).toBeFocused()
        const responsibleInput = createForm.getByRole('textbox', {
          name: 'Kravunderlagsansvarigs HSA-id',
        })
        await expect(responsibleInput).toHaveValue('SE5560000001-admin1')
        await expect(responsibleInput).toHaveAttribute('readonly', '')
        await expect(
          createForm.getByRole('button', { name: 'Hämta' }),
        ).toBeVisible()
        await expect(createForm.getByText(/Ada Admin/)).toBeVisible()
        const createLifecycleStatus = createForm.getByRole('combobox', {
          name: /Kravunderlagets livscykelstatus/,
        })
        await expect(createLifecycleStatus).toBeVisible()
        await expect(createLifecycleStatus).toHaveJSProperty('required', true)
        await expect(createLifecycleStatus).toHaveValue('')

        await createForm.getByRole('button', { name: 'Avbryt' }).click()
        await expect(createDialog).toBeHidden()
      })

      await test.step('create and persist a disposable kravunderlag', async () => {
        await seedAuthorizationResponsibilityPeople()
        const randomSuffix = Math.random()
          .toString(36)
          .slice(2, 8)
          .toUpperCase()
        const viewportPrefix = viewport.name === 'mobile' ? 'M' : 'D'
        const createdSpecificationCode = `PWT-SPEC02-${viewportPrefix}-${randomSuffix}`
        const createdName = `PWT SPEC-02 skapat kravunderlag ${viewport.name} ${randomSuffix}`
        let createdSpecificationId: number | null = null

        try {
          await createButton.click()
          const createDialog = page.getByRole('dialog', {
            name: 'Nytt kravunderlag',
          })
          await expect(createDialog).toBeVisible()
          const createForm = createDialog.locator(
            'form#requirement-specification-form',
          )
          const nameInput = createForm.getByRole('textbox', { name: 'Namn *' })
          const codeInput = createForm.getByRole('textbox', {
            name: 'Kravunderlagskod *',
          })
          await nameInput.fill(createdName)
          await nameInput.blur()
          await codeInput.fill(createdSpecificationCode)
          await expect(codeInput).toHaveValue(createdSpecificationCode)
          await createForm
            .getByRole('textbox', { name: 'Underlagssyfte' })
            .fill('Playwright SPEC-02 verifierar komplett create-flöde.')
          await createForm
            .getByRole('combobox', {
              name: /Kravunderlagets livscykelstatus/u,
            })
            .selectOption('1')
          const createResponsePromise = page.waitForResponse(
            response =>
              response.url().endsWith('/api/requirements-specifications') &&
              response.request().method() === 'POST',
          )
          await createForm.getByRole('button', { name: 'Spara' }).click()
          const createdResponse = await createResponsePromise
          await expectApiResponseOk(
            createdResponse,
            'POST created requirement specification',
          )
          const createdPayload = (await createdResponse.json()) as {
            id?: unknown
          }
          expect(createdPayload).toMatchObject({
            name: createdName,
            responsibleHsaId: 'SE5560000001-admin1',
            specificationLifecycleStatusId: 1,
            specificationCode: createdSpecificationCode,
          })
          expect(typeof createdPayload.id).toBe('number')
          if (typeof createdPayload.id !== 'number') {
            throw new Error('Created requirement specification id is missing')
          }
          createdSpecificationId = createdPayload.id
          await expect(createDialog).toBeHidden({ timeout: 30_000 })

          const createdRow = page.getByRole('row', {
            name: new RegExp(escapeRegExp(createdName)),
          })
          await expect(createdRow).toBeVisible({ timeout: 30_000 })
          await expect(createdRow).toContainText('Ada Admin')
          await expect(createdRow).toContainText('Upphandling')
        } finally {
          if (createdSpecificationId !== null) {
            await request
              .delete(
                `/api/requirements-specifications/${createdSpecificationId}`,
              )
              .catch(() => undefined)
          }
          await page.reload()
        }
      })

      await test.step('open responsible change modal from the list edit form', async () => {
        const row = page.getByRole('row', {
          name: /Upphandling av e-tjänstplattform/,
        })
        await row.getByRole('button', { name: 'Redigera' }).click()

        const editDialog = page.getByRole('dialog', {
          name: 'Redigera kravunderlag',
        })
        await expect(editDialog).toBeVisible()
        const editForm = editDialog.locator(
          'form#requirement-specification-form',
        )
        await expect(editForm).toBeVisible()
        await expectRequiredFieldsHintInActionRow(editForm)
        await expect(editForm.locator(':scope > div.grid')).toHaveClass(
          /lg:grid-cols-2/,
        )
        await expect(
          editDialog.getByRole('textbox', { name: 'Namn *' }),
        ).toHaveValue('Upphandling av e-tjänstplattform')
        const responsibleInput = editForm.getByRole('textbox', {
          name: 'Kravunderlagsansvarigs HSA-id',
        })
        await expect(responsibleInput).toHaveAttribute('readonly', '')
        await expect(editForm.getByText('Emma Lindqvist')).toBeVisible()
        const editLifecycleStatus = editForm.getByRole('combobox', {
          name: /Kravunderlagets livscykelstatus/,
        })
        await expect(editLifecycleStatus).toHaveJSProperty('required', true)
        await expect(editLifecycleStatus).toHaveValue('1')

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
        const newResponsibleInput = changeDialog.getByRole('textbox', {
          name: 'Nya kravunderlagsansvarigs HSA-id',
        })
        await expect(newResponsibleInput).toBeVisible()
        await expect(
          changeDialog.getByRole('button', { name: 'Hämta' }),
        ).toBeVisible()

        await fillEditableHsaId(
          changeDialog,
          'Nya kravunderlagsansvarigs HSA-id',
          currentResponsibleHsaId,
        )
        await expect(changeDialog.getByRole('alert')).toContainText(
          'måste skilja sig',
        )
        await changeDialog.getByRole('button', { name: 'Avbryt' }).click()
        await expect(changeDialog).toBeHidden()
        await editForm.getByRole('button', { name: 'Avbryt' }).click()
        await expect(editDialog).toBeHidden()
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

test.describe('Requirements specifications destructive manual cases', () => {
  test.use({ viewport: { height: 720, width: 1280 } })

  test('SPEC-04: cancels and confirms deleting a disposable specification from the list', async ({
    page,
  }) => {
    let deleted = false
    const deleteRequests: string[] = []
    await page.route('**/api/requirements-specifications', async route => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      await route.fulfill({
        contentType: 'application/json',
        json: {
          collectionPermissions: { canCreateSpecification: true },
          specifications: deleted
            ? []
            : [
                {
                  businessNeedsReference:
                    'PWT-MANUAL delete confirmation fixture.',
                  governanceObjectType: {
                    id: 2,
                    nameEn: 'Information system',
                    nameSv: 'Informationssystem',
                  },
                  id: 920001,
                  implementationType: {
                    id: 2,
                    nameEn: 'Development',
                    nameSv: 'Utveckling',
                  },
                  itemCount: 0,
                  lifecycleStatus: {
                    id: 3,
                    nameEn: 'Development',
                    nameSv: 'Utveckling',
                  },
                  name: 'PWT-MANUAL redigerbart kravunderlag',
                  permissions: {
                    canEditContent: true,
                    canManageAssignments: true,
                    canReviewDecisions: true,
                    canUseAi: false,
                  },
                  requirementAreas: [],
                  responsibleDisplayName: 'Petra specresp',
                  responsibleHsaId: 'SE5560000001-specresp1',
                  specificationCode: 'PWT-SPEC-EDIT-2026',
                },
              ],
        },
      })
    })
    await page.route(
      '**/api/requirements-specifications/920001',
      async route => {
        if (route.request().method() === 'DELETE') {
          deleteRequests.push(route.request().url())
          deleted = true
          await route.fulfill({
            contentType: 'application/json',
            json: { ok: true },
          })
          return
        }
        await route.continue()
      },
    )

    await page.goto('/sv/specifications')
    await page.getByRole('textbox', { name: 'Filtrera på namn' }).fill('PWT')

    const row = page.getByRole('row', {
      name: /PWT-MANUAL redigerbart kravunderlag/,
    })
    await expect(row).toHaveCount(1)

    await test.step('cancel the delete confirmation', async () => {
      await row.getByRole('button', { name: 'Ta bort' }).click()
      const dialog = page.getByRole('alertdialog')
      await expect(dialog).toHaveCount(1)
      await dialog.getByRole('button', { name: 'Avbryt' }).click()
      await expect(dialog).toHaveCount(0)
      expect(deleteRequests).toEqual([])
      await expect(row).toHaveCount(1)
    })

    await test.step('confirm deletion and remove the row', async () => {
      await row.getByRole('button', { name: 'Ta bort' }).click()
      const dialog = page.getByRole('alertdialog')
      await dialog.getByRole('button', { name: 'Bekräfta' }).click()
      await expect.poll(() => deleteRequests.length).toBe(1)
      await expect(
        page.getByRole('row', { name: /PWT-MANUAL redigerbart kravunderlag/ }),
      ).toHaveCount(0)
    })
  })
})
