import { Buffer } from 'node:buffer'
import {
  type Download,
  expect,
  type Locator,
  type Page,
  type Response,
  type TestInfo,
  test,
} from '@playwright/test'
import {
  getRequirementRowButton,
  resolveRequirementDetailPane,
} from '../requirements/requirement-detail-test-helpers'

const PDF_EVENT_TIMEOUT_MS = 15_000
const RESPONSE_BODY_EXCERPT_LENGTH = 2_000

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

test('COL-06: opens the suggestion-history report for a requirement with suggestions', async ({
  page,
}, testInfo) => {
  const requirementUniqueId = 'PWT-SPEC-EDIT-SOURCE'
  const detailPane = await openRequirementDetail(page, requirementUniqueId)

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
