import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test'
import { expectApiResponseOk } from '../api-response-assertions'

interface SpecificationItemStatus {
  color: string
  descriptionEn: string | null
  descriptionSv: string | null
  iconName: string | null
  id: number
  nameEn: string
  nameSv: string
  sortOrder: number
}

interface PriorityLevel {
  assessmentCriteriaEn: string
  assessmentCriteriaSv: string
  code: string
  color: string
  descriptionEn: string
  descriptionSv: string
  iconName: string | null
  id: number
  nameEn: string
  nameSv: string
  sortOrder: number
}

interface RequirementStatus {
  color: string
  iconName: string | null
  id: number
  isSystem: boolean
  nameEn: string
  nameSv: string
  sortOrder: number
}

const CANONICAL_REQUIREMENT_STATUS_COLORS = new Map([
  [1, '#3b82f6'],
  [2, '#eab308'],
  [3, '#22c55e'],
  [4, '#6b7280'],
])

const CANONICAL_USAGE_STATUS_COLORS = new Map([
  [1, '#94a3b8'],
  [2, '#f59e0b'],
  [3, '#3b82f6'],
  [4, '#22c55e'],
  [5, '#ef4444'],
  [6, '#6b7280'],
])

async function getUsageStatuses(
  request: APIRequestContext,
): Promise<SpecificationItemStatus[]> {
  const response = await request.get('/api/catalog/specification-item-statuses')
  await expectApiResponseOk(response, 'GET specification item statuses')

  const body = (await response.json()) as {
    statuses?: SpecificationItemStatus[]
  }
  return body.statuses ?? []
}

async function getPriorityLevels(
  request: APIRequestContext,
): Promise<PriorityLevel[]> {
  const response = await request.get('/api/priority-levels')
  await expectApiResponseOk(response, 'GET priority levels')

  const body = (await response.json()) as {
    priorityLevels?: PriorityLevel[]
  }
  return body.priorityLevels ?? []
}

async function getRequirementStatuses(
  request: APIRequestContext,
): Promise<RequirementStatus[]> {
  const response = await request.get('/api/requirement-statuses')
  await expectApiResponseOk(response, 'GET requirement statuses')

  const body = (await response.json()) as {
    statuses?: RequirementStatus[]
  }
  return (body.statuses ?? []).filter(status => status.isSystem)
}

async function openUsageStatusForm(
  page: Page,
  status: SpecificationItemStatus,
) {
  await page.goto('/sv/specification-item-statuses')

  const row = page.getByRole('row', { name: new RegExp(status.nameSv) })
  await row.getByRole('button', { name: 'Redigera' }).click()

  return page.locator('form').filter({
    has: page.getByRole('heading', {
      name: 'Redigera användningsstatus',
    }),
  })
}

async function openPriorityLevelForm(page: Page, priorityLevel: PriorityLevel) {
  await page.goto('/sv/priority-levels')

  const row = page.getByRole('row', {
    name: priorityLevel.nameSv,
  })
  await row.getByRole('button', { name: 'Redigera' }).click()

  return page.locator('form').filter({
    has: page.getByRole('heading', {
      name: 'Redigera prioritet',
    }),
  })
}

async function openRequirementStatusForm(
  page: Page,
  status: RequirementStatus,
) {
  await page.goto('/sv/requirement-statuses')

  const row = page.getByRole('row', { name: status.nameSv })
  await row.getByRole('button', { name: 'Redigera' }).click()

  return page.locator('form').filter({
    has: page.getByRole('heading', { name: 'Redigera' }),
  })
}

