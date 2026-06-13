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

test('AUTH-06/AUTH-10/AUTH-11: Admin keeps admin powers without PrivacyOfficer or Reviewer powers', async ({
  browserName: _browserName,
}, testInfo) => {
  referenceManualCases(testInfo, 'AUTH-06', 'AUTH-10', 'AUTH-11')
  const adminOnly = await newRoleContext(testInfo, 'adminOnly')

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
      await adminOnly.post('/api/requirement-transitions/PWT0005', {
        data: { statusId: STATUS_ARCHIVED },
      }),
      403,
      'admin-only reviewer lifecycle decision',
    )
  } finally {
    await adminOnly.dispose()
  }
})

test.describe('AUTH-06/AUTH-11: Admin Center tab permissions for Admin-only users', () => {
  test.use({
    storageState: ROLE_STORAGE_STATE.adminOnly,
    viewport: { height: 720, width: 1280 },
  })

  test('enables Admin tabs while PrivacyOfficer tabs stay disabled', async ({
    page,
  }, testInfo) => {
    referenceManualCases(testInfo, 'AUTH-06', 'AUTH-11')
    await page.goto('/sv/admin?tab=privacy')

    const columnsTab = page.getByRole('tab', { name: 'Kolumner' })
    const identityTab = page.getByRole('tab', { name: 'Identitet' })
    const accessReviewTab = page.getByRole('tab', {
      name: 'Behörighetsöversyn',
    })
    const archivingTab = page.getByRole('tab', { name: 'Arkivering' })
    const privacyTab = page.getByRole('tab', { name: 'Dataskydd' })
    const actionLogTab = page.getByRole('tab', { name: 'Åtgärdslogg' })

    await expect(columnsTab).toHaveAttribute('aria-selected', 'true')
    await expect(identityTab).not.toHaveAttribute('aria-disabled', 'true')
    await expect(accessReviewTab).not.toHaveAttribute('aria-disabled', 'true')
    await expect(actionLogTab).not.toHaveAttribute('aria-disabled', 'true')
    await expect(archivingTab).toHaveAttribute('aria-disabled', 'true')
    await expect(privacyTab).toHaveAttribute('aria-disabled', 'true')
    await expect(privacyTab).toHaveAttribute('title', /Dataskyddshandläggare/)
  })
})
