import { expect, type Locator, type Page, test } from '@playwright/test'
import { newRoleContext } from '../authorization/authorization-test-helpers'

interface APIResponseLike {
  body(): Promise<Buffer>
  headers(): Record<string, string>
  ok(): boolean
  status(): number
  text(): Promise<string>
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function expectOk(response: APIResponseLike, context: string) {
  if (response.ok()) return
  throw new Error(
    `${context} failed with ${response.status()}: ${await response.text()}`,
  )
}

async function openRequirementDetail(
  page: Page,
  uniqueId: string,
): Promise<Locator> {
  await page.goto(`/sv/requirements?selected=${encodeURIComponent(uniqueId)}`)

  const rowButton = page.getByRole('button', {
    name: new RegExp(`^${escapeRegExp(uniqueId)}\\b`),
  })
  await expect(rowButton).toHaveCount(1)

  const detailPaneId = await rowButton.getAttribute('aria-controls')
  if (!detailPaneId) {
    throw new Error(`Requirement row ${uniqueId} has no detail pane target.`)
  }

  const detailPane = page.locator(`#${detailPaneId}`)
  await expect(detailPane).toHaveCount(1)
  return detailPane
}

test('COL-06: opens the suggestion-history report for a requirement with suggestions', async ({
  page,
}, testInfo) => {
  const requirementUniqueId = 'PWT-SPEC-EDIT-SOURCE'
  const reviewerRequest = await newRoleContext(testInfo, 'reviewer')
  const detailPane = await openRequirementDetail(page, requirementUniqueId)

  await detailPane.getByRole('button', { name: 'Rapporter' }).click()
  await expect(
    page.getByRole('menuitem', { name: 'Förbättringsförslagshistorik' }),
  ).toBeVisible()

  try {
    const directPdfResponse = await reviewerRequest.get(
      `/sv/requirements/reports/pdf/suggestion-history/${requirementUniqueId}`,
      { timeout: 30_000 },
    )
    await expectOk(directPdfResponse, 'GET suggestion-history PDF body')
    expect(directPdfResponse.headers()['content-type']).toContain(
      'application/pdf',
    )
    const contentDisposition =
      directPdfResponse.headers()['content-disposition'] ?? ''
    expect(contentDisposition).toContain(requirementUniqueId)
    expect(contentDisposition).toContain('.pdf')
    const pdfBody = await directPdfResponse.body()
    expect(pdfBody.subarray(0, 4).toString('utf8')).toBe('%PDF')
  } finally {
    await reviewerRequest.dispose()
  }
})
