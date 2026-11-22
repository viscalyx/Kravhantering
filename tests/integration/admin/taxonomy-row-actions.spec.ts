import { expect, test } from '@playwright/test'

test('ADMIN-13: co-author actions identify and open the displayed requirement area in both languages', async ({
  page,
}) => {
  for (const [locale, action, dialogTitle] of [
    ['sv', 'Hantera medförfattare för', 'Kravområdesmedförfattare'],
    ['en', 'Manage co-authors for', 'Requirement area co-authors'],
  ] as const) {
    await page.goto(`/${locale}/requirement-areas`)
    for (const [name, id] of [
      ['Drift', 9],
      ['Säkerhet', 2],
    ] as const) {
      await test.step(`Open the ${locale} co-author action for ${name}`, async () => {
        const row = page.getByRole('row').filter({
          has: page.getByRole('cell', { name, exact: true }),
        })
        const label = `${action} ${name}`
        const button = row.getByRole('button', { name: label, exact: true })
        await expect(button).toHaveAttribute('title', label)
        const [response] = await Promise.all([
          page.waitForResponse(`**/api/requirement-areas/${id}/co-authors`),
          button.click(),
        ])
        expect(response.ok()).toBe(true)
        const dialog = page.getByRole('dialog', { name: dialogTitle })
        await expect(dialog).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
      })
    }
  }
})

test('ADMIN-35: taxonomy action names identify the displayed item in both languages', async ({
  page,
}) => {
  for (const [locale, edit, remove] of [
    ['sv', 'Redigera', 'Ta bort'],
    ['en', 'Edit', 'Delete'],
  ] as const) {
    for (const [path, names] of [
      [
        'governance-object-types',
        locale === 'sv'
          ? ['Förvaltningsobjekt', 'Projekt']
          : ['Management object', 'Project'],
      ],
      [
        'implementation-types',
        locale === 'sv'
          ? ['Upphandling', 'Utveckling']
          : ['Procurement', 'Development'],
      ],
    ] as const) {
      await test.step(`Read the ${locale} action names on ${path}`, async () => {
        await page.goto(`/${locale}/specifications/${path}`)
        for (const name of names) {
          const row = page
            .getByRole('row')
            .filter({ has: page.getByRole('cell', { name, exact: true }) })
          for (const action of [edit, remove]) {
            await expect(
              row.getByRole('button', {
                name: `${action} ${name}`,
                exact: true,
              }),
            ).toHaveCount(1)
          }
        }
      })
    }
  }
})
