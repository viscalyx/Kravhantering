import { expect, type Page, test } from '@playwright/test'

function accessReviewDetail(decision = 'pending') {
  return {
    items: [
      {
        comment: decision === 'pending' ? null : 'Fortsatt uppdrag',
        createdAt: '2026-05-12T12:00:00.000Z',
        decidedAt: decision === 'pending' ? null : '2026-05-12T12:10:00.000Z',
        decidedBy:
          decision === 'pending'
            ? null
            : {
                displayName: 'Ada Admin',
                hsaId: 'SE5560000001-admin1',
              },
        decision,
        id: 7,
        permissionType: 'area_co_author',
        principal: {
          displayName: 'Kalle Svensson',
          hsaId: 'SE5560000001-kalle1',
        },
        scope: {
          key: '1',
          label: 'INT Integration',
          type: 'requirement_area',
        },
        sourceKey: 'requirement_area_co_authors.hsa_id',
        sourceTable: 'requirement_area_co_authors',
      },
    ],
    run: {
      completedAt: null,
      completedBy: null,
      createdAt: '2026-05-12T12:00:00.000Z',
      createdBy: {
        displayName: 'Ada Admin',
        hsaId: 'SE5560000001-admin1',
      },
      dueAt: '2026-06-11T12:00:00.000Z',
      externalEvidenceReference: 'IDM-2026',
      id: 42,
      periodEnd: '2027-05-12T12:00:00.000Z',
      periodStart: '2026-05-12T12:00:00.000Z',
      reviewer: {
        displayName: 'Ada Admin',
        hsaId: 'SE5560000001-admin1',
      },
      status: 'in_review',
      summary: {
        approvedCount: decision === 'approved' ? 1 : 0,
        changedCount: 0,
        itemCount: 1,
        notApplicableCount: 0,
        pendingCount: decision === 'pending' ? 1 : 0,
        revokeRequiredCount: 0,
      },
      updatedAt: '2026-05-12T12:00:00.000Z',
    },
  }
}

function accessReviewExport() {
  return {
    ...accessReviewDetail('approved'),
    generatedAt: '2026-05-12T12:30:00.000Z',
    generatedBy: {
      displayName: 'Ada Admin',
      hsaId: 'SE5560000001-admin1',
    },
    limitations: [],
    schemaVersion: 'access-review-export.v1',
  }
}

async function routeAccessReviewApis(
  page: Page,
  options: {
    decisionError?: { error: string; status: number }
    exportError?: { error: string; status: number }
  } = {},
) {
  const exportRequests: unknown[] = []
  const decisionRequests: unknown[] = []

  await page.route('**/api/admin/access-reviews', async route => {
    await route.fulfill({
      contentType: 'application/json',
      json: { runs: [accessReviewDetail().run] },
    })
  })
  await page.route('**/api/admin/access-reviews/42', async route => {
    await route.fulfill({
      contentType: 'application/json',
      json: accessReviewDetail(),
    })
  })
  await page.route('**/api/admin/access-reviews/42/items/7', async route => {
    decisionRequests.push(route.request().postDataJSON())
    if (options.decisionError) {
      await route.fulfill({
        contentType: 'application/json',
        json: { error: options.decisionError.error },
        status: options.decisionError.status,
      })
      return
    }
    await route.fulfill({
      contentType: 'application/json',
      json: accessReviewDetail('approved'),
    })
  })
  await page.route('**/api/admin/access-reviews/42/export', async route => {
    exportRequests.push(route.request().postDataJSON())
    if (options.exportError) {
      await route.fulfill({
        contentType: 'application/json',
        json: { error: options.exportError.error },
        status: options.exportError.status,
      })
      return
    }
    await route.fulfill({
      contentType: 'application/json',
      json: accessReviewExport(),
    })
  })

  return { decisionRequests, exportRequests }
}

function accessReviewAlert(page: Page) {
  return page.locator('#accessReview-panel').getByRole('alert')
}

