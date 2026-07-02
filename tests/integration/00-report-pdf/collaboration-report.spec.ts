import { Buffer } from 'node:buffer'
import {
  type APIRequestContext,
  type APIResponse,
  type Download,
  expect,
  type Locator,
  type Page,
  type Response,
  type TestInfo,
  test,
} from '@playwright/test'
import { expectApiResponseOk } from '../api-response-assertions'
import {
  getRequirementRowButton,
  resolveRequirementDetailPane,
} from '../requirements/requirement-detail-test-helpers'

const PDF_EVENT_TIMEOUT_MS = 15_000
const RESPONSE_BODY_EXCERPT_LENGTH = 2_000

async function apiResponseBodyExcerpt(response: APIResponse): Promise<string> {
  const body = await response.text()
  return body.length > RESPONSE_BODY_EXCERPT_LENGTH
    ? `${body.slice(0, RESPONSE_BODY_EXCERPT_LENGTH)}...`
    : body
}

async function isNextDevNotFoundApiResponse(
  response: APIResponse,
): Promise<boolean> {
  if (response.status() !== 404) return false

  const contentType = response.headers()['content-type'] ?? ''
  return contentType.includes('text/html')
}

async function waitForReportRouteReady(
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

        if (!(await isNextDevNotFoundApiResponse(response))) {
          lastBodyExcerpt = null
          readyResponse = response
          return 'ready'
        }

        lastBodyExcerpt = await apiResponseBodyExcerpt(response)
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

function isSuggestionHistoryPdfResponse(response: Response): boolean {
  try {
    return new URL(response.url()).pathname.includes(
      '/requirements/reports/pdf/suggestion-history/',
    )
  } catch {
    return response
      .url()
      .includes('/requirements/reports/pdf/suggestion-history/')
  }
}

async function responseBodyExcerpt(response: Response): Promise<string | null> {
  try {
    const body = await response.text()
    return body.length > RESPONSE_BODY_EXCERPT_LENGTH
      ? `${body.slice(0, RESPONSE_BODY_EXCERPT_LENGTH)}...`
      : body
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `Unable to read response body: ${message}`
  }
}

async function attachPdfResponseDiagnostics({
  page,
  response,
  testInfo,
}: {
  page: Page
  response: Response
  testInfo: TestInfo
}): Promise<string | null> {
  const headers = response.headers()
  const bodyExcerpt = response.ok() ? null : await responseBodyExcerpt(response)
  const errorDialogText = await page
    .getByRole('alertdialog')
    .textContent({ timeout: 1_000 })
    .catch(() => null)

  await testInfo.attach('suggestion-history PDF response diagnostics', {
    body: JSON.stringify(
      {
        bodyExcerpt,
        contentDisposition: headers['content-disposition'] ?? null,
        contentType: headers['content-type'] ?? null,
        errorDialogText,
        pageUrl: page.url(),
        status: response.status(),
        statusText: response.statusText(),
        timestamp: new Date().toISOString(),
        url: response.url(),
      },
      null,
      2,
    ),
    contentType: 'application/json',
  })

  return bodyExcerpt
}

function downloadResult(
  promise: Promise<Download>,
): Promise<{ download: Download } | { error: unknown }> {
  return promise.then(download => ({ download })).catch(error => ({ error }))
}

async function openRequirementDetail(
  page: Page,
  uniqueId: string,
): Promise<Locator> {
  await page.goto(`/sv/requirements?selected=${encodeURIComponent(uniqueId)}`)

  const rowButton = getRequirementRowButton(page, uniqueId)
  await expect(rowButton).toHaveCount(1)

  const detailPane = await resolveRequirementDetailPane(
    page,
    rowButton,
    uniqueId,
  )
  await expect(detailPane).toHaveCount(1)
  return detailPane
}

async function getRequirementInternalId(
  request: APIRequestContext,
  uniqueId: string,
): Promise<number> {
  const response = await request.get(
    `/api/requirements/${encodeURIComponent(uniqueId)}`,
  )
  if (!response.ok()) {
    throw new Error(
      `GET requirement ${uniqueId} returned ${response.status()} ${response.statusText()}. Response body excerpt: ${await apiResponseBodyExcerpt(response)}`,
    )
  }

  const requirement = (await response.json()) as { id?: unknown }
  if (typeof requirement.id !== 'number') {
    throw new Error(`GET requirement ${uniqueId} did not return a numeric id.`)
  }
  return requirement.id
}

test('COL-06: opens the suggestion-history report for a requirement with suggestions', async ({
  page,
}, testInfo) => {
  const requirementUniqueId = 'PWT-SPEC-EDIT-SOURCE'
  const detailPane = await openRequirementDetail(page, requirementUniqueId)
  const requirementId =
    await test.step('resolve the internal requirement id used by the report menu', async () => {
      return getRequirementInternalId(page.request, requirementUniqueId)
    })
  const suggestionHistoryReportUrl = `/sv/requirements/reports/pdf/suggestion-history/${requirementId}`

  await test.step('wait for the suggestion-history PDF route to be ready', async () => {
    const response = await waitForReportRouteReady(
      page.request,
      suggestionHistoryReportUrl,
      'suggestion-history PDF',
    )
    await expectApiResponseOk(response, 'suggestion-history PDF')
    expect(response.headers()['content-type']).toContain('application/pdf')
  })

  const suggestionHistoryMenuItem =
    await test.step('open the suggestion-history report menu', async () => {
      await detailPane.getByRole('button', { name: 'Rapporter' }).click()
      const menuItem = page.getByRole('menuitem', {
        name: 'Förbättringsförslagshistorik',
      })
      await expect(menuItem).toHaveCount(1)
      return menuItem
    })

  const pdfDownload =
    await test.step('trigger the suggestion-history PDF download', async () => {
      const pdfResponsePromise = page.waitForResponse(
        isSuggestionHistoryPdfResponse,
        { timeout: PDF_EVENT_TIMEOUT_MS },
      )
      const pdfDownloadPromise = downloadResult(
        page.waitForEvent('download', { timeout: PDF_EVENT_TIMEOUT_MS }),
      )
      await suggestionHistoryMenuItem.click()
      const pdfResponse = await pdfResponsePromise

      if (!pdfResponse.ok()) {
        const bodyExcerpt = await attachPdfResponseDiagnostics({
          page,
          response: pdfResponse,
          testInfo,
        })

        throw new Error(
          [
            `Suggestion-history PDF request returned ${pdfResponse.status()} ${pdfResponse.statusText()}.`,
            `URL: ${pdfResponse.url()}.`,
            `Response body excerpt: ${bodyExcerpt ?? '<not captured>'}`,
          ].join(' '),
        )
      }

      const pdfDownloadResult = await pdfDownloadPromise
      if ('error' in pdfDownloadResult) {
        await attachPdfResponseDiagnostics({
          page,
          response: pdfResponse,
          testInfo,
        })
        const message =
          pdfDownloadResult.error instanceof Error
            ? pdfDownloadResult.error.message
            : String(pdfDownloadResult.error)
        throw new Error(
          `Suggestion-history PDF response succeeded but no download event fired: ${message}`,
        )
      }
      return pdfDownloadResult.download
    })

  await test.step('verify the suggestion-history PDF download', async () => {
    expect(pdfDownload.suggestedFilename()).toContain(requirementUniqueId)
    expect(pdfDownload.suggestedFilename()).toMatch(/\.pdf$/u)
    const pdfStream = await pdfDownload.createReadStream()
    if (!pdfStream) {
      throw new Error(
        'Suggestion-history PDF download did not expose a stream.',
      )
    }

    const chunks: Buffer[] = []
    for await (const chunk of pdfStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    expect(Buffer.concat(chunks).subarray(0, 4).toString('utf8')).toBe('%PDF')
  })
})
