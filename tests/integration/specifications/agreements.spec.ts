import { readFile } from 'node:fs/promises'
import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test'
import type { SpecificationAgreementView } from '@/components/SpecificationAgreementBox'
import { DESKTOP_VIEWPORT } from '@/tests/helpers/desktop-viewport'
import { requireTestValue } from '@/tests/helpers/require-test-value'
import {
  expectOk,
  newRoleContext,
  ROLE_STORAGE_STATE,
  withPlaywrightSqlServerDataSource,
} from '../authorization/authorization-test-helpers'

test.use({ storageState: ROLE_STORAGE_STATE.specificationResponsible })

const today = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(
    new Date(),
  )
const futureDate = () => `${new Date().getUTCFullYear() + 2}-01-01`
const card = (page: Page) =>
  page.locator('[data-developer-mode-value="agreement selector"]')

async function expectFullWidthAgreementStatus(page: Page) {
  const status = card(page).locator(
    '[data-developer-mode-value="agreement effective date and state"]',
  )
  await expect(status).toBeVisible()
  await expect
    .poll(async () =>
      status.evaluate(element => {
        const content = element.closest('dd')
        const text = element.querySelector('span')
        if (!content || !text) return false
        const available = content.getBoundingClientRect()
        const row = element.getBoundingClientRect()
        const label = text.getBoundingClientRect()
        return (
          Math.abs(row.width - available.width) < 1 &&
          Math.abs(label.right - available.right) < 1 &&
          element.scrollWidth <= element.clientWidth
        )
      }),
    )
    .toBe(true)
}

async function expectAgreementDetailsFooter(dialog: Locator) {
  const footer = dialog.locator(
    '[data-developer-mode-value="agreement details actions"]',
  )
  await expect(footer).toBeVisible()
  await expect(footer.getByRole('button').last()).toHaveText('Close')
  await expect
    .poll(() =>
      footer.evaluate(element => {
        const buttons = Array.from(element.querySelectorAll('button'))
        const last = buttons.at(-1)
        const details = element.parentElement?.querySelector('details')
        if (!last || !details) return false
        const bounds = element.getBoundingClientRect()
        const lastBounds = last.getBoundingClientRect()
        const spaced = buttons.every((button, index) => {
          if (!index) return true
          const previous = buttons[index - 1].getBoundingClientRect()
          const current = button.getBoundingClientRect()
          return (
            Math.round(current.left - previous.right) >= 12 ||
            Math.round(current.top - previous.bottom) >= 12
          )
        })
        return (
          Math.abs(lastBounds.right - bounds.right) < 1 &&
          details.getBoundingClientRect().bottom <= bounds.top &&
          element.scrollWidth <= element.clientWidth &&
          spaced
        )
      }),
    )
    .toBe(true)
}

async function fixture(owner: APIRequestContext) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const created = await owner.post('/api/requirements-specifications', {
    data: {
      name: `Agreement workflow ${suffix}`,
      specificationCode: `AG-${suffix.toUpperCase()}`,
      specificationLifecycleStatusId: 4,
    },
  })
  await expectOk(created, 'create agreement specification')
  const specification = (await created.json()) as { id: number }
  const response = await owner.post(
    `/api/requirements-specifications/${specification.id}/local-requirements`,
    {
      data: {
        description: 'Original agreed service',
        acceptanceCriteria: 'Original service criterion',
        verifiable: false,
      },
    },
  )
  await expectOk(response, 'create original local content')
  const { localRequirement } = (await response.json()) as {
    localRequirement: { id: number; uniqueId: string }
  }
  return {
    id: specification.id,
    local: localRequirement,
    endpoint: `/api/requirements-specifications/${specification.id}/agreement`,
  }
}

async function register(page: Page, reference: string, date: string) {
  await page
    .getByRole('button', { name: 'Register agreement', exact: true })
    .click()
  const dialog = page.getByRole('dialog', {
    name: 'Register agreement',
    exact: true,
  })
  await dialog.getByLabel(/^Agreement reference/).fill(reference)
  await dialog.getByLabel(/^Agreement effective date/).fill(date)
  await dialog
    .getByRole('button', { name: 'Confirm agreement', exact: true })
    .click()
  await expect(dialog).toBeHidden()
  await expect(card(page)).toContainText(reference)
}

async function draft(page: Page, reference: string, date: string) {
  await page.getByRole('button', { name: 'New agreement', exact: true }).click()
  const dialog = page.getByRole('dialog', {
    name: 'New agreement',
    exact: true,
  })
  await dialog.getByLabel(/^Agreement reference/).fill(reference)
  await dialog.getByLabel(/^Agreement effective date/).fill(date)
  await dialog
    .getByRole('button', { name: 'Create draft', exact: true })
    .click()
  await expect(dialog).toBeHidden()
  await expect(card(page)).toContainText(reference)
  await expect(card(page)).toContainText('Draft')
}

async function select(page: Page, reference: string, historical = false) {
  await page
    .getByRole('button', { name: 'Select agreement', exact: true })
    .click()
  const selector = page.getByRole('dialog', {
    name: 'Select agreement',
    exact: true,
  })
  if (historical) {
    const details = selector.locator('details')
    if (!(await details.getAttribute('open')))
      await selector.getByText('Previous agreements', { exact: true }).click()
  }
  await selector
    .getByRole('button', { name: new RegExp(`^${reference} ·`) })
    .click()
  await expect(selector).toBeHidden()
  await expect(card(page)).toContainText(reference)
}

async function expand(page: Page, uniqueId: string) {
  const button = page
    .locator('[data-specification-detail-list-panel="items"]')
    .getByRole('button', { name: new RegExp(`^${uniqueId}\\b`) })
  if ((await button.getAttribute('aria-expanded')) !== 'true')
    await button.click()
  await expect(button).toHaveAttribute('aria-expanded', 'true')
}

async function confirmDraft(page: Page) {
  await page
    .getByRole('button', { name: 'Agreement details', exact: true })
    .click()
  const dialog = page.getByRole('dialog', {
    name: 'Agreement details',
    exact: true,
  })
  await expectAgreementDetailsFooter(dialog)
  await dialog
    .getByRole('button', { name: 'Confirm agreement', exact: true })
    .click()
  await expect(dialog).toBeHidden()
}

