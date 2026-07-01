import {
  type APIRequestContext,
  type APIResponse,
  expect,
  type Locator,
  type Page,
  type Route,
  test,
} from '@playwright/test'
import {
  DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS,
  type RequirementListColumnDefault,
} from '../../../lib/requirements/list-view'

const viewportVariants = [
  {
    name: 'desktop',
    viewport: { height: 720, width: 1280 },
  },
  {
    name: 'mobile',
    viewport: { height: 812, width: 375 },
  },
] as const

const DEFAULT_COLUMN_PAYLOAD: RequirementListColumnDefault[] =
  DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS.map(column => ({ ...column }))
const DEFAULT_HSA_ID_PREFIX = 'SE5560000001'
const TEMPORARY_HSA_ID_PREFIX = 'NO5560000099'
const VISIBLE_REQUIREMENTS_HEADER_SELECTOR =
  '[data-sticky-table-header-table="true"] thead'
const VISIBLE_REQUIREMENTS_HEADER_CELL_SELECTOR =
  '[data-sticky-table-header-table="true"] thead th'

const RETENTION_POLICY = {
  action: 'delete',
  ageDays: 730,
  decisionReference: 'Förvaltningsbeslut 2026-01',
  id: 5,
  informationSet: 'Kravunderlag utanför förvaltning',
  isEnabled: true,
  lastRunAt: null,
  latestRun: null,
  policyKey: 'obsolete_specifications_delete',
  statusCondition: 'Inte Förvaltning och äldre än två år',
}

const REQUIREMENT_SELECTION_RETENTION_POLICY = {
  action: 'delete',
  ageDays: 365,
  decisionReference: 'Förvaltningsbeslut 2026-02',
  id: 6,
  informationSet: 'Arkiverade kravurvalsfrågor och kravurvalssvar',
  isEnabled: true,
  lastRunAt: null,
  latestRun: null,
  policyKey: 'archived_requirement_selection_delete',
  statusCondition: 'Arkiverad och äldre än ett år',
}

interface AdminHsaIdPrefixRow {
  id: number
  isDefault: boolean
  isUsed: boolean
  isVisible: boolean
  label: string | null
  prefix: string
}

async function requestOkWithRetry(
  requestName: string,
  sendRequest: () => Promise<APIResponse>,
): Promise<APIResponse> {
  const retryState: {
    lastFailure: string
    successfulResponse?: APIResponse
  } = { lastFailure: 'no response received' }

  try {
    await expect
      .poll(
        async () => {
          try {
            const response = await sendRequest()
            if (response.ok()) {
              retryState.successfulResponse = response
              return true
            }

            retryState.lastFailure = `${response.status()}: ${await response.text()}`
          } catch (error) {
            retryState.lastFailure =
              error instanceof Error ? error.message : String(error)
          }

          return false
        },
        {
          intervals: [250, 500, 1_000, 2_000],
          timeout: 45_000,
        },
      )
      .toBe(true)
  } catch {
    throw new Error(
      `${requestName} failed after retries: ${retryState.lastFailure}`,
    )
  }

  if (!retryState.successfulResponse) {
    throw new Error(
      `${requestName} failed after retries: ${retryState.lastFailure}`,
    )
  }

  return retryState.successfulResponse
}

