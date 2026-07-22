import {
  type APIRequestContext,
  expect,
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
