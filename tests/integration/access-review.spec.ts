import { expect, test } from '@playwright/test'

function accessReviewDetail(decision = 'pending') {
  return {
    items: [
      {
        canGenerateAi: true,
        comment: decision === 'pending' ? null : 'Fortsatt uppdrag',
        createdAt: '2026-05-12T12:00:00.000Z',
        decidedAt: decision === 'pending' ? null : '2026-05-12T12:10:00.000Z',
        decidedBy:
          decision === 'pending'
            ? null
            : {
                displayName: 'Ada Admin',
                hsaId: 'SE2321000032-admin1',
              },
        decision,
        id: 7,
        permissionType: 'area_co_author',
        principal: {
          displayName: 'Kalle Svensson',
          hsaId: 'SE2321000032-kalle1',
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
        hsaId: 'SE2321000032-admin1',
      },
      dueAt: '2026-06-11T12:00:00.000Z',
      externalEvidenceReference: 'IDM-2026',
      id: 42,
      periodEnd: '2027-05-12T12:00:00.000Z',
      periodStart: '2026-05-12T12:00:00.000Z',
      reviewer: {
        displayName: 'Ada Admin',
        hsaId: 'SE2321000032-admin1',
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
      hsaId: 'SE2321000032-admin1',
    },
    limitations: [],
    schemaVersion: 'access-review-export.v1',
  }
}

test('admin can decide and export an access review run', async ({ page }) => {
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
    await route.fulfill({
      contentType: 'application/json',
      json: accessReviewDetail('approved'),
    })
  })
  await page.route('**/api/admin/access-reviews/42/export', async route => {
    exportRequests.push(route.request().postDataJSON())
    await route.fulfill({
      contentType: 'application/json',
      json: accessReviewExport(),
    })
  })

  await page.goto('/sv/admin?tab=accessReview')

  await expect(
    page.getByRole('heading', { name: 'Behörighetsöversyn' }),
  ).toBeVisible()
  await expect(page.getByText('Kalle Svensson')).toBeVisible()
  await expect(page.getByText('AI på')).toBeVisible()

  const row = page.getByRole('row').filter({ hasText: 'Kalle Svensson' })
  await row.getByRole('textbox').fill('Fortsatt uppdrag')
  await row.getByRole('button', { name: 'Spara beslut' }).click()

  await expect.poll(() => decisionRequests.length).toBe(1)
  expect(decisionRequests[0]).toMatchObject({
    comment: 'Fortsatt uppdrag',
    decision: 'approved',
  })
  await expect(
    page.getByText('Beslutet i behörighetsöversynen sparades.'),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Exportera JSON' }).click()
  await expect.poll(() => exportRequests.length).toBe(1)
  expect(exportRequests[0]).toEqual({ delivery: 'json' })

  await page.getByRole('button', { name: 'Exportera PDF' }).click()
  await expect.poll(() => exportRequests.length).toBe(2)
  expect(exportRequests[1]).toEqual({ delivery: 'pdf' })
})
