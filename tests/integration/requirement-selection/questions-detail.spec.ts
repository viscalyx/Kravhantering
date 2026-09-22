import { expect, test } from '@playwright/test'
import { DESKTOP_VIEWPORT } from '../../helpers/desktop-viewport'
import { expectActiveQuestionBadge } from '../../helpers/question-status'

test.describe('Requirement selection question detail preview', () => {
  test.use({ viewport: DESKTOP_VIEWPORT })

  test('REQ-14c: opens a read-only requirement detail from the answer modal', async ({
    page,
  }) => {
    await test.step('open a seeded requirement-selection answer for editing', async () => {
      await page.goto('/sv/requirements/stewardship?tab=questions')

      await expect(
        page.getByRole('heading', { level: 1, name: 'Kravurvalsfrågor' }),
      ).toBeVisible()
      await page.getByRole('button', { name: /SÄK-KUF001/ }).click()

      const answerRow = page
        .getByText('Grundskydd för intern information', { exact: true })
        .locator('xpath=ancestor::li[1]')
      await expect(answerRow).toContainText('Grundskydd för intern information')
      await answerRow.getByRole('button', { name: 'Redigera' }).click()

      await expect(
        page.getByRole('dialog', { name: 'Redigera kravurvalsvar' }),
      ).toBeVisible()
    })

    const dialog = page.getByRole('dialog', {
      name: 'Redigera kravurvalsvar',
    })
    const requirementId = 'SÄK0042'

    await test.step('expand a requirement in the selection preview', async () => {
      const requirementButton = dialog.getByRole('button', {
        name: `Öppna kravdetaljer ${requirementId}`,
      })

      await expect(requirementButton).toHaveAttribute('aria-expanded', 'false')
      await requirementButton.click()
      await expect(requirementButton).toHaveAttribute('aria-expanded', 'true')
    })

    await test.step('read area information without closing the answer editor', async () => {
      const info = dialog.getByRole('button', { name: /^Information om /u })
      await info.focus()
      await page.keyboard.press('Enter')
      const panel = page.getByRole('region', { name: /^Information om /u })
      await expect(panel).toContainText('Kravområdesägare')
      await page.keyboard.press('Tab')
      await expect(panel).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(info).toBeFocused()
      await expect(dialog).toHaveCount(1)
    })

    await test.step('verify the read-only requirement detail', async () => {
      const expandedRequirement = dialog
        .getByRole('button', {
          name: `Öppna kravdetaljer ${requirementId}`,
        })
        .locator('xpath=ancestor::li[1]')

      await expect(
        expandedRequirement.getByRole('heading', { name: 'Kravtext' }),
      ).toHaveCount(1)

      await expect(
        expandedRequirement.getByRole('heading', { name: 'Kravtext' }),
      ).toBeVisible()
      await expect(expandedRequirement).toContainText(
        'Skyddade routes ska returnera 302',
      )
      await expect(
        expandedRequirement.getByRole('heading', { name: requirementId }),
      ).toHaveCount(0)
      await expect(
        dialog.getByRole('button', { name: 'Arkivera' }),
      ).toHaveCount(0)
    })
  })

  test('REQ-14d: keeps answer-editor removal controls at least 24 CSS pixels', async ({
    page,
  }) => {
    for (const viewport of [
      { ...DESKTOP_VIEWPORT, name: 'desktop' },
      { height: 812, name: 'mobile', width: 375 },
    ]) {
      await test.step(`open the seeded answer at ${viewport.name} size`, async () => {
        await page.setViewportSize(viewport)
        await page.goto('/sv/requirements/stewardship?tab=questions')

        await expect(
          page.getByRole('heading', { level: 1, name: 'Kravurvalsfrågor' }),
        ).toBeVisible()
        await page.getByRole('button', { name: /SÄK-KUF001/ }).click()

        const answerRow = page
          .getByText('Grundskydd för intern information', { exact: true })
          .locator('xpath=ancestor::li[1]')
        await answerRow.getByRole('button', { name: 'Redigera' }).click()
      })

      await test.step(`measure both removal targets at ${viewport.name} size`, async () => {
        const dialog = page.getByRole('dialog', {
          name: 'Redigera kravurvalsvar',
        })
        const removalControls = [
          dialog.getByRole('button', { name: /^Ta bort paket / }),
          dialog.getByRole('button', { name: 'Ta bort krav SÄK0042' }),
        ]

        for (const control of removalControls) {
          const pill = control.locator('xpath=parent::span')
          const neighboringLabel = control.locator(
            'xpath=preceding-sibling::span[1]',
          )

          await control.scrollIntoViewIfNeeded()
          await expect
            .poll(async () => (await control.boundingBox())?.height ?? 0)
            .toBeGreaterThanOrEqual(24)
          await expect
            .poll(async () => (await control.boundingBox())?.width ?? 0)
            .toBeGreaterThanOrEqual(24)
          await expect
            .poll(async () => {
              const [controlBounds, pillBounds, neighboringLabelBounds] =
                await Promise.all([
                  control.boundingBox(),
                  pill.boundingBox(),
                  neighboringLabel.boundingBox(),
                ])

              if (!controlBounds || !pillBounds || !neighboringLabelBounds) {
                return false
              }

              const controlIsInsidePill =
                controlBounds.x >= pillBounds.x &&
                controlBounds.y >= pillBounds.y &&
                controlBounds.x + controlBounds.width <=
                  pillBounds.x + pillBounds.width &&
                controlBounds.y + controlBounds.height <=
                  pillBounds.y + pillBounds.height
              const overlapsNeighboringLabel =
                controlBounds.x <
                  neighboringLabelBounds.x + neighboringLabelBounds.width &&
                controlBounds.x + controlBounds.width >
                  neighboringLabelBounds.x &&
                controlBounds.y <
                  neighboringLabelBounds.y + neighboringLabelBounds.height &&
                controlBounds.y + controlBounds.height >
                  neighboringLabelBounds.y

              return controlIsInsidePill && !overlapsNeighboringLabel
            })
            .toBe(true)
        }
      })
    }
  })
})

