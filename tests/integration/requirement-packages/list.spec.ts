import { expect, type Locator, test } from '@playwright/test'
import { DESKTOP_VIEWPORT } from '../../helpers/desktop-viewport'

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

const deterministicPackageLeadVerification = {
  displayName: 'Ada Admin',
  email: 'ada.admin@example.test',
  givenName: 'Ada',
  hasProtectedPersonalData: true,
  hsaId: 'SE5560000001-admin1',
  middleName: null,
  surname: 'Admin',
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

for (const viewport of viewports) {
  test.describe(`Requirement packages list filter — ${viewport.name} (${viewport.width}×${viewport.height})`, () => {
    test.use({ viewport: { height: viewport.height, width: viewport.width } })

    test('REQ-14a: filters and inspects requirement packages with HSA-id responsibility controls', async ({
      page,
    }) => {
      await page.route('**/api/hsa-person-lookup-capability', route =>
        route.fulfill({
          body: JSON.stringify({ available: true }),
          contentType: 'application/json',
          status: 200,
        }),
      )
      const hsaVerifyRequests: Record<string, unknown>[] = []
      await page.route(
        '**/api/requirement-responsibility-people/verify',
        async route => {
          const payload = route.request().postDataJSON() as Record<
            string,
            unknown
          >
          hsaVerifyRequests.push(payload)

          if (
            payload.hsaId === deterministicPackageLeadVerification.hsaId &&
            payload.purpose === 'requirement_package_lead'
          ) {
            await route.fulfill({
              body: JSON.stringify({
                evidence: 'playwright-signed-evidence',
                expiresAt: '2099-01-01T00:00:00.000Z',
                person: deterministicPackageLeadVerification,
              }),
              contentType: 'application/json',
              status: 200,
            })
            return
          }

          await route.continue()
        },
      )

      await test.step('open the package stewardship list', async () => {
        await page.goto('/sv/requirements/stewardship?tab=packages')

        await expect(page).toHaveTitle(/Kravbiblioteksförvaltning/)
        await expect(
          page.getByRole('heading', { level: 1, name: 'Kravpaket' }),
        ).toHaveText('Kravpaket')
      })

      const nameFilter = page.getByRole('textbox', {
        name: 'Filtrera på namn eller beskrivning',
      })
      const mobilePackage = page.getByRole('cell', {
        exact: true,
        name: 'Mobil användning',
      })
      const ssoPackage = page.getByRole('cell', {
        exact: true,
        name: 'Single Sign-On',
      })

      await test.step('verify the unfiltered table', async () => {
        await expect(nameFilter).toHaveValue('')
        await expect(mobilePackage).toHaveCount(1)
        await expect(ssoPackage).toHaveCount(1)
        await expect(
          page.getByRole('columnheader', { name: 'Kravpaketsmedförfattare' }),
        ).toHaveCount(1)
        const mobileRow = page.getByRole('row', { name: /Mobil användning/ })
        await expect(mobileRow).toContainText('Anna Johansson')
        await expect(mobileRow).toContainText('SE5560000001-annaj')
        const coAuthorCell = mobileRow.getByRole('cell').filter({
          hasText: 'Paul PkgCoAuthor',
        })
        await expect(coAuthorCell).toHaveText('Paul PkgCoAuthor')
        await expect(coAuthorCell).not.toContainText('SE5560000001-pkgco1')
        await expect(coAuthorCell).not.toContainText('@')
        await expect(mobilePackage.getByRole('link')).toHaveCount(0)
        await expect(mobilePackage.getByRole('button')).toHaveCount(0)
      })

      if (viewport.name === 'desktop') {
        await test.step('keep the create button anchored to the list', async () => {
          const createButton = page.getByRole('button', {
            name: 'Nytt kravpaket',
          })
          const tableSurface = page.getByRole('table')

          await expect(createButton).toHaveCount(1)
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
        })
      }

      await test.step('filter by a matching package name', async () => {
        await nameFilter.fill('Mobil')

        await expect(mobilePackage).toHaveCount(1)
        await expect(ssoPackage).toHaveCount(0)
      })

      await test.step('filter by a matching package purpose and scope', async () => {
        await nameFilter.fill('gemensamma inloggning')

        await expect(mobilePackage).toHaveCount(0)
        await expect(ssoPackage).toHaveCount(1)
      })

      await test.step('show the no-results state', async () => {
        await nameFilter.fill('paket som saknas')

        await expect(page.getByText('Inga resultat hittades')).toHaveCount(1)
        await expect(mobilePackage).toHaveCount(0)
      })

      await test.step('clear the search', async () => {
        await page.getByRole('button', { name: 'Rensa sökning' }).click()

        await expect(nameFilter).toHaveValue('')
        await expect(mobilePackage).toHaveCount(1)
        await expect(ssoPackage).toHaveCount(1)
      })

      await test.step('show the signed-in package lead when creating', async () => {
        await page.getByRole('button', { name: 'Nytt kravpaket' }).click()

        const dialog = page.getByRole('dialog', { name: 'Nytt kravpaket' })
        await expect(dialog).toBeVisible()
        const nameInput = dialog.getByRole('textbox', { name: 'Namn' })

        const leadSummary = dialog.locator(
          'section[aria-labelledby="requirement-package-create-lead-title"]',
        )
        await expect(nameInput).toBeVisible()
        await expect(
          dialog.getByText(
            'Du blir kravpaketsansvarig när kravpaketet skapas.',
          ),
        ).toBeVisible()
        await expect(
          dialog.getByRole('textbox', {
            name: 'Kravpaketsansvarigs HSA-id',
          }),
        ).toHaveCount(0)
        await expect(dialog.getByRole('button', { name: 'Hämta' })).toHaveCount(
          0,
        )
        await expect(dialog.getByText(/Ada Admin/)).toBeVisible()
        await expect(dialog.getByText('SE5560000001-admin1')).toBeVisible()
        await expect(dialog.getByText('Kopplade krav')).toHaveCount(0)
        await expect(
          dialog.getByRole('button', { name: 'Lägg till medförfattare' }),
        ).toHaveCount(0)
        await expect(
          dialog.getByRole('button', { name: 'Hantera medförfattare' }),
        ).toHaveCount(0)
        await expect(
          dialog.getByRole('heading', { name: 'Kravpaketsansvarig' }),
        ).toBeVisible()
        await expect(leadSummary).toBeVisible()

        await dialog.getByRole('button', { name: 'Stäng' }).last().click()
        await expect(dialog).toBeHidden()
      })

      await test.step('manage package co-authors through the row action', async () => {
        const row = page.getByRole('row', { name: /Mobil användning/ })
        await row.getByRole('button', { name: 'Hantera medförfattare' }).click()

        const dialog = page.getByRole('dialog', {
          name: 'Kravpaketsmedförfattare',
        })
        await expect(dialog).toBeVisible()
        await expect(
          dialog.getByText(
            'Lägg till HSA-id för personer som stödjer kravpaketsansvarig.',
          ),
        ).toBeVisible()
        await expect(dialog.getByText('SE5560000001-pkgco1')).toBeVisible()
        await expect(
          dialog.getByRole('textbox', { name: 'Medförfattares HSA-id' }),
        ).toBeVisible()
        await expect(
          dialog.getByRole('button', { name: 'Hämta' }),
        ).toBeVisible()

        await dialog.getByRole('button', { name: 'Stäng' }).last().click()
        await expect(dialog).toBeHidden()
      })

      await test.step('change package lead through the edit modal', async () => {
        const row = page.getByRole('row', { name: /Mobil användning/ })
        await row.getByRole('button', { name: 'Redigera' }).click()

        const dialog = page.getByRole('dialog', {
          name: 'Redigera kravpaket',
        })
        await expect(dialog).toBeVisible()
        const leadInput = dialog.getByRole('textbox', {
          name: 'Kravpaketsansvarigs HSA-id',
        })
        await expect(leadInput).toHaveAttribute('readonly', '')
        await expect(
          leadInput.locator('xpath=../following-sibling::p'),
        ).toContainText(/\(.+@.+\)/)
        await expect(
          dialog.getByRole('button', { name: 'Byt kravpaketsansvarig' }),
        ).toBeVisible()

        const linkedRequirementsButton = dialog.getByRole('button', {
          name: /Visa kopplade krav/,
        })
        await expect(linkedRequirementsButton).toBeVisible()
        await linkedRequirementsButton.click()

        const linkedRequirementsDialog = page.getByRole('dialog', {
          name: /Kopplade krav:/,
        })
        await expect(linkedRequirementsDialog).toBeVisible()
        await linkedRequirementsDialog
          .getByRole('button', { name: 'Stäng' })
          .last()
          .click()
        await expect(linkedRequirementsDialog).toBeHidden()
        await expect(dialog).toBeVisible()

        const currentLeadHsaId = await leadInput.inputValue()
        await dialog
          .getByRole('button', { name: 'Byt kravpaketsansvarig' })
          .click()

        const changeDialog = page.getByRole('dialog', {
          name: 'Byt kravpaketsansvarig',
        })
        await expect(changeDialog).toBeVisible()
        await expect(
          changeDialog.getByRole('textbox', {
            name: 'Förra kravpaketsansvarigs HSA-id',
          }),
        ).toHaveValue(currentLeadHsaId)
        const nextLeadInput = changeDialog.getByRole('textbox', {
          name: 'Nya kravpaketsansvarigs HSA-id',
        })
        await expect(nextLeadInput).toBeVisible()
        await expect(
          changeDialog.getByRole('button', { name: 'Hämta' }),
        ).toBeVisible()
        await expect(
          changeDialog.getByRole('textbox', { name: 'Namn' }),
        ).toHaveCount(0)
        await expect(
          changeDialog.getByRole('textbox', { name: 'E-post' }),
        ).toHaveCount(0)
        await expect(changeDialog.getByText('Inte hämtat')).toBeVisible()

        await fillEditableHsaId(
          changeDialog,
          'Nya kravpaketsansvarigs HSA-id',
          'SE5560000001-admin1',
        )
        await changeDialog.getByRole('button', { name: 'Hämta' }).click()
        await expect(
          changeDialog.getByText('Ada Admin (ada.admin@example.test)'),
        ).toBeVisible()
        await expect(
          changeDialog.getByText(/Skyddade personuppgifter:/),
        ).toContainText(/endast för det behöriga uppdraget/)
        expect(hsaVerifyRequests).toContainEqual(
          expect.objectContaining({
            hsaId: deterministicPackageLeadVerification.hsaId,
            mode: 'refresh',
            purpose: 'requirement_package_lead',
            scopeId: 1,
          }),
        )

        await fillEditableHsaId(
          changeDialog,
          'Nya kravpaketsansvarigs HSA-id',
          'SE5560000001-pkgco1',
        )
        await expect(changeDialog.getByRole('alert')).toContainText(
          'Kravpaketsansvarig kan inte samtidigt vara',
        )
      })
    })
  })
}

for (const viewport of viewports) {
  test.describe(`HSA lookup capability — ${viewport.name} (${viewport.width}×${viewport.height})`, () => {
    test.use({
      viewport: { height: viewport.height, width: viewport.width },
    })

    test('REQ-14a: keeps local responsibility data visible when external lookup is unavailable', async ({
      page,
    }) => {
      const localReuseRequests: Record<string, unknown>[] = []
      await test.step('set up unavailable HSA and local reuse responses', async () => {
        await page.route('**/api/hsa-person-lookup-capability', route =>
          route.fulfill({
            body: JSON.stringify({ available: false }),
            contentType: 'application/json',
            status: 200,
          }),
        )
        await page.route(
          '**/api/requirement-responsibility-people/verify',
          async route => {
            const payload = route.request().postDataJSON() as Record<
              string,
              unknown
            >
            localReuseRequests.push(payload)
            await route.fulfill({
              body: JSON.stringify({
                evidence: 'local-reuse-evidence',
                expiresAt: '2099-01-01T00:00:00.000Z',
                person: {
                  displayName: 'Lokal Kravansvarsperson',
                  email: 'local.person@example.test',
                  givenName: 'Lokal',
                  hasProtectedPersonalData: false,
                  hsaId: 'SE5560000001-local1',
                  middleName: null,
                  surname: 'Kravansvarsperson',
                },
              }),
              contentType: 'application/json',
              status: 200,
            })
          },
        )
      })

      const changeDialog = page.getByRole('dialog', {
        name: 'Byt kravpaketsansvarig',
      })
      await test.step('open the package-lead change dialog', async () => {
        await page.goto('/sv/requirements/stewardship?tab=packages')
        const row = page.getByRole('row', { name: /Mobil användning/ })
        await expect(row).toContainText('Anna Johansson')
        await row.getByRole('button', { name: 'Redigera' }).click()
        const editDialog = page.getByRole('dialog', {
          name: 'Redigera kravpaket',
        })
        await expect(editDialog.getByText(/Anna Johansson/)).toBeVisible()
        await editDialog
          .getByRole('button', { name: 'Byt kravpaketsansvarig' })
          .click()
      })

      await test.step('show that direct HSA lookup is unavailable', async () => {
        await expect(changeDialog.getByRole('status')).toContainText(
          'Direktuppslag i HSA är inte tillgängligt',
        )
        await expect(
          changeDialog.getByRole('button', { name: 'Hämta' }),
        ).toBeDisabled()
      })

      await test.step('reuse an existing local responsibility person', async () => {
        await fillEditableHsaId(
          changeDialog,
          'Nya kravpaketsansvarigs HSA-id',
          'SE5560000001-local1',
        )
        await changeDialog
          .getByRole('textbox', { name: 'Nya kravpaketsansvarigs HSA-id' })
          .press('Tab')
        await expect(changeDialog).toContainText(
          'Lokal Kravansvarsperson (local.person@example.test)',
        )
        expect(localReuseRequests).toContainEqual(
          expect.objectContaining({
            hsaId: 'SE5560000001-local1',
            mode: 'reuse_local',
            purpose: 'requirement_package_lead',
            scopeId: 1,
          }),
        )
      })
    })
  })
}

for (const locale of ['sv', 'en'] as const) {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    for (const navigation of ['collapsed', 'expanded']) {
      for (const theme of ['light', 'dark']) {
        test.describe(`Package status ${locale} ${viewport.width} ${navigation} ${theme}`, () => {
          test.use({ viewport })

          test('REQ-14a: shows package status and preserves list actions through archive and reactivation', async ({
            page,
          }, testInfo) => {
            const labels =
              locale === 'sv'
                ? {
                    active: 'Aktiv',
                    archived: 'Arkiverad',
                    archive: 'Arkivera',
                    reactivate: 'Återaktivera',
                    coAuthors: 'Hantera medförfattare',
                    edit: 'Redigera',
                    delete: 'Ta bort',
                    close: 'Stäng',
                    review: 'Granskning',
                  }
                : {
                    active: 'Active',
                    archived: 'Archived',
                    archive: 'Archive',
                    reactivate: 'Reactivate',
                    coAuthors: 'Manage co-authors',
                    edit: 'Edit',
                    delete: 'Delete',
                    close: 'Close',
                    review: 'Review',
                  }
            const purpose =
              'Complete purpose and scope for shared digital services, including mobile access, identity management and accessible information across organizational boundaries.'
            const packages = [
              {
                id: 135301,
                name: 'Shared digital services with a long package name',
                purposeAndScope: purpose,
                isArchived: false,
                leadDisplayName: 'Anna Johansson',
                leadHsaId: 'SE5560000001-annaj',
                linkedRequirementCount: 1,
                coAuthors: [
                  {
                    displayName: 'Paul PkgCoAuthor',
                    hsaId: 'SE5560000001-pkgco1',
                  },
                ],
                permissions: { canManageAssignments: true },
              },
              {
                id: 135302,
                name: 'Archived package',
                purposeAndScope: purpose,
                isArchived: true,
                leadDisplayName: 'Anna Johansson',
                leadHsaId: 'SE5560000001-annaj',
                linkedRequirementCount: 0,
                coAuthors: [],
                permissions: { canManageAssignments: false },
              },
            ]
            const linkedRequirements = [
              {
                id: 135303,
                uniqueId: 'REQ-135303',
                description: 'Linked requirement retains its version status',
                versionNumber: 2,
                statusId: 2,
                statusNameSv: 'Granskning',
                statusNameEn: 'Review',
                statusColor: '#f59e0b',
                statusIconName: 'Clock',
                archiveInitiatedAt: null,
              },
            ]

            await test.step('open identical active and archived packages in the selected theme and navigation mode', async () => {
              await page.addInitScript(
                ({ theme, navigation }) => {
                  localStorage.setItem('theme', theme)
                  localStorage.setItem(
                    'requirements.navigationRail.expanded.v1',
                    navigation,
                  )
                },
                { theme, navigation },
              )
              await page.route('**/api/requirement-packages**', async route => {
                const url = new URL(route.request().url())
                if (url.pathname === '/api/requirement-packages') {
                  await route.fulfill({
                    json: { requirementPackages: packages },
                  })
                } else if (
                  url.pathname === '/api/requirement-packages/135301'
                ) {
                  await route.fulfill({
                    json: { ...packages[0], linkedRequirements },
                  })
                } else if (
                  /\/135301\/(archive|reactivate)$/.test(url.pathname) &&
                  route.request().method() === 'POST'
                ) {
                  packages[0].isArchived = url.pathname.endsWith('/archive')
                  await route.fulfill({ json: packages[0] })
                } else {
                  await route.continue()
                }
              })
              await page.goto(
                `/${locale}/requirements/stewardship?tab=packages`,
              )
              await expect(page.locator('html')).toHaveClass(new RegExp(theme))
            })

            const activeRow = page.getByRole('row', {
              name: /Shared digital services with a long package name/,
            })
            const archivedRow = page.getByRole('row', {
              name: /Archived package/,
            })
            const status = activeRow.getByRole('status')

            await test.step('read text and icons while retaining complete text, responsibility, counts and row actions', async () => {
              await expect(status).toHaveText(labels.active)
              await expect(
                status.locator('svg.lucide-circle-check'),
              ).toHaveAttribute('aria-hidden', 'true')
              await expect(archivedRow.getByRole('status')).toHaveText(
                labels.archived,
              )
              await expect(
                archivedRow.getByRole('status').locator('svg.lucide-archive'),
              ).toHaveAttribute('aria-hidden', 'true')
              await expect(status).toHaveAttribute(
                'data-developer-mode-name',
                'package status',
              )
              await expect(status).toHaveAttribute(
                'data-developer-mode-context',
                'requirementPackages',
              )
              await expect(status).toHaveAttribute(
                'data-developer-mode-value',
                'active',
              )
              await expect(archivedRow.getByRole('status')).toHaveAttribute(
                'data-developer-mode-value',
                'archived',
              )
              await expect(activeRow.getByRole('cell').nth(1)).toHaveText(
                purpose,
              )
              await expect(activeRow.getByRole('cell').nth(2)).toContainText(
                'Anna Johansson',
              )
              await expect(activeRow.getByRole('cell').nth(2)).toContainText(
                'SE5560000001-annaj',
              )
              await expect(activeRow.getByRole('cell').nth(3)).toHaveText(
                'Paul PkgCoAuthor',
              )
              await expect(activeRow.getByRole('cell').nth(5)).toHaveText(
                locale === 'sv' ? '1 krav' : '1 requirement',
              )
              await expect(
                archivedRow.getByRole('button', { name: labels.coAuthors }),
              ).toHaveCount(0)
              const actions = activeRow
                .getByRole('cell')
                .last()
                .getByRole('button')
              for (const [index, name] of [
                labels.coAuthors,
                labels.edit,
                labels.archive,
                labels.delete,
              ].entries()) {
                const action = actions.nth(index)
                await expect(action).toHaveAccessibleName(name)
                const box = await action.boundingBox()
                expect(box?.width).toBe(44)
                expect(box?.height).toBe(44)
              }
              expect(
                await page
                  .getByRole('table')
                  .evaluate(table => getComputedStyle(table).tableLayout),
              ).toBe('auto')
              await testInfo.attach('package-status', {
                body: await page.screenshot({ fullPage: true }),
                contentType: 'image/png',
              })
            })

            const checkLinkedStatus = async () => {
              const count = activeRow
                .getByRole('cell')
                .nth(5)
                .getByRole('button')
              await count.focus()
              await count.press('Enter')
              const dialog = page.getByRole('dialog')
              await expect(
                dialog.getByRole('row', { name: /REQ-135303/ }),
              ).toContainText(labels.review)
              await dialog
                .getByRole('button', { name: labels.close, exact: true })
                .last()
                .click()
              await expect(dialog).toHaveCount(0)
            }

            await test.step('archive by mouse and reactivate by keyboard without changing linked requirement status', async () => {
              await checkLinkedStatus()
              await activeRow
                .getByRole('button', { name: labels.archive, exact: true })
                .click()
              await expect(status).toHaveText(labels.archived)
              await expect(status).toHaveAttribute(
                'data-developer-mode-value',
                'archived',
              )
              await expect(status.locator('svg.lucide-archive')).toHaveCount(1)
              await checkLinkedStatus()
              const reactivate = activeRow.getByRole('button', {
                name: labels.reactivate,
                exact: true,
              })
              await reactivate.focus()
              await expect(reactivate).toBeFocused()
              await reactivate.press('Enter')
              await expect(status).toHaveText(labels.active)
              await expect(
                status.locator('svg.lucide-circle-check'),
              ).toHaveCount(1)
              await checkLinkedStatus()
            })
          })
        })
      }
    }
  }
}
