// THROWAWAY #1352: inspect real agreement UI with in-memory examples.
import { writeFile } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'

const directory =
  'app/[locale]/specifications/[specificationId]/prototype-review'
const browser = await chromium.launch({ headless: true })
const requests = []
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('request', request => {
    if (request.url().includes('/api/requirements-specifications/')) {
      requests.push({ url: request.url(), method: request.method() })
    }
  })
  await page.goto(
    'http://localhost:3001/en/specifications/8?variant=E&nav=expanded&theme=light',
  )
  await page.locator('#username').fill('ada.admin')
  await page.locator('#password').fill('devpass')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await page.waitForURL(
    'http://localhost:3001/en/specifications/8?variant=E&nav=expanded&theme=light',
  )
  const card = page
    .locator('[data-specification-detail-header-metadata] > div')
    .first()
  await expect(
    page.locator('#specification-right-panel tbody tr').first(),
  ).toContainText(/./)
  await expect(card).not.toContainText('Working…')
  const realAgreement = await card.textContent()
  await page.getByRole('button', { name: 'Long text', exact: true }).click()
  for (const text of ['MOCK-2026-001', '2026-01-01', 'Current'])
    await expect(card).toContainText(text)
  await card
    .getByRole('button', { name: 'Agreement details', exact: true })
    .click()
  const dialog = page.getByRole('dialog')
  await expect(page.locator('.prototype-review')).toBeHidden()
  await expect(dialog).toContainText('Mock agreement for a shared platform')
  await dialog
    .locator('summary')
    .filter({ hasText: 'Registration information' })
    .click()
  for (const text of ['Anna Exempel', 'Erik Exempel', 'Correction history'])
    await expect(dialog).toContainText(text)
  await dialog
    .getByRole('button', { name: 'Correct agreement details', exact: true })
    .click()
  await dialog
    .getByRole('button', { name: 'Save correction', exact: true })
    .click()
  await expect(dialog).toContainText('Changes are not saved.')
  await page.keyboard.press('Escape')
  await card
    .getByRole('button', { name: 'Select agreement', exact: true })
    .click()
  await page
    .getByRole('dialog', { name: 'Select agreement' })
    .locator('summary')
    .click()
  await page.getByRole('button', { name: /MOCK-2024-001/ }).click()
  await expect(card).toContainText('MOCK-2024-001')
  await expect(card).toContainText('Previous')
  await card
    .getByRole('button', { name: 'Select agreement', exact: true })
    .click()
  await page.getByRole('button', { name: /MOCK-2026-001/ }).click()
  await card
    .getByRole('button', { name: 'Agreement details', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Record agreement end', exact: true })
    .click()
  await expect(dialog).toContainText('Agreement ended')
  await dialog
    .getByRole('button', { name: 'Close', exact: true })
    .first()
    .click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: 'Long text', exact: true }).click()
  await expect(card).toHaveText(realAgreement)
  await page.goto(
    'http://localhost:3001/sv/specifications/8?variant=E&nav=expanded&theme=light&sample=long&review=clean',
  )
  await expect(card).toContainText('MOCK-2026-001')
  await expect(
    page.locator('#specification-right-panel tbody tr').first(),
  ).toContainText(/./)
  await expect(
    page.locator('button[aria-controls="specification-right-panel"]'),
  ).toHaveAttribute('aria-expanded', 'true')
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: `${directory}/images/1440-expanded-light-E-collapsed-long-sv.png`,
    fullPage: true,
  })
  await page.locator('h1 button').click()
  await expect(page.locator('#prototype-header-description')).toBeVisible()
  await page.screenshot({
    path: `${directory}/images/1440-expanded-light-E-expanded-long-sv.png`,
    fullPage: true,
  })
  await card
    .getByRole('button', { name: 'Avtalsuppgifter', exact: true })
    .click()
  await dialog
    .locator('summary')
    .filter({ hasText: 'Registrerande information' })
    .click()
  await expect(dialog).toContainText('Rättelsehistorik')
  await page.screenshot({
    path: `${directory}/images/mock-agreement-details-sv.png`,
    fullPage: true,
  })
  await page.keyboard.press('Escape')
  await card.getByRole('button', { name: 'Välj avtal', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Välj avtal' })
    .locator('summary')
    .click()
  await page.screenshot({
    path: `${directory}/images/mock-agreement-selector-sv.png`,
    fullPage: true,
  })
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 375, height: 812 })
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true)
  const unexpectedRequests = requests.filter(
    request =>
      request.method !== 'GET' || request.url.includes('agreementId=-'),
  )
  expect(unexpectedRequests).toEqual([])
  await writeFile(
    `${directory}/mock-agreement-checks.json`,
    JSON.stringify(
      {
        locales: ['en', 'sv'],
        referenceDateStatus: true,
        details: true,
        registration: true,
        correctionHistory: true,
        previousSelector: true,
        mutationBlockedBeforeNetwork: true,
        endPreviewInMemory: true,
        toggleRestoresRealAgreement: true,
        modalActionsUnobstructed: true,
        mobile: true,
        unexpectedRequests,
      },
      null,
      2,
    ),
  )
  console.log(
    'PASS: mock agreement fields, details/history, selection, restore, modal actions and mobile; no writes or mock-ID API requests.',
  )
} finally {
  await browser.close()
}