test('SPEC-23/SPEC-26: show compact future and cancelled changes while viewing an earlier agreement', async ({
  page,
}, testInfo) => {
  const owner = await newRoleContext(testInfo, 'specificationResponsible')
  try {
    const data = await fixture(owner)
    const mutate = async (input: Record<string, unknown>) =>
      expectOk(
        await owner.post(data.endpoint, { data: input }),
        'prepare agreement history',
      )
    const read = async (id?: number) => {
      const response = await owner.get(
        `${data.endpoint}${id ? `?agreementId=${id}` : ''}`,
      )
      await expectOk(response, 'read agreement fixture')
      return response.json() as Promise<{
        agreements: Array<{
          id: number
          state: string
          agreementReference: string
        }>
        items: Array<{ itemRef: string }>
      }>
    }
    const draftId = async () =>
      requireTestValue(
        (await read()).agreements.find(value => value.state === 'draft'),
      ).id
    await mutate({
      operation: 'establish',
      agreementReference: 'Avtal A',
      effectiveDate: '2020-01-01',
    })
    await mutate({
      operation: 'create_draft',
      agreementReference: 'Avtal B',
      effectiveDate: today(),
    })
    const b = await draftId()
    await mutate({
      operation: 'save_requirement',
      agreementId: b,
      itemRef: `local:${data.local.id}`,
      content: { description: 'Changed for agreement B' },
    })
    await mutate({ operation: 'confirm', agreementId: b })
    const itemsResponse = await owner.get(
      `/api/requirements-specifications/${data.id}/items?agreementId=${b}`,
    )
    await expectOk(itemsResponse, 'read B requirement')
    const bItem = requireTestValue(
      ((await itemsResponse.json()) as { items: Array<{ itemRef: string }> })
        .items[0],
    )
    await mutate({
      operation: 'create_draft',
      agreementReference: 'Avtal C',
      effectiveDate: futureDate(),
    })
    const c = await draftId()
    await mutate({
      operation: 'save_requirement',
      agreementId: c,
      itemRef: bItem.itemRef,
      content: { description: 'Cancelled content C' },
    })
    await mutate({ operation: 'confirm', agreementId: c })
    await mutate({
      operation: 'cancel',
      agreementId: c,
      reason: 'Use another agreement',
    })
    await mutate({
      operation: 'create_draft',
      agreementReference: 'Avtal D',
      effectiveDate: `${new Date().getUTCFullYear() + 3}-01-01`,
    })
    const d = await draftId()
    await mutate({
      operation: 'save_requirement',
      agreementId: d,
      itemRef: bItem.itemRef,
      content: { description: 'Draft content D' },
    })
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await page.goto(`/sv/specifications/${data.id}`)
    await expect(card(page)).toContainText('Avtal B')
    await expand(page, data.local.uniqueId)
    const disclosure = page.locator('details').filter({
      has: page.locator('summary').filter({ hasText: /^Historik$/ }),
    })
    await disclosure
      .locator('summary')
      .filter({ hasText: /^Historik$/ })
      .click()
    await expect(
      disclosure.getByText('Visar avtal: Avtal B', { exact: true }),
    ).toBeVisible()
    const entries = disclosure.getByRole('listitem')
    await expect(entries).toHaveCount(3)
    await expect(entries.nth(0)).toContainText('Avtal D')
    await expect(entries.nth(0)).toContainText('Jämfört med Avtal B')
    await expect(entries.nth(1)).toContainText(
      'Avbrutet — trädde aldrig i kraft',
    )
    await expect(entries.nth(2)).toContainText('Visar avtal')
    await expect(disclosure.getByRole('button')).toHaveCount(0)
    await expect(
      disclosure.getByText('Changed for agreement B', { exact: true }),
    ).toHaveCount(0)
    await page
      .getByRole('button', { name: 'Jämför med föregående avtal', exact: true })
      .click()
    const comparison = page.getByRole('dialog', {
      name: 'Jämför med föregående avtal',
      exact: true,
    })
    await expect(comparison).toContainText('Original agreed service')
    await expect(comparison).toContainText('Changed for agreement B')
    await comparison
      .getByRole('button', { name: 'Stäng', exact: true })
      .last()
      .click()
    await expect(comparison).toBeHidden()
    await page.getByRole('button', { name: 'Välj avtal', exact: true }).click()
    const selector = page.getByRole('dialog', {
      name: 'Välj avtal',
      exact: true,
    })
    await selector.getByText('Tidigare avtal', { exact: true }).click()
    await selector.getByRole('button', { name: /^Avtal A ·/ }).click()
    await expect(card(page)).toContainText('Avtal A')
    await expect(
      page
        .getByRole('button', { name: new RegExp(`^${data.local.uniqueId}\\b`) })
        .locator('xpath=ancestor::tr[1]'),
    ).toContainText('Original agreed service')
    await expand(page, data.local.uniqueId)
    await disclosure
      .locator('summary')
      .filter({ hasText: /^Historik$/ })
      .click()
    await expect(
      disclosure.getByText('Visar avtal: Avtal A', { exact: true }),
    ).toBeVisible()
    await expect(entries).toHaveCount(3)
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 1200 })
      await expect
        .poll(() =>
          disclosure.evaluate(
            element => element.scrollWidth <= element.clientWidth,
          ),
        )
        .toBe(true)
      await disclosure.screenshot({
        path: testInfo.outputPath(`history-${width}.png`),
      })
    }
  } finally {
    await owner.dispose()
  }
})

test('SPEC-23: center wrapped Swedish action labels and keep room for requirement content', async ({
  page,
}, testInfo) => {
  const owner = await newRoleContext(testInfo, 'specificationResponsible')
  try {
    const data = await fixture(owner)
    for (const [operation, agreementReference, effectiveDate] of [
      ['establish', 'Avtal A', '2020-01-01'],
      ['create_draft', 'Avtal B', today()],
    ]) {
      await expectOk(
        await owner.post(data.endpoint, {
          data: { operation, agreementReference, effectiveDate },
        }),
        `prepare ${agreementReference}`,
      )
    }
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await page.goto(`/sv/specifications/${data.id}`)
    await page.getByRole('button', { name: 'Välj avtal', exact: true }).click()
    const selector = page.getByRole('dialog', {
      name: 'Välj avtal',
      exact: true,
    })
    await Promise.all([
      page.waitForResponse(
        response =>
          response
            .url()
            .includes(`/api/requirements-specifications/${data.id}/items?`) &&
          response.url().includes('agreementId=') &&
          response.ok(),
      ),
      selector.getByRole('button', { name: /^Avtal B ·/ }).click(),
    ])
    await expect(selector).toBeHidden()
    await expect(card(page)).toContainText('Avtal B')
    await expand(page, data.local.uniqueId)
    const actions = page.getByRole('group', {
      name: 'Åtgärder för kravet',
      exact: true,
    })
    const compare = actions.getByRole('button', {
      name: 'Jämför med föregående avtal',
      exact: true,
    })
    await expect(compare).toBeVisible()
    for (const viewport of [DESKTOP_VIEWPORT, { width: 375, height: 900 }]) {
      await page.setViewportSize(viewport)
      for (const button of await actions.getByRole('button').all()) {
        await expect
          .poll(() =>
            button.evaluate(element => {
              const icon = element.querySelector('svg')
              const label = Array.from(element.childNodes).find(
                node =>
                  node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
              )
              if (!icon || !label) return false
              const range = document.createRange()
              range.selectNodeContents(label)
              const lines = Array.from(range.getClientRects())
              const first = lines[0]
              if (!first) return false
              const glyph = icon.getBoundingClientRect()
              const bounds = element.getBoundingClientRect()
              const center = (bounds.left + bounds.right) / 2
              return (
                Math.abs((glyph.left + first.right) / 2 - center) < 1 &&
                glyph.top < first.bottom &&
                glyph.bottom > first.top &&
                lines
                  .slice(1)
                  .every(
                    line => Math.abs((line.left + line.right) / 2 - center) < 1,
                  ) &&
                lines.every(
                  line =>
                    line.left >= bounds.left && line.right <= bounds.right,
                ) &&
                element.scrollWidth <= element.clientWidth &&
                bounds.height >= 24
              )
            }),
          )
          .toBe(true)
      }
      if (viewport.width === DESKTOP_VIEWPORT.width) {
        const layout = await compare.evaluate(element => {
          const range = document.createRange()
          range.selectNodeContents(element.lastChild as Node)
          const rail = element.closest('fieldset')
          return {
            lines: range.getClientRects().length,
            railWidth: rail?.getBoundingClientRect().width,
            contentWidth:
              rail?.previousElementSibling?.getBoundingClientRect().width,
          }
        })
        expect(layout.lines).toBeGreaterThan(1)
        expect(layout.railWidth).toBeLessThanOrEqual(224)
        expect(layout.contentWidth).toBeGreaterThan(
          requireTestValue(layout.railWidth),
        )
      }
      await actions.screenshot({
        path: testInfo.outputPath(`actions-${viewport.width}.png`),
      })
    }
    await compare.click()
    const comparison = page.getByRole('dialog', {
      name: 'Jämför med föregående avtal',
      exact: true,
    })
    await expect(comparison).toContainText('Original agreed service')
    await comparison
      .getByRole('button', { name: 'Stäng', exact: true })
      .last()
      .click()
    await expect(comparison).toBeHidden()
  } finally {
    await owner.dispose()
  }
})