async function expectStatusColorPreview(form: Locator, expectedColor: string) {
  await expect(
    form.getByRole('textbox', { name: 'Färgkod (hex)' }),
  ).toHaveValue(expectedColor)
  const preview = form.getByRole('status', {
    name: 'Förhandsvisning av märke',
  })
  await expect(preview.getByText('Ljust tema')).toHaveCount(1)
  await expect(preview.getByText('Mörkt tema')).toHaveCount(1)
  await expect(preview.getByText(/Kontrast \d+\.\d{2}:1/)).toHaveCount(2)
  await expect(preview.getByText('Uppfyller AA')).toHaveCount(2)
  await expect(preview.locator('.status-badge--light')).toHaveAttribute(
    'data-accent-color',
    expectedColor,
  )
  await expect(preview.locator('.status-badge--dark')).toHaveAttribute(
    'data-accent-color',
    expectedColor,
  )
  const swatch = form.locator('[data-color-swatch="exact-rgb"]')
  await expect(swatch).toHaveCSS('border-style', 'solid')
  const [red, green, blue] = [1, 3, 5].map(offset =>
    Number.parseInt(expectedColor.slice(offset, offset + 2), 16),
  )
  await expect(swatch).toHaveCSS(
    'background-color',
    `rgb(${red}, ${green}, ${blue})`,
  )
  const swatchBox = await swatch.boundingBox()
  expect(swatchBox).not.toBeNull()
  expect(swatchBox?.width ?? 0).toBeGreaterThan(swatchBox?.height ?? 0)
}

async function restoreUsageStatus(page: Page, status: SpecificationItemStatus) {
  const form = await openUsageStatusForm(page, status)
  const definitionInput = form.getByRole('textbox', {
    name: 'Definition (SV)',
  })
  const saveButton = form.getByRole('button', { name: 'Spara' })

  await definitionInput.fill(status.descriptionSv ?? '')
  if (await saveButton.isEnabled()) {
    await saveButton.click()
    await expect(form).toHaveCount(0)
  }
}

async function restorePriorityLevel(page: Page, priorityLevel: PriorityLevel) {
  const form = await openPriorityLevelForm(page, priorityLevel)
  const descriptionInput = form.getByRole('textbox', {
    name: 'Beskrivning (SV) *',
  })
  const saveButton = form.getByRole('button', { name: 'Spara' })

  await descriptionInput.fill(priorityLevel.descriptionSv)
  if (await saveButton.isEnabled()) {
    await saveButton.click()
    await expect(form).toHaveCount(0)
  }
}