test.describe('Compact requirement selection question summaries', () => {
  for (const [width, height] of [
    [1440, 900],
    [1920, 1080],
  ]) {
    for (const theme of ['light', 'dark']) {
      for (const navigation of ['collapsed', 'expanded']) {
        test(`REQ-14e: readable split summaries at ${width}, ${theme}, navigation ${navigation}`, async ({
          page,
        }) => {
          await test.step('open the selected theme and navigation layout', async () => {
            await page.setViewportSize({ width, height })
            await page.addInitScript(
              ({ theme, navigation }) => {
                localStorage.setItem('theme', theme)
                localStorage.setItem(
                  'requirements.navigationRail.expanded.v1',
                  navigation,
                )
              },
              { theme, navigation },
            )
            await page.goto('/sv/requirements/stewardship?tab=questions')
          })
          const rows = page.locator('[data-question-id]')
          const row = rows.filter({ hasText: 'DRF-KUF001' }).first()
          const text = row.locator('[data-developer-mode-name="question text"]')
          const facts = row.locator(
            '[data-developer-mode-name="question metadata"]',
          )
          await test.step('read compact facts and measure rows and controls', async () => {
            await expect(facts).toContainText('KUF')
            await expectActiveQuestionBadge(
              row.locator('[data-developer-mode-name="question status"]'),
              theme,
            )
            await expect
              .poll(async () => {
                const [textBox, factsBox, rowBox] = await Promise.all([
                  text.boundingBox(),
                  facts.boundingBox(),
                  row.boundingBox(),
                ])
                return (
                  !!textBox &&
                  !!factsBox &&
                  !!rowBox &&
                  textBox.x + textBox.width <= factsBox.x &&
                  rowBox.height < 90
                )
              })
              .toBe(true)
            const list = row.locator('..')
            await expect(list).toHaveAttribute(
              'data-developer-mode-name',
              'requirement area question list',
            )
            const nextRow = list.locator(':scope > li').nth(1)
            await expect
              .poll(async () => {
                const [first, next] = await Promise.all([
                  row.boundingBox(),
                  nextRow.boundingBox(),
                ])
                return first && next
                  ? Math.abs(first.y + first.height - next.y)
                  : Infinity
              })
              .toBeLessThanOrEqual(1)
            for (const control of await row.getByRole('button').all()) {
              await expect
                .poll(async () => {
                  const box = await control.boundingBox()
                  return box ? Math.min(box.width, box.height) : 0
                })
                .toBeGreaterThanOrEqual(24)
            }
          })
          await test.step('expand and collapse with the keyboard', async () => {
            const disclosure = row.locator(
              '[data-developer-mode-name="question disclosure"]',
            )
            await disclosure.focus()
            await expect(disclosure).toBeFocused()
            await page.keyboard.press('Enter')
            await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
            await page.keyboard.press('Enter')
            await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
          })
        })
      }
    }
  }

  for (const theme of ['light', 'dark']) {
    test(`REQ-14e: wraps long question text and keeps hierarchy independent on narrow screens and in the drag preview in ${theme}`, async ({
      page,
    }) => {
      await page.addInitScript(
        theme => localStorage.setItem('theme', theme),
        theme,
      )
      const longText =
        'Vilka förutsättningar gäller för informationshantering och tillgänglighet? '.repeat(
          9,
        )
      await page.route(
        '**/api/requirement-selection-questions?includeArchived=true',
        async route => {
          const response = await route.fetch()
          const body = await response.json()
          body.questions.find(
            (question: { questionCode: string }) =>
              question.questionCode === 'DRF-KUF001',
          ).text = longText
          await route.fulfill({ response, json: body })
        },
      )
      for (const width of [1440, 768, 320]) {
        await test.step(`read the long question at ${width}px`, async () => {
          await page.setViewportSize({ width, height: 900 })
          await page.goto('/sv/requirements/stewardship?tab=questions')
          const row = page
            .locator('[data-question-id]')
            .filter({ hasText: 'DRF-KUF001' })
            .first()
          const text = row.locator('[data-developer-mode-name="question text"]')
          const facts = row.locator(
            '[data-developer-mode-name="question metadata"]',
          )
          await expect(text).toHaveText(longText)
          await expect
            .poll(() =>
              row.evaluate(
                element => element.scrollWidth <= element.clientWidth,
              ),
            )
            .toBe(true)
          await expect
            .poll(() =>
              text.evaluate(
                element => element.scrollHeight <= element.clientHeight,
              ),
            )
            .toBe(true)
          if (width <= 768) {
            await expect
              .poll(async () => {
                const [textBox, factsBox] = await Promise.all([
                  text.boundingBox(),
                  facts.boundingBox(),
                ])
                return (
                  !!textBox &&
                  !!factsBox &&
                  textBox.y + textBox.height <= factsBox.y
                )
              })
              .toBe(true)
          }
          await test.step('open and close hierarchy without expanding details', async () => {
            const hierarchy = row.getByRole('button', {
              name: /^Visa kravurvalsfrågehierarki/,
            })
            // Seeded DRF-KUF001 has dependent questions.
            await expect(hierarchy).toHaveCount(1)
            await hierarchy.focus()
            await page.keyboard.press('Enter')
            const dialog = page.getByRole('dialog')
            await expect(dialog).toContainText('DRF-KUF001')
            await dialog
              .getByRole('button', { name: 'Stäng', exact: true })
              .focus()
            await page.keyboard.press('Escape')
            await expect(dialog).toHaveCount(0)
            await expect(
              row.getByRole('button', { name: /^Visa detaljer/ }),
            ).toHaveAttribute('aria-expanded', 'false')
          })
          if (width === 1440) {
            await test.step('read the full text in the matching drag preview', async () => {
              const handle = row.getByRole('button', {
                name: 'Ändra frågeordning',
              })
              const box = await handle.boundingBox()
              if (!box) throw new Error('Missing question reorder handle')
              await page.mouse.move(box.x + box.width / 2, box.y + 20)
              await page.mouse.down()
              await page.mouse.move(box.x + box.width / 2 + 15, box.y + 20, {
                steps: 3,
              })
              const preview = page.locator('[data-question-drag-preview]')
              await expect(preview).toContainText(longText)
              const theme = await page
                .locator('html')
                .evaluate(element =>
                  element.classList.contains('dark') ? 'dark' : 'light',
                )
              await expectActiveQuestionBadge(
                preview.locator('[data-developer-mode-name="question status"]'),
                theme,
              )
              const previewText = preview.locator(
                '[data-developer-mode-name="question text"]',
              )
              await expect
                .poll(() =>
                  previewText.evaluate(
                    element => element.scrollHeight <= element.clientHeight,
                  ),
                )
                .toBe(true)
              await expect
                .poll(async () => {
                  const [source, floating] = await Promise.all([
                    row.boundingBox(),
                    preview.boundingBox(),
                  ])
                  return source && floating
                    ? Math.abs(source.height - floating.height)
                    : Infinity
                })
                .toBeLessThanOrEqual(2)
              await page.mouse.up()
            })
          }
        })
      }
    })
  }
})

