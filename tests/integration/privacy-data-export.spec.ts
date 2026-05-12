import { expect, test } from '@playwright/test'

// cspell:ignore linneab

function exportPayload(hsaId: string) {
  return {
    generatedAt: '2026-05-12T12:00:00.000Z',
    generatedBy: {
      displayName: 'Ada Admin',
      hsaId: 'SE2321000032-admin1',
      roles: ['Admin', 'PrivacyOfficer'],
      source: 'oidc',
      sub: 'admin-sub',
    },
    limitations: [],
    schemaVersion: 'privacy-data-subject-export.v1',
    sources: [],
    subject: {
      hsaId,
      targetFingerprint: '0123456789abcdef0123456789abcdef',
    },
    summary: {
      itemCount: 2,
      limitationCount: 0,
      sourceCount: 1,
    },
  }
}

test('admin privacy preview can export JSON and PDF for the preview target', async ({
  page,
}) => {
  const exportRequests: unknown[] = []
  await page.route('**/api/privacy/data-subject-export', async route => {
    const body = route.request().postDataJSON()
    exportRequests.push(body)
    const hsaId =
      typeof body === 'object' &&
      body !== null &&
      'target' in body &&
      typeof body.target === 'object' &&
      body.target !== null &&
      'hsaId' in body.target &&
      typeof body.target.hsaId === 'string'
        ? body.target.hsaId
        : 'SE2321000032-admin1'
    await route.fulfill({
      contentType: 'application/json',
      json: exportPayload(hsaId),
    })
  })

  await page.goto('/sv/admin?tab=privacy')
  await page
    .getByRole('textbox', { name: 'HSA-ID att söka efter' })
    .fill('SE2321000032-linneab')
  await page.getByRole('button', { name: 'Förhandsgranska' }).click()

  await expect(
    page.getByRole('button', { name: 'Exportera JSON' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Exportera JSON' }).click()

  await expect.poll(() => exportRequests.length).toBe(1)
  expect(exportRequests[0]).toMatchObject({
    delivery: 'json',
    target: { hsaId: 'SE2321000032-linneab' },
  })

  await page.getByRole('button', { name: 'Exportera PDF' }).click()
  await expect.poll(() => exportRequests.length).toBe(2)
  expect(exportRequests[1]).toMatchObject({
    delivery: 'pdf',
    target: { hsaId: 'SE2321000032-linneab' },
  })
})

test('self-service privacy page exports the signed-in user without target override', async ({
  page,
}) => {
  const exportRequests: unknown[] = []
  await page.route('**/api/privacy/data-subject-export', async route => {
    const body = route.request().postDataJSON()
    exportRequests.push(body)
    await route.fulfill({
      contentType: 'application/json',
      json: exportPayload('SE2321000032-admin1'),
    })
  })

  await page.goto('/sv/privacy')
  await expect(page.getByRole('heading', { name: 'Dataexport' })).toBeVisible()
  await page.getByRole('button', { name: 'Exportera JSON' }).click()

  await expect.poll(() => exportRequests.length).toBe(1)
  expect(exportRequests[0]).toEqual({ delivery: 'json' })
})