test.describe('Admin statuses and workflows', () => {
  test('ADMIN-02: both status catalogs preview every canonical color in both themes', async ({
    page,
    request,
  }) => {
    const requirementStatuses = await getRequirementStatuses(request)
    const usageStatuses = await getUsageStatuses(request)

    expect(requirementStatuses).toHaveLength(4)
    expect(usageStatuses).toHaveLength(6)

    await test.step('preview every canonical requirement status color', async () => {
      for (const status of requirementStatuses) {
        const expectedColor = CANONICAL_REQUIREMENT_STATUS_COLORS.get(status.id)
        expect(expectedColor).toBeDefined()
        const form = await openRequirementStatusForm(page, status)
        await expectStatusColorPreview(form, expectedColor ?? '')
      }
    })

    await test.step('preview every canonical usage status color', async () => {
      for (const status of usageStatuses) {
        const expectedColor = CANONICAL_USAGE_STATUS_COLORS.get(status.id)
        expect(expectedColor).toBeDefined()
        const form = await openUsageStatusForm(page, status)
        await expectStatusColorPreview(form, expectedColor ?? '')
      }
    })
  })

  test('ADMIN-02: both status catalogs expose invalid stored colors without accent styling', async ({
    page,
  }) => {
    let requirementSavedColor: string | null = null
    let usageSavedColor: string | null = null
    await page.route(/\/api\/requirement-statuses(?:\?.*)?$/, route =>
      route.fulfill({
        json: {
          statuses: [
            {
              color: 'invalid-color',
              iconName: 'PenLine',
              id: 1,
              isSystem: true,
              nameEn: 'Draft',
              nameSv: 'Utkast',
              sortOrder: 1,
            },
          ],
        },
      }),
    )
    await page.route(/\/api\/requirement-statuses\/1$/, async route => {
      if (route.request().method() !== 'PUT') {
        await route.continue()
        return
      }
      const body = route.request().postDataJSON() as { color?: string }
      requirementSavedColor = body.color ?? null
      await route.fulfill({ json: {} })
    })

    await page.goto('/sv/requirement-statuses')
    const requirementAlert = page
      .getByRole('alert')
      .filter({ hasText: 'ogiltiga lagrade färger' })
    await expect(requirementAlert).toContainText('ogiltiga lagrade färger')
    const requirementRow = page.getByRole('row', { name: /Utkast/ })
    await expect(requirementRow.locator('.status-badge')).not.toHaveAttribute(
      'data-accent-color',
      /.+/,
    )
    await requirementRow.getByRole('button', { name: 'Redigera' }).click()
    const requirementForm = page.locator('form').filter({
      has: page.getByRole('heading', { name: 'Redigera' }),
    })
    await expect(
      requirementForm.getByRole('textbox', { name: 'Färgkod (hex)' }),
    ).toHaveAttribute('aria-invalid', 'true')
    await expect(
      requirementForm.getByText(/Ange en färg som #RRGGBB/),
    ).toHaveCount(1)
    await expect(
      requirementForm.locator('[data-color-swatch="exact-rgb"]'),
    ).toHaveCount(0)
    const requirementSave = requirementForm.getByRole('button', {
      name: 'Spara',
    })
    await expect(requirementSave).toBeDisabled()
    await requirementForm
      .getByRole('textbox', { name: 'Färgkod (hex)' })
      .fill('#3b82f6')
    await expect(requirementSave).toBeEnabled()
    await requirementSave.click()
    await expect(requirementForm).toHaveCount(0)
    expect(requirementSavedColor).toBe('#3b82f6')

    await page.route(
      /\/api\/catalog\/specification-item-statuses(?:\?.*)?$/,
      route =>
        route.fulfill({
          json: {
            statuses: [
              {
                color: '#12345G',
                descriptionEn: 'Included in the specification',
                descriptionSv: 'Ingår i kravunderlaget',
                iconName: 'Circle',
                id: 1,
                linkedItemCount: 0,
                nameEn: 'Included',
                nameSv: 'Inkluderad',
                sortOrder: 1,
              },
            ],
          },
        }),
    )
    await page.route(
      /\/api\/catalog\/specification-item-statuses\/1$/,
      async route => {
        if (route.request().method() !== 'PUT') {
          await route.continue()
          return
        }
        const body = route.request().postDataJSON() as { color?: string }
        usageSavedColor = body.color ?? null
        await route.fulfill({ json: {} })
      },
    )

    await page.goto('/sv/specification-item-statuses')
    const usageAlert = page
      .getByRole('alert')
      .filter({ hasText: 'ogiltiga lagrade färger' })
    await expect(usageAlert).toContainText('ogiltiga lagrade färger')
    const usageRow = page.getByRole('row', { name: /Inkluderad/ })
    await expect(usageRow.locator('.status-badge')).not.toHaveAttribute(
      'data-accent-color',
      /.+/,
    )
    await usageRow.getByRole('button', { name: 'Redigera' }).click()
    const usageForm = page.locator('form').filter({
      has: page.getByRole('heading', { name: 'Redigera användningsstatus' }),
    })
    await expect(
      usageForm.getByRole('textbox', { name: 'Färgkod (hex)' }),
    ).toHaveAttribute('aria-invalid', 'true')
    await expect(usageForm.getByText(/Ange en färg som #RRGGBB/)).toHaveCount(1)
    await expect(
      usageForm.locator('[data-color-swatch="exact-rgb"]'),
    ).toHaveCount(0)
    const usageSave = usageForm.getByRole('button', { name: 'Spara' })
    await expect(usageSave).toBeDisabled()
    await usageForm
      .getByRole('textbox', { name: 'Färgkod (hex)' })
      .fill('#94a3b8')
    await expect(usageSave).toBeEnabled()
    await usageSave.click()
    await expect(usageForm).toHaveCount(0)
    expect(usageSavedColor).toBe('#94a3b8')
  })

  test('ADMIN-02: usage status form saves changes after cancelled discard', async ({
    page,
    request,
  }) => {
    const statuses = await getUsageStatuses(request)
    const status = statuses.find(item => item.nameSv === 'Inkluderad')
    if (!status) {
      throw new Error('Seeded usage status "Inkluderad" was not found.')
    }

    const temporaryDescription = `${
      status.descriptionSv ?? 'Testad användningsstatus'
    } Playwright ADMIN-02`

    try {
      const form = await openUsageStatusForm(page, status)
      const saveButton = form.getByRole('button', { name: 'Spara' })
      const definitionInput = form.getByRole('textbox', {
        name: 'Definition (SV)',
      })

      await expect(saveButton).toBeDisabled()
      await definitionInput.fill(temporaryDescription)
      await expect(saveButton).toBeEnabled()

      await form.getByRole('button', { name: 'Avbryt' }).click()
      const discardDialog = page.getByRole('alertdialog')
      await expect(discardDialog).toContainText('Du har osparade ändringar')
      await discardDialog.getByRole('button', { name: 'Avbryt' }).click()
      await expect(form).toHaveCount(1)
      await expect(definitionInput).toHaveValue(temporaryDescription)

      await saveButton.click()
      await expect(form).toHaveCount(0)
      await expect(page.getByText(temporaryDescription)).toHaveCount(1)

      await page.reload()
      await expect(page.getByText(temporaryDescription)).toHaveCount(1)
    } finally {
      await restoreUsageStatus(page, status)
    }
  })

  test('ADMIN-02: taxonomy form saves changes after cancelled discard', async ({
    page,
    request,
  }) => {
    const priorityLevels = await getPriorityLevels(request)
    const priorityLevel = priorityLevels[0]
    if (!priorityLevel) {
      throw new Error('No seeded priority level was found.')
    }

    const temporaryDescription = `Playwright ADMIN-02 taxonomy ${Date.now()}`

    try {
      const form = await openPriorityLevelForm(page, priorityLevel)
      const saveButton = form.getByRole('button', { name: 'Spara' })
      const descriptionInput = form.getByRole('textbox', {
        name: 'Beskrivning (SV) *',
      })
      await form
        .getByRole('button', { name: 'Hjälp: Sorteringsordning' })
        .click()
      await expect(
        form.getByText(
          'Ange ett tal som styr visningsordningen. Lägre tal visas först.',
        ),
      ).toBeVisible()
      await form.getByRole('button', { name: 'Hjälp: Färg' }).click()
      await expect(
        form.getByText(
          'Välj färgen som används för märket för denna prioritet.',
        ),
      ).toBeVisible()
      await form.getByRole('button', { name: 'Hjälp: Ikon' }).click()
      await expect(
        form.getByText(
          'Välj en godkänd ikon som visas bredvid prioritetsetiketten. Lämna tomt för ett märke med enbart text.',
        ),
      ).toBeVisible()

      await expect(saveButton).toBeDisabled()
      await descriptionInput.fill(temporaryDescription)
      await expect(saveButton).toBeEnabled()

      await form.getByRole('button', { name: 'Avbryt' }).click()
      const discardDialog = page.getByRole('alertdialog')
      await expect(discardDialog).toContainText('Du har osparade ändringar')
      await discardDialog.getByRole('button', { name: 'Avbryt' }).click()
      await expect(form).toHaveCount(1)
      await expect(descriptionInput).toHaveValue(temporaryDescription)

      await saveButton.click()
      await expect(form).toHaveCount(0)
      await expect(page.getByText(temporaryDescription)).toHaveCount(1)

      await page.reload()
      await expect(page.getByText(temporaryDescription)).toHaveCount(1)
    } finally {
      await restorePriorityLevel(page, priorityLevel)
    }
  })
})