async function resetAdminSettings(request: APIRequestContext) {
  await requestOkWithRetry('requirement columns', () =>
    request.put('/api/admin/requirement-columns', {
      data: {
        columns: DEFAULT_COLUMN_PAYLOAD,
      },
      timeout: 30_000,
    }),
  )

  const currentPrefixesResponse = await requestOkWithRetry(
    'HSA-id prefixes load',
    () => request.get('/api/admin/hsa-id-prefixes', { timeout: 30_000 }),
  )
  const currentPrefixes = (await currentPrefixesResponse.json()) as {
    prefixes?: AdminHsaIdPrefixRow[]
  }
  const preservedUsedPrefixes =
    currentPrefixes.prefixes
      ?.filter(row => row.prefix !== DEFAULT_HSA_ID_PREFIX && row.isUsed)
      .map(row => ({
        id: row.id,
        isDefault: false,
        isVisible: false,
        label: row.label,
        prefix: row.prefix,
      })) ?? []
  const existingDefaultPrefix = currentPrefixes.prefixes?.find(
    row => row.prefix === DEFAULT_HSA_ID_PREFIX,
  )

  await requestOkWithRetry('HSA-id prefixes', () =>
    request.put('/api/admin/hsa-id-prefixes', {
      data: {
        prefixes: [
          {
            ...(existingDefaultPrefix ? { id: existingDefaultPrefix.id } : {}),
            isDefault: true,
            isVisible: true,
            label: null,
            prefix: DEFAULT_HSA_ID_PREFIX,
          },
          ...preservedUsedPrefixes,
        ],
      },
      timeout: 30_000,
    }),
  )
}

async function getAdminColumnOrder(page: Page) {
  return page
    .locator('[data-testid^="admin-column-row-"]')
    .evaluateAll(nodes =>
      nodes
        .map(node =>
          node.getAttribute('data-testid')?.replace('admin-column-row-', ''),
        )
        .filter((value): value is string => Boolean(value)),
    )
}

async function setAdminColumnOrder(page: Page, targetOrder: string[]) {
  for (
    let guard = 0;
    guard < targetOrder.length * targetOrder.length;
    guard++
  ) {
    const currentOrder = await getAdminColumnOrder(page)

    if (currentOrder.join('|') === targetOrder.join('|')) {
      return
    }

    const targetIndex = currentOrder.findIndex(
      (columnId, index) => columnId !== targetOrder[index],
    )
    if (targetIndex < 0) {
      return
    }

    const columnId = targetOrder[targetIndex]
    await page
      .getByTestId(`admin-column-row-${columnId}`)
      .getByRole('button', { name: 'Flytta upp' })
      .click()
  }

  throw new Error('Could not apply the requested admin column order.')
}

function swapColumns(order: string[], leftId: string, rightId: string) {
  const nextOrder = [...order]
  const leftIndex = nextOrder.indexOf(leftId)
  const rightIndex = nextOrder.indexOf(rightId)

  if (leftIndex < 0 || rightIndex < 0) {
    return nextOrder
  }

  ;[nextOrder[leftIndex], nextOrder[rightIndex]] = [
    nextOrder[rightIndex],
    nextOrder[leftIndex],
  ]

  return nextOrder
}

async function expectTouchTargetSize(locator: Locator) {
  const box = await locator.boundingBox()

  expect(box).not.toBeNull()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
}

async function expectIconOnlyAction(action: Locator, accessibleName: string) {
  await expect(action).toBeVisible()
  await expect(action).not.toContainText(accessibleName)
  await expect(action.locator('svg')).toBeVisible()
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    contentType: 'application/json',
    json: body,
    status,
  })
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ request }) => {
  await resetAdminSettings(request)
})

test.afterEach(async ({ request }) => {
  await resetAdminSettings(request)
})

