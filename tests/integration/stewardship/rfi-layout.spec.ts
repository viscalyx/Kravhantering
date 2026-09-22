import { expect, test } from '@playwright/test'
import { expectActiveQuestionBadge } from '../../helpers/question-status'

const area = {
  id: 920001,
  name: 'PWT-MANUAL Säkerhet',
  permissions: { canAuthor: true, canManageAssignments: false },
  prefix: 'PWM',
}
const questions = Array.from({ length: 32 }, (_, index) => ({
  archivedAt: index === 31 ? '2026-09-01T00:00:00Z' : null,
  areaId: area.id,
  areaName: area.name,
  areaPrefix: area.prefix,
  expectedAnswerFormat: 'Fritext med exempel.',
  helpText: 'Beskriv hur informationen skyddas.',
  id: 920001 + index,
  isArchived: index === 31,
  questionCode: `PWM-RFI${String(index + 1).padStart(3, '0')}`,
  questionText: 'Hur skyddar ni informationen i tjänsten?',
  sortOrder: index,
  versionNumber: index === 31 ? 12 : 1,
}))

for (const [width, height] of [
  [1440, 900],
  [1920, 1080],
]) {
  for (const theme of ['light', 'dark']) {
    for (const navigation of ['collapsed', 'expanded']) {
      test(`SPEC-16d: RFI summaries at ${width}, ${theme}, navigation ${navigation}`, async ({
        page,
      }) => {
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
        await page.route('**/api/requirement-areas', route =>
          route.fulfill({ json: { areas: [area] } }),
        )
        await page.route('**/api/rfi-questions?includeArchived=true', route =>
          route.fulfill({ json: { questions } }),
        )
        await page.route('**/api/rfi-question-suggestions', route =>
          route.fulfill({ json: { suggestions: [] } }),
        )
        await page.goto('/sv/requirements/stewardship?tab=information-requests')
        const list = page.locator(
          '[data-developer-mode-name="requirement area question list"]',
        )
        const rows = list.locator(':scope > li')
        const first = rows.first()
        const disclosure = first.getByRole('button', { expanded: false })
        await test.step('read question facts and the original green active badge', async () => {
          await expect(rows).toHaveCount(32)
          await expect(first).toContainText('PWM-RFI001')
          await expect(first).toContainText('v1')
          await expectActiveQuestionBadge(
            first.locator('[data-developer-mode-name="question status"]'),
            theme,
          )
          await expect(rows.last().getByRole('status')).toHaveText('Arkiverad')
          await expect(
            rows
              .last()
              .locator(
                '[data-developer-mode-name="question status"] svg.lucide-archive',
              ),
          ).toHaveCount(1)
          await expect(rows.last()).toContainText('v12')
        })
        await test.step('measure shared rows, separate metadata and four full-width filters', async () => {
          const text = first.locator(
            '[data-developer-mode-name="question text"]',
          )
          const metadata = first.locator(
            '[data-developer-mode-name="question metadata"]',
          )
          await expect
            .poll(async () => {
              const [a, b, row, next] = await Promise.all([
                text.boundingBox(),
                metadata.boundingBox(),
                first.boundingBox(),
                rows.nth(1).boundingBox(),
              ])
              return (
                !!a &&
                !!b &&
                !!row &&
                !!next &&
                a.x + a.width <= b.x &&
                row.height < 90 &&
                Math.abs(row.y + row.height - next.y) <= 1
              )
            })
            .toBe(true)
          const filters = page.locator(
            '[data-developer-mode-name="question filters"]',
          )
          await expect(filters.getByRole('combobox')).toHaveCount(3)
          await expect
            .poll(() =>
              filters.evaluate(element => {
                const style = getComputedStyle(element)
                const last = element.lastElementChild?.getBoundingClientRect()
                const box = element.getBoundingClientRect()
                return (
                  !!last &&
                  style.gridTemplateColumns.split(' ').length === 4 &&
                  Math.abs(
                    box.right -
                      Number.parseFloat(style.paddingRight) -
                      Number.parseFloat(style.borderRightWidth) -
                      last.right,
                  ) < 1
                )
              }),
            )
            .toBe(true)
          for (const button of await first.getByRole('button').all()) {
            await expect
              .poll(async () => {
                const box = await button.boundingBox()
                return box ? Math.min(box.width, box.height) : 0
              })
              .toBeGreaterThanOrEqual(24)
          }
        })
        await test.step('use keyboard disclosure and edit without accidental expansion', async () => {
          await disclosure.focus()
          await expect(disclosure).toBeFocused()
          await expect(disclosure).toHaveCSS('box-shadow', /.+rgb|.+oklab/)
          await page.keyboard.press('Enter')
          await expect(
            first.getByRole('button', { expanded: true }),
          ).toHaveCount(1)
          await expect(first).toContainText(
            'Beskriv hur informationen skyddas.',
          )
          await page.keyboard.press('Enter')
          await first
            .getByRole('button', { name: 'Redigera RFI-fråga: PWM-RFI001' })
            .click()
          const dialog = page.getByRole('dialog', {
            name: 'Redigera RFI-fråga',
          })
          await expect(dialog).toHaveCount(1)
          await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
          await dialog
            .getByRole('button', { name: 'Stäng', exact: true })
            .click()
        })
        await test.step('filter by text and archived status', async () => {
          await page
            .getByRole('textbox', { name: 'Sök RFI-frågor' })
            .fill('PWM-RFI032')
          await expect(rows).toHaveCount(1)
          await expect(rows.first()).toContainText('v12')
          await page.getByRole('textbox', { name: 'Sök RFI-frågor' }).clear()
          await page
            .getByRole('combobox', { name: 'Alla statusar' })
            .selectOption('active')
          await expect(rows).toHaveCount(31)
          await page
            .getByRole('combobox', { name: 'Alla statusar' })
            .selectOption('archived')
          await expect(rows).toHaveCount(1)
          await expect(rows.first().getByRole('status')).toHaveText('Arkiverad')
        })
      })
    }
  }
}

