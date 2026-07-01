import { expect, test } from '@playwright/test'
import {
  type AuthorizationFixture,
  createAuthorizationFixture,
  type DataSubjectExportResponse,
  expectOk,
  expectStatus,
  HSA,
  newRoleContext,
  type RequirementPackageResponse,
  ROLE_STORAGE_STATE,
  referenceManualCases,
} from './authorization-test-helpers'

let fixture: AuthorizationFixture

test.describe.configure({ mode: 'serial' })
test.use({
  storageState: ROLE_STORAGE_STATE.packageCoauthor,
  viewport: { height: 720, width: 1280 },
})

test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
  fixture = await createAuthorizationFixture(testInfo)
})

test('AUTHZ-07/AUTH-10/AUTH-11: requirement package co-authors are exported but cannot manage packages', async ({
  page,
}, testInfo) => {
  referenceManualCases(testInfo, 'AUTHZ-07', 'AUTH-10', 'AUTH-11')
  const packageCoauthor = await newRoleContext(testInfo, 'packageCoauthor')

  try {
    await page.goto('/sv/requirements/stewardship?tab=packages')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Kravpaket' }),
    ).toBeVisible()
    await page
      .getByRole('textbox', {
        name: 'Filtrera på namn eller beskrivning',
      })
      .fill(fixture.packageName)
    const row = page.getByRole('row', { name: new RegExp(fixture.packageName) })
    await expect(row).toBeVisible()
    await expect(row).toContainText('Leo PackageLead')
    await row.getByRole('button', { name: 'Redigera' }).click()

    const dialog = page.getByRole('dialog', { name: 'Redigera kravpaket' })
    await expect(dialog).toBeVisible()
    await dialog
      .getByRole('textbox', { name: 'Syfte och avgränsning' })
      .fill('Package co-author must not update metadata.')
    await dialog.getByRole('button', { name: 'Spara' }).click()
    await expect(dialog.getByRole('alert')).toContainText('Forbidden')

    const readResponse = await packageCoauthor.get(
      `/api/requirement-packages/${fixture.packageId}`,
    )
    await expectOk(readResponse, 'package co-author package read')
    const packagePayload = (await readResponse.json()) as {
      requirementPackage: RequirementPackageResponse
    }

    expect(
      packagePayload.requirementPackage.coAuthors?.map(
        coAuthor => coAuthor.hsaId,
      ),
    ).toContain(HSA.packageCoauthor)

    await expectStatus(
      await packageCoauthor.put(
        `/api/requirement-packages/${fixture.packageId}`,
        {
          data: {
            purposeAndScope: 'Package co-author must not update metadata.',
          },
        },
      ),
      403,
      'package co-author update',
    )

    const exportResponse = await packageCoauthor.post(
      '/api/privacy/data-subject-export',
      {
        data: { delivery: 'json', locale: 'sv' },
      },
    )
    await expectOk(exportResponse, 'package co-author self privacy export')
    const exportPayload =
      (await exportResponse.json()) as DataSubjectExportResponse

    expect(exportPayload.subject.hsaId).toBe(HSA.packageCoauthor)
    expect(exportPayload.sources.map(source => source.key)).toContain(
      'requirement_package_co_authors.hsa_id',
    )
  } finally {
    await packageCoauthor.dispose()
  }
})
