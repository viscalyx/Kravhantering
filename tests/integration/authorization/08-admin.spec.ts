import { expect, test } from '@playwright/test'
import {
  createAuthorizationFixture,
  expectOk,
  expectStatus,
  HSA,
  newRoleContext,
  ROLE_STORAGE_STATE,
  referenceManualCases,
  STATUS_ARCHIVED,
} from './authorization-test-helpers'

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
  await createAuthorizationFixture(testInfo)
})

test('AUTHZ-08/AUTH-06/AUTH-10/AUTH-11/ADMIN-10: Admin keeps admin powers without PrivacyOfficer or Reviewer powers', async ({
  browserName: _browserName,
}, testInfo) => {
  referenceManualCases(
    testInfo,
    'AUTHZ-08',
    'AUTH-06',
    'AUTH-10',
    'AUTH-11',
    'ADMIN-10',
  )
  const adminOnly = await newRoleContext(testInfo, 'adminOnly')
  const admin = await newRoleContext(testInfo, 'admin')

  try {
    await expectOk(
      await adminOnly.get('/api/admin/audit-events'),
      'admin-only action log read',
    )
    await expectOk(
      await adminOnly.get('/api/requirements-specifications'),
      'admin-only broad specifications list',
    )
    await expectStatus(
      await adminOnly.post('/api/privacy/erasure-preview', {
        data: { target: { hsaId: HSA.areaOwner } },
      }),
      403,
      'admin-only privacy preview',
    )
    await expectStatus(
      await adminOnly.post('/api/admin/archiving/preview', {
        data: { policyId: 1 },
      }),
      403,
      'admin-only retention preview',
    )
    const policiesResponse = await admin.get('/api/admin/archiving/policies')
    await expectOk(policiesResponse, 'admin retention policies')
    const policiesBody = (await policiesResponse.json()) as {
      policies?: Array<{ id: number }>
    }
    const policy = policiesBody.policies?.[0]
    expect(policy).toBeDefined()
    if (policy) {
      await expectOk(
        await admin.post('/api/admin/archiving/preview', {
          data: { policyId: policy.id },
        }),
        'admin retention preview',
      )
    }
    await expectStatus(
      await adminOnly.post('/api/requirement-transitions/PWT0005', {
        data: { statusId: STATUS_ARCHIVED },
      }),
      403,
      'admin-only reviewer lifecycle decision',
    )
  } finally {
    await admin.dispose()
    await adminOnly.dispose()
  }
})

test.describe('AUTHZ-08/AUTH-11: Admin users with PrivacyOfficer can reach both Admin and privacy surfaces', () => {
  test.use({
    storageState: ROLE_STORAGE_STATE.admin,
    viewport: { height: 720, width: 1280 },
  })

  test('AUTHZ-08/AUTH-11: Ada can use Admin tabs and PrivacyOfficer-only tabs', async ({
    page,
  }, testInfo) => {
    referenceManualCases(testInfo, 'AUTHZ-08', 'AUTH-11')
    await page.goto('/sv/admin')

    const identityTab = page.getByRole('tab', { name: 'Identitet' })
    const aiTab = page.getByRole('tab', { name: 'AI' })
    const accessReviewTab = page.getByRole('tab', {
      name: 'Behörighetsöversyn',
    })
    const archivingTab = page.getByRole('tab', { name: 'Arkivering' })
    const privacyTab = page.getByRole('tab', { name: 'Dataskydd' })
    const actionLogTab = page.getByRole('tab', { name: 'Åtgärdslogg' })

    await expect(
      page.getByRole('heading', { level: 1, name: 'Administrationscenter' }),
    ).toBeVisible()

    for (const tab of [
      identityTab,
      aiTab,
      accessReviewTab,
      archivingTab,
      privacyTab,
      actionLogTab,
    ]) {
      await expect(tab).not.toHaveAttribute('aria-disabled', 'true')
    }

    await identityTab.click()
    await expect(identityTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { name: 'Identitet' })).toBeVisible()

    await aiTab.click()
    await expect(aiTab).toHaveAttribute('aria-selected', 'true')
    await expect(
      page.getByRole('heading', { exact: true, name: 'AI' }),
    ).toBeVisible()

    await accessReviewTab.click()
    await expect(accessReviewTab).toHaveAttribute('aria-selected', 'true')
    await expect(
      page.getByRole('heading', { name: 'Behörighetsöversyn' }),
    ).toBeVisible()

    await actionLogTab.click()
    await expect(actionLogTab).toHaveAttribute('aria-selected', 'true')
    await expect(
      page.getByRole('heading', { name: 'Åtgärdslogg' }),
    ).toBeVisible()

    await privacyTab.click()
    await expect(privacyTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { name: 'Dataskydd' })).toBeVisible()

    await archivingTab.click()
    await expect(archivingTab).toHaveAttribute('aria-selected', 'true')
    await expect(
      page.getByRole('heading', { name: 'Arkivering' }),
    ).toBeVisible()
  })
})

test.describe('AUTHZ-08/AUTH-06/AUTH-11: Admin Center tab permissions for Admin-only users', () => {
  test.use({
    storageState: ROLE_STORAGE_STATE.adminOnly,
    viewport: { height: 720, width: 1280 },
  })

  test('AUTHZ-08/AUTH-06/AUTH-11: shows Admin tabs while PrivacyOfficer-only tabs stay hidden', async ({
    page,
  }, testInfo) => {
    referenceManualCases(testInfo, 'AUTHZ-08', 'AUTH-06', 'AUTH-11')
    await page.goto('/sv/admin?tab=privacy')

    const columnsTab = page.getByRole('tab', { name: 'Kolumner' })
    const identityTab = page.getByRole('tab', { name: 'Identitet' })
    const accessReviewTab = page.getByRole('tab', {
      name: 'Behörighetsöversyn',
    })
    const actionLogTab = page.getByRole('tab', { name: 'Åtgärdslogg' })

    await expect(columnsTab).toHaveAttribute('aria-selected', 'true')
    await expect(identityTab).toBeVisible()
    await expect(accessReviewTab).toBeVisible()
    await expect(actionLogTab).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Arkivering' })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Dataskydd' })).toHaveCount(0)
    await expect(
      page.getByText(
        'Du saknar behörighet till den begärda fliken. Kolumner visas i stället.',
      ),
    ).toBeVisible()

    await identityTab.click()
    await expect(identityTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { name: 'Identitet' })).toBeVisible()

    await accessReviewTab.click()
    await expect(accessReviewTab).toHaveAttribute('aria-selected', 'true')
    await expect(
      page.getByRole('heading', { name: 'Behörighetsöversyn' }),
    ).toBeVisible()

    await actionLogTab.click()
    await expect(actionLogTab).toHaveAttribute('aria-selected', 'true')
    await expect(
      page.getByRole('heading', { name: 'Åtgärdslogg' }),
    ).toBeVisible()
  })
})
