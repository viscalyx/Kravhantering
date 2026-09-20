import { expect, test } from '@playwright/test'
import en from '@/messages/en.json'
import sv from '@/messages/sv.json'
import { requireTestValue } from '@/tests/helpers/require-test-value'
import { expectApiResponseOk } from '../api-response-assertions'

for (const locale of ['sv', 'en'] as const) {
  const t = (locale === 'sv' ? sv : en).specification
  const common = (locale === 'sv' ? sv : en).common
  const title =
    (locale === 'sv'
      ? 'Kravunderlag för samordnade digitala tjänster '
      : 'Requirements specification for coordinated digital services '
    )
      .repeat(4)
      .slice(0, 149) + '…'
  const description =
    (locale === 'sv'
      ? 'Beskrivningen förklarar verksamhetens behov och de resultat som ska följas upp. '
      : 'The description explains business needs and the outcomes that will be followed up. '
    )
      .repeat(5)
      .slice(0, 299) + '…'

  test(`SPEC-02/SPEC-03: validates title and description when creating and editing in ${locale}`, async ({
    page,
    request,
  }) => {
    let id: number | undefined
    try {
      await page.goto(`/${locale}/specifications`)
      await page
        .getByRole('button', { name: t.newSpecification, exact: true })
        .click()
      for (const mode of ['create', 'edit']) {
        const dialog = page.getByRole('dialog')
        const name = dialog.locator('#spec-name')
        const purpose = dialog.locator('#spec-business-ref')
        await name.fill(' ')
        await dialog
          .locator('#spec-specification-code')
          .fill(`LIMIT-${Date.now()}`)
        await dialog.locator('#spec-lifecycle-status').selectOption('1')
        await dialog
          .getByRole('button', { name: common.save, exact: true })
          .click()
        await expect(dialog.getByRole('alert')).toContainText(t.nameRequired)
        await name.fill(`${title}x`)
        await dialog
          .getByRole('button', { name: common.save, exact: true })
          .click()
        await expect(name).toHaveAttribute('aria-invalid', 'true')
        await expect(dialog.getByRole('alert')).toContainText(
          t.nameTooLong.replace('{max}', '150'),
        )
        await name.fill(`  ${title}  `)
        await purpose.fill(`${description}x`)
        await dialog
          .getByRole('button', { name: common.save, exact: true })
          .click()
        await expect(purpose).toHaveAttribute('aria-invalid', 'true')
        await expect(dialog.getByRole('alert')).toContainText(
          t.descriptionTooLong.replace('{max}', '300'),
        )
        await purpose.fill(`  ${description}  `)
        const saved = page.waitForResponse(
          response =>
            response.request().method() ===
              (mode === 'create' ? 'POST' : 'PUT') &&
            response.url().includes('/api/requirements-specifications'),
        )
        await dialog
          .getByRole('button', { name: common.save, exact: true })
          .click()
        const response = await saved
        await expectApiResponseOk(
          response,
          'save boundary-length specification',
        )
        const result = await response.json()
        id = result.id
        expect(result).toMatchObject({
          name: title,
          businessNeedsReference: description,
        })
        if (mode === 'create') {
          await page.goto(`/${locale}/specifications/${id}`)
          await page
            .getByRole('button', { name: t.editSpecification, exact: true })
            .click()
        }
      }
      const patch = await request.patch(
        `/api/requirements-specifications/${id}`,
        {
          data: {
            name: `  ${title}  `,
            businessNeedsReference: `  ${description}  `,
          },
        },
      )
      await expectApiResponseOk(patch, 'PATCH trimmed boundary values')
      expect(await patch.json()).toMatchObject({
        name: title,
        businessNeedsReference: description,
      })
      for (const data of [
        { name: `${title}x` },
        { businessNeedsReference: `${description}x` },
      ]) {
        const invalid = await request.patch(
          `/api/requirements-specifications/${id}`,
          { data },
        )
        expect(invalid.status()).toBe(400)
        expect(await invalid.json()).toMatchObject({
          error: 'Invalid request',
          issues: [expect.objectContaining({ path: Object.keys(data)[0] })],
        })
      }
    } finally {
      if (id)
        await expectApiResponseOk(
          await request.delete(`/api/requirements-specifications/${id}`),
          'delete text-limit fixture',
        )
    }
  })

  for (const width of [320, 1440, 1920]) {
    for (const expandedNavigation of width === 320 ? [false] : [false, true]) {
      for (const theme of ['light', 'dark']) {
        test(`SPEC-03/SPEC-05: maximum header text ${locale}, ${width}, navigation ${expandedNavigation}, ${theme}`, async ({
          page,
          request,
        }, testInfo) => {
          const response = await request.post(
            '/api/requirements-specifications',
            {
              data: {
                name: title,
                businessNeedsReference: description,
                specificationCode: `HEADER-${Date.now()}`,
                specificationLifecycleStatusId: 1,
              },
            },
          )
          await expectApiResponseOk(response, 'create maximum header fixture')
          const { id } = (await response.json()) as { id: number }
          try {
            await page.emulateMedia({ reducedMotion: 'reduce' })
            await page.setViewportSize({
              width,
              height: width === 1920 ? 1080 : 900,
            })
            await page.addInitScript(
              theme => localStorage.setItem('theme', theme),
              theme,
            )
            await page.goto(`/${locale}/specifications/${id}`)
            if (expandedNavigation)
              await page
                .locator(
                  '[data-developer-mode-context="navigation"][data-developer-mode-value="expand rail"]',
                )
                .click()
            const toggle = page.getByRole('button', {
              name: t.expandHeader,
              exact: true,
            })
            await expect(toggle).toHaveAttribute('aria-expanded', 'false')
            const metadata = page.locator(
              '[data-specification-detail-header-metadata]',
            )
            await expect(metadata).toContainText(t.lifecycleStatusShort)
            await expect(metadata.getByRole('button')).toHaveCount(0)
            const heading = page.getByRole('heading', { level: 1, name: title })
            const bounds = requireTestValue(await heading.boundingBox())
            const summary = requireTestValue(await metadata.boundingBox())
            if (width === 320)
              expect(summary.y).toBeGreaterThan(bounds.y + bounds.height)
            else {
              expect(summary.y).toBe(bounds.y - 16)
              expect(summary.width).toBeLessThan(400)
            }
            await page.screenshot({
              path: testInfo.outputPath('collapsed.png'),
              fullPage: true,
            })
            await toggle.focus()
            await toggle.press('Enter')
            await expect(
              page.getByRole('button', { name: t.collapseHeader, exact: true }),
            ).toBeFocused()
            await expect(
              page.getByText(description, { exact: true }),
            ).toHaveCount(1)
            await expect(metadata).toContainText(t.lifecycleStatus)
            await expect(
              page.getByRole('button', {
                name: t.editSpecification,
                exact: true,
              }),
            ).toBeEnabled()
            expect(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
            ).toBe(true)
            await page.screenshot({
              path: testInfo.outputPath('expanded.png'),
              fullPage: true,
            })
            await page
              .getByRole('button', { name: t.collapseHeader, exact: true })
              .click()
            await expect(
              page.getByText(description, { exact: true }),
            ).toHaveCount(0)
          } finally {
            await expectApiResponseOk(
              await request.delete(`/api/requirements-specifications/${id}`),
              'delete maximum header fixture',
            )
          }
        })
      }
    }
  }
}
