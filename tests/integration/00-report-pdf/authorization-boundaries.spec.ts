import { expect, test } from '@playwright/test'
import {
  expectOk,
  expectStatus,
  newRoleContext,
  type RequirementListResponse,
  referenceManualCases,
} from '../authorization/authorization-test-helpers'

test('REQ-10/LIFE-11/SPEC-10d/AUTH-10/AUTH-11: report PDFs enforce published and history boundaries', async ({
  browserName: _browserName,
}, testInfo) => {
  referenceManualCases(
    testInfo,
    'REQ-10',
    'LIFE-11',
    'SPEC-10d',
    'AUTH-10',
    'AUTH-11',
  )
  const noRoles = await newRoleContext(testInfo, 'noRoles')

  try {
    const requirementsResponse = await noRoles.get(
      '/api/requirements?limit=1&locale=sv&statuses=3',
    )
    await expectOk(requirementsResponse, 'published requirements list')
    const requirements =
      (await requirementsResponse.json()) as RequirementListResponse
    const publishedRequirement = requirements.requirements[0]
    expect(publishedRequirement).toBeDefined()

    const listPdfResponse = await noRoles.get(
      `/sv/requirements/reports/pdf/list?ids=${publishedRequirement.id}`,
    )
    await expectOk(listPdfResponse, 'published requirement list PDF')
    expect(listPdfResponse.headers()['content-type']).toContain(
      'application/pdf',
    )

    const historyUrls = [
      [
        `/sv/requirements/reports/pdf/history/${publishedRequirement.id}`,
        'history PDF without history access',
      ],
      [
        `/sv/requirements/reports/pdf/review/${publishedRequirement.id}`,
        'review PDF without history access',
      ],
      [
        `/sv/requirements/reports/pdf/suggestion-history/${publishedRequirement.id}`,
        'suggestion history PDF without history access',
      ],
      [
        `/sv/requirements/reports/pdf/review-combined?ids=${publishedRequirement.id}`,
        'combined review PDF without history access',
      ],
    ] as const

    for (const [url, label] of historyUrls) {
      await expectStatus(await noRoles.get(url), 403, label)
    }

    await expectStatus(
      await noRoles.get(
        '/sv/specifications/ETJANST-UPP-2026/reports/pdf/procurement',
      ),
      403,
      'unassigned specification profile PDF',
    )
  } finally {
    await noRoles.dispose()
  }
})
