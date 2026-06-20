import { expect, type Locator, test } from '@playwright/test'

const viewports = [
  { height: 812, name: 'mobile', width: 375 },
  { height: 720, name: 'desktop', width: 1280 },
]

type FieldBox = {
  height: number
  width: number
  x: number
  y: number
}

async function inputBox(scope: Locator, id: string): Promise<FieldBox> {
  const box = await scope.locator(`#${id}`).boundingBox()
  expect(box, `expected ${id} to have a bounding box`).not.toBeNull()
  return box as FieldBox
}

function expectSameRow(left: FieldBox, right: FieldBox): void {
  expect(Math.abs(left.y - right.y)).toBeLessThanOrEqual(8)
  expect(right.x).toBeGreaterThan(left.x + left.width)
}

function expectBelow(upper: FieldBox, lower: FieldBox): void {
  expect(lower.y).toBeGreaterThan(upper.y + upper.height)
}

for (const viewport of viewports) {
  test.describe(`Norm reference create layout — ${viewport.name}`, () => {
    test.use({ viewport: { height: viewport.height, width: viewport.width } })

    test('lays out the new norm reference form responsively', async ({
      page,
    }) => {
      await test.step('open the norm library create dialog', async () => {
        await page.goto('/sv/requirements/stewardship?tab=norms')

        await expect(
          page.getByRole('heading', { level: 1, name: 'Normbibliotek' }),
        ).toHaveText('Normbibliotek')

        await page.getByRole('button', { name: 'Ny normreferens' }).click()
      })

      const dialog = page.getByRole('dialog', { name: 'Ny normreferens' })
      await expect(dialog).toHaveCount(1)

      const name = await inputBox(dialog, 'norm-reference-name')
      const type = await inputBox(dialog, 'norm-reference-type')
      const reference = await inputBox(dialog, 'norm-reference-reference')
      const version = await inputBox(dialog, 'norm-reference-version')
      const issuer = await inputBox(dialog, 'norm-reference-issuer')
      const uri = await inputBox(dialog, 'norm-reference-uri')
      const normReferenceId = await inputBox(dialog, 'norm-reference-id')

      if (viewport.name === 'desktop') {
        await test.step('verify the desktop two-column rows', async () => {
          expectSameRow(name, type)
          expectSameRow(reference, version)
          expectSameRow(issuer, uri)
          expectBelow(name, reference)
          expectBelow(reference, issuer)
          expectBelow(issuer, normReferenceId)
          expect(normReferenceId.width).toBeGreaterThan(name.width * 1.6)
        })
      } else {
        await test.step('verify the mobile single-column stack', async () => {
          for (const field of [
            type,
            reference,
            version,
            issuer,
            uri,
            normReferenceId,
          ]) {
            expect(Math.abs(field.x - name.x)).toBeLessThanOrEqual(4)
            expect(field.width).toBeGreaterThan(name.width - 8)
          }

          expectBelow(name, type)
          expectBelow(type, reference)
          expectBelow(reference, version)
          expectBelow(version, issuer)
          expectBelow(issuer, uri)
          expectBelow(uri, normReferenceId)
        })
      }
    })
  })
}