test('SPEC-22/SPEC-23/SPEC-28: edit the complete agreement in the requirement list and retain historical content and output', async ({
  page,
}, testInfo) => {
  const owner = await newRoleContext(testInfo, 'specificationResponsible')
  const reviewer = await newRoleContext(testInfo, 'reviewer')
  try {
    const data = await fixture(owner)
    const requested = await owner.post(
      `/api/specification-item-deviations/${encodeURIComponent(`local:${data.local.id}`)}`,
      { data: { motivation: 'Historical permission' } },
    )
    await expectOk(requested, 'create historical permission')
    const deviation = (await requested.json()) as { id: number }
    const deviationPath = `/api/specification-local-deviations/${deviation.id}`
    await expectOk(
      await owner.post(`${deviationPath}/request-review`),
      'request historical permission review',
    )
    await expectOk(
      await reviewer.post(`${deviationPath}/decision`, {
        data: { decision: 1, decisionMotivation: 'Historical approval' },
      }),
      'approve historical permission',
    )
    await expectOk(
      await owner.post(data.endpoint, {
        data: {
          operation: 'close_deviation',
          itemRef: `local:${data.local.id}`,
          deviationId: deviation.id,
          reason: 'Historical permission no longer needed',
        },
      }),
      'close historical permission',
    )
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await page.goto(`/en/specifications/${data.id}`)
    await register(page, 'Agreement A', '2020-01-01')
    await expect(card(page)).toContainText('Current')
    await expand(page, data.local.uniqueId)
    await expect(
      page.getByRole('button', {
        name: 'Compare with previous agreement',
        exact: true,
      }),
    ).toHaveCount(0)
    await expect(
      page.locator('summary').filter({ hasText: /^History$/ }),
    ).toHaveCount(0)
    await page
      .getByRole('button', { name: 'Agreement details', exact: true })
      .click()
    const details = page.getByRole('dialog', {
      name: 'Agreement details',
      exact: true,
    })
    await details.getByText('Registration information', { exact: true }).click()
    await expectAgreementDetailsFooter(details)
    await expect(details).toContainText('Registered')
    await page.keyboard.press('Escape')
    await draft(page, 'Agreement B', today())
    await expand(page, data.local.uniqueId)
    const actions = page.locator(
      '[data-developer-mode-value="requirement action column"]',
    )
    const compare = actions.getByRole('button', {
      name: 'Compare with previous agreement',
      exact: true,
    })
    await expect(compare).toBeVisible()
    for (const label of ['Edit requirement', 'Remove requirement']) {
      const action = actions.getByRole('button', { name: label, exact: true })
      await expect
        .poll(() =>
          action.evaluate(button => {
            const icon = button.querySelector('svg')
            const labelNode = Array.from(button.childNodes).find(
              node =>
                node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
            )
            if (!icon || !labelNode) return false
            const range = document.createRange()
            range.selectNodeContents(labelNode)
            const text = range.getBoundingClientRect()
            const bounds = button.getBoundingClientRect()
            const groupCenter =
              (icon.getBoundingClientRect().left + text.right) / 2
            return Math.abs(groupCenter - (bounds.left + bounds.right) / 2) < 1
          }),
        )
        .toBe(true)
    }
    await expect
      .poll(() =>
        compare.evaluate(button => {
          const rail = button.closest('fieldset')
          const content = rail?.previousElementSibling
          if (!rail || !content) return false
          const bounds = button.getBoundingClientRect()
          const railBounds = rail.getBoundingClientRect()
          return (
            Math.abs(bounds.right - railBounds.right) < 1 &&
            railBounds.left >= content.getBoundingClientRect().right
          )
        }),
      )
      .toBe(true)
    await compare.click()
    const comparison = page.getByRole('dialog', {
      name: 'Compare with previous agreement',
      exact: true,
    })
    await expect(comparison).toContainText('Original agreed service')
    await comparison
      .getByRole('button', { name: 'Close', exact: true })
      .last()
      .click()
    await expect(comparison).toBeHidden()
    await page
      .getByRole('button', { name: 'Edit requirement', exact: true })
      .click()
    const editor = page.getByRole('dialog', {
      name: 'Edit requirement',
      exact: true,
    })
    await editor.getByLabel(/^Requirement text/).fill('Changed agreed service')
    await editor
      .getByLabel(/^Acceptance criterion/)
      .fill('Changed service criterion')
    await editor.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(editor).toBeHidden()
    await expect(
      page
        .getByRole('button', {
          name: new RegExp(`^${data.local.uniqueId}\\b`),
        })
        .locator('xpath=ancestor::tr[1]'),
    ).toContainText('Changed agreed service')
    await confirmDraft(page)
    await expect(card(page)).toContainText('Current')
    await select(page, 'Agreement A', true)
    await expect(
      page
        .getByRole('button', {
          name: new RegExp(`^${data.local.uniqueId}\\b`),
        })
        .locator('xpath=ancestor::tr[1]'),
    ).toContainText('Original agreed service')
    await expand(page, data.local.uniqueId)
    await expect(
      page.getByRole('button', {
        name: 'Compare with previous agreement',
        exact: true,
      }),
    ).toHaveCount(0)
    await expect(
      page.locator('summary').filter({ hasText: /^History$/ }),
    ).toBeVisible()
    await expect(
      page.getByText('Original service criterion', { exact: true }),
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'More actions', exact: true })
      .click()
    const downloadPromise = page.waitForEvent('download')
    await page
      .getByRole('menuitem', { name: 'Full CSV export', exact: true })
      .click()
    const download = await downloadPromise
    const csv = await readFile(requireTestValue(await download.path()), 'utf8')
    expect(csv).toContain('Agreement A')
    expect(csv).toContain('Original agreed service')
    expect(csv).toContain('Previous')
    expect(csv).toContain('Permission ended')
    expect(csv).not.toContain('Action required')
  } finally {
    await owner.dispose()
    await reviewer.dispose()
  }
})

test('SPEC-22/SPEC-25/SPEC-26: correct and cancel the first upcoming agreement, then resume independent working content', async ({
  page,
}, testInfo) => {
  const owner = await newRoleContext(testInfo, 'specificationResponsible')
  try {
    const data = await fixture(owner)
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await page.goto(`/en/specifications/${data.id}`)
    await register(page, 'Future A', futureDate())
    await expectFullWidthAgreementStatus(page)
    await expect(card(page)).toContainText('Upcoming')
    await expand(page, data.local.uniqueId)
    await expect(
      page.getByRole('button', { name: 'Request a deviation', exact: true }),
    ).toBeEnabled()
    await page
      .getByRole('button', { name: 'Agreement details', exact: true })
      .click()
    let dialog = page.getByRole('dialog', {
      name: 'Agreement details',
      exact: true,
    })
    await expectAgreementDetailsFooter(dialog)
    await page.setViewportSize({ width: 375, height: 812 })
    await expectAgreementDetailsFooter(dialog)
    await dialog
      .locator('[data-developer-mode-value="agreement details actions"]')
      .getByRole('button', { name: 'Close', exact: true })
      .click()
    await expect(dialog).toBeHidden()
    await expect(card(page)).toContainText('Upcoming')
    await expect(
      page.getByRole('button', { name: 'Agreement details', exact: true }),
    ).toBeFocused()
    await page
      .getByRole('button', { name: 'Agreement details', exact: true })
      .click()
    await expect(dialog.getByRole('status')).toHaveText('Upcoming')
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await dialog
      .getByRole('button', { name: 'Correct agreement details', exact: true })
      .click()
    dialog = page.getByRole('dialog', {
      name: 'Correct agreement details',
      exact: true,
    })
    await dialog.getByLabel(/^Agreement reference/).fill('Corrected A')
    await dialog
      .getByRole('button', { name: 'Save correction', exact: true })
      .click()
    await expect(dialog).toBeHidden()
    await page
      .getByRole('button', { name: 'Agreement details', exact: true })
      .click()
    dialog = page.getByRole('dialog', {
      name: 'Agreement details',
      exact: true,
    })
    await dialog.getByText('Registration information', { exact: true }).click()
    await expect(dialog).toContainText('Future A')
    await expect(dialog).toContainText('Corrected A')
    await dialog
      .getByRole('button', { name: 'Cancel upcoming agreement', exact: true })
      .click()
    dialog = page.getByRole('dialog', {
      name: 'Cancel upcoming agreement',
      exact: true,
    })
    await dialog.getByLabel(/^Reason/).fill('Replacement agreement is required')
    await dialog
      .getByRole('button', { name: 'Cancel upcoming agreement', exact: true })
      .click()
    await expect(dialog).toBeHidden()
    await expect(card(page)).toContainText('None')
    await expect(
      page.getByRole('button', { name: 'New unique requirement', exact: true }),
    ).toBeEnabled()
    await select(page, 'Corrected A', true)
    await expect(card(page)).toContainText('Cancelled')
    await expect(
      page
        .getByRole('button', {
          name: new RegExp(`^${data.local.uniqueId}\\b`),
        })
        .locator('xpath=ancestor::tr[1]'),
    ).toContainText('Original agreed service')
  } finally {
    await owner.dispose()
  }
})

test('SPEC-26/SPEC-27: discard a pending draft, record agreement end and prepare an extension in the same specification', async ({
  page,
}, testInfo) => {
  const owner = await newRoleContext(testInfo, 'specificationResponsible')
  try {
    const data = await fixture(owner)
    await page.goto(`/en/specifications/${data.id}`)
    await register(page, 'Agreement A', '2020-01-01')
    await draft(page, 'Discard B', futureDate())
    await page
      .getByRole('button', { name: 'Agreement details', exact: true })
      .click()
    const details = page.getByRole('dialog', {
      name: 'Agreement details',
      exact: true,
    })
    await details
      .getByRole('button', { name: 'Discard draft', exact: true })
      .click()
    await page
      .getByRole('alertdialog', {
        name: 'Discard agreement draft',
        exact: true,
      })
      .getByRole('button', { name: 'Discard draft', exact: true })
      .click()
    await expect(details).toBeHidden()
    await expect(card(page)).toContainText('Agreement A')
    await page
      .getByRole('button', { name: 'Agreement details', exact: true })
      .click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Record agreement end', exact: true })
      .click()
    const end = page.getByRole('dialog', {
      name: 'Record agreement end',
      exact: true,
    })
    await end.getByLabel(/^Agreement ended/).fill(today())
    await end.getByLabel(/^Reason/).fill('The agreed delivery period ended')
    await end
      .getByRole('button', { name: 'Record agreement end', exact: true })
      .click()
    await expect(end).toBeHidden()
    await expect(card(page)).toContainText('Ended')
    await draft(page, 'Extension C', today())
    await expect(
      page
        .getByRole('button', {
          name: new RegExp(`^${data.local.uniqueId}\\b`),
        })
        .locator('xpath=ancestor::tr[1]'),
    ).toContainText('Original agreed service')
    await confirmDraft(page)
    await expect(card(page)).toContainText('Current')
    await select(page, 'Agreement A', true)
    await expect(card(page)).toContainText('Ended')
  } finally {
    await owner.dispose()
  }
})

