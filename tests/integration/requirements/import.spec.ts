import { readFile } from 'node:fs/promises'
import { expect, type Route, test } from '@playwright/test'
import { escapeRegExp } from '@/tests/helpers/common'

const importedDescription =
  'Playwright importerat krav ska kunna granskas och importeras.'

// cSpell:ignore SOSFS
const validImportPayload = {
  proposedNormReferences: [
    {
      issuer: 'Socialstyrelsen',
      key: 'SOSFS-IMPORT-1',
      name: 'Importreferens',
      normReferenceId: 'SOSFS-IMPORT-1',
      reference: '3 kap. 1 §',
      type: 'Föreskrift',
      uri: 'https://example.test/norm',
      version: '2026',
    },
  ],
  requirements: [
    {
      description: importedDescription,
      proposedNormReferenceKeys: ['SOSFS-IMPORT-1'],
      verifiable: true,
      typeId: 1,
      verificationMethod: 'Demonstration',
    },
  ],
  schemaVersion: 'requirement-import.v3',
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    contentType: 'application/json',
    json: body,
    status,
  })
}

test.describe('Requirements import', () => {
  test.use({ viewport: { height: 760, width: 1280 } })

  test('REQ-17: imports a reviewed requirement JSON into a selected requirement area', async ({
    page,
  }) => {
    const artifactDownloads: string[] = []
    const previewRequests: unknown[] = []
    const executeRequests: unknown[] = []

    await page.route('**/api/requirements/import/schema?*', async route => {
      artifactDownloads.push('schema')
      await fulfillJson(route, {
        schema: 'requirement-import.v3',
      })
    })
    await page.route(
      '**/api/requirements/import/instruction?*',
      async route => {
        artifactDownloads.push('instruction')
        await route.fulfill({
          body: 'Importinstruktion för kravimport.',
          contentType: 'text/markdown;charset=utf-8',
        })
      },
    )
    await page.route('**/api/requirements/import/preview', async route => {
      previewRequests.push(route.request().postDataJSON())
      await fulfillJson(route, {
        previewToken: 'library-import-preview-token',
        proposals: [
          {
            issuer: 'Socialstyrelsen',
            key: 'SOSFS-IMPORT-1',
            name: 'Importreferens',
            normReferenceId: 'SOSFS-IMPORT-1',
            reference: '3 kap. 1 §',
            referencedCount: 1,
            resolvedNormReferenceDbId: 1,
            type: 'Föreskrift',
            uri: 'https://example.test/norm',
            version: '2026',
            warnings: [],
          },
        ],
        rows: [
          {
            errors: [],
            infos: [],
            labels: {
              category: null,
              priorityLevel: null,
              qualityCharacteristic: null,
              type: 'Funktionellt',
            },
            proposedNormReferenceKeys: ['SOSFS-IMPORT-1'],
            reviewRowId: 'import-row-1',
            selected: true,
            sourceIndex: 0,
            values: {
              acceptanceCriteria: null,
              categoryId: null,
              description: importedDescription,
              needsReferenceId: null,
              normReferenceIds: [1],
              priorityLevelId: null,
              qualityCharacteristicId: null,
              requirementPackageIds: [],
              verifiable: true,
              typeId: 1,
              verificationMethod: 'Demonstration',
            },
            warnings: [],
          },
        ],
        summary: { errorCount: 0, rowCount: 1, warningCount: 0 },
      })
    })
    await page.route('**/api/requirements/import/execute', async route => {
      executeRequests.push(route.request().postDataJSON())
      await fulfillJson(route, {
        createdRows: [
          {
            acceptanceCriteria: null,
            categoryName: null,
            createdDatabaseId: 9001,
            createdVisibleId: 'PWI9001',
            description: importedDescription,
            importMode: 'library',
            needsReferenceId: null,
            normReferences: ['SOSFS-IMPORT-1 - Importreferens'],
            priorityLevelName: null,
            qualityCharacteristicName: null,
            requirementPackageNames: [],
            verifiable: true,
            sourceIndex: 0,
            targetAreaId: 1,
            targetSpecificationId: null,
            typeName: 'Funktionellt',
            verificationMethod: 'Demonstration',
          },
        ],
        summary: { createdCount: 1 },
      })
    })

    const dialog = page.getByRole('dialog', { name: 'Importera krav' })
    const previewButton = dialog.getByRole('button', {
      name: 'Förhandsgranska krav',
    })
    let selectedAreaId: number | null = null
    let selectedAreaDialogName = /Importera krav för/

    await test.step('open import and download supporting artifacts', async () => {
      await page.goto('/sv/requirements')

      const importButton = page.getByRole('button', { name: 'Importera krav' })
      const exportButton = page.getByRole('button', { name: 'Exportera' })
      const columnsButton = page.getByRole('button', { name: 'Kolumner' })
      await expect(importButton).toBeVisible()
      await expect(exportButton).toBeVisible()
      await expect(columnsButton).toBeVisible()
      const actionIds = await page
        .locator(
          '[data-floating-action-rail-placement="fixed-right"] [data-floating-action-group="primary"] [data-floating-action-item="true"]',
        )
        .evaluateAll(elements =>
          elements.map(element =>
            element.getAttribute('data-floating-action-id'),
          ),
        )
      expect(actionIds.indexOf('import')).toBeLessThan(
        actionIds.indexOf('export'),
      )
      expect(actionIds.indexOf('columns')).toBeGreaterThan(
        actionIds.indexOf('export'),
      )

      await importButton.click()
      await expect(dialog).toHaveCount(1)

      await dialog.getByRole('button', { name: 'Ladda ner schema' }).click()
      await dialog
        .getByRole('button', { name: 'Ladda ner importinstruktion' })
        .click()
      await expect
        .poll(() => artifactDownloads.sort())
        .toEqual(['instruction', 'schema'])
      await expect(
        dialog.getByText(
          /Importinstruktionen är bara formatdelen och referensdata för import/,
        ),
      ).toHaveCount(1)
    })

    await test.step('validate JSON and select a requirement area', async () => {
      await expect(previewButton).toBeDisabled()
      await expect(
        dialog.getByText(/Välj kravområde och lägg till import-JSON/),
      ).toHaveCount(1)

      await dialog.getByLabel('Import-JSON').fill(
        JSON.stringify({
          ...validImportPayload,
          requirements: [
            {
              ...validImportPayload.requirements[0],
              areaId: 1,
            },
          ],
        }),
      )
      await expect(
        dialog.getByText(/JSON följer inte importschemat/),
      ).toHaveCount(1)

      const areaSelect = dialog.getByLabel('Kravområde')
      const [selectedAreaValue] = await areaSelect.selectOption({ index: 1 })
      const parsedSelectedAreaId = Number(selectedAreaValue)
      if (!Number.isInteger(parsedSelectedAreaId) || parsedSelectedAreaId < 1) {
        throw new Error(
          `Expected selected requirement area to have a numeric id, got "${selectedAreaValue}".`,
        )
      }
      selectedAreaId = parsedSelectedAreaId
      const selectedAreaName = await areaSelect
        .locator('option:checked')
        .textContent()
      const selectedAreaTitleName = selectedAreaName
        ?.trim()
        .replace(/^\S+\s+/, '')
      selectedAreaDialogName = new RegExp(
        `Importera krav för ${escapeRegExp(selectedAreaTitleName ?? '')}`,
      )
      await dialog
        .getByLabel('Import-JSON')
        .fill(JSON.stringify(validImportPayload))
      await expect(previewButton).toBeEnabled()
    })

    await test.step('preview the selected import rows', async () => {
      await previewButton.click()

      await expect(page.getByLabel(/Import-JSON/)).toHaveCount(0)
      await expect(
        page.getByRole('dialog', {
          name: selectedAreaDialogName,
        }),
      ).toHaveCount(1)
      await expect(page.getByRole('tab', { name: /Krav 1/ })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await expect(
        page.getByRole('tab', { name: /Föreslagna normreferenser 1/ }),
      ).toHaveCount(1)
      await expect(
        page.getByRole('button', { name: 'Kollapsa alla' }),
      ).toBeDisabled()
      await expect(
        page.getByRole('button', { name: 'Expandera alla' }),
      ).toBeEnabled()
    })

    await test.step('review imported requirement and norm reference details', async () => {
      await page
        .getByRole('button', { exact: true, name: 'Expandera rad #1' })
        .click()
      const reviewDialog = page.getByRole('dialog', {
        name: selectedAreaDialogName,
      })
      await expect(
        reviewDialog.getByRole('textbox', { name: 'Kravtext *' }),
      ).toHaveValue(importedDescription)
      await expect(reviewDialog.getByLabel('Verifieringsmetod')).toHaveValue(
        'Demonstration',
      )
      const typeBox = await reviewDialog.getByLabel('Typ').boundingBox()
      const qualityBox = await reviewDialog
        .getByLabel('Kvalitetsegenskap')
        .boundingBox()
      expect(typeBox).not.toBeNull()
      expect(qualityBox).not.toBeNull()
      expect(typeBox?.y ?? 0).toBeLessThanOrEqual(qualityBox?.y ?? 0)

      await page
        .getByRole('tab', { name: /Föreslagna normreferenser 1/ })
        .click()
      await expect(reviewDialog.getByText('SOSFS-IMPORT-1')).toHaveCount(1)
      await expect(reviewDialog.getByText('Löst')).toHaveCount(1)
      await expect(reviewDialog.getByText('Importreferens')).toHaveCount(1)
    })

    await test.step('execute the selected import', async () => {
      await page.getByRole('tab', { name: /Krav 1/ }).click()
      await page.getByRole('button', { name: 'Importera valda' }).click()

      await expect.poll(() => executeRequests.length).toBe(1)
      if (selectedAreaId == null) {
        throw new Error('No requirement area id was captured before import.')
      }
      expect(previewRequests[0]).toMatchObject({
        locale: 'sv',
        payload: validImportPayload,
      })
      expect(executeRequests[0]).toMatchObject({
        areaId: selectedAreaId,
        locale: 'sv',
        previewToken: 'library-import-preview-token',
        rows: [
          {
            description: importedDescription,
            normReferenceIds: [1],
            reviewRowId: 'import-row-1',
            sourceIndex: 0,
            verificationMethod: 'Demonstration',
          },
        ],
      })
      await expect(page.getByText(/Importerade rader: 1/)).toHaveCount(1)
      await expect(page.getByRole('status')).toHaveText('Importerade rader: 1')
      const receiptDownloadPromise = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Ladda ner CSV-kvitto' }).click()
      const receiptDownload = await receiptDownloadPromise
      expect(receiptDownload.suggestedFilename()).toBe(
        'requirements-import-receipt.csv',
      )
      const receiptPath = await receiptDownload.path()
      if (!receiptPath) {
        throw new Error('CSV receipt download did not expose a local path.')
      }
      const receiptCsv = await readFile(receiptPath, 'utf8')
      expect(receiptCsv).toContain(
        'importMode,sourceIndex,createdVisibleId,createdDatabaseId,description',
      )
      expect(receiptCsv).toContain('"library","0","PWI9001","9001"')
      expect(receiptCsv).toContain(`"${importedDescription}"`)
      expect(receiptCsv).toContain(
        '"SOSFS-IMPORT-1 - Importreferens","true","Demonstration","1"',
      )
    })
  })
})
