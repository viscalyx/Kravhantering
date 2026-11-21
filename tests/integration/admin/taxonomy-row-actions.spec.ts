import { expect, test } from '@playwright/test'

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