test('SPEC-23: compare and adopt a newer library version before the first agreement', async ({
  page,
}, testInfo) => {
  const owner = await newRoleContext(testInfo, 'specificationResponsible')
  try {
    const data = await fixture(owner)
    const source = await withPlaywrightSqlServerDataSource(async db => {
      const [source] =
        (await db.query(`SELECT TOP (1) requirement.id AS requirementId, requirement.unique_id AS uniqueId, older.id AS oldVersionId, older.description AS oldDescription, published.description AS newDescription
        FROM requirements requirement INNER JOIN requirement_versions older ON older.requirement_id = requirement.id AND older.requirement_status_id = 4
        INNER JOIN requirement_versions published ON published.requirement_id = requirement.id AND published.requirement_status_id = 3 AND published.version_number > older.version_number
        ORDER BY requirement.id, older.version_number`)) as Array<{
          requirementId: number
          uniqueId: string
          oldVersionId: number
          oldDescription: string
          newDescription: string
        }>
      if (!source)
        throw new Error('Demo data needs a newer published library version')
      await db.query(
        `INSERT INTO requirements_specification_items (requirements_specification_id, requirement_id, requirement_version_id, note, specification_item_status_id, created_at)
        VALUES (@0, @1, @2, N'Preserved delivery note', 1, SYSUTCDATETIME())`,
        [data.id, source.requirementId, source.oldVersionId],
      )
      return source
    })
    await page.goto(`/en/specifications/${data.id}`)
    await expect(
      page.getByRole('button', { name: 'Register agreement', exact: true }),
    ).toBeEnabled()
    await expand(page, source.uniqueId)
    await expect(
      page.getByRole('button', { name: new RegExp(`^${source.uniqueId}\\b`) }),
    ).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('[id^="requirement-row-detail-"]')).toContainText(
      source.oldDescription,
    )
    await page
      .getByRole('button', {
        name: 'Update from requirement library',
        exact: true,
      })
      .click()
    const comparison = page.getByRole('dialog', {
      name: 'Compare library versions',
      exact: true,
    })
    await expect(
      comparison.getByRole('region', {
        name: 'Newer published version',
        exact: true,
      }),
    ).toContainText(source.newDescription)
    await expect(
      comparison.getByText('Changed field:', { exact: true }).first(),
    ).toBeAttached()
    await comparison.getByRole('button', { name: 'Close', exact: true }).click()
    await page
      .getByRole('button', {
        name: 'Update from requirement library',
        exact: true,
      })
      .click()
    await comparison
      .getByRole('button', { name: 'Use the compared version', exact: true })
      .click()
    await expect(comparison).toBeHidden()
    await expect(
      page
        .getByRole('button', { name: new RegExp(`^${source.uniqueId}\\b`) })
        .locator('xpath=ancestor::tr[1]'),
    ).toContainText(source.newDescription)
    const applicationPage = await (
      await owner.get(`/api/requirements-specifications/${data.id}/items`)
    ).json()
    const application = applicationPage.items.find(
      (item: { uniqueId: string }) => item.uniqueId === source.uniqueId,
    )
    const updated = await (
      await owner.get(`${data.endpoint}?itemRefs=${application.itemRef}`)
    ).json()
    expect(
      updated.items.find(
        (item: { uniqueId: string }) => item.uniqueId === source.uniqueId,
      ),
    ).toMatchObject({
      note: 'Preserved delivery note',
      description: source.newDescription,
    })
    await register(page, 'Agreement A', '2020-01-01')
    await draft(page, 'Agreement B', futureDate())
    await expand(page, source.uniqueId)
    await page
      .getByRole('button', { name: 'Edit requirement', exact: true })
      .click()
    const editor = page.getByRole('dialog', {
      name: 'Edit requirement',
      exact: true,
    })
    await expect(editor).toContainText('new requirement ID')
    await editor
      .getByLabel(/^Requirement text/)
      .fill('Locally negotiated library content')
    await editor.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(editor).toBeHidden()
    const selectedPage = await (
      await owner.get(
        `/api/requirements-specifications/${data.id}/items?agreementId=${(await (await owner.get(data.endpoint)).json()).agreements.find((agreement: { state: string }) => agreement.state === 'draft').id}`,
      )
    ).json()
    const converted = selectedPage.items.find(
      (item: { version: { description: string } }) =>
        item.version.description === 'Locally negotiated library content',
    )
    expect(converted.uniqueId).not.toBe(source.uniqueId)
    await expand(page, converted.uniqueId)
    await page
      .getByRole('button', { name: 'Request a deviation', exact: true })
      .click()
    const deviation = page.getByRole('dialog', {
      name: 'Request a deviation',
      exact: true,
    })
    await deviation
      .getByLabel(/^Motivation/)
      .fill('Draft content requires an exception')
    await deviation
      .getByRole('button', { name: 'Register deviation', exact: true })
      .click()
    await expect(deviation).toBeHidden()
    await expect(
      page.getByRole('button', { name: 'Edit requirement', exact: true }),
    ).toBeDisabled()
    await page
      .getByRole('button', { name: 'End without a decision', exact: true })
      .click()
    const cancel = page.getByRole('dialog', {
      name: 'End without a decision',
      exact: true,
    })
    await cancel.getByLabel(/^Reason/).fill('Restore the library requirement')
    await cancel
      .getByRole('button', { name: 'End without a decision', exact: true })
      .click()
    await expect(cancel).toBeHidden()
    await page
      .locator('[data-developer-mode-value="requirement action column"]')
      .getByRole('button', { name: 'Undo change', exact: true })
      .click()
    await expand(page, source.uniqueId)
    await page
      .locator('summary')
      .filter({ hasText: /^Deviation history$/ })
      .click()
    await expect(
      page.locator('summary').filter({ hasText: /^History$/ }),
    ).toHaveCount(0)
    await expect(
      page.getByText('Draft content requires an exception', { exact: true }),
    ).toBeVisible()
  } finally {
    await owner.dispose()
  }
})

for (const locale of ['sv', 'en'] as const) {
  test(`SPEC-22/SPEC-25: keyboard agreement selection and localized duplicate validation at 320px (${locale})`, async ({
    page,
  }, testInfo) => {
    const owner = await newRoleContext(testInfo, 'specificationResponsible')
    const labels =
      locale === 'sv'
        ? {
            register: 'Registrera avtal',
            reference: 'Avtalsreferens',
            date: 'Avtalsdatum',
            confirm: 'Bekräfta avtal',
            create: 'Nytt avtal',
            save: 'Skapa utkast',
            select: 'Välj avtal',
            previous: 'Tidigare avtal',
            duplicate: 'Avtalsreferensen eller avtalsdatumet används redan',
          }
        : {
            register: 'Register agreement',
            reference: 'Agreement reference',
            date: 'Agreement effective date',
            confirm: 'Confirm agreement',
            create: 'New agreement',
            save: 'Create draft',
            select: 'Select agreement',
            previous: 'Previous agreements',
            duplicate:
              'The agreement reference or effective date is already used',
          }
    try {
      const data = await fixture(owner)
      await page.setViewportSize({ width: 320, height: 740 })
      await page.goto(`/${locale}/specifications/${data.id}`)
      const registerButton = page.getByRole('button', {
        name: labels.register,
        exact: true,
      })
      await registerButton.focus()
      await registerButton.press('Enter')
      const registration = page.getByRole('dialog', {
        name: labels.register,
        exact: true,
      })
      await registration
        .getByLabel(new RegExp(`^${labels.reference}`))
        .fill('Mobile A')
      await registration
        .getByLabel(new RegExp(`^${labels.date}`))
        .fill('2020-01-01')
      await registration
        .getByRole('button', { name: labels.confirm, exact: true })
        .click()
      await expect(registration).toBeHidden()
      await expectFullWidthAgreementStatus(page)
      await page
        .getByRole('button', { name: labels.select, exact: true })
        .click()
      const firstSelector = page.getByRole('dialog', {
        name: labels.select,
        exact: true,
      })
      await expect(
        firstSelector.getByText(labels.previous, { exact: true }),
      ).toHaveCount(0)
      await expect(
        firstSelector.getByRole('button', { name: /^Mobile A ·/ }),
      ).toBeVisible()
      await page.keyboard.press('Escape')
      await page
        .getByRole('button', { name: labels.create, exact: true })
        .click()
      const create = page.getByRole('dialog', {
        name: labels.create,
        exact: true,
      })
      await create
        .getByLabel(new RegExp(`^${labels.reference}`))
        .fill('Mobile A')
      await create.getByLabel(new RegExp(`^${labels.date}`)).fill(futureDate())
      await create
        .getByRole('button', { name: labels.save, exact: true })
        .click()
      await expect(create.getByRole('alert')).toContainText(labels.duplicate)
      await create
        .getByLabel(new RegExp(`^${labels.reference}`))
        .fill('Mobile B')
      await create
        .getByRole('button', { name: labels.save, exact: true })
        .click()
      await expect(create).toBeHidden()
      const selectButton = page.getByRole('button', {
        name: labels.select,
        exact: true,
      })
      await selectButton.focus()
      await selectButton.press('Enter')
      const selector = page.getByRole('dialog', {
        name: labels.select,
        exact: true,
      })
      await expect(
        selector.getByText(labels.previous, { exact: true }),
      ).toHaveCount(0)
      const bounds = await selector.boundingBox()
      expect(bounds?.x).toBeGreaterThanOrEqual(0)
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(320)
      await page.keyboard.press('Escape')
      await expect(selector).toBeHidden()
      await expect(selectButton).toBeFocused()
      const target = await selectButton.boundingBox()
      expect(target?.width).toBeGreaterThanOrEqual(24)
      expect(target?.height).toBeGreaterThanOrEqual(24)
    } finally {
      await owner.dispose()
    }
  })
}

