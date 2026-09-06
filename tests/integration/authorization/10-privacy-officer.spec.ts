// cSpell:ignore linneab
import { expect, type Page, test } from '@playwright/test'
import { DESKTOP_VIEWPORT } from '../../helpers/desktop-viewport'
import {
  expectOk,
  expectStatus,
  HSA,
  newRoleContext,
  ROLE_STORAGE_STATE,
  referenceManualCases,
} from './authorization-test-helpers'

let fixture: { areaId: number; packageId: number }
const PRIVACY_PREVIEW_TARGET_HSA_ID = 'SE5560000001-linneab'

async function waitForPrivacyPanelHydration(page: Page) {
  const targetInput = page.getByRole('textbox', {
    name: 'HSA-id att söka efter',
  })
  const previewButton = page.getByRole('button', { name: 'Förhandsgranska' })

  await expect(async () => {
    await targetInput.fill('SE5560000001-hydration')
    await expect(previewButton).toBeEnabled({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })

  await targetInput.fill('')
  await expect(previewButton).toBeDisabled()
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
  const admin = await newRoleContext(testInfo, 'admin')

  try {
    const [areasResponse, packagesResponse] = await Promise.all([
      admin.get('/api/requirement-areas'),
      admin.get('/api/requirement-packages'),
    ])
    await expectOk(areasResponse, 'find requirement area authorization target')
    await expectOk(
      packagesResponse,
      'find requirement package authorization target',
    )

    const { areas } = (await areasResponse.json()) as {
      areas: Array<{ id: number }>
    }
    const { requirementPackages } = (await packagesResponse.json()) as {
      requirementPackages: Array<{ id: number }>
    }
    const areaId = areas[0]?.id
    const packageId = requirementPackages[0]?.id
    if (!areaId || !packageId) {
      throw new Error(
        'PrivacyOfficer authorization tests require seeded area and package targets',
      )
    }
    fixture = { areaId, packageId }
  } finally {
    await admin.dispose()
  }
})

test('AUTHZ-10/AUTH-07/AUTH-11: PrivacyOfficer users can use privacy and access review without action log', async ({
  browserName: _browserName,
}, testInfo) => {
  referenceManualCases(testInfo, 'AUTHZ-10', 'AUTH-07', 'AUTH-11')
  const privacyOfficer = await newRoleContext(testInfo, 'privacyOfficer')

  try {
    await expectOk(
      await privacyOfficer.get('/api/admin/access-reviews'),
      'privacy officer access-review list',
    )
    await expectOk(
      await privacyOfficer.post('/api/privacy/erasure-preview', {
        data: { target: { hsaId: HSA.areaOwner } },
      }),
      'privacy officer privacy preview',
    )
    await expectStatus(
      await privacyOfficer.get('/api/admin/audit-events'),
      403,
      'privacy officer action log read',
    )
    await expectStatus(
      await privacyOfficer.put(`/api/requirement-areas/${fixture.areaId}`, {
        data: {
          description: 'PrivacyOfficer must not change area responsibility.',
        },
      }),
      403,
      'privacy officer requirement area update',
    )
    await expectStatus(
      await privacyOfficer.put(
        `/api/requirement-packages/${fixture.packageId}`,
        {
          data: {
            purposeAndScope:
              'PrivacyOfficer must not change package responsibility.',
          },
        },
      ),
      403,
      'privacy officer requirement package update',
    )
  } finally {
    await privacyOfficer.dispose()
  }
})

test.describe('AUTHZ-10/AUTH-07/AUTH-11: PrivacyOfficer users can run the cross-user privacy flow', () => {
  test.use({
    storageState: ROLE_STORAGE_STATE.privacyOfficer,
    viewport: DESKTOP_VIEWPORT,
  })

  test('AUTHZ-10/AUTH-07/AUTH-11: previews and exports another person from Admin Center privacy', async ({
    page,
  }, testInfo) => {
    referenceManualCases(testInfo, 'AUTHZ-10', 'AUTH-07', 'AUTH-11')
    await page.goto('/sv/admin?tab=privacy')
    await waitForPrivacyPanelHydration(page)

    await expect(page.getByRole('tab', { name: 'Dataskydd' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByRole('heading', { name: 'Dataskydd' })).toBeVisible()

    const previewResponsePromise = page.waitForResponse(
      response =>
        response.url().includes('/api/privacy/erasure-preview') &&
        response.request().method() === 'POST',
    )

    await page
      .getByRole('textbox', { name: 'HSA-id att söka efter' })
      .fill(PRIVACY_PREVIEW_TARGET_HSA_ID)
    await page.getByRole('button', { name: 'Förhandsgranska' }).click()

    const previewResponse = await previewResponsePromise
    expect(previewResponse.ok()).toBe(true)

    await expect(
      page.getByRole('button', { name: 'Exportera JSON' }),
    ).toBeVisible()

    const exportResponsePromise = page.waitForResponse(
      response =>
        response.url().includes('/api/privacy/data-subject-export') &&
        response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Exportera JSON' }).click()

    const exportResponse = await exportResponsePromise
    expect(exportResponse.ok()).toBe(true)
    expect(exportResponse.request().postDataJSON()).toMatchObject({
      delivery: 'json',
      target: { hsaId: PRIVACY_PREVIEW_TARGET_HSA_ID },
    })
    await expect(page.getByText(/^Kunde inte exportera data:/u)).toHaveCount(0)
  })
})

test.describe('AUTHZ-10/AUTH-07/AUTH-11: Admin Center tab permissions for PrivacyOfficer users', () => {
  test.use({
    storageState: ROLE_STORAGE_STATE.privacyOfficer,
    viewport: DESKTOP_VIEWPORT,
  })

  test('AUTHZ-10/AUTH-07/AUTH-11: shows privacy tabs while Admin-only tabs stay hidden', async ({
    page,
  }, testInfo) => {
    referenceManualCases(testInfo, 'AUTHZ-10', 'AUTH-07', 'AUTH-11')
    await page.goto('/sv/admin?tab=actionAuditLog')

    const accessReviewTab = page.getByRole('tab', {
      name: 'Behörighetsöversyn',
    })
    const archivingTab = page.getByRole('tab', { name: 'Arkivering' })
    const privacyTab = page.getByRole('tab', { name: 'Dataskydd' })
    await expect(accessReviewTab).toHaveAttribute('aria-selected', 'true')
    await expect(archivingTab).toBeVisible()
    await expect(privacyTab).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Kolumner' })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Identitet' })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Åtgärdslogg' })).toHaveCount(0)
    await expect(
      page.getByText(
        'Du saknar behörighet till den begärda fliken. Behörighetsöversyn visas i stället.',
      ),
    ).toBeVisible()
  })
})
