import { expect, test } from '@playwright/test'
import { expectApiResponseOk } from '../api-response-assertions'

const marker = (name: string) => `[data-developer-mode-name="${name}"]`

test('LIFE-01B: association drafts, fixed groups and nested creation persist through requirement save', async ({
  page,
  request,
}) => {
  const suffix = Date.now().toString()
  const packageName = `PWT-1349 package ${suffix}`
  const normName = `PWT-1349 norm ${suffix}`
  const reference = `PWT1349-${suffix}`
  await page.goto('/sv/requirements/new')
  await test.step('cancel a draft and restore focus', async () => {
    const trigger = page.getByRole('button', { name: 'Välj kravpaket' })
    await trigger.click()
    const picker = page.getByRole('dialog')
    const first = picker.getByRole('checkbox').first()
    await expect(
      picker.getByText('0 markerade i dialogen', { exact: true }),
    ).toHaveCount(1)
    await first.check()
    await expect(
      picker.getByText('1 markerat i dialogen', { exact: true }),
    ).toHaveCount(1)
    await picker.getByRole('checkbox').nth(1).check()
    await expect(
      picker.getByText('2 markerade i dialogen', { exact: true }),
    ).toHaveCount(1)
    await picker.getByRole('searchbox').fill('no matching purpose')
    await picker.press('Escape')
    await expect(trigger).toBeFocused()
    await trigger.click()
    await expect(
      page.getByRole('dialog').getByRole('checkbox').first(),
    ).not.toBeChecked()
  })
  let createdRequirementId: string | undefined
  const createdIds: { kind: string; id: number }[] = []
  try {
    for (const kind of ['packages', 'norms'] as const) {
      await test.step(`create ${kind} above the picker and retain it after cancelling the draft`, async () => {
        if (kind === 'norms')
          await page
            .getByRole('button', { name: 'Välj normreferenser' })
            .click()
        const picker = page.getByRole('dialog')
        const search = picker.getByRole('searchbox')
        await search.fill('unmatched search')
        const createLabel =
          kind === 'packages' ? 'Nytt kravpaket' : 'Ny normreferens'
        const create = picker.getByRole('button', { name: createLabel })
        await create.click()
        await expect(page.getByRole('dialog')).toHaveAccessibleName(createLabel)
        await page
          .getByRole('dialog', { name: createLabel, exact: true })
          .getByRole('textbox')
          .first()
          .press('Escape')
        await expect(create).toBeFocused()
        await expect(search).toHaveValue('unmatched search')
        await create.click()
        const child = page.getByRole('dialog')
        await expect(child).toHaveAccessibleName(createLabel)
        await child
          .locator(`[id="association-create-${kind}-name"]`)
          .fill(kind === 'packages' ? packageName : normName)
        const cancel = child.getByRole('button', {
          name: 'Avbryt',
          exact: true,
        })
        await cancel.click()
        const confirmation = page.getByRole('alertdialog')
        await expect(confirmation).toBeVisible()
        await expect(confirmation).toHaveCSS('opacity', '1')
        const anchorBox = await cancel.boundingBox()
        const confirmationBox = await confirmation.boundingBox()
        expect(anchorBox).not.toBeNull()
        expect(confirmationBox).not.toBeNull()
        if (anchorBox && confirmationBox) {
          expect(
            Math.min(
              Math.abs(confirmationBox.y - anchorBox.y - anchorBox.height),
              Math.abs(
                anchorBox.y - confirmationBox.y - confirmationBox.height,
              ),
            ),
          ).toBeLessThanOrEqual(9)
        }
        await confirmation
          .getByRole('button', { name: 'Avbryt', exact: true })
          .click()
        await expect(
          child.locator(`[id="association-create-${kind}-name"]`),
        ).toHaveValue(kind === 'packages' ? packageName : normName)
        if (kind === 'packages') {
          await child
            .locator('#association-create-packages-purpose')
            .fill('Requirement form association persistence test')
          await expect(child).toContainText('Kravpaketsansvarig')
        } else {
          await child.locator('#association-create-norms-id').fill(reference)
          await child.locator('#association-create-norms-type').fill('Standard')
          await child
            .locator('#association-create-norms-reference')
            .fill('Section 1')
          await child.locator('#association-create-norms-issuer').fill('PWT')
        }
        const endpoint =
          kind === 'packages' ? 'requirement-packages' : 'norm-references'
        const responsePromise = page.waitForResponse(
          r =>
            r.url().endsWith(`/api/${endpoint}`) &&
            r.request().method() === 'POST',
        )
        await child.getByRole('button', { name: 'Spara', exact: true }).click()
        const response = await responsePromise
        await expectApiResponseOk(response, `create ${kind}`)
        const created = await response.json()
        createdIds.push({ kind: endpoint, id: created.id })
        await expect(
          page
            .getByRole('dialog')
            .getByRole('status')
            .filter({ hasText: kind === 'packages' ? packageName : normName }),
        ).toHaveCount(1)
        await expect(search).toHaveValue('unmatched search')
        await search.fill('')
        const rowName =
          kind === 'packages' ? packageName : `${reference} ${normName}`
        const checkbox = page.getByRole('checkbox', {
          name: rowName,
          exact: true,
        })
        await expect(checkbox).toBeChecked()
        const selectedGroup = page.getByRole('rowgroup', {
          name: 'Redan valda',
        })
        await expect(
          selectedGroup.getByRole('checkbox', { name: rowName, exact: true }),
        ).toBeChecked()
        await checkbox.uncheck()
        await expect(
          selectedGroup.getByRole('checkbox', { name: rowName, exact: true }),
        ).not.toBeChecked()
        await checkbox.check()
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Avbryt', exact: true })
          .click()
        await page
          .getByRole('button', {
            name:
              kind === 'packages' ? 'Välj kravpaket' : 'Välj normreferenser',
          })
          .click()
        await expect(
          page.getByRole('checkbox', { name: rowName, exact: true }),
        ).not.toBeChecked()
        await page.getByRole('checkbox', { name: rowName, exact: true }).check()
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Välj', exact: true })
          .click()
      })
    }
    await test.step('save associations and edit with both destinations', async () => {
      const area = await request.get('/api/requirement-areas')
      const areas = await area.json()
      await page.locator('#areaId').selectOption(String(areas.areas[0].id))
      await page.locator('#description').fill(`PWT-1349 requirement ${suffix}`)
      await page
        .getByRole('button', { name: 'Detaljsida', exact: true })
        .click()
      const savedPromise = page.waitForResponse(
        r =>
          r.url().endsWith('/api/requirements') &&
          r.request().method() === 'POST',
      )
      await page.getByRole('button', { name: 'Spara', exact: true }).click()
      const response = await savedPromise
      await expectApiResponseOk(response, 'save requirement with associations')
      const saved = await response.json()
      createdRequirementId = saved.requirement.uniqueId
      await expect(page).toHaveURL(
        new RegExp(`/requirements/${saved.requirement.uniqueId}`),
      )
      await page.goto(`/sv/requirements/${saved.requirement.uniqueId}/edit`)
      await expect(
        page
          .locator(marker('association selection'))
          .filter({ hasText: 'Kravpaket' }),
      ).toContainText(packageName)
      await expect(
        page
          .locator(marker('association selection'))
          .filter({ hasText: 'Normreferenser' }),
      ).toContainText(reference)
      await expect(
        page.getByRole('button', { name: 'Detaljsida', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true')
      await page.locator('#description').fill(`PWT-1349 edited ${suffix}`)
      await page.getByRole('button', { name: 'Listvy', exact: true }).click()
      await page.getByRole('button', { name: 'Spara', exact: true }).click()
      await expect(page).toHaveURL(/\/sv\/requirements(?:\?|$)/)
    })
  } finally {
    if (createdRequirementId) {
      const deleted = await request.post(
        `/api/requirements/${createdRequirementId}/delete-draft`,
      )
      await expectApiResponseOk(deleted, 'delete isolated test draft')
    }
    for (const item of createdIds.reverse()) {
      const response = await request.delete(`/api/${item.kind}/${item.id}`)
      await expectApiResponseOk(response, 'delete isolated association')
    }
  }
})

for (const width of [320, 1440, 1920]) {
  test(`LIFE-01C: form and selector geometry at ${width}px with both themes and navigation states`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 900 })
    await page.goto('/sv/requirements/new')
    for (const dark of [false, true]) {
      for (const expanded of width === 320 ? [false] : [false, true]) {
        await test.step(`${dark ? 'dark' : 'light'}, ${expanded ? 'expanded' : 'collapsed'}`, async () => {
          await page.evaluate(
            ({ dark, expanded }) => {
              localStorage.setItem('theme', dark ? 'dark' : 'light')
              localStorage.setItem(
                'requirements.navigationRail.expanded.v1',
                expanded ? 'expanded' : 'collapsed',
              )
            },
            { dark, expanded },
          )
          await page.reload()
          const choose = page.getByRole('button', {
            name: 'Välj normreferenser',
          })
          await expect(choose).toBeEnabled()
          await expect(page.locator('form')).toHaveCSS('opacity', '1')
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true)
          const text = await page.locator('#description').boundingBox()
          expect(text?.height).toBeGreaterThanOrEqual(100)
          if (width >= 1440) {
            const category = await page.locator('#categoryId').boundingBox()
            expect(category?.x).toBeGreaterThan(
              (text?.x ?? 0) + (text?.width ?? 0),
            )
            const save = await page
              .getByRole('button', { name: 'Spara', exact: true })
              .boundingBox()
            const destination = await page
              .getByRole('button', { name: 'Listvy', exact: true })
              .boundingBox()
            expect(
              Math.abs((save?.y ?? 0) - (destination?.y ?? 0)),
            ).toBeLessThan(5)
          }
          await page.screenshot({
            path: `test-results/1349-${width}-${dark}-${expanded}.png`,
            fullPage: true,
          })
          await choose.click()
          const dialog = page.getByRole('dialog')
          await expect(dialog.getByRole('table')).toHaveAttribute(
            'data-developer-mode-name',
            'association table',
          )
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true)
          const search = dialog.getByRole('searchbox')
          await expect(search).toBeFocused()
          const last = dialog.getByRole('button', { name: 'Välj', exact: true })
          await last.focus()
          await page.keyboard.press('Tab')
          await expect(
            dialog.getByRole('button', { name: 'Stäng', exact: true }),
          ).toBeFocused()
          await dialog.press('Escape')
          await expect(choose).toBeFocused()
          await choose.click()
          const row = page
            .getByRole('dialog')
            .getByRole('row')
            .filter({ has: page.getByRole('checkbox') })
            .first()
          const normName = (
            await row.getByRole('cell').nth(2).innerText()
          ).trim()
          const checkbox = row.getByRole('checkbox')
          const label = await checkbox.getAttribute('aria-label')
          expect(label).toBeTruthy()
          await checkbox.check()
          await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Välj', exact: true })
            .click()
          const badge = page.getByRole('button', {
            name: label ?? '',
            exact: true,
          })
          await expect(choose).toBeFocused()
          await page.keyboard.press('Tab')
          await expect(badge).toBeFocused()
          await expect(page.getByRole('tooltip')).toContainText(normName)
        })
      }
    }
  })
}
