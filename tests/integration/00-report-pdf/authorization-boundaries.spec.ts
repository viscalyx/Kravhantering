import {
  type APIRequestContext,
  type APIResponse,
  expect,
  test,
} from '@playwright/test'
import {
  expectOk,
  expectStatus,
  newRoleContext,
  type RequirementListResponse,
  referenceManualCases,
} from '../authorization/authorization-test-helpers'

const RESPONSE_BODY_EXCERPT_LENGTH = 2_000

async function responseBodyExcerpt(response: APIResponse): Promise<string> {
  const body = await response.text()
  return body.length > RESPONSE_BODY_EXCERPT_LENGTH
    ? `${body.slice(0, RESPONSE_BODY_EXCERPT_LENGTH)}...`
    : body
}

async function isNextDevNotFoundResponse(
  response: APIResponse,
): Promise<boolean> {
  if (response.status() !== 404) return false

  const contentType = response.headers()['content-type'] ?? ''
  return contentType.includes('text/html')
}

async function getAfterReportRouteReady(
  request: APIRequestContext,
  url: string,
  label: string,
): Promise<APIResponse> {
  let lastStatus: number | null = null
  let lastBodyExcerpt: string | null = null
  let readyResponse: APIResponse | null = null

  await expect
    .poll(
      async () => {
        const response = await request.get(url)
        lastStatus = response.status()

        if (!(await isNextDevNotFoundResponse(response))) {
          lastBodyExcerpt = null
          readyResponse = response
          return 'ready'
        }

        lastBodyExcerpt = await responseBodyExcerpt(response)
        return 'next-dev-not-found'
      },
      {
        message: `${label} route should resolve after Next dev route compilation`,
        timeout: 20_000,
      },
    )
    .toBe('ready')

  if (!readyResponse) {
    throw new Error(
      `${label} did not return a response after route-ready polling. Last status: ${lastStatus}; previous body excerpt: ${lastBodyExcerpt ?? '<not captured>'}`,
    )
  }
  return readyResponse
}

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

    const listPdfResponse = await getAfterReportRouteReady(
      noRoles,
      `/sv/requirements/reports/pdf/list?ids=${publishedRequirement.id}`,
      'published requirement list PDF',
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
      await expectStatus(
        await getAfterReportRouteReady(noRoles, url, label),
        403,
        label,
      )
    }

    await expectStatus(
      await getAfterReportRouteReady(
        noRoles,
        '/sv/specifications/8/reports/pdf/procurement',
        'unassigned specification profile PDF',
      ),
      403,
      'unassigned specification profile PDF',
    )
  } finally {
    await noRoles.dispose()
  }
})