test('SPEC-16d: long RFI text wraps and metadata stacks on narrow screens', async ({
  page,
}) => {
  const longText =
    'Hur skyddas informationen när organisationer samverkar? '.repeat(10) +
    'Referens'.repeat(30)
  await page.route('**/api/requirement-areas', route =>
    route.fulfill({ json: { areas: [area] } }),
  )
  await page.route('**/api/rfi-questions?includeArchived=true', route =>
    route.fulfill({
      json: { questions: [{ ...questions[0], questionText: longText }] },
    }),
  )
  await page.route('**/api/rfi-question-suggestions', route =>
    route.fulfill({ json: { suggestions: [] } }),
  )
  for (const width of [1440, 768, 320]) {
    await test.step(`read and expand the full question at ${width}px`, async () => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/sv/requirements/stewardship?tab=information-requests')
      const text = page.locator('[data-developer-mode-name="question text"]')
      const metadata = page.locator(
        '[data-developer-mode-name="question metadata"]',
      )
      await expect(text).toHaveText(longText)
      await expect
        .poll(() =>
          text.evaluate(
            element =>
              element.scrollHeight <= element.clientHeight &&
              element.scrollWidth <= element.clientWidth,
          ),
        )
        .toBe(true)
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true)
      if (width < 1100) {
        await expect
          .poll(async () => {
            const [a, b] = await Promise.all([
              text.boundingBox(),
              metadata.boundingBox(),
            ])
            return !!a && !!b && a.y + a.height <= b.y
          })
          .toBe(true)
      }
      const disclosure = page.getByRole('button', {
        expanded: false,
        name: /PWM-RFI001/,
      })
      await disclosure.click()
      await expect(
        page.getByText('Beskriv hur informationen skyddas.'),
      ).toHaveCount(1)
    })
  }
})

test('SPEC-16d: keeps the RFI status live region mounted through archive and reactivation', async ({
  page,
}) => {
  let question = { ...questions[0] }
  await page.route('**/api/requirement-areas', route =>
    route.fulfill({ json: { areas: [area] } }),
  )
  await page.route('**/api/rfi-questions?includeArchived=true', route =>
    route.fulfill({ json: { questions: [question] } }),
  )
  await page.route('**/api/rfi-question-suggestions', route =>
    route.fulfill({ json: { suggestions: [] } }),
  )
  await page.route(`**/api/rfi-questions/${question.id}`, async route => {
    question = { ...question, isArchived: true }
    await route.fulfill({ json: { id: question.id } })
  })
  await page.route(
    `**/api/rfi-questions/${question.id}/reactivate`,
    async route => {
      question = { ...question, isArchived: false }
      await route.fulfill({ json: { id: question.id } })
    },
  )
  await page.goto('/sv/requirements/stewardship?tab=information-requests')
  const row = page
    .getByRole('listitem')
    .filter({ hasText: question.questionCode })
  const announcement = row.getByRole('status')
  await expect(announcement).toHaveText('Aktiv')
  await expect(announcement).toHaveAttribute('aria-live', 'polite')
  await expect(announcement).toHaveAttribute(
    'data-developer-mode-name',
    'question status announcement',
  )
  await expect(row.locator('button [role="status"]')).toHaveCount(0)
  const original = await announcement.elementHandle()
  if (!original) throw new Error('Missing RFI status live region')
  for (const [action, status] of [
    ['Arkivera', 'Arkiverad'],
    ['Återaktivera', 'Aktiv'],
  ]) {
    await test.step(`update the existing announcement to ${status}`, async () => {
      await row
        .getByRole('button', { name: `${action}: ${question.questionCode}` })
        .click()
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
      await expect(row.getByRole('button', { expanded: false })).toHaveCount(1)
    })
  }
})
