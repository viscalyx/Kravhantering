import { expect, type Page, type Route, test } from '@playwright/test'
import {
  expectStatus,
  newRoleContext,
} from '../authorization/authorization-test-helpers'

const specificationSlug = 'ETJANST-UPP-2026'
const editSpecificationSlug = 'PWT-SPEC-EDIT-2026'
const rfiSpecificationId = 920007
const rfiSpecificationSlug = 'PWT-RFI-WORKFLOW-2026'
const rfiAreaId = 920001
const rfiPrimaryQuestionId = 920001
const rfiSecondaryQuestionId = 920002

async function gotoSpecificationDetail(
  page: Page,
  slug = specificationSlug,
): Promise<void> {
  await page.goto(`/sv/specifications/${slug}`)
  await expect(
    page.getByText(/^Det gick inte att läsa in tillgängliga krav:/),
  ).toBeHidden({ timeout: 10_000 })
}

function requirementSelectionQuestions(answerIds: number[]) {
  return [
    {
      answers: [
        {
          alreadyAddedRequirementCount: 0,
          description: 'Kravurval för test av sparat svar.',
          healthState: 'healthy',
          id: 9001,
          isActive: true,
          isArchived: false,
          isNoRequirementSelection: false,
          matchingRequirementCount: 2,
          text: 'Ja, använd e-legitimation',
        },
        {
          alreadyAddedRequirementCount: 0,
          description: null,
          healthState: 'healthy',
          id: 9002,
          isActive: true,
          isArchived: false,
          isNoRequirementSelection: true,
          matchingRequirementCount: 0,
          text: 'Nej',
        },
      ],
      areaName: 'Integration',
      id: 901,
      isActive: true,
      isArchived: false,
      isVisible: true,
      questionCode: 'KUF-PLAY-1',
      savedAnswers: answerIds.map(answerId => ({
        answerId,
        isHistorical: false,
      })),
      selectedAnswerIds: answerIds,
      selectionType: 'single',
      text: 'Ska kravunderlaget omfatta e-legitimation?',
      visibilityGroups: [],
      visibilityState: 'visible',
    },
  ]
}

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 720 },
]

function rfiListResponse(options?: {
  isLocked?: boolean
  primaryRelevance?: 'not_relevant' | 'relevant' | null
  primaryStale?: boolean
}) {
  return {
    list: {
      isLocked: options?.isLocked ?? false,
      items: [
        {
          areaId: rfiAreaId,
          areaName: 'PWT-MANUAL Playwright manual cases',
          expectedAnswerFormat: 'PWT-MANUAL fritextsvar.',
          helpText: 'PWT-MANUAL RFI fixture for Playwright.',
          isIncluded: true,
          isVersionStale: options?.primaryStale ?? false,
          questionCode: 'PWM-RFI001',
          questionId: rfiPrimaryQuestionId,
          questionText: 'PWT-MANUAL vilken information ska leverantören lämna?',
          relevance: options?.primaryRelevance ?? null,
          versionNumber: options?.primaryStale ? 2 : 1,
        },
        {
          areaId: rfiAreaId,
          areaName: 'PWT-MANUAL Playwright manual cases',
          expectedAnswerFormat: 'PWT-MANUAL fritextsvar.',
          helpText: 'PWT-MANUAL RFI fixture for Playwright.',
          isIncluded: true,
          isVersionStale: false,
          questionCode: 'PWM-RFI002',
          questionId: rfiSecondaryQuestionId,
          questionText: 'PWT-MANUAL hur ska området besvaras samlat?',
          relevance: null,
          versionNumber: 1,
        },
      ],
      lockedAt: options?.isLocked ? '2026-04-24T09:00:00.000Z' : null,
      lockedByDisplayName: options?.isLocked ? 'Petra specresp' : null,
      specificationId: rfiSpecificationId,
    },
  }
}