async function deviationFixture(
  owner: APIRequestContext,
  kind: 'library' | 'local',
) {
  const data = await fixture(owner)
  let uniqueId = data.local.uniqueId
  if (kind === 'library') {
    const source = await withPlaywrightSqlServerDataSource(async db => {
      const rows = (await db.query(
        `SELECT TOP (1) requirement.id, requirement.unique_id AS uniqueId FROM requirements requirement INNER JOIN requirement_versions version ON version.requirement_id = requirement.id WHERE version.requirement_status_id = 3 ORDER BY requirement.id`,
      )) as Array<{ id: number; uniqueId: string }>
      return requireTestValue(rows[0])
    })
    await expectOk(
      await owner.post(`/api/requirements-specifications/${data.id}/items`, {
        data: { requirementIds: [source.id] },
      }),
      'link library requirement',
    )
    uniqueId = source.uniqueId
  }
  const itemPage = (await (
    await owner.get(`/api/requirements-specifications/${data.id}/items`)
  ).json()) as { items: Array<{ itemRef: string; uniqueId: string }> }
  const item = requireTestValue(
    itemPage.items.find(item => item.uniqueId === uniqueId),
  )
  const read = async () =>
    (await (
      await owner.get(
        `${data.endpoint}?itemRefs=${encodeURIComponent(item.itemRef)}`,
      )
    ).json()) as {
      deviations: Array<{
        id: number
        itemRef: string
        decision: number | null
        isReviewRequested: number
      }>
    }
  const createEndpoint = `/api/specification-item-deviations/${encodeURIComponent(item.itemRef)}`
  return { data, uniqueId, item, read, createEndpoint }
}

// Keep each workflow independent so their combined navigation and mutation
// time does not exhaust a single test's timeout on CI.
for (const kind of ['library', 'local'] as const) {
  test(`DEV-08 DEV-09: ${kind} deviation conflict recovery, editing and review`, async ({
    page,
    browser,
  }, testInfo) => {
    const owner = await newRoleContext(testInfo, 'specificationResponsible')
    const reviewer = await newRoleContext(testInfo, 'reviewer')
    try {
      const { data, uniqueId, item, read, createEndpoint } =
        await deviationFixture(owner, kind)
      await page.goto(`/en/specifications/${data.id}`)
      await expect(
        page.getByRole('button', { name: 'Register agreement', exact: true }),
      ).toBeEnabled()
      await expand(page, uniqueId)
      const actions = page.getByRole('group', {
        name: 'Requirement actions',
        exact: true,
      })
      const create = actions.getByRole('button', {
        name: 'Request a deviation',
        exact: true,
      })
      const remove = actions.getByRole('button', {
        name: kind === 'local' ? 'Delete' : 'Remove requirement',
        exact: true,
      })
      await expect(create).toBeVisible()
      await expect(remove).toBeVisible()
      const createBox = requireTestValue(await create.boundingBox())
      const removeBox = requireTestValue(await remove.boundingBox())
      expect(removeBox.y).toBeGreaterThanOrEqual(createBox.y + createBox.height)
      await actions.screenshot({
        path: testInfo.outputPath('requirement-actions.png'),
      })
      await create.click()
      const form = page.getByRole('dialog', {
        name: 'Request a deviation',
        exact: true,
      })
      await form
        .getByLabel(/^Motivation/)
        .fill('Keep this input after a conflict')
      const competing = await owner.post(createEndpoint, {
        data: { motivation: 'Saved by a concurrent author' },
      })
      await expectOk(competing, 'create competing case')
      const { id: competingId } = (await competing.json()) as { id: number }
      await form
        .getByRole('button', { name: 'Register deviation', exact: true })
        .click()
      await expect(form.getByRole('alert')).toContainText(
        'An active deviation already exists',
      )
      await expect(form.getByLabel(/^Motivation/)).toHaveValue(
        'Keep this input after a conflict',
      )
      await expectOk(
        await owner.post(data.endpoint, {
          data: {
            operation: 'cancel_deviation',
            itemRef: item.itemRef,
            deviationId: competingId,
            reason: 'Concurrent request withdrawn',
          },
        }),
        'cancel competing case',
      )
      await form
        .getByRole('button', { name: 'Register deviation', exact: true })
        .click()
      await expect(form).toBeHidden()
      let box = page.getByRole('article', {
        name: 'Keep this input after a conflict',
        exact: true,
      })
      await expect(box.getByRole('status')).toContainText('Draft')
      await box
        .getByRole('button', { name: 'Edit deviation', exact: true })
        .click()
      const edit = page.getByRole('dialog', {
        name: 'Edit deviation',
        exact: true,
      })
      await edit.getByLabel(/^Motivation/).fill('Edited request motivation')
      await edit.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(edit).toBeHidden()
      box = page.getByRole('article', {
        name: 'Edited request motivation',
        exact: true,
      })
      await expect(
        box.getByRole('button', { name: 'Edit deviation', exact: true }),
      ).toBeVisible()
      const reviewAction = box.getByRole('button', {
        name: 'Review ↗',
        exact: true,
      })
      await reviewAction.focus()
      await reviewAction.press('Enter')
      await expect(box.getByRole('status')).toContainText('Review requested')
      const pending = requireTestValue(
        (await read()).deviations.find(
          deviation =>
            deviation.itemRef === item.itemRef && deviation.decision === null,
        ),
      )
      expect(pending.isReviewRequested).toBe(1)
      const reviewerView = await reviewer.get(data.endpoint)
      await expectOk(reviewerView, 'reviewer reads requested deviation')
      expect((await reviewerView.json()).canReviewDeviations).toBe(true)
      const reviewerContext = await browser.newContext({
        storageState: ROLE_STORAGE_STATE.reviewer,
      })
      try {
        const reviewPage = await reviewerContext.newPage()
        const ready = reviewPage.waitForResponse(
          response =>
            response.url().includes(data.endpoint) &&
            response.request().method() === 'GET',
        )
        await reviewPage.goto(
          new URL(`/en/specifications/${data.id}`, page.url()).toString(),
        )
        await ready
        await expand(reviewPage, uniqueId)
        await expect(
          reviewPage
            .getByRole('article', {
              name: 'Edited request motivation',
              exact: true,
            })
            .getByRole('button', { name: 'Record decision', exact: true }),
        ).toBeVisible()
      } finally {
        await reviewerContext.close()
      }

      await page.reload()
      await expect(
        page.getByRole('button', { name: 'Register agreement', exact: true }),
      ).toBeEnabled()
      await expand(page, uniqueId)
      await expect(box.getByRole('status')).toContainText('Review requested')
    } finally {
      await owner.dispose()
      await reviewer.dispose()
    }
  })

  test(`DEV-08 DEV-10: ${kind} deviation returns to draft and ends without a decision`, async ({
    page,
  }, testInfo) => {
    const owner = await newRoleContext(testInfo, 'specificationResponsible')
    try {
      const { data, uniqueId, read, createEndpoint } = await deviationFixture(
        owner,
        kind,
      )
      const response = await owner.post(createEndpoint, {
        data: { motivation: 'Edited request motivation' },
      })
      await expectOk(response, 'create deviation for cancellation')
      const pending = (await response.json()) as { id: number }
      const reviewEndpoint =
        kind === 'local'
          ? `/api/specification-local-deviations/${pending.id}/request-review`
          : `/api/deviations/${pending.id}/request-review`
      await expectOk(
        await owner.post(reviewEndpoint),
        'request deviation review',
      )
      await page.goto(`/en/specifications/${data.id}`)
      await expect(
        page.getByRole('button', { name: 'Register agreement', exact: true }),
      ).toBeEnabled()
      await expand(page, uniqueId)
      const box = page.getByRole('article', {
        name: 'Edited request motivation',
        exact: true,
      })
      const create = page
        .getByRole('group', {
          name: 'Requirement actions',
          exact: true,
        })
        .getByRole('button', { name: 'Request a deviation', exact: true })
      await expect(box.getByRole('status')).toContainText('Review requested')
      await box.getByRole('button', { name: '← Draft', exact: true }).click()
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Confirm', exact: true })
        .click()
      await expect(box.getByRole('status')).toContainText('Draft')
      await box
        .getByRole('button', { name: 'End without a decision', exact: true })
        .click()
      const cancel = page.getByRole('dialog', {
        name: 'End without a decision',
        exact: true,
      })
      await expect(cancel).toContainText('retained in history as cancelled')
      await expect(
        cancel.getByRole('button', {
          name: 'End without a decision',
          exact: true,
        }),
      ).toBeDisabled()
      await cancel.getByLabel(/^Reason/).fill('The request is no longer needed')
      await cancel
        .getByRole('button', { name: 'End without a decision', exact: true })
        .click()
      await expect(cancel).toBeHidden()
      await expect(box.getByRole('status')).toContainText('Cancelled')
      await expect(create).toBeVisible()
      expect(
        (await read()).deviations.find(
          deviation => deviation.id === pending.id,
        ),
      ).toMatchObject({ decision: 3, isReviewRequested: 0 })
      await page.reload()
      await expect(
        page.getByRole('button', { name: 'Register agreement', exact: true }),
      ).toBeEnabled()
      await expand(page, uniqueId)
      await expect(box.getByRole('status')).toContainText('Cancelled')
    } finally {
      await owner.dispose()
    }
  })

  test(`DEV-08 DEV-10: ${kind} future-agreement deviation ends in a narrow viewport`, async ({
    page,
  }, testInfo) => {
    const owner = await newRoleContext(testInfo, 'specificationResponsible')
    try {
      const { data, uniqueId } = await deviationFixture(owner, kind)
      await page.goto(`/en/specifications/${data.id}`)
      await expect(
        page.getByRole('button', { name: 'Register agreement', exact: true }),
      ).toBeEnabled()
      const create = page
        .getByRole('group', {
          name: 'Requirement actions',
          exact: true,
        })
        .getByRole('button', { name: 'Request a deviation', exact: true })
      const form = page.getByRole('dialog', {
        name: 'Request a deviation',
        exact: true,
      })
      await register(page, 'Future agreement', futureDate())
      await expand(page, uniqueId)
      await create.click()
      await form.getByLabel(/^Motivation/).fill('Upcoming content exception')
      await form
        .getByRole('button', { name: 'Register deviation', exact: true })
        .click()
      await expect(form).toBeHidden()
      const upcoming = page.getByRole('article', {
        name: 'Upcoming content exception',
        exact: true,
      })
      await page.setViewportSize({ width: 375, height: 812 })
      await expect(
        upcoming.getByRole('button', {
          name: 'End without a decision',
          exact: true,
        }),
      ).toBeVisible()
      await upcoming.screenshot({
        path: testInfo.outputPath('deviation-mobile.png'),
      })
      await upcoming
        .getByRole('button', { name: 'End without a decision', exact: true })
        .click()
      const cancel = page.getByRole('dialog', {
        name: 'End without a decision',
        exact: true,
      })
      await cancel.getByLabel(/^Reason/).fill('Upcoming request withdrawn')
      const cancellationActions = cancel.locator(
        '[data-developer-mode-value="end deviation without a decision"]',
      )
      for (const width of [1440, 375]) {
        await page.setViewportSize({ width, height: 812 })
        const closeButton = cancellationActions.getByRole('button', {
          name: 'Close',
          exact: true,
        })
        const endButton = cancellationActions.getByRole('button', {
          name: 'End without a decision',
          exact: true,
        })
        await expect(closeButton).toBeVisible()
        await expect(endButton).toBeVisible()
        const closeBounds = requireTestValue(await closeButton.boundingBox())
        const endBounds = requireTestValue(await endButton.boundingBox())
        // Dialog transforms can produce fractional CSS pixels.
        expect(
          Math.round(
            Math.max(
              endBounds.x - closeBounds.x - closeBounds.width,
              endBounds.y - closeBounds.y - closeBounds.height,
            ),
          ),
        ).toBeGreaterThanOrEqual(12)
      }
      await cancel.screenshot({
        path: testInfo.outputPath('cancellation-dialog-mobile.png'),
      })
      await cancel
        .getByRole('button', { name: 'End without a decision', exact: true })
        .click()
      await expect(cancel).toBeHidden()
      await expect(upcoming.getByRole('status')).toContainText('Cancelled')
    } finally {
      await owner.dispose()
    }
  })
}

