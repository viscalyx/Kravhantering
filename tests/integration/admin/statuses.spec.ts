import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from '@playwright/test'

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

async function getUsageStatuses(
  request: APIRequestContext,
): Promise<SpecificationItemStatus[]> {
  const response = await request.get('/api/catalog/specification-item-statuses')
  expect(response.ok()).toBe(true)

  const body = (await response.json()) as {
    statuses?: SpecificationItemStatus[]
  }
  return body.statuses ?? []
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
})
