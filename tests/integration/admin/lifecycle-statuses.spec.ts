import { expect, test } from '@playwright/test'
import en from '@/messages/en.json'
import sv from '@/messages/sv.json'
import { DESKTOP_VIEWPORT } from '../../helpers/desktop-viewport'

interface LifecycleStatus {
  id: number
  nameEn: string
  nameSv: string
}

test.use({
  storageState: 'test-results/auth/admin.json',
  viewport: DESKTOP_VIEWPORT,
})

test('ADMIN-33: protects built-in lifecycle statuses while allowing bilingual renaming and custom CRUD', async ({
  page,
  request,
}) => {
  const endpoint = '/api/specification-lifecycle-statuses'
  const readStatuses = async (): Promise<LifecycleStatus[]> => {
    const response = await request.get(endpoint)
    expect(response.ok()).toBe(true)
    return (await response.json()).statuses
  }
  const before = await readStatuses()
  const builtIn = before.find(status => status.id === 1)
  expect(builtIn).toBeDefined()
  if (!builtIn) throw new Error('Missing built-in lifecycle status')
  const suffix = Date.now()
  const renamed = { nameEn: `Renamed ${suffix}`, nameSv: `Omdöpt ${suffix}` }
  const custom = { nameEn: `Custom ${suffix}`, nameSv: `Egen ${suffix}` }
  let customId: number | undefined

  try {
    await test.step('Reject direct deletion without changing built-in statuses', async () => {
      for (const [locale, messages] of [
        ['en', en],
        ['sv', sv],
      ] as const) {
        for (const id of [1, 2, 3, 4]) {
          const response = await request.delete(
            `${endpoint}/${id}?locale=${locale}`,
          )
          expect(response.status()).toBe(409)
          expect(await response.json()).toEqual({
            code: 'protected_specification_lifecycle_status',
            error: messages.lifecycleStatusMgmt.protectedDeletion,
          })
        }
        expect(await readStatuses()).toEqual(before)
      }
    })
    await test.step('Rename a built-in status in both languages', async () => {
      await page.goto('/sv/specifications/lifecycle-statuses')
      const builtInRow = page
        .getByRole('row')
        .filter({ hasText: builtIn.nameSv })
      await expect(
        builtInRow.getByText(sv.lifecycleStatusMgmt.protectedDeletion),
      ).toHaveText(sv.lifecycleStatusMgmt.protectedDeletion)
      await expect(
        builtInRow.getByRole('button', { name: sv.common.delete, exact: true }),
      ).toHaveCount(0)
      await expect(
        builtInRow.locator(
          '[data-developer-mode-value="protected lifecycle status"]',
        ),
      ).toHaveCount(1)
      await builtInRow
        .getByRole('button', { name: sv.common.edit, exact: true })
        .click()
      await page.locator('#ls-name-sv').fill(renamed.nameSv)
      await page.locator('#ls-name-en').fill(renamed.nameEn)
      await page
        .getByRole('button', { name: sv.common.save, exact: true })
        .click()
      await expect(
        page.getByRole('row').filter({ hasText: renamed.nameSv }),
      ).toHaveCount(1)
      expect((await readStatuses()).find(status => status.id === 1)).toEqual({
        id: 1,
        ...renamed,
      })
      expect((await request.delete(`${endpoint}/1`)).status()).toBe(409)

      await page.goto('/en/specifications/lifecycle-statuses')
      const renamedRow = page
        .getByRole('row')
        .filter({ hasText: renamed.nameEn })
      await expect(
        renamedRow.getByText(en.lifecycleStatusMgmt.protectedDeletion),
      ).toHaveCount(1)
      await expect(
        renamedRow.getByRole('button', { name: en.common.delete, exact: true }),
      ).toHaveCount(0)
    })
    await test.step('Create, edit and delete a custom status', async () => {
      await page
        .getByRole('button', { name: en.common.create, exact: true })
        .click()
      await page.locator('#ls-name-sv').fill(custom.nameSv)
      await page.locator('#ls-name-en').fill(custom.nameEn)
      await page
        .getByRole('button', { name: en.common.save, exact: true })
        .click()
      let customRow = page.getByRole('row').filter({ hasText: custom.nameEn })
      await expect(customRow).toHaveCount(1)
      customId = (await readStatuses()).find(
        status => status.nameEn === custom.nameEn,
      )?.id
      expect(customId).toBeGreaterThan(4)
      await customRow
        .getByRole('button', { name: en.common.edit, exact: true })
        .click()
      await page.locator('#ls-name-en').fill(`${custom.nameEn} edited`)
      await page.locator('#ls-name-sv').fill(`${custom.nameSv} ändrad`)
      await page
        .getByRole('button', { name: en.common.save, exact: true })
        .click()
      customRow = page
        .getByRole('row')
        .filter({ hasText: `${custom.nameEn} edited` })
      await expect(customRow).toHaveCount(1)
      expect(
        (await readStatuses()).find(status => status.id === customId),
      ).toEqual({
        id: customId,
        nameEn: `${custom.nameEn} edited`,
        nameSv: `${custom.nameSv} ändrad`,
      })
      await customRow
        .getByRole('button', { name: en.common.delete, exact: true })
        .click()
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: en.common.confirm, exact: true })
        .click()
      await expect(customRow).toHaveCount(0)
      expect(
        (await readStatuses()).some(status => status.id === customId),
      ).toBe(false)
    })
  } finally {
    const restored = await request.put(`${endpoint}/1`, {
      data: { nameEn: builtIn.nameEn, nameSv: builtIn.nameSv },
    })
    expect(restored.ok()).toBe(true)
    const remaining = await readStatuses()
    for (const status of remaining.filter(
      status =>
        status.id === customId ||
        status.nameEn === custom.nameEn ||
        status.nameEn === `${custom.nameEn} edited`,
    )) {
      expect((await request.delete(`${endpoint}/${status.id}`)).ok()).toBe(true)
    }
  }
})