test('SPEC-24: future ending still requires consent to remove approved content', async ({
  page,
}, testInfo) => {
  const owner = await newRoleContext(testInfo, 'specificationResponsible')
  const reviewer = await newRoleContext(testInfo, 'reviewer')
  try {
    const data =
      await test.step('Prepare approved content in an agreement draft', async () => {
        const data = await fixture(owner)
        const created = await owner.post(
          `/api/specification-item-deviations/local:${data.local.id}`,
          { data: { motivation: 'Temporary permission' } },
        )
        await expectOk(created, 'create permission request')
        const approval = (await created.json()) as { id: number }
        await expectOk(
          await owner.post(
            `/api/specification-local-deviations/${approval.id}/request-review`,
          ),
          'request review',
        )
        await expectOk(
          await reviewer.post(
            `/api/specification-local-deviations/${approval.id}/decision`,
            { data: { decision: 1, decisionMotivation: 'Approved' } },
          ),
          'approve permission',
        )
        await page.goto(`/en/specifications/${data.id}`)
        await register(page, 'Approval A', '2020-01-01')
        await draft(page, 'Approval B', futureDate())
        // Model a recorded ending whose effective time is still in the future.
        await page.route(`**${data.endpoint}*`, async route => {
          if (
            route.request().method() !== 'GET' ||
            route.request().url().includes('historyItemRef')
          ) {
            await route.continue()
            return
          }
          const response = await route.fetch()
          const body = await response.json()
          await route.fulfill({
            response,
            json: {
              ...body,
              deviationEndings: [
                {
                  id: 1,
                  itemRef: `local:${data.local.id}`,
                  deviationId: approval.id,
                  agreementId: body.selectedAgreement.id,
                  endedAt: '2099-01-01T00:00:00Z',
                  cancelledAt: null,
                },
              ],
            },
          })
        })
        const refreshed = page.waitForResponse(
          response =>
            new URL(response.url()).pathname ===
              `/api/requirements-specifications/${data.id}/items` &&
            response.request().method() === 'GET',
        )
        await page.reload()
        expect((await refreshed).ok()).toBe(true)
        await select(page, 'Approval B')
        await expect(
          page
            .locator('[data-specification-detail-list-panel="items"] tbody')
            .first(),
        ).not.toHaveClass(/pointer-events-none/u)
        await expand(page, data.local.uniqueId)
        return data
      })
    await test.step('Require explicit approval-ending consent', async () => {
      await page
        .getByRole('button', { name: 'Remove requirement', exact: true })
        .click()
      const confirmation = page.getByRole('alertdialog')
      await expect(confirmation).toContainText(data.local.uniqueId)
      await expect(
        confirmation.getByRole('button', {
          name: 'Save and plan ending',
          exact: true,
        }),
      ).toBeEnabled()
      await confirmation
        .getByRole('button', { name: 'Cancel', exact: true })
        .click()
      await expect(confirmation).toBeHidden()
    })
  } finally {
    await owner.dispose()
    await reviewer.dispose()
  }
})