for (const theme of ['light', 'dark']) {
  test(`REQ-14e: inactive and archived question statuses remain distinct in ${theme}`, async ({
    page,
  }) => {
    await page.addInitScript(
      theme => localStorage.setItem('theme', theme),
      theme,
    )
    await page.route(
      '**/api/requirement-selection-questions?includeArchived=true',
      async route => {
        const response = await route.fetch()
        const body = await response.json()
        for (const [index, question] of body.questions.entries()) {
          question.isActive = index !== 1
          question.isArchived = index === 2
        }
        await route.fulfill({ response, json: body })
      },
    )
    await page.goto('/sv/requirements/stewardship?tab=questions')
    for (const [label, icon] of [
      ['Inaktiv', 'lucide-circle-pause'],
      ['Arkiverad', 'lucide-archive'],
    ]) {
      await test.step(`read the ${label} label and icon without active styling`, async () => {
        const badge = page
          .locator('[data-question-id]')
          .locator('[data-developer-mode-name="question status"]')
          .filter({ hasText: new RegExp(`^${label}$`) })
        await expect(badge).toHaveCount(1)
        await expect(badge.locator(`svg.${icon}`)).toHaveAttribute(
          'aria-hidden',
          'true',
        )
        await expect(badge).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      })
    }
  })
}

