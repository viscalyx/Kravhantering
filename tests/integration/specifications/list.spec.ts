import { expect, type Locator, test } from '@playwright/test'
import { upsertRequirementResponsibilityPerson } from '@/lib/dal/requirement-responsibility-people'
import { escapeRegExp } from '@/tests/helpers/common'
import { DESKTOP_VIEWPORT } from '../../helpers/desktop-viewport'
import { expectApiResponseOk } from '../api-response-assertions'
import {
  seedAuthorizationResponsibilityPeople,
  withPlaywrightSqlServerDataSource,
} from '../authorization/authorization-test-helpers'

const viewports = [{ ...DESKTOP_VIEWPORT, name: 'desktop' }]

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

        await expect(async () => {
          const buttonBox = await createButton.boundingBox()
          const deleteActionBox = await deleteAction.boundingBox()
          const tableBox = await tableSurface.boundingBox()
          const viewportSize = page.viewportSize()

          expect(buttonBox).not.toBeNull()
          expect(deleteActionBox).not.toBeNull()
          expect(tableBox).not.toBeNull()
          expect(viewportSize).not.toBeNull()
          expect(
            (deleteActionBox?.x ?? 0) + (deleteActionBox?.width ?? 0),
          ).toBeLessThanOrEqual(
            (tableBox?.x ?? 0) + (tableBox?.width ?? viewport.width) + 1,
          )
          const actionRightMargin =
            (viewportSize?.width ?? viewport.width) -
            ((buttonBox?.x ?? 0) + (buttonBox?.width ?? 0))
          expect(Math.abs(actionRightMargin - 32)).toBeLessThanOrEqual(1)
          expect(
            (buttonBox?.x ?? 0) + (buttonBox?.width ?? 0),
          ).toBeLessThanOrEqual((viewportSize?.width ?? viewport.width) + 1)
          expect(
            Math.abs((buttonBox?.y ?? 0) - ((tableBox?.y ?? 0) + 4)),
          ).toBeLessThanOrEqual(12)
        }).toPass({ timeout: 15_000 })
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
        await expect(editForm.getByText('Ada Admin')).toBeVisible()
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
  test.use({ viewport: DESKTOP_VIEWPORT })

  test('SPEC-04: cancels and confirms deleting a disposable specification from the list', async ({
    page,
  }) => {
    let deleted = false
    const deleteRequests: string[] = []
    let releaseReloadRequest = () => {}
    let markReloadRequestStarted = () => {}
    const reloadRequestStarted = new Promise<void>(resolve => {
      markReloadRequestStarted = resolve
    })
    await test.step('set up post-deletion reload interception', async () => {
      await page.route('**/api/requirements-specifications', async route => {
        if (route.request().method() !== 'GET') {
          await route.continue()
          return
        }
        if (deleted) {
          markReloadRequestStarted()
          await new Promise<void>(resolve => {
            releaseReloadRequest = resolve
          })
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
      await test.step('verify loading and release the post-deletion reload', async () => {
        await reloadRequestStarted

        const loadingStatus = page
          .getByRole('status')
          .filter({ hasText: 'Laddar...' })
        await expect(loadingStatus).toBeVisible()
        await expect(page.getByRole('table')).toHaveCount(0)

        releaseReloadRequest()
        await expect(loadingStatus).toHaveCount(0)
        await expect(page.getByRole('table')).toBeVisible()
        await expect(
          page.getByRole('row', {
            name: /PWT-MANUAL redigerbart kravunderlag/,
          }),
        ).toHaveCount(0)
      })
    })
  })
})

for (const width of [320, 768, 1440, 1920]) {
  test(`SPEC-01: list views preserve search and readable geometry at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 900 })
    await page.goto('/sv/specifications')
    const nameFilter = page.getByRole('textbox', { name: 'Filtrera på namn' })
    const viewLabels = ['Tabellvy', 'Tvåradersvy', 'Kortvy']
    for (const dark of [false, true]) {
      for (const expanded of width < 1024 ? [false] : [false, true]) {
        await test.step(`${dark ? 'dark' : 'light'}, navigation ${expanded ? 'expanded' : 'collapsed'}`, async () => {
          await page.evaluate(
            ({ dark, expanded }) => {
              localStorage.setItem('theme', dark ? 'dark' : 'light')
              localStorage.setItem(
                'requirements.navigationRail.expanded.v1',
                expanded ? 'expanded' : 'collapsed',
              )
            },
            { dark, expanded },
          )
          await page.reload()
          const switcher = page.getByRole('group', {
            name: 'Listvy',
            exact: true,
          })
          await expect(switcher).toHaveAttribute(
            'data-developer-mode-name',
            'view switcher',
          )
          await expect(
            page.getByRole('button', { name: 'Tabellvy', exact: true }),
          ).toHaveAttribute('aria-pressed', 'true')
          const names = await page.locator('table tbody a').allTextContents()
          expect(names.length).toBeGreaterThan(0)
          expect(names).toEqual(
            [...names].sort((a, b) =>
              a.localeCompare(b, 'sv', { sensitivity: 'base' }),
            ),
          )
          for (const [index, label] of viewLabels.entries()) {
            const selected = page.getByRole('button', {
              name: label,
              exact: true,
            })
            await selected.click()
            await expect(selected).toHaveAttribute('aria-pressed', 'true')
            const surface =
              index === 0
                ? page.getByRole('table')
                : page.locator('article').first().locator('..')
            await expect(surface.getByRole('link')).toHaveText(names)
            if (index === 0) {
              await expect(surface.getByRole('columnheader')).toHaveText([
                'Namn',
                'Kravunderlagsansvarig',
                'Styrningsobjektstyp',
                'Genomförandeform',
                'Kravunderlagets livscykelstatus',
                'Åtgärder',
              ])
            }
            await nameFilter.fill('e-tjänst')
            await expect(
              surface.getByRole('link', {
                name: 'Upphandling av e-tjänstplattform',
                exact: true,
              }),
            ).toHaveCount(1)
            await nameFilter.focus()
            const searchSurface = nameFilter.locator('..')
            await expect(searchSurface).toHaveAttribute(
              'data-developer-mode-name',
              'search field',
            )
            await expect
              .poll(() =>
                searchSurface.evaluate(el => getComputedStyle(el).boxShadow),
              )
              .not.toBe('none')
            await expect(async () => {
              expect(
                await page.evaluate(
                  () =>
                    document.documentElement.scrollWidth <= window.innerWidth,
                ),
              ).toBe(true)
              const boxes = await surface
                .getByRole('button')
                .evaluateAll(elements =>
                  elements.map(el => ({
                    width: el.getBoundingClientRect().width,
                    height: el.getBoundingClientRect().height,
                  })),
                )
              for (const box of boxes) {
                expect(box.width).toBeGreaterThanOrEqual(24)
                expect(box.height).toBeGreaterThanOrEqual(24)
              }
            }).toPass()
            const identity = surface
              .locator('[data-developer-mode-name="responsible identity"]')
              .first()
            await expect(identity).toContainText('SE5560000001-')
            if (width >= 1440) {
              const hsa = identity.locator('[tabindex="0"]')
              await expect
                .poll(() =>
                  hsa.evaluate(el => el.scrollWidth <= el.clientWidth),
                )
                .toBe(true)
            }
            if (index === 2) {
              const card = page.getByRole('article').first()
              const linkBox = await card.getByRole('link').boundingBox()
              const actionBox = await card
                .getByRole('button', { name: 'Redigera', exact: true })
                .boundingBox()
              if (!actionBox || !linkBox)
                throw new Error('Missing card title or action geometry')
              expect(actionBox.x).toBeGreaterThan(linkBox.x + linkBox.width)
              expect(Math.abs(actionBox.y - linkBox.y)).toBeLessThan(6)
            }
            await page.screenshot({
              path: testInfo.outputPath(
                `${width}-${dark ? 'dark' : 'light'}-${expanded ? 'expanded' : 'collapsed'}-${index}.png`,
              ),
            })
            await selected.focus()
            await page.keyboard.press('ArrowRight')
            await expect(
              page.getByRole('button', {
                name: viewLabels[(index + 1) % 3],
                exact: true,
              }),
            ).toHaveAttribute('aria-pressed', 'true')
            await expect(nameFilter).toHaveValue('e-tjänst')
            await selected.click()
            await nameFilter.fill('no-matching-specification-name-1350')
            await expect(
              page.getByRole('status').filter({ hasText: 'Inga resultat' }),
            ).toHaveCount(1)
            await page.getByRole('button', { name: 'Rensa sökning' }).click()
            await expect(nameFilter).toHaveValue('')
            await expect(surface.getByRole('link')).toHaveText(names)
          }
          await page
            .getByRole('button', { name: 'Hjälp: filtrera på namn' })
            .click()
          await expect(nameFilter).toHaveAccessibleDescription(
            'Skriv hela eller delar av kravunderlagets namn. Sökningen gäller alla tre vyer.',
          )
          await page
            .getByRole('button', { name: 'Kortvy', exact: true })
            .focus()
          await page.keyboard.press('Home')
          await expect(
            page.getByRole('button', { name: 'Tabellvy', exact: true }),
          ).toBeFocused()
          await page.keyboard.press('End')
          await expect(
            page.getByRole('button', { name: 'Kortvy', exact: true }),
          ).toBeFocused()
        })
      }
    }
  })
}

test('SPEC-01: long identities scroll with the keyboard and long names and codes remain readable in each view', async ({
  page,
  request,
}) => {
  const stamp = Date.now().toString()
  const hsaId = `SE5560000001-${stamp.padStart(18, '0')}`
  const name = `PWT-1350 Kravunderlag för upphandling av en gemensam informationsplattform med särskilda krav på informationssäkerhet ${stamp}`
  const code = `PWT-1350-LONG-CODE-${stamp}`
  const response = await request.post('/api/requirements-specifications', {
    data: {
      name,
      specificationCode: code,
      responsibleHsaId: 'SE5560000001-admin1',
      specificationLifecycleStatusId: 1,
    },
  })
  await expectApiResponseOk(
    response,
    'create isolated list readability fixture',
  )
  const { id } = (await response.json()) as { id: number }
  try {
    // Set up an isolated identity at the supported HSA-id length limit.
    await withPlaywrightSqlServerDataSource(async db => {
      await db.transaction(async manager => {
        await upsertRequirementResponsibilityPerson(manager, {
          hsaId,
          givenName: 'Long',
          middleName: null,
          surname: 'Identifier',
          email: 'long@example.test',
        })
        await manager.query(
          'UPDATE requirements_specifications SET responsible_hsa_id = @0 WHERE id = @1',
          [hsaId, id],
        )
      })
    })
    await page.setViewportSize({ width: 320, height: 900 })
    await page.goto('/sv/specifications')
    await page.getByRole('textbox', { name: 'Filtrera på namn' }).fill(stamp)
    for (const view of ['Tabellvy', 'Tvåradersvy', 'Kortvy']) {
      await test.step(`${view}: read the full identity with the keyboard`, async () => {
        await page.getByRole('button', { name: view, exact: true }).click()
        const nameLink = page.getByRole('link', { name, exact: true })
        await expect(nameLink).toHaveCount(1)
        const identifier = page.getByText(hsaId, { exact: true })
        await expect(identifier).toHaveText(hsaId)
        await expect
          .poll(() =>
            identifier.evaluate(el => el.scrollWidth > el.clientWidth),
          )
          .toBe(true)
        await nameLink.focus()
        for (let step = 0; step < 5; step++) {
          await page.keyboard.press('Tab')
          if (await identifier.evaluate(el => el === document.activeElement))
            break
        }
        await expect(identifier).toBeFocused()
        for (let step = 0; step < 12; step++)
          await page.keyboard.press('ArrowRight')
        await expect
          .poll(() =>
            identifier.evaluate(
              el => el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
            ),
          )
          .toBe(true)
        const codeElement = page
          .locator('[data-developer-mode-name="specification code"]')
          .filter({ hasText: code })
        await expect(codeElement).toContainText(code)
        await expect
          .poll(() =>
            codeElement.evaluate(el => el.scrollWidth <= el.clientWidth),
          )
          .toBe(true)
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true)
      })
    }
    await test.step('keep short names and their codes on the same row', async () => {
      await page.setViewportSize(DESKTOP_VIEWPORT)
      await page
        .getByRole('button', { name: 'Tvåradersvy', exact: true })
        .click()
      await page
        .getByRole('article', { name, exact: true })
        .getByRole('button', { name: 'Redigera', exact: true })
        .click()
      const dialog = page.getByRole('dialog', { name: 'Redigera kravunderlag' })
      await dialog
        .getByRole('textbox', { name: 'Namn *', exact: true })
        .fill(`PWT-1350 ${stamp}`)
      await dialog.getByRole('button', { name: 'Spara', exact: true }).click()
      await expect(dialog).toHaveCount(0)
      const nameLink = page.getByRole('link', {
        name: `PWT-1350 ${stamp}`,
        exact: true,
      })
      const codeElement = page
        .locator('[data-developer-mode-name="specification code"]')
        .filter({ hasText: code })
      const nameBox = await nameLink.boundingBox()
      const codeBox = await codeElement.boundingBox()
      if (!nameBox || !codeBox)
        throw new Error('Missing specification name or code geometry')
      expect(codeBox.x).toBeGreaterThan(nameBox.x + nameBox.width)
      expect(Math.abs(codeBox.y - nameBox.y)).toBeLessThan(8)
    })
  } finally {
    await expectApiResponseOk(
      await request.delete(`/api/requirements-specifications/${id}`),
      'delete isolated list readability fixture',
    )
    await withPlaywrightSqlServerDataSource(db =>
      db.query(
        'DELETE FROM requirement_responsibility_people WHERE hsa_id = @0',
        [hsaId],
      ),
    )
  }
})