function seededRfiSuggestions() {
  return [
    {
      areaId: rfiAreaId,
      content: 'PWT-MANUAL öppet frågeförslag.',
      id: 920001,
      isReviewRequested: false,
      resolution: null,
      rfiQuestionId: rfiPrimaryQuestionId,
      specificationId: rfiSpecificationId,
    },
    {
      areaId: rfiAreaId,
      content: 'PWT-MANUAL öppet områdesförslag.',
      id: 920002,
      isReviewRequested: false,
      resolution: null,
      rfiQuestionId: null,
      specificationId: rfiSpecificationId,
    },
    {
      areaId: rfiAreaId,
      content: 'PWT-MANUAL hanterat RFI-förslag.',
      id: 920003,
      isReviewRequested: true,
      resolution: 1,
      rfiQuestionId: rfiPrimaryQuestionId,
      specificationId: rfiSpecificationId,
    },
    {
      areaId: rfiAreaId,
      content: 'PWT-MANUAL avfärdat RFI-förslag.',
      id: 920004,
      isReviewRequested: true,
      resolution: 2,
      rfiQuestionId: rfiSecondaryQuestionId,
      specificationId: rfiSpecificationId,
    },
  ]
}

async function mockRfiList(
  page: Page,
  options?: {
    initialList?: ReturnType<typeof rfiListResponse>
    suggestions?: ReturnType<typeof seededRfiSuggestions>
  },
) {
  let list = options?.initialList ?? rfiListResponse()
  let suggestions = options?.suggestions ?? []

  await page.route(
    `**/api/requirements-specifications/${rfiSpecificationSlug}/rfi-list`,
    async route => {
      await route.fulfill({
        contentType: 'application/json',
        json: list,
      })
    },
  )
  await page.route(
    `**/api/requirements-specifications/${rfiSpecificationSlug}/rfi-list/lock`,
    async route => {
      list = rfiListResponse({
        isLocked: true,
        primaryRelevance: null,
        primaryStale: true,
      })
      await route.fulfill({
        contentType: 'application/json',
        json: list,
      })
    },
  )
  await page.route(
    `**/api/requirements-specifications/${rfiSpecificationSlug}/rfi-list/unlock`,
    async route => {
      list = rfiListResponse({ isLocked: false, primaryRelevance: null })
      await route.fulfill({
        contentType: 'application/json',
        json: list,
      })
    },
  )
  await page.route('**/api/rfi-question-suggestions?*', async route => {
    await route.fulfill({
      contentType: 'application/json',
      json: { suggestions },
    })
  })

  return {
    addSuggestion(suggestion: ReturnType<typeof seededRfiSuggestions>[number]) {
      suggestions = [suggestion, ...suggestions]
    },
    deleteSuggestion(id: number) {
      suggestions = suggestions.filter(suggestion => suggestion.id !== id)
    },
  }
}

async function mockReportDownloads(page: Page) {
  const requests: string[] = []
  await page.route('**/specifications/**/reports/pdf/**', async route => {
    requests.push(route.request().url())
    await route.fulfill({
      body: '%PDF-1.4\n%%EOF',
      contentType: 'application/pdf',
    })
  })
  await page.route(
    '**/api/requirements-specifications/**/exports?**',
    async route => {
      requests.push(route.request().url())
      await route.fulfill({
        body: 'Krav-ID;Kravtext\nPWT;fixture\n',
        contentType: 'text/csv',
      })
    },
  )
  return requests
}

async function clickMenuItem(page: Page, menuName: string, itemName: string) {
  await page.getByRole('button', { name: menuName }).click()
  await page.getByText(itemName, { exact: true }).click()
}

async function filterAvailableRequirementById(page: Page, uniqueId: string) {
  const availablePanel = page.getByRole('tabpanel', {
    name: 'Tillgängliga krav',
  })

  await availablePanel
    .getByRole('button', { name: 'Filtrera efter Krav-ID' })
    .click()
  const filterInput = page.getByRole('textbox', { name: 'Krav-ID' })
  await filterInput.fill(uniqueId)
  await filterInput.press('Enter')

  await expect(
    availablePanel.getByRole('checkbox', { name: `Markera ${uniqueId}` }),
  ).toBeVisible()
}