test('REQ-14e: keeps the question status live region mounted through lifecycle changes', async ({
  page,
}) => {
  const response = await page.request.get(
    '/api/requirement-selection-questions?includeArchived=true',
  )
  const body = await response.json()
  const question = body.questions.find(
    (item: { questionCode: string }) => item.questionCode === 'DRF-KUF001',
  )
  question.answers = []
  question.isActive = true
  question.isArchived = false
  await page.route(
    '**/api/requirement-selection-questions?includeArchived=true',
    route => route.fulfill({ json: { questions: [question] } }),
  )
  await page.route(
    `**/api/requirement-selection-questions/${question.id}/*`,
    async route => {
      const action = route.request().url().split('/').at(-1)
      question.isActive = action === 'activate' || action === 'reactivate'
      question.isArchived = action === 'archive'
      await route.fulfill({ json: question })
    },
  )
  await page.goto('/sv/requirements/stewardship?tab=questions')
  const row = page
    .locator('[data-question-id]')
    .filter({ hasText: 'DRF-KUF001' })
  const disclosure = row.getByRole('button', { expanded: false })
  const announcement = row.getByRole('status')
  await expect(announcement).toHaveText('Aktiv')
  await expect(announcement).toHaveAttribute('aria-live', 'polite')
  await expect(announcement).toHaveAttribute(
    'data-developer-mode-name',
    'question status announcement',
  )
  await expect(row.locator('button [role="status"]')).toHaveCount(0)
  const original = await announcement.elementHandle()
  if (!original) throw new Error('Missing question status live region')
  await disclosure.click()
  for (const [action, status] of [
    ['Inaktivera', 'Inaktiv'],
    ['Aktivera', 'Aktiv'],
    ['Arkivera', 'Arkiverad'],
    ['Återaktivera', 'Aktiv'],
  ]) {
    await test.step(`update the existing announcement to ${status}`, async () => {
      await row.getByRole('button', { name: action, exact: true }).click()
      if (action === 'Arkivera')
        await page
          .getByRole('alertdialog')
          .getByRole('button', { name: action, exact: true })
          .click()
      await expect(announcement).toHaveText(status)
      await expect
        .poll(() =>
          original.evaluate(
            (element, status) =>
              element.isConnected && element.textContent === status,
            status,
          ),
        )
        .toBe(true)
      await expect(
        row.locator('[data-developer-mode-name="question status"]'),
      ).toHaveText(status)
    })
  }
})