test('DEV-11/DEV-12: shared renewal and responsible closure survive draft discard and use Verified for follow-up', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000)
  const owner = await newRoleContext(testInfo, 'specificationResponsible')
  const reviewer = await newRoleContext(testInfo, 'reviewer')
  const reviewContext = await browser.newContext({
    storageState: ROLE_STORAGE_STATE.reviewer,
  })
  try {
    const data = await test.step('Fixture and initial approval', async () => {
      const data = await fixture(owner)
      const itemRef = `local:${data.local.id}`
      const create = await owner.post(
        `/api/specification-item-deviations/${encodeURIComponent(itemRef)}`,
        { data: { motivation: 'Original temporary permission' } },
      )
      await expectOk(create, 'create original request')
      const original = (await create.json()) as { id: number }
      await expectOk(
        await owner.post(
          `/api/specification-local-deviations/${original.id}/request-review`,
        ),
        'request initial review',
      )
      await expectOk(
        await reviewer.post(
          `/api/specification-local-deviations/${original.id}/decision`,
          {
            data: {
              decision: 1,
              decisionMotivation: 'Initial approval',
              conditions: 'Original controls',
            },
          },
        ),
        'approve initial permission',
      )
      await page.goto(`/en/specifications/${data.id}`)
      await register(page, 'Validity A', '2020-01-01')
      await draft(page, 'Validity B', futureDate())
      return data
    })
    const itemRef = `local:${data.local.id}`
    await test.step('Expired approval offers renewal without closure', async () => {
      const reloadReady = async () => {
        const refreshed = page.waitForResponse(
          response =>
            new URL(response.url()).pathname ===
              `/api/requirements-specifications/${data.id}/items` &&
            response.request().method() === 'GET',
        )
        await page.reload()
        expect((await refreshed).ok()).toBe(true)
        await expect(
          page
            .locator('[data-specification-detail-list-panel="items"] tbody')
            .first(),
        ).not.toHaveClass(/pointer-events-none/u)
      }
      await page.route(`**${data.endpoint}*`, async route => {
        if (
          route.request().method() !== 'GET' ||
          route.request().url().includes('historyItemRef')
        ) {
          await route.continue()
          return
        }
        const response = await route.fetch()
        const body = await response.json()
        await route.fulfill({
          response,
          json: {
            ...body,
            deviations: body.deviations.map((deviation: { itemRef: string }) =>
              deviation.itemRef === itemRef
                ? { ...deviation, validThrough: '2020-09-30' }
                : deviation,
            ),
          },
        })
      })
      await reloadReady()
      await expand(page, data.local.uniqueId)
      await expect(
        page.getByRole('article', {
          name: 'Original temporary permission',
          exact: true,
        }),
      ).toContainText('Approval expired')
      await expect(
        page.getByRole('button', { name: 'Close approval', exact: true }),
      ).toHaveCount(0)
      await expect(
        page.getByRole('button', { name: 'Request renewal', exact: true }),
      ).toBeEnabled()
      await page.unroute(`**${data.endpoint}*`)
      await reloadReady()
    })
    await test.step('Renewal request', async () => {
      await expand(page, data.local.uniqueId)
      await page
        .getByRole('button', { name: 'Request renewal', exact: true })
        .click()
      const renewal = page.getByRole('dialog', {
        name: 'Request a deviation',
        exact: true,
      })
      await expect(renewal).toContainText('Validity A, Validity B')
      await renewal
        .locator('#deviation-motivation')
        .fill('Continued permission with new controls')
      await renewal
        .getByRole('button', { name: 'Register deviation', exact: true })
        .click()
      await expect(renewal).toBeHidden()
      await expect(
        page.getByRole('button', { name: 'Close approval', exact: true }),
      ).toHaveCount(0)
      await expect(
        page.getByRole('button', { name: 'Request renewal', exact: true }),
      ).toHaveCount(0)
      await page
        .getByRole('article', {
          name: 'Continued permission with new controls',
          exact: true,
        })
        .getByRole('button', { name: 'Review ↗', exact: true })
        .click()
      await expect(
        page.getByRole('button', { name: 'Close approval', exact: true }),
      ).toHaveCount(0)
    })
    await test.step('Reviewer decision', async () => {
      const reviewPage = await reviewContext.newPage()
      const initialized = reviewPage.waitForResponse(
        response =>
          new URL(response.url()).pathname ===
            `/api/requirements-specifications/${data.id}/items` &&
          response.request().method() === 'GET',
      )
      await reviewPage.goto(
        new URL(`/en/specifications/${data.id}`, page.url()).toString(),
      )
      expect((await initialized).ok()).toBe(true)
      await expect(
        reviewPage
          .locator('[data-specification-detail-list-panel="items"] tbody')
          .first(),
      ).not.toHaveClass(/pointer-events-none/u)
      await expand(reviewPage, data.local.uniqueId)
      await reviewPage
        .getByRole('button', { name: 'Record decision', exact: true })
        .click()
      const decision = reviewPage.getByRole('dialog', {
        name: 'Record decision',
        exact: true,
      })
      await expect(decision).toContainText('Validity A, Validity B')
      await decision
        .locator('#decision-motivation')
        .fill('Separate renewal decision')
      await decision
        .getByLabel('Approval conditions', { exact: true })
        .fill('New access controls')
      await decision.getByLabel('Set an end date', { exact: true }).check()
      await decision
        .getByLabel('Valid through', { exact: true })
        .fill('2099-09-30')
      await decision
        .getByRole('button', { name: 'Record decision', exact: true })
        .click()
      await expect(decision).toBeHidden()
    })
    await test.step('Closure', async () => {
      const refreshed = page.waitForResponse(
        response =>
          new URL(response.url()).pathname ===
            `/api/requirements-specifications/${data.id}/items` &&
          response.request().method() === 'GET',
      )
      await page.reload()
      expect((await refreshed).ok()).toBe(true)
      await select(page, 'Validity B')
      await expect(
        page
          .locator('[data-specification-detail-list-panel="items"] tbody')
          .first(),
      ).not.toHaveClass(/pointer-events-none/u)
      await expand(page, data.local.uniqueId)
      await page
        .getByRole('button', { name: 'Close approval', exact: true })
        .click()
      const close = page.getByRole('dialog', {
        name: 'Close approval',
        exact: true,
      })
      await expect(close).toContainText('Validity A, Validity B')
      await close.getByLabel(/^Reason/).fill('Departure no longer needed')
      await close
        .getByRole('button', { name: 'Close approval', exact: true })
        .click()
      await expect(close).toBeHidden()
      await expect(
        page.getByText('Deviation approval was closed – action required', {
          exact: true,
        }),
      ).toHaveCount(1)
    })
    await test.step('Draft discard and status filtering', async () => {
      await page
        .getByRole('button', { name: 'Agreement details', exact: true })
        .click()
      await page
        .getByRole('dialog', { name: 'Agreement details', exact: true })
        .getByRole('button', { name: 'Discard draft', exact: true })
        .click()
      await page
        .getByRole('alertdialog', {
          name: 'Discard agreement draft',
          exact: true,
        })
        .getByRole('button', { name: 'Discard draft', exact: true })
        .click()
      await expect(card(page)).toContainText('Validity A')
      await expand(page, data.local.uniqueId)
      await expect(
        page.getByText('Departure no longer needed', { exact: false }),
      ).toHaveCount(1)
      const leftPanel = page.locator(
        '[data-specification-detail-list-panel="items"]',
      )
      await leftPanel
        .getByRole('button', { name: 'Columns', exact: true })
        .click()
      await page
        .locator(
          '[data-column-picker-option="specificationItemStatus"] input[type="checkbox"]',
        )
        .check()
      await leftPanel
        .getByRole('button', { name: 'Columns', exact: true })
        .click()
      const status = page.getByRole('combobox', {
        name: 'Usage status',
        exact: true,
      })
      await status.selectOption('4')
      await expect(
        page.getByText('Deviation approval was closed – action required', {
          exact: true,
        }),
      ).toHaveCount(0)
      await status.selectOption('3')
      await expect(
        page.getByText('Deviation approval was closed – action required', {
          exact: true,
        }),
      ).toHaveCount(1)
      await expect(
        status.getByRole('option', { name: 'Deviated', exact: true }),
      ).toHaveCount(0)
      await expect(
        page.getByRole('button', { name: 'Request renewal', exact: true }),
      ).toHaveCount(0)
      const freshRequest = page.getByRole('button', {
        name: 'Request a deviation',
        exact: true,
      })
      await expect(freshRequest).toHaveAttribute(
        'data-developer-mode-value',
        'new request without renewal link',
      )
      await freshRequest.click()
      const freshDialog = page.getByRole('dialog', {
        name: 'Request a deviation',
        exact: true,
      })
      await freshDialog
        .locator('#deviation-motivation')
        .fill('New permission after closure')
      const freshResponse = page.waitForResponse(
        response =>
          new URL(response.url()).pathname ===
            `/api/specification-item-deviations/${encodeURIComponent(itemRef)}` &&
          response.request().method() === 'POST',
      )
      await freshDialog
        .getByRole('button', { name: 'Register deviation', exact: true })
        .click()
      const created = await freshResponse
      expect(created.ok(), await created.text()).toBe(true)
      expect(created.request().postDataJSON()).not.toHaveProperty(
        'renewsDeviationId',
      )
      await expect(freshDialog).toBeHidden()
      await expect(
        page.getByRole('article', {
          name: 'New permission after closure',
          exact: true,
        }),
      ).toContainText('Review ↗')
    })
  } finally {
    await reviewContext.close()
    await owner.dispose()
    await reviewer.dispose()
  }
})