for (const viewport of viewports) {
  test.describe(`Requirements specification detail edit action — ${viewport.name} (${viewport.width}×${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test('SPEC-03: opens the specification edit dialog from the title action', async ({
      page,
    }) => {
      await gotoSpecificationDetail(page)

      await expect(
        page.getByRole('heading', {
          level: 1,
          name: 'Upphandling av e-tjänstplattform',
        }),
      ).toBeVisible()
      const splitPanel = page.locator(
        '[data-specification-detail-split-panel="true"]',
      )
      await expect(splitPanel).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Lägg till unika krav' }),
      ).toBeVisible()

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
      test('SPEC-05: lets the specification-detail lists scroll independently while keeping the sticky title bars visible', async ({
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

      test('SPEC-08: shows configured usage statuses in the editable status column', async ({
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

      test('SPEC-11: resets column views for specification requirement lists', async ({
        page,
      }) => {
        await page.addInitScript(() => {
          globalThis.localStorage.clear()
        })
        await gotoSpecificationDetail(page)

        const leftPanel = page.locator(
          '[data-specification-detail-list-panel="items"]',
        )
        const areaHeader = leftPanel.locator(
          '[data-requirement-header-label="area"]',
        )

        await expect(leftPanel).toHaveCount(1)
        await expect(areaHeader).toHaveCount(1)

        await leftPanel.locator('[data-column-picker-trigger="true"]').click()
        const popover = page.locator('[data-column-picker-popover="true"]')
        const areaCheckbox = popover.locator(
          '[data-column-picker-option="area"] input[type="checkbox"]',
        )
        await expect(areaCheckbox).toBeChecked()
        await areaCheckbox.uncheck()
        await expect(areaHeader).toHaveCount(0)

        await popover
          .getByRole('button', { name: 'Återställ standardvy' })
          .click()
        await expect(areaHeader).toHaveCount(1)
      })

      test('SPEC-12: answers requirement-selection questions and updates progress', async ({
        page,
      }) => {
        let selectedAnswerIds: number[] = []
        let releaseInitialQuestions!: () => void
        let resolveInitialQuestionsRequested!: () => void
        const initialQuestionsCanResolve = new Promise<void>(resolve => {
          releaseInitialQuestions = resolve
        })
        const initialQuestionsRequested = new Promise<void>(resolve => {
          resolveInitialQuestionsRequested = resolve
        })
        const saveRequests: unknown[] = []

        await page.route(
          `**/api/requirements-specifications/${specificationSlug}/requirement-selection-answers`,
          async (route: Route) => {
            resolveInitialQuestionsRequested()
            await initialQuestionsCanResolve
            await route.fulfill({
              contentType: 'application/json',
              json: {
                questions: requirementSelectionQuestions(selectedAnswerIds),
              },
            })
          },
        )
        await page.route(
          `**/api/requirements-specifications/${specificationSlug}/requirement-selection-answers/901`,
          async route => {
            const body = route.request().postDataJSON() as {
              answerIds?: number[]
            }
            saveRequests.push(body)
            selectedAnswerIds = body.answerIds ?? []
            await route.fulfill({
              contentType: 'application/json',
              json: {
                questions: requirementSelectionQuestions(selectedAnswerIds),
              },
            })
          },
        )

        await gotoSpecificationDetail(page)
        await page.getByRole('tab', { name: 'Kravurvalsfrågor' }).click()
        await initialQuestionsRequested

        const rightPanel = page.locator(
          '[data-specification-detail-list-panel="available"]',
        )
        await expect(rightPanel).toContainText('Laddar kravurvalsfrågor...')
        await expect(rightPanel).not.toContainText('Besvarade: 0/1')

        releaseInitialQuestions()
        await expect(rightPanel).toContainText('Besvarade: 0/1')
        await expect(rightPanel).toContainText('Obesvarad')

        await rightPanel
          .locator('label')
          .filter({ hasText: 'Ja, använd e-legitimation' })
          .click()

        await expect
          .poll(() => saveRequests)
          .toEqual([{ answerIds: [9001], confirmHiddenAnswerClear: false }])
        await expect(rightPanel).toContainText('Besvarade: 1/1')
        await expect(rightPanel).toContainText('Besvarad')
      })

      test('SPEC-13/SPEC-14: shows RFI scope switches and the included-only view filter', async ({
        page,
      }) => {
        await gotoSpecificationDetail(page)

        await test.step('open the RFI question list tab', async () => {
          await page.getByRole('tab', { name: 'RFI-frågelista' }).click()
          await expect(
            page.getByRole('button', {
              name: 'Visa endast de som ingår i RFI',
            }),
          ).toHaveAttribute('aria-pressed', 'false')
        })

        await test.step('toggle the transient included-only filter', async () => {
          const filterButton = page.getByRole('button', {
            name: 'Visa endast de som ingår i RFI',
          })
          await filterButton.click()
          const activeFilterButton = page.getByRole('button', {
            name: 'Visar endast de som ingår i RFI',
          })
          await expect(activeFilterButton).toHaveAttribute(
            'aria-pressed',
            'true',
          )
          await activeFilterButton.click()
          await expect(
            page.getByRole('button', {
              name: 'Visa endast de som ingår i RFI',
            }),
          ).toHaveAttribute('aria-pressed', 'false')
        })

        await test.step('verify scope controls stay separate from export actions', async () => {
          await expect(page.getByRole('link', { name: 'CSV' })).toHaveAttribute(
            'href',
            /\/rfi-list\/export\?format=csv/u,
          )
          await expect(page.getByRole('link', { name: 'PDF' })).toHaveAttribute(
            'href',
            /\/rfi-list\/export\?format=pdf/u,
          )
          await expect(
            page
              .getByRole('switch', {
                name: /Ändra om kravområdet .+ ingår i RFI/u,
              })
              .first(),
          ).toHaveAttribute('title', /Ingår i RFI|Ingår inte i RFI|Delvis/u)
          await expect(
            page
              .getByRole('switch', {
                name: /Ändra om .+-RFI\d+ ingår i RFI/u,
              })
              .first(),
          ).toHaveAttribute('title', /Ingår i RFI|Ingår inte i RFI/u)
        })
      })
    }
  })
}

test.describe('Requirements specification deterministic manual cases', () => {
  test.use({ viewport: { height: 720, width: 1280 } })

  test('SPEC-06: adds and removes a requirement in the specification detail UI', async ({
    page,
  }) => {
    const addRequests: unknown[] = []
    const removeRequests: unknown[] = []
    await page.route(
      `**/api/requirements-specifications/${editSpecificationSlug}/items`,
      async route => {
        const method = route.request().method()
        if (method === 'POST') {
          addRequests.push(route.request().postDataJSON())
          await route.fulfill({
            contentType: 'application/json',
            json: { addedCount: 1, ok: true },
            status: 201,
          })
          return
        }
        if (method === 'DELETE') {
          removeRequests.push(route.request().postDataJSON())
          await route.fulfill({
            contentType: 'application/json',
            json: { ok: true },
          })
          return
        }
        await route.continue()
      },
    )

    await gotoSpecificationDetail(page, editSpecificationSlug)

    await filterAvailableRequirementById(page, 'PWT-REPORT-A')
    await page.getByRole('checkbox', { name: 'Markera PWT-REPORT-A' }).check()
    await page.getByRole('button', { name: 'Lägg till valda (1)' }).click()
    const addDialog = page.getByRole('dialog').filter({
      hasText: 'Lägger till 1 krav i underlaget',
    })
    await expect(addDialog).toBeVisible()
    await addDialog
      .getByRole('combobox', { name: 'Behovsreferens (valfri)' })
      .selectOption('new')
    await addDialog
      .getByRole('textbox', { name: 'Ny behovsreferens' })
      .fill('PWT SPEC-06 behov')
    await addDialog.getByRole('button', { name: 'Lägg till' }).click()

    await expect
      .poll(() => addRequests)
      .toEqual([
        expect.objectContaining({
          needsReferenceText: 'PWT SPEC-06 behov',
          requirementIds: expect.arrayContaining([920005]),
        }),
      ])

    await page
      .getByRole('checkbox', { name: 'Markera PWT-SPEC-EDIT-SOURCE' })
      .check()
    await page.getByRole('button', { name: 'Ta bort valda (1)' }).click()
    const removeDialog = page.getByRole('alertdialog', {
      name: 'Ta bort valda (1)',
    })
    await expect(removeDialog).toHaveCount(1)
    await removeDialog.getByRole('button', { name: 'Avbryt' }).click()
    await expect(removeDialog).toHaveCount(0)
    expect(removeRequests).toEqual([])

    await page.getByRole('button', { name: 'Ta bort valda (1)' }).click()
    await page
      .getByRole('alertdialog', { name: 'Ta bort valda (1)' })
      .getByRole('button', { name: 'Ta bort' })
      .click()

    await expect
      .poll(() => removeRequests)
      .toEqual([
        expect.objectContaining({
          itemRefs: expect.arrayContaining(['lib:920001']),
        }),
      ])
  })

  test('SPEC-07: creates a specification-local requirement and opens the graduation action', async ({
    page,
  }) => {
    const createRequests: unknown[] = []
    await page.route(
      `**/api/requirements-specifications/${editSpecificationSlug}/local-requirements`,
      async route => {
        createRequests.push(route.request().postDataJSON())
        await route.fulfill({
          contentType: 'application/json',
          json: {
            localRequirement: {
              id: 920099,
              uniqueId: 'KRAV0002',
            },
            ok: true,
          },
          status: 201,
        })
      },
    )

    await gotoSpecificationDetail(page, editSpecificationSlug)
    await page.getByRole('button', { name: 'Lägg till unika krav' }).click()
    const dialog = page.getByRole('dialog').filter({
      hasText: 'Nytt unikt krav',
    })
    if (!(await dialog.isVisible({ timeout: 1_000 }).catch(() => false))) {
      await page.getByRole('button', { name: 'Nytt unikt krav' }).click()
    }
    await expect(dialog).toBeVisible()
    await dialog
      .getByRole('textbox', { name: /Kravtext/u })
      .fill('PWT SPEC-07 unikt krav.')
    await dialog
      .getByRole('textbox', { name: /Acceptanskriterium/u })
      .fill('Verifiera i UI.')
    await dialog.getByRole('checkbox', { name: 'Verifierbar' }).check()
    await dialog
      .getByRole('textbox', { name: /Verifieringsmetod/u })
      .fill('Playwright-test.')
    await dialog.getByRole('button', { name: 'Spara' }).click()

    await expect
      .poll(() => createRequests)
      .toEqual([
        expect.objectContaining({
          acceptanceCriteria: 'Verifiera i UI.',
          description: 'PWT SPEC-07 unikt krav.',
          requiresTesting: true,
          verificationMethod: 'Playwright-test.',
        }),
      ])

    const localRow = page.getByRole('button', {
      name: /KRAV0001\b/,
    })
    await localRow.click()
    const localDetailRow = page
      .getByRole('row')
      .filter({ hasText: 'Lyft till kravbiblioteket' })
    await localDetailRow.getByRole('button', { name: 'Redigera' }).click()
    const editDialog = page.getByRole('dialog', {
      name: 'Redigera unikt krav',
    })
    await expect(editDialog).toBeVisible()
    await editDialog.getByRole('button', { name: 'Stäng' }).click()
    await localDetailRow
      .getByRole('button', { name: 'Lyft till kravbiblioteket' })
      .click()
    const liftDialog = page.getByRole('dialog', { name: 'Lyft unikt krav' })
    await expect(liftDialog).toBeVisible()
    await liftDialog.getByRole('button', { name: 'Avbryt' }).click()
  })

  test('SPEC-09: creates, edits, and deletes needs references from the detail tab', async ({
    page,
  }) => {
    const requests: Array<{ body: unknown; method: string }> = []
    type NeedsReferenceFixture = {
      createdAt: string
      description: string | null
      id: number
      libraryItemCount: number
      linkedItemCount: number
      specificationLocalRequirementCount: number
      text: string
      updatedAt: string
    }
    let needsReferences: NeedsReferenceFixture[] = [
      {
        createdAt: '2026-04-24T09:00:00.000Z',
        description: null,
        id: 920001,
        libraryItemCount: 1,
        linkedItemCount: 2,
        specificationLocalRequirementCount: 1,
        text: 'PWT-MANUAL ursprungligt behov',
        updatedAt: '2026-04-24T09:00:00.000Z',
      },
      {
        createdAt: '2026-04-24T09:00:00.000Z',
        description: null,
        id: 920002,
        libraryItemCount: 0,
        linkedItemCount: 0,
        specificationLocalRequirementCount: 0,
        text: 'PWT-MANUAL ersättningsbehov',
        updatedAt: '2026-04-24T09:00:00.000Z',
      },
    ]
    await page.route(
      `**/api/requirements-specifications/${editSpecificationSlug}/needs-references`,
      async route => {
        const method = route.request().method()
        if (method === 'GET') {
          await route.fulfill({
            contentType: 'application/json',
            json: { needsReferences },
          })
          return
        }
        if (method !== 'GET') {
          const body = route.request().postDataJSON() as {
            description?: string | null
            id?: number
            text?: string
          }
          requests.push({ body, method })
          if (method === 'POST') {
            needsReferences = [
              ...needsReferences,
              {
                createdAt: '2026-04-24T09:00:00.000Z',
                description: body.description ?? null,
                id: 920099,
                libraryItemCount: 0,
                linkedItemCount: 0,
                specificationLocalRequirementCount: 0,
                text: body.text ?? '',
                updatedAt: '2026-04-24T09:00:00.000Z',
              },
            ]
          } else if (method === 'PATCH') {
            needsReferences = needsReferences.map(reference =>
              reference.id === body.id
                ? {
                    ...reference,
                    description: body.description ?? null,
                    text: body.text ?? reference.text,
                  }
                : reference,
            )
          } else if (method === 'DELETE') {
            needsReferences = needsReferences.filter(
              reference => reference.id !== body.id,
            )
          }
          await route.fulfill({
            contentType: 'application/json',
            json: {
              needsReference: {
                description: body.description ?? null,
                id: body.id ?? 920099,
                text: body.text ?? 'PWT SPEC-09 behov',
              },
              ok: true,
            },
            status: method === 'POST' ? 201 : 200,
          })
          return
        }
        await route.continue()
      },
    )

    await gotoSpecificationDetail(page, editSpecificationSlug)
    await page.getByRole('tab', { name: 'Behovsreferenser' }).click()
    await page.getByRole('button', { name: 'Ny behovsreferens' }).click()

    const createDialog = page.getByRole('dialog')
    await createDialog
      .getByRole('textbox', { name: 'Behovsreferens' })
      .fill('PWT SPEC-09 behov')
    await createDialog
      .getByRole('textbox', { name: 'Beskrivning' })
      .fill('PWT SPEC-09 beskrivning')
    await createDialog.getByRole('button', { name: 'Spara' }).click()

    const createdRow = page
      .getByRole('row')
      .filter({ hasText: 'PWT SPEC-09 behov' })
    await expect(createdRow).toBeVisible()
    await createdRow
      .getByRole('button', { name: 'Redigera behovsreferens' })
      .click()
    const editDialog = page.getByRole('dialog')
    await editDialog
      .getByRole('textbox', { name: 'Behovsreferens' })
      .fill('PWT SPEC-09 ändrat behov')
    await editDialog.getByRole('button', { name: 'Spara' }).click()

    const editedRow = page
      .getByRole('row')
      .filter({ hasText: 'PWT SPEC-09 ändrat behov' })
    await expect(editedRow).toBeVisible()
    await editedRow
      .getByRole('button', { name: 'Ta bort behovsreferens' })
      .click()
    await page
      .getByRole('alertdialog', { name: 'Ta bort behovsreferens' })
      .getByRole('button', { name: 'Ta bort' })
      .click()

    await expect
      .poll(() => requests)
      .toEqual([
        {
          body: {
            description: 'PWT SPEC-09 beskrivning',
            text: 'PWT SPEC-09 behov',
          },
          method: 'POST',
        },
        {
          body: expect.objectContaining({
            text: 'PWT SPEC-09 ändrat behov',
          }),
          method: 'PATCH',
        },
        {
          body: expect.objectContaining({
            id: 920099,
          }),
          method: 'DELETE',
        },
      ])
  })

  test('SPEC-10b: generates progress reports for Införande and Utveckling specifications', async ({
    page,
  }) => {
    const downloadRequests = await mockReportDownloads(page)

    for (const slug of ['PWT-SPEC-REPORT-INFOR', 'PWT-SPEC-REPORT-UTV']) {
      await gotoSpecificationDetail(page, slug)
      await clickMenuItem(page, 'Rapporter', 'Genomföranderapport')
      await expect
        .poll(() =>
          downloadRequests.some(url =>
            url.includes(`/sv/specifications/${slug}/reports/pdf/progress`),
          ),
        )
        .toBe(true)

      await page.getByRole('button', { name: 'Exportera' }).click()
      await expect(page.getByText('Anbuds-CSV', { exact: true })).toHaveCount(0)
      await page.getByText('Full CSV-export', { exact: true }).click()
      await expect
        .poll(() =>
          downloadRequests.some(
            url =>
              url.includes(
                `/api/requirements-specifications/${slug}/exports`,
              ) && url.includes('profile=full'),
          ),
        )
        .toBe(true)
    }
  })

  test('SPEC-10c: generates a management report for Förvaltning specifications', async ({
    page,
  }) => {
    const downloadRequests = await mockReportDownloads(page)

    await gotoSpecificationDetail(page, 'PWT-SPEC-REPORT-FORV')
    await clickMenuItem(page, 'Rapporter', 'Förvaltningsrapport')

    await expect
      .poll(() =>
        downloadRequests.some(url =>
          url.includes(
            '/sv/specifications/PWT-SPEC-REPORT-FORV/reports/pdf/management',
          ),
        ),
      )
      .toBe(true)
  })

  test('SPEC-10e: shows traceability only up to the 200 filtered-item limit', async ({
    page,
  }) => {
    const downloadRequests = await mockReportDownloads(page)

    await gotoSpecificationDetail(page, 'PWT-SPEC-TRACE-200')
    await clickMenuItem(page, 'Rapporter', 'Tillämpningsspårbarhet')
    await expect
      .poll(() =>
        downloadRequests.some(url =>
          url.includes(
            '/sv/specifications/PWT-SPEC-TRACE-200/reports/pdf/traceability',
          ),
        ),
      )
      .toBe(true)

    await gotoSpecificationDetail(page, 'PWT-SPEC-TRACE-201')
    await page.getByRole('button', { name: 'Rapporter' }).click()
    await expect(
      page.getByText('Tillämpningsspårbarhet', { exact: true }),
    ).toHaveCount(0)
    await page.getByText('Genomföranderapport', { exact: true }).click()
    await expect
      .poll(() =>
        downloadRequests.some(url =>
          url.includes(
            '/sv/specifications/PWT-SPEC-TRACE-201/reports/pdf/progress',
          ),
        ),
      )
      .toBe(true)
  })

  test('SPEC-15: unlocks and relocks an RFI list after a question version changes', async ({
    page,
  }) => {
    await mockRfiList(page, {
      initialList: rfiListResponse({
        isLocked: true,
        primaryRelevance: 'relevant',
      }),
    })

    await gotoSpecificationDetail(page, rfiSpecificationSlug)
    await page.getByRole('tab', { name: 'RFI-frågelista' }).click()

    const lockSwitch = page.getByRole('switch', { name: 'Låst' })
    await expect(lockSwitch).toBeChecked()
    await lockSwitch.click()
    await expect(lockSwitch).not.toBeChecked()
    await lockSwitch.click()
    await expect(lockSwitch).toBeChecked()

    const primaryQuestion = page
      .locator('article')
      .filter({ hasText: 'PWM-RFI001' })
    await expect(primaryQuestion.getByText('Nyare version finns')).toHaveCount(
      1,
    )
    await expect(
      primaryQuestion.getByLabel('Relevant', { exact: true }),
    ).not.toBeChecked()
    await expect(
      primaryQuestion.getByLabel('Inte relevant', { exact: true }),
    ).not.toBeChecked()
  })

  test('SPEC-16: creates RFI question and area suggestions from the RFI list', async ({
    page,
  }) => {
    const rfiMock = await mockRfiList(page)
    const createRequests: unknown[] = []
    await page.route('**/api/rfi-question-suggestions', async route => {
      const body = route.request().postDataJSON() as {
        areaId: number
        content: string
        rfiQuestionId: number | null
        specificationId: number
      }
      createRequests.push(body)
      const suggestion = {
        areaId: body.areaId,
        content: body.content,
        id: 920100 + createRequests.length,
        isReviewRequested: false,
        resolution: null,
        rfiQuestionId: body.rfiQuestionId,
        specificationId: body.specificationId,
      }
      rfiMock.addSuggestion(suggestion)
      await route.fulfill({
        contentType: 'application/json',
        json: { suggestion },
        status: 201,
      })
    })

    await gotoSpecificationDetail(page, rfiSpecificationSlug)
    await page.getByRole('tab', { name: 'RFI-frågelista' }).click()

    await page
      .getByRole('button', {
        name: 'Skicka RFI-frågeförslag för PWM-RFI001',
      })
      .click()
    let dialog = page.getByRole('dialog', {
      name: 'Skicka RFI-frågeförslag',
    })
    await expect(dialog).toContainText('PWM-RFI001')
    await dialog
      .getByRole('textbox', { name: /Förslag/u })
      .fill('PWT SPEC-16 frågeförslag')
    await dialog
      .getByRole('button', { name: 'Skicka RFI-frågeförslag' })
      .click()
    await expect(
      page.getByText('RFI-frågeförslaget har skickats.'),
    ).toHaveCount(1)

    await page
      .getByRole('button', {
        name: 'Skicka RFI-frågeförslag för kravområdet PWT-MANUAL Playwright manual cases',
      })
      .click()
    dialog = page.getByRole('dialog', {
      name: 'Skicka RFI-frågeförslag',
    })
    await expect(dialog).toContainText('kravområdet')
    await dialog
      .getByRole('textbox', { name: /Förslag/u })
      .fill('PWT SPEC-16 områdesförslag')
    await dialog
      .getByRole('button', { name: 'Skicka RFI-frågeförslag' })
      .click()

    await expect
      .poll(() => createRequests)
      .toEqual([
        {
          areaId: rfiAreaId,
          content: 'PWT SPEC-16 frågeförslag',
          rfiQuestionId: rfiPrimaryQuestionId,
          specificationId: rfiSpecificationId,
        },
        {
          areaId: rfiAreaId,
          content: 'PWT SPEC-16 områdesförslag',
          rfiQuestionId: null,
          specificationId: rfiSpecificationId,
        },
      ])
  })

  test('SPEC-16a: views and deletes RFI suggestions from the specification RFI list', async ({
    page,
  }) => {
    const rfiMock = await mockRfiList(page, {
      suggestions: seededRfiSuggestions(),
    })
    const deleteRequests: number[] = []
    await page.route('**/api/rfi-question-suggestions/920001', async route => {
      deleteRequests.push(920001)
      rfiMock.deleteSuggestion(920001)
      await route.fulfill({
        contentType: 'application/json',
        json: { ok: true },
      })
    })

    await gotoSpecificationDetail(page, rfiSpecificationSlug)
    await page.getByRole('tab', { name: 'RFI-frågelista' }).click()

    await page
      .getByRole('button', {
        name: 'Visa 1 RFI-frågeförslag för kravområdet PWT-MANUAL Playwright manual cases',
      })
      .click()
    let suggestionsDialog = page.getByRole('dialog', {
      name: 'RFI-frågeförslag',
    })
    await expect(suggestionsDialog).toContainText(
      'PWT-MANUAL öppet områdesförslag.',
    )
    await suggestionsDialog.getByRole('button', { name: 'Stäng' }).click()

    await page
      .getByRole('button', {
        name: 'Visa 2 RFI-frågeförslag för PWM-RFI001',
      })
      .click()
    suggestionsDialog = page.getByRole('dialog', {
      name: 'RFI-frågeförslag',
    })
    await expect(suggestionsDialog).toContainText(
      'PWT-MANUAL öppet frågeförslag.',
    )
    await expect(suggestionsDialog).toContainText(
      'PWT-MANUAL hanterat RFI-förslag.',
    )
    await suggestionsDialog
      .getByRole('button', { name: 'Ta bort RFI-frågeförslag' })
      .click()
    await page
      .getByRole('alertdialog', { name: 'Ta bort RFI-frågeförslag' })
      .getByRole('button', { name: 'Ta bort' })
      .click()

    await expect.poll(() => deleteRequests).toEqual([920001])
    await expect(suggestionsDialog).not.toContainText(
      'PWT-MANUAL öppet frågeförslag.',
    )
    await expect(suggestionsDialog).toContainText(
      'PWT-MANUAL hanterat RFI-förslag.',
    )
  })

  test('SPEC-16b: rejects an RFI suggestion when the specification author lacks target area authorship', async ({
    page: _page,
  }, testInfo) => {
    const roleRequest = await newRoleContext(testInfo, 'specificationCoauthor')
    try {
      const response = await roleRequest.post('/api/rfi-question-suggestions', {
        data: {
          areaId: rfiAreaId,
          content: 'PWT SPEC-16b ska nekas',
          rfiQuestionId: rfiPrimaryQuestionId,
          specificationId: rfiSpecificationId,
        },
      })
      await expectStatus(
        response,
        403,
        'create RFI suggestion without area authorship',
      )
    } finally {
      await roleRequest.dispose()
    }
  })
})
