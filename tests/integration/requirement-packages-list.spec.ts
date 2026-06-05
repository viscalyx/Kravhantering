import { expect, test } from '@playwright/test'

const viewports = [
  { height: 812, name: 'mobile', width: 375 },
  { height: 720, name: 'desktop', width: 1280 },
]

for (const viewport of viewports) {
  test.describe(`Requirement packages list filter — ${viewport.name} (${viewport.width}×${viewport.height})`, () => {
    test.use({ viewport: { height: viewport.height, width: viewport.width } })

    test('filters the table by package name or description and clears the search', async ({
      page,
    }) => {
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

      await test.step('filter by a matching package description', async () => {
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
    })
  })
}