for (const locale of ['en', 'sv'] as const) {
  for (const inDraft of [false, true]) {
    test(`SPEC-29: Included-only removal, mixed selection and accessible explanations (${locale}, draft: ${inDraft})`, async ({
      page,
    }, testInfo) => {
      // Real setup, two status checks, removals, and reloads exceed one minute in CI.
      test.setTimeout(120_000)
      const owner = await newRoleContext(testInfo, 'specificationResponsible')
      try {
        const {
          data,
          library,
          uniqueId,
          itemsPath,
          agreementId,
          localRef,
          setStatus,
          panel,
          showContext,
        } = await test.step('Fixture setup', async () => {
          const {
            data,
            item: library,
            uniqueId,
          } = await deviationFixture(owner, 'library')
          const itemsPath = `/api/requirements-specifications/${data.id}/items`
          let agreementId: number | undefined
          if (inDraft) {
            await expectOk(
              await owner.post(data.endpoint, {
                data: {
                  operation: 'establish',
                  agreementReference: 'Removal A',
                  effectiveDate: '2020-01-01',
                },
              }),
              'establish removal fixture agreement',
            )
            await expectOk(
              await owner.post(data.endpoint, {
                data: {
                  operation: 'create_draft',
                  agreementReference: 'Removal B',
                  effectiveDate: futureDate(),
                },
              }),
              'create removal fixture draft',
            )
            const view = (await (
              await owner.get(data.endpoint)
            ).json()) as SpecificationAgreementView
            agreementId = requireTestValue(
              view.agreements.find(value => value.state === 'draft'),
            ).id
          }
          const localRef = `local:${data.local.id}`
          const setStatus = async (itemRef: string, status: number) => {
            await expectOk(
              await owner.patch(`${itemsPath}/${encodeURIComponent(itemRef)}`, {
                data: { specificationItemStatusId: status },
              }),
              'set usage status in current context',
            )
          }
          const url = `/${locale}/specifications/${data.id}`
          const panel = page.locator(
            '[data-specification-detail-list-panel="items"]',
          )
          const showContext = async () => {
            if (inDraft) {
              const label = locale === 'sv' ? 'Välj avtal' : 'Select agreement'
              await page
                .getByRole('button', { name: label, exact: true })
                .click()
              const selector = page.getByRole('dialog', {
                name: label,
                exact: true,
              })
              await selector
                .getByRole('button', { name: /^Removal B ·/ })
                .click()
              await expect(selector).toBeHidden()
              await expect(card(page)).toContainText('Removal B')
            } else {
              await expect(
                page.getByRole('button', {
                  name:
                    locale === 'sv' ? 'Registrera avtal' : 'Register agreement',
                  exact: true,
                }),
              ).toBeEnabled()
            }
            await expect(panel.locator('tbody')).not.toHaveClass(
              /pointer-events-none/,
            )
          }
          await page.goto(url)
          await showContext()
          return {
            data,
            library,
            uniqueId,
            itemsPath,
            agreementId,
            localRef,
            setStatus,
            panel,
            showContext,
          }
        })
        const statusReason =
          locale === 'sv'
            ? 'Kravet kan bara tas bort när användningsstatus är Inkluderad.'
            : 'The requirement can only be removed when its usage status is Included.'
        for (const [ref, id] of [
          [library.itemRef, uniqueId],
          [localRef, data.local.uniqueId],
        ]) {
          const action = await test.step(`Blocked removal: ${id}`, async () => {
            await setStatus(ref, 2)
            const rejected = await owner.delete(itemsPath, {
              data: { itemRefs: [library.itemRef, localRef], agreementId },
            })
            expect(rejected.status()).toBe(409)
            expect(await rejected.json()).toMatchObject({
              details: { reason: 'removal_requires_included' },
            })
            await page.reload()
            await showContext()
            await expand(page, id)
            const action = page
              .locator(
                '[data-developer-mode-value="requirement action column"]',
              )
              .getByRole('button', {
                name:
                  locale === 'sv'
                    ? ref === localRef && !inDraft
                      ? 'Ta bort'
                      : 'Ta bort krav'
                    : ref === localRef && !inDraft
                      ? 'Delete'
                      : 'Remove requirement',
                exact: true,
              })
            await expect(action).toBeDisabled()
            return action
          })
          await test.step(`Accessibility checks: ${id}`, async () => {
            await action.focus()
            await expect(action).toBeFocused()
            await expect(action).toHaveAccessibleDescription(statusReason)
            const descriptionId = await action.getAttribute('aria-describedby')
            const explanation = page.locator(`[id="${descriptionId}"]`)
            await expect(explanation).toBeVisible()
            await expect(explanation).toHaveAttribute(
              'data-developer-mode-value',
              'requirement removal unavailable',
            )
            await action.press('Escape')
            await expect(explanation).toBeHidden()
            await action.press('Tab')
            await action.hover()
            await explanation.hover()
            await expect(explanation).toBeVisible()
            await action.focus()
            await action.press('Enter')
            await expect(page.getByRole('alertdialog')).toHaveCount(0)
            await panel
              .getByRole('checkbox', {
                name: `${locale === 'sv' ? 'Markera' : 'Select'} ${uniqueId}`,
                exact: true,
              })
              .check()
            await panel
              .getByRole('checkbox', {
                name: `${locale === 'sv' ? 'Markera' : 'Select'} ${data.local.uniqueId}`,
                exact: true,
              })
              .check()
            const bulk = page.locator(
              '[data-developer-mode-value="remove selected items"]',
            )
            await expect(bulk).toBeDisabled()
            await bulk.focus()
            const selectionReason =
              locale === 'sv'
                ? 'Alla markerade krav måste ha användningsstatus Inkluderad för att kunna tas bort.'
                : 'All selected requirements must have usage status Included to be removed.'
            await expect(bulk).toHaveAccessibleDescription(selectionReason)
            await expect(bulk).toHaveAttribute('title', selectionReason)
          })
          await setStatus(ref, 1)
        }
        await test.step('Successful removal', async () => {
          await page.reload()
          await showContext()
          await expand(page, data.local.uniqueId)
          const localRemove = page
            .locator('[data-developer-mode-value="requirement action column"]')
            .getByRole('button', {
              name:
                locale === 'sv'
                  ? inDraft
                    ? 'Ta bort krav'
                    : 'Ta bort'
                  : inDraft
                    ? 'Remove requirement'
                    : 'Delete',
              exact: true,
            })
          await expect(localRemove).toBeEnabled()
          await localRemove.click()
          await page
            .getByRole('alertdialog')
            .getByRole('button', {
              name:
                locale === 'sv'
                  ? inDraft
                    ? 'Ta bort krav'
                    : 'Ta bort'
                  : inDraft
                    ? 'Remove requirement'
                    : 'Delete',
              exact: true,
            })
            .click()
          await expect(page.getByRole('alertdialog')).toHaveCount(0)
          await page.reload()
          await showContext()
          const viewAfterLocal = (await (
            await owner.get(
              `${data.endpoint}${agreementId ? `?agreementId=${agreementId}` : ''}`,
            )
          ).json()) as SpecificationAgreementView
          expect(
            viewAfterLocal.items.some(
              item => item.itemRef === localRef && !item.isRemoved,
            ),
          ).toBe(false)
          await panel
            .getByRole('checkbox', {
              name: `${locale === 'sv' ? 'Markera' : 'Select'} ${uniqueId}`,
              exact: true,
            })
            .check()
          const bulk = page.locator(
            '[data-developer-mode-value="remove selected items"]',
          )
          await expect(bulk).toBeEnabled()
          await expect(bulk).toHaveAttribute(
            'title',
            locale === 'sv' ? 'Ta bort valda (1)' : 'Remove selected (1)',
          )
          await bulk.click()
          await page
            .getByRole('alertdialog')
            .getByRole('button', {
              name: locale === 'sv' ? 'Ta bort' : 'Delete',
              exact: true,
            })
            .click()
          await expect(page.getByRole('alertdialog')).toHaveCount(0)
          await page.reload()
          const finalView = (await (
            await owner.get(
              `${data.endpoint}${agreementId ? `?agreementId=${agreementId}` : ''}`,
            )
          ).json()) as SpecificationAgreementView
          expect(finalView.items.filter(item => !item.isRemoved)).toHaveLength(
            0,
          )
          await withPlaywrightSqlServerDataSource(async db => {
            expect(
              await db.query(
                'SELECT unique_id AS uniqueId FROM requirements WHERE unique_id = @0',
                [uniqueId],
              ),
            ).toEqual([{ uniqueId }])
          })
        })
      } finally {
        await owner.dispose()
      }
    })
  }
}