for (const { name, viewport } of viewportVariants) {
  test.describe(`admin entrypoint (${name})`, () => {
    test.describe.configure({ mode: 'serial' })
    test.use({ viewport })

    test('AUTH-05: side navigation settings link opens the Swedish admin center', async ({
      page,
    }) => {
      await page.goto('/sv/requirements')

      await expect(page.getByRole('button', { name: 'Taxonomi' })).toHaveCount(
        0,
      )
      if (name === 'mobile') {
        await page.getByRole('button', { name: 'Öppna meny' }).click()
      }

      const settingsLink = page.getByRole('link', { name: 'Inställningar' })
      await expect(settingsLink).toBeVisible()
      await expect(settingsLink).toHaveAttribute('href', '/sv/admin')

      await settingsLink.click()
      await expect(page).toHaveURL('/sv/admin')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Administrationscenter',
      )

      await page.getByRole('tab', { name: 'Taxonomi' }).click()
      await expect(
        page.getByRole('tabpanel', { name: 'Taxonomi' }),
      ).toContainText('Kravområden')

      await page.getByRole('tab', { name: 'Statusar och arbetsflöden' }).click()
      await expect(
        page.getByRole('tabpanel', { name: 'Statusar och arbetsflöden' }),
      ).toContainText('Kravversionsstatusar')
    })

    test(`ADMIN-01: persists column changes through library reloads (${name})`, async ({
      page,
    }) => {
      await page.goto('/sv/admin')

      const originalOrder = await getAdminColumnOrder(page)
      const targetOrder = swapColumns(originalOrder, 'area', 'category')
      await expect(page.getByRole('button', { name: 'Spara' })).toBeDisabled()

      await setAdminColumnOrder(page, targetOrder)
      await page.getByRole('button', { name: 'Spara' }).click()
      await expect(page.getByText('Sparat')).toBeVisible()

      await page.goto('/sv/requirements')
      await expect(
        page.locator(VISIBLE_REQUIREMENTS_HEADER_SELECTOR),
      ).toContainText('Kategori')

      const readHeaderTexts = async () =>
        page
          .locator(VISIBLE_REQUIREMENTS_HEADER_CELL_SELECTOR)
          .evaluateAll(nodes =>
            nodes.map(
              node => node.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            ),
          )

      const headerTexts = await readHeaderTexts()
      const categoryIndex = headerTexts.findIndex(text =>
        text.includes('Kategori'),
      )
      const areaIndex = headerTexts.findIndex(text =>
        text.includes('Kravområde'),
      )

      expect(categoryIndex).toBeGreaterThanOrEqual(0)
      expect(areaIndex).toBeGreaterThanOrEqual(0)
      expect(categoryIndex < areaIndex).toBe(
        targetOrder.indexOf('category') < targetOrder.indexOf('area'),
      )

      await page.reload()
      await expect(
        page.locator(VISIBLE_REQUIREMENTS_HEADER_SELECTOR),
      ).toContainText('Kategori')

      await page.goto('/sv/admin')
      await expect
        .poll(async () => getAdminColumnOrder(page))
        .toEqual(targetOrder)
    })

    if (name === 'desktop') {
      test.describe('admin-only permissions', () => {
        test.use({ storageState: 'test-results/auth/admin-only.json' })

        test('AUTH-06: keeps Swedish admin tabs reachable while retention preview is disabled', async ({
          page,
        }) => {
          await page.goto('/sv/admin')

          const tablist = page.getByRole('tablist', {
            name: 'Administrationscenter',
          })
          const accessReviewTab = page.getByRole('tab', {
            name: 'Behörighetsöversyn',
          })
          const archivingTab = page.getByRole('tab', { name: 'Arkivering' })
          const privacyTab = page.getByRole('tab', { name: 'Dataskydd' })
          const actionAuditLogTab = page.getByRole('tab', {
            name: 'Åtgärdslogg',
          })
          await expect(accessReviewTab).not.toHaveAttribute(
            'aria-disabled',
            'true',
          )
          await expect(actionAuditLogTab).not.toHaveAttribute(
            'aria-disabled',
            'true',
          )
          await expect(archivingTab).toHaveAttribute('aria-disabled', 'true')
          await expect(archivingTab).toHaveAttribute(
            'title',
            /Dataskyddshandläggare/,
          )
          await expect(privacyTab).toHaveAttribute('aria-disabled', 'true')
          await expect(privacyTab).toHaveAttribute(
            'title',
            /Dataskyddshandläggare/,
          )
          const tablistMetrics = await tablist.evaluate(element => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
          }))

          expect(tablistMetrics.clientWidth).toBeGreaterThan(0)
          expect(tablistMetrics.scrollWidth).toBeGreaterThanOrEqual(
            tablistMetrics.clientWidth,
          )

          await actionAuditLogTab.scrollIntoViewIfNeeded()
          const tablistBox = await tablist.boundingBox()
          const actionAuditLogBox = await actionAuditLogTab.boundingBox()

          expect(tablistBox).not.toBeNull()
          expect(actionAuditLogBox).not.toBeNull()
          expect(actionAuditLogBox?.x ?? 0).toBeGreaterThanOrEqual(
            (tablistBox?.x ?? 0) - 1,
          )
          expect(
            (actionAuditLogBox?.x ?? 0) + (actionAuditLogBox?.width ?? 0),
          ).toBeLessThanOrEqual(
            (tablistBox?.x ?? 0) + (tablistBox?.width ?? 0) + 1,
          )
        })
      })

      test('ADMIN-10: data protection role can preview retention candidates from the archiving tab', async ({
        browser,
        page,
      }) => {
        const adminOnlyContext = await browser.newContext({
          storageState: 'test-results/auth/admin-only.json',
          viewport,
        })
        const adminOnlyPage = await adminOnlyContext.newPage()
        try {
          await adminOnlyPage.goto('/sv/admin?tab=archiving')
          await expect(
            adminOnlyPage.getByRole('tab', { name: 'Arkivering' }),
          ).toHaveAttribute('aria-disabled', 'true')
          await expect(
            adminOnlyPage.getByRole('button', {
              name: 'Förhandsgranska gallring',
            }),
          ).toHaveCount(0)
        } finally {
          await adminOnlyContext.close()
        }

        const previewRequests: unknown[] = []
        await page.route('**/api/admin/archiving/policies', async route => {
          await fulfillJson(route, { policies: [RETENTION_POLICY] })
        })
        await page.route('**/api/admin/archiving/preview', async route => {
          previewRequests.push(route.request().postDataJSON())
          await fulfillJson(route, {
            candidates: [
              {
                action: 'delete',
                ageBasis: '2025-01-01T00:00:00.000Z',
                blockedReasonKey: null,
                currentDisplayValue: 'Gammalt kravunderlag',
                fieldKey: 'lifecycleStatus',
                key: 'requirements_specifications.obsolete:101',
                objectKey: 'specifications',
                reference: 'SPEC0001 Gammalt kravunderlag',
                requiresExport: true,
                sourceKey: 'requirements_specifications.obsolete',
                subjectId: '101',
                subjectTable: 'requirements_specifications',
              },
            ],
            cutoff: '2025-05-14T00:00:00.000Z',
            policy: RETENTION_POLICY,
            previewToken: 'retention-preview-token',
            summary: {
              archiveCount: 1,
              candidateCount: 1,
              deleteCount: 1,
              exceptionCount: 0,
              skippedCount: 0,
            },
          })
        })

        await page.goto('/sv/admin?tab=archiving')
        await expect(
          page.getByRole('heading', { name: 'Arkivering' }),
        ).toHaveCount(1)
        await page
          .getByRole('button', { name: 'Förhandsgranska gallring' })
          .click()

        await expect(page.getByText('1 gallringskandidat(er)')).toHaveCount(1)
        await expect(
          page.getByText('SPEC0001 Gammalt kravunderlag'),
        ).toHaveCount(1)
        expect(previewRequests).toEqual([{ policyId: RETENTION_POLICY.id }])
      })

      test('ADMIN-12: retention preview excludes saved historical requirement-selection answers', async ({
        page,
      }) => {
        const previewRequests: unknown[] = []
        await page.route('**/api/admin/archiving/policies', async route => {
          await fulfillJson(route, {
            policies: [REQUIREMENT_SELECTION_RETENTION_POLICY],
          })
        })
        await page.route('**/api/admin/archiving/preview', async route => {
          previewRequests.push(route.request().postDataJSON())
          await fulfillJson(route, {
            candidates: [
              {
                action: 'delete',
                ageBasis: '2025-04-24T09:00:00.000Z',
                blockedReasonKey: null,
                currentDisplayValue: 'PWT ADMIN-12 arkiverad fråga',
                fieldKey: 'requirementSelection',
                key: 'requirement_selection_questions.archived:920401',
                objectKey: 'requirementSelectionQuestions',
                reference: 'PWT-ADMIN12-KUF001',
                requiresExport: false,
                sourceKey: 'requirement_selection_questions.archived',
                subjectId: '920401',
                subjectTable: 'requirement_selection_questions',
              },
              {
                action: 'delete',
                ageBasis: '2025-04-24T09:00:00.000Z',
                blockedReasonKey: null,
                currentDisplayValue: 'PWT ADMIN-12 arkiverat svar',
                fieldKey: 'requirementSelection',
                key: 'requirement_selection_answers.archived:920411',
                objectKey: 'requirementSelectionAnswers',
                reference: 'PWT ADMIN-12 svarsalternativ',
                requiresExport: false,
                sourceKey: 'requirement_selection_answers.archived',
                subjectId: '920411',
                subjectTable: 'requirement_selection_answers',
              },
            ],
            cutoff: '2025-05-14T00:00:00.000Z',
            policy: REQUIREMENT_SELECTION_RETENTION_POLICY,
            previewToken: 'requirement-selection-retention-preview-token',
            summary: {
              archiveCount: 0,
              candidateCount: 2,
              deleteCount: 2,
              exceptionCount: 0,
              skippedCount: 0,
            },
          })
        })

        await page.goto('/sv/admin?tab=archiving')
        await page
          .getByRole('button', { name: 'Förhandsgranska gallring' })
          .click()

        await expect(page.getByText('2 gallringskandidat(er)')).toHaveCount(1)
        await expect(page.getByText('PWT-ADMIN12-KUF001')).toHaveCount(1)
        await expect(
          page.getByText('PWT ADMIN-12 svarsalternativ'),
        ).toHaveCount(1)
        await expect(
          page.getByText('PWT ADMIN-12 historiskt sparat svar'),
        ).toHaveCount(0)
        expect(previewRequests).toEqual([
          { policyId: REQUIREMENT_SELECTION_RETENTION_POLICY.id },
        ])
      })

      test('ADMIN-03: browser back returns to the taxonomy tab after opening a taxonomy page', async ({
        page,
      }) => {
        await page.goto('/en/admin')

        const taxonomyTab = page.getByRole('tab', {
          name: 'Taxonomy',
        })
        await taxonomyTab.click()
        await expect(page).toHaveURL('/en/admin?tab=taxonomy')

        await page.getByTestId('taxonomy-card-areas').click()
        await expect(page).toHaveURL('/en/requirement-areas')
        await expect(
          page.getByRole('heading', { level: 1, name: 'Requirement areas' }),
        ).toBeVisible()

        const areasTable = page.getByRole('table')
        await expectIconOnlyAction(
          areasTable.getByRole('button', { name: 'Edit' }).first(),
          'Edit',
        )
        await expectIconOnlyAction(
          areasTable.getByRole('button', { name: 'Delete' }).first(),
          'Delete',
        )

        await page.goBack()
        await expect(page).toHaveURL('/en/admin?tab=taxonomy')
        await expect(taxonomyTab).toHaveAttribute('aria-selected', 'true')
        await expect(page.getByTestId('taxonomy-card-areas')).toBeVisible()
      })

      test('ADMIN-14: administers HSA-id prefixes and uses them in HSA-id fields', async ({
        page,
      }) => {
        await page.goto('/sv/admin?tab=identity')

        const identityTab = page.getByRole('tab', { name: 'Identitet' })
        await expect(identityTab).toHaveAttribute('aria-selected', 'true')
        await expect(
          page.getByRole('heading', { name: 'Identitet' }),
        ).toBeVisible()
        await expect(
          page.getByRole('textbox', { name: 'HSA-id-prefix' }),
        ).toHaveValue(DEFAULT_HSA_ID_PREFIX)
        await expect(
          page.getByTestId(`hsa-id-prefix-row-${DEFAULT_HSA_ID_PREFIX}`),
        ).toBeVisible()

        await page.getByRole('button', { name: 'Lägg till prefix' }).click()
        const newRow = page.locator('[data-testid^="hsa-id-prefix-row-new-"]')
        await newRow
          .getByRole('textbox', { name: 'HSA-id-prefix' })
          .fill(TEMPORARY_HSA_ID_PREFIX)
        const temporaryPrefixRow = page.getByTestId(
          `hsa-id-prefix-row-${TEMPORARY_HSA_ID_PREFIX}`,
        )
        await temporaryPrefixRow
          .getByRole('textbox', { name: 'Etikett' })
          .fill('Norsk testorganisation')
        await temporaryPrefixRow
          .getByRole('radio', {
            name: `Standard: ${TEMPORARY_HSA_ID_PREFIX}`,
          })
          .check({ force: true })
        await page.getByRole('button', { name: 'Spara' }).click()
        await expect(page.getByText('Sparat')).toBeVisible()
        await expect(temporaryPrefixRow).toBeVisible()

        await page.goto('/sv/requirement-areas')
        await page.getByRole('button', { name: 'Ny' }).click()

        const prefixSelect = page.getByRole('combobox', {
          name: 'HSA-id-prefix',
        })
        await expect(prefixSelect).toBeEnabled()
        await expect(prefixSelect).toHaveValue(TEMPORARY_HSA_ID_PREFIX)
        await expect(
          prefixSelect.locator(`option[value="${TEMPORARY_HSA_ID_PREFIX}"]`),
        ).toHaveText(`Norsk testorganisation - ${TEMPORARY_HSA_ID_PREFIX}`)

        const suffixInput = page.getByRole('textbox', {
          name: 'Kravområdesägare',
        })
        await expect(suffixInput).toBeEnabled()
        await expect(suffixInput).toHaveAttribute('placeholder', 'Suffix')
      })
    }

    if (name === 'mobile') {
      test('ADMIN-04: keeps admin tabs and actions usable on mobile', async ({
        page,
      }) => {
        await page.goto('/sv/admin')

        const columnsTab = page.getByRole('tab', { name: 'Kolumner' })
        const taxonomyTab = page.getByRole('tab', {
          name: 'Taxonomi',
        })
        const statusesAndWorkflowsTab = page.getByRole('tab', {
          name: 'Statusar och arbetsflöden',
        })
        const tablist = page.getByRole('tablist', {
          name: 'Administrationscenter',
        })
        const tablistMetrics = await tablist.evaluate(element => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }))

        expect(tablistMetrics.scrollWidth).toBeGreaterThan(
          tablistMetrics.clientWidth,
        )

        await expect(
          page.getByRole('tab', { name: 'Terminologi' }),
        ).toHaveCount(0)
        await expectTouchTargetSize(columnsTab)
        await expectTouchTargetSize(taxonomyTab)
        await expectTouchTargetSize(statusesAndWorkflowsTab)
        await expect(page.getByRole('button', { name: 'English' })).toHaveCount(
          0,
        )
        await expectTouchTargetSize(
          page.getByRole('button', { name: 'Återställ standardvy' }),
        )
        await expectTouchTargetSize(page.getByRole('button', { name: 'Spara' }))

        await taxonomyTab.click()
        await expect(taxonomyTab).toHaveAttribute('aria-selected', 'true')
        await expect(page.getByTestId('taxonomy-card-areas')).toBeVisible()

        await statusesAndWorkflowsTab.click()
        await expect(statusesAndWorkflowsTab).toHaveAttribute(
          'aria-selected',
          'true',
        )
        await expect(
          page.getByTestId('statuses-workflows-card-statuses'),
        ).toBeVisible()

        await columnsTab.click()
        await expect(columnsTab).toHaveAttribute('aria-selected', 'true')

        const columnResetButton = page.getByRole('button', {
          name: 'Återställ standardvy',
        })
        const columnSaveButton = page.getByRole('button', { name: 'Spara' })

        await expectTouchTargetSize(columnResetButton)
        await expectTouchTargetSize(columnSaveButton)
        await expect(columnResetButton).toBeVisible()
        await expect(columnSaveButton).toBeVisible()
      })
    }
  })
}

for (const locale of ['sv', 'en'] as const) {
  test(`AUTH-05: admin page loads for ${locale}`, async ({ page }) => {
    await page.goto(`/${locale}/admin`)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      locale === 'sv' ? 'Administrationscenter' : 'Admin center',
    )
  })
}
