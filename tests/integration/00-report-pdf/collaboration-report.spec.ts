import { Buffer } from 'node:buffer'
import { expect, type Locator, type Page, test } from '@playwright/test'
import {
  getRequirementRowButton,
  resolveRequirementDetailPane,
} from '../requirements/requirement-detail-test-helpers'

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
}) => {
  const requirementUniqueId = 'PWT-SPEC-EDIT-SOURCE'
  const detailPane = await openRequirementDetail(page, requirementUniqueId)

  await detailPane.getByRole('button', { name: 'Rapporter' }).click()
  const suggestionHistoryMenuItem = page.getByRole('menuitem', {
    name: 'Förbättringsförslagshistorik',
  })
  await expect(suggestionHistoryMenuItem).toHaveCount(1)

  const downloadPromise = page.waitForEvent('download')
  await suggestionHistoryMenuItem.click()
  const pdfDownload = await downloadPromise

  expect(pdfDownload.suggestedFilename()).toContain(requirementUniqueId)
  expect(pdfDownload.suggestedFilename()).toMatch(/\.pdf$/u)
  const pdfStream = await pdfDownload.createReadStream()
  if (!pdfStream) {
    throw new Error('Suggestion-history PDF download did not expose a stream.')
  }

  const chunks: Buffer[] = []
  for await (const chunk of pdfStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  expect(Buffer.concat(chunks).subarray(0, 4).toString('utf8')).toBe('%PDF')
})
