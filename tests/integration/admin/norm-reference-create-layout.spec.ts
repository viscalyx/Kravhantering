import { expect, type Locator, test } from '@playwright/test'

async function fillNormReferenceForm(dialog: Locator, normReferenceId: string) {
  await dialog.locator('#norm-reference-name').fill('PWT ADMIN-06 normreferens')
  await dialog.locator('#norm-reference-type').fill('Standard')
  await dialog
    .locator('#norm-reference-reference')
    .fill('PWT ADMIN-06 referens')
  await dialog.locator('#norm-reference-issuer').fill('PWT')
  await dialog.locator('#norm-reference-id').fill(normReferenceId)
}

test.describe('Norm reference creation', () => {
  test('ADMIN-06: keeps the form open when a norm reference ID already exists', async ({
    page,
  }) => {
    const normReferenceId = `PWT-ADMIN06-${Date.now()}`
    let createdId: number | null = null

    try {
      await page.goto('/sv/requirements/stewardship?tab=norms')
      await expect(
        page.getByRole('heading', { level: 1, name: 'Normbibliotek' }),
      ).toBeVisible()

      await page.getByRole('button', { name: 'Ny normreferens' }).click()
      let dialog = page.getByRole('dialog', { name: 'Ny normreferens' })
      await expect(dialog).toBeVisible()
      await fillNormReferenceForm(dialog, normReferenceId)

      const createResponsePromise = page.waitForResponse(
        response =>
          response.url().endsWith('/api/norm-references') &&
          response.request().method() === 'POST',
      )
      await dialog.getByRole('button', { name: 'Spara' }).click()
      const createResponse = await createResponsePromise
      expect(createResponse.status()).toBe(201)
      const created = (await createResponse.json()) as { id?: unknown }
      if (typeof created.id !== 'number') {
        throw new Error(
          'Created norm reference response did not contain an ID.',
        )
      }
      createdId = created.id
      await expect(dialog).toBeHidden()

      await page.getByRole('button', { name: 'Ny normreferens' }).click()
      dialog = page.getByRole('dialog', { name: 'Ny normreferens' })
      await fillNormReferenceForm(dialog, normReferenceId)
      await dialog.getByRole('button', { name: 'Spara' }).click()

      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('alert')).toContainText(
        'Norm reference ID already exists',
      )
      await expect(dialog.locator('#norm-reference-id')).toHaveValue(
        normReferenceId,
      )
    } finally {
      if (createdId !== null) {
        const cleanupResponse = await page.request.delete(
          `/api/norm-references/${createdId}`,
        )
        expect(cleanupResponse.ok()).toBe(true)
      }
    }
  })
})