test('ADMIN-08: retries the access review run list after a load failure', async ({
  page,
}) => {
  let listAttempts = 0
  let shouldFailListLoad = true
  await page.route('**/api/admin/access-reviews', async route => {
    listAttempts += 1
    if (shouldFailListLoad) {
      await route.fulfill({
        contentType: 'application/json',
        json: { error: 'Kunde inte läsa in testlistan' },
        status: 500,
      })
      return
    }
    await route.fulfill({
      contentType: 'application/json',
      json: { runs: [accessReviewDetail().run] },
    })
  })
  await page.route('**/api/admin/access-reviews/42', async route => {
    await route.fulfill({
      contentType: 'application/json',
      json: accessReviewDetail(),
    })
  })

  await page.goto('/sv/admin?tab=accessReview')

  await test.step('shows the initial run-list load error once', async () => {
    await expect(accessReviewAlert(page)).toContainText(
      'Kunde inte läsa in testlistan',
    )
    await expect(
      page.getByText('Kunde inte läsa in testlistan', { exact: true }),
    ).toHaveCount(1)
  })

  await test.step('retries and loads the access review run list', async () => {
    const failedAttemptCount = listAttempts
    shouldFailListLoad = false
    await page.getByRole('button', { name: 'Försök igen' }).click()

    await expect(page.getByText('Kalle Svensson')).toBeVisible()
    expect(listAttempts).toBe(failedAttemptCount + 1)
  })
})

test('ADMIN-08: admin can decide and export an access review run', async ({
  page,
}) => {
  const { decisionRequests, exportRequests } = await routeAccessReviewApis(page)

  await page.goto('/sv/admin?tab=accessReview')

  await expect(
    page.getByRole('heading', { name: 'Behörighetsöversyn' }),
  ).toBeVisible()
  await expect(page.getByText('Kalle Svensson')).toBeVisible()

  const row = page.getByRole('row').filter({ hasText: 'Kalle Svensson' })
  await row.getByRole('textbox').fill('Fortsatt uppdrag')
  await row.getByRole('button', { name: 'Rad behöver granskas' }).click()

  await expect.poll(() => decisionRequests.length).toBe(1)
  expect(decisionRequests[0]).toMatchObject({
    comment: 'Fortsatt uppdrag',
    decision: 'approved',
  })
  await expect(row).toContainText('Godkänd')
  await expect(row).toContainText('Fortsatt uppdrag')

  await page.getByRole('button', { name: 'Exportera JSON' }).click()
  await expect.poll(() => exportRequests.length).toBe(1)
  expect(exportRequests[0]).toEqual({ delivery: 'json' })

  await page.getByRole('button', { name: 'Exportera PDF' }).click()
  await expect.poll(() => exportRequests.length).toBe(2)
  expect(exportRequests[1]).toEqual({ delivery: 'pdf', locale: 'sv' })
})

for (const { error, status } of [
  { error: 'Serverfel vid beslut', status: 500 },
  { error: 'Saknar behörighet', status: 403 },
]) {
  test(`ADMIN-08: surfaces decision failure ${status} without saving the row`, async ({
    page,
  }) => {
    const { decisionRequests } = await routeAccessReviewApis(page, {
      decisionError: { error, status },
    })

    await page.goto('/sv/admin?tab=accessReview')

    const row = page.getByRole('row').filter({ hasText: 'Kalle Svensson' })
    await row.getByRole('textbox').fill('Fortsatt uppdrag')
    await row.getByRole('button', { name: 'Rad behöver granskas' }).click()

    await expect.poll(() => decisionRequests.length).toBe(1)
    await expect(accessReviewAlert(page)).toContainText(error)
    await expect(
      row.getByRole('button', { name: 'Rad behöver granskas' }),
    ).toBeVisible()
    await expect(row.getByRole('textbox')).toBeVisible()
  })
}

for (const { error, status } of [
  { error: 'Exporten misslyckades', status: 500 },
  { error: 'Saknar behörighet', status: 403 },
  {
    error: 'Granskningen kan inte exporteras i nuvarande läge',
    status: 409,
  },
]) {
  test(`ADMIN-08: surfaces export failure ${status}`, async ({ page }) => {
    const { exportRequests } = await routeAccessReviewApis(page, {
      exportError: { error, status },
    })

    await page.goto('/sv/admin?tab=accessReview')

    await page.getByRole('button', { name: 'Exportera JSON' }).click()

    await expect.poll(() => exportRequests.length).toBe(1)
    expect(exportRequests[0]).toEqual({ delivery: 'json' })
    await expect(accessReviewAlert(page)).toContainText(error)
  })
}

test('ADMIN-09: validates long decision comments before sending a decision request', async ({
  page,
}) => {
  const { decisionRequests } = await routeAccessReviewApis(page)

  await page.goto('/sv/admin?tab=accessReview')

  const row = page.getByRole('row').filter({ hasText: 'Kalle Svensson' })
  await row.getByRole('textbox').fill('a'.repeat(10_001))
  await row.getByRole('button', { name: 'Rad behöver granskas' }).click()

  await expect(accessReviewAlert(page)).toContainText(
    'Kommentaren får vara högst',
  )
  expect(decisionRequests).toHaveLength(0)
})
