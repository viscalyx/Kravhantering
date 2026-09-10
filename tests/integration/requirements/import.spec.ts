import { readFile } from 'node:fs/promises'
import { expect, type Route, test } from '@playwright/test'
import { buildRequirementsImportJsonSchema } from '@/lib/requirements/import-schema'
import { escapeRegExp } from '@/tests/helpers/common'
import { DESKTOP_VIEWPORT } from '../../helpers/desktop-viewport'

const importedDescription =
  '=Playwright importerat krav ska kunna granskas och importeras.'

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
  schemaVersion: 'requirement-import.v4',
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    contentType: 'application/json',
    json: body,
    status,
  })
}

test.describe('Requirements import', () => {
  test.use({ viewport: DESKTOP_VIEWPORT })

  test('REQ-17: imports a reviewed requirement JSON into a selected requirement area', async ({
    page,
  }) => {
    const artifactDownloads: string[] = []
    const previewRequests: unknown[] = []
    const executeRequests: unknown[] = []

    await page.route('**/api/requirements/import/schema?*', async route => {
      artifactDownloads.push('schema')
      await fulfillJson(route, buildRequirementsImportJsonSchema('sv'))
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
              priorityLevel: 'Låg',
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
              priorityLevelId: 2,
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
            priorityLevelName: 'P2 – Låg',
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
    const importButton = page.getByRole('button', { name: 'Importera krav' })
    let selectedAreaId: number | null = null
    let selectedAreaDialogName = /Importera krav för/

    await test.step('open import and download supporting artifacts', async () => {
      await page.goto('/sv/requirements')

      const exportButton = page.getByRole('button', { name: 'Exportera' })
      const columnsButton = page.getByRole('button', { name: 'Kolumner' })
      await expect(importButton).toBeVisible()
      await expect(exportButton).toBeVisible()
      await expect(columnsButton).toBeVisible()

      await importButton.click()
      await expect(dialog).toHaveCount(1)
      await expect(dialog.locator(':focus')).toHaveCount(1)

      await dialog.getByRole('button', { name: 'Stäng' }).click()
      await expect(dialog).toHaveCount(0)
      await expect(importButton).toBeFocused()

      await importButton.click()
      await expect(dialog).toHaveCount(1)
      await expect(dialog.getByLabel('Import-JSON')).toHaveValue('')

      await dialog.getByRole('button', { name: 'Ladda ner schema' }).click()
      await dialog
        .getByRole('button', { name: 'Ladda ner importinstruktion' })
        .click()
      await expect
        .poll(() => ({
          instruction: artifactDownloads.includes('instruction'),
          schema: artifactDownloads.includes('schema'),
        }))
        .toEqual({ instruction: true, schema: true })
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
      const priorityBadge = page
        .getByRole('dialog', { name: selectedAreaDialogName })
        .locator('.status-badge')
        .filter({ hasText: 'P2 – Låg' })
      await expect(priorityBadge).toHaveCount(1)
      await expect(priorityBadge).toHaveText('P2 – Låg')
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
      await expect(
        page.getByRole('status').filter({ hasText: 'Importerade rader: 1' }),
      ).toHaveText('Importerade rader: 1')
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
      expect(receiptCsv).toBe(
        `\uFEFFimportMode,sourceIndex,createdVisibleId,createdDatabaseId,description,acceptanceCriteria,category,type,qualityCharacteristic,priorityLevel,requirementPackages,normReferences,verifiable,verificationMethod,targetAreaId,targetSpecificationId,needsReferenceId\n"library","0","PWI9001","9001","'${importedDescription}",,,"Funktionellt",,"P2 – Låg","","SOSFS-IMPORT-1 - Importreferens","true","Demonstration","1",,\n`,
      )

      const refreshedRequirements = page.waitForRequest(request => {
        const url = new URL(request.url())
        return (
          request.method() === 'GET' && url.pathname === '/api/requirements'
        )
      })
      await dialog.getByRole('button', { name: 'Stäng' }).click()
      await refreshedRequirements
      await expect(dialog).toHaveCount(0)
      await expect(importButton).toBeFocused()
    })
  })
  test('REQ-17a: downloads edited remaining candidates and reopens with changed reference data', async ({
    page,
  }) => {
    const previewRequests: Array<{
      payload: { requirements: Array<{ description: string }> }
    }> = []
    const proposal = {
      issuer: 'Issuer',
      key: 'pending',
      name: 'Pending standard',
      normReferenceId: null,
      reference: 'Article 2',
      type: 'Standard',
      uri: null,
      version: null,
    }
    const values = {
      acceptanceCriteria: null,
      categoryId: null,
      description: 'Original candidate',
      needsReferenceId: null,
      normReferenceIds: [42],
      priorityLevelId: null,
      qualityCharacteristicId: null,
      requirementPackageIds: [],
      typeId: 1,
      verifiable: false,
      verificationMethod: null,
    }
    await page.route('**/api/requirements/import/schema?*', route =>
      fulfillJson(route, buildRequirementsImportJsonSchema('sv')),
    )
    await page.route('**/api/norm-references*', route =>
      fulfillJson(route, {
        normReferences: [
          { id: 42, name: 'Existing standard', normReferenceId: 'ISO-42' },
        ],
      }),
    )
    await page.route('**/api/requirements/import/preview', async route => {
      const request = route.request().postDataJSON()
      previewRequests.push(request)
      const reopened =
        request.payload.requirements[0].description ===
        'Corrected remaining candidate'
      await fulfillJson(route, {
        previewToken: reopened ? 'fresh-preview' : 'original-preview',
        proposals: [
          {
            ...proposal,
            referencedCount: 1,
            resolvedNormReferenceDbId: null,
            warnings: [],
          },
        ],
        needsReferenceProposals: [],
        rows: reopened
          ? [
              {
                errors: [],
                infos: [],
                proposedNeedsReferenceKey: null,
                proposedNormReferenceKeys: ['pending'],
                reviewRowId: 'fresh-row',
                selected: true,
                sourceIndex: 0,
                values: {
                  ...values,
                  description: 'Corrected remaining candidate',
                  normReferenceIds: [],
                },
                warnings: [
                  {
                    code: 'import_norm_reference_unresolved',
                    field: 'normReferenceIds',
                    level: 'warning',
                    message: 'Normreferensen ISO-42 finns inte längre.',
                    originalValue: 'ISO-42',
                  },
                ],
              },
            ]
          : [0, 1].map(sourceIndex => ({
              errors: [],
              infos: [],
              proposedNeedsReferenceKey: null,
              proposedNormReferenceKeys: sourceIndex === 1 ? ['pending'] : [],
              reviewRowId: `row-${sourceIndex}`,
              selected: sourceIndex === 0,
              sourceIndex,
              values: {
                ...values,
                description:
                  sourceIndex === 0
                    ? 'Import this candidate'
                    : values.description,
              },
              warnings: [],
            })),
        summary: {
          errorCount: 0,
          rowCount: reopened ? 1 : 2,
          warningCount: reopened ? 1 : 0,
        },
      })
    })
    await page.route('**/api/requirements/import/execute', route =>
      fulfillJson(route, {
        createdRows: [
          {
            ...values,
            categoryName: null,
            createdDatabaseId: 9002,
            createdVisibleId: 'PWI9002',
            importMode: 'library',
            normReferences: ['ISO-42'],
            priorityLevelName: null,
            qualityCharacteristicName: null,
            requirementPackageNames: [],
            sourceIndex: 0,
            targetAreaId: 1,
            targetSpecificationId: null,
            typeName: 'Funktionellt',
          },
        ],
        summary: { createdCount: 1 },
      }),
    )
    await page.goto('/sv/requirements')
    await page
      .getByRole('button', { name: 'Importera krav', exact: true })
      .click()
    const dialog = page.getByRole('dialog', { name: /Importera krav/ })
    await dialog.getByLabel('Kravområde').selectOption({ index: 1 })
    await dialog.getByLabel('Import-JSON').fill(
      JSON.stringify({
        schemaVersion: 'requirement-import.v4',
        proposedNormReferences: [proposal],
        requirements: [
          { description: 'Import this candidate' },
          {
            description: 'Original candidate',
            normReferenceIds: ['ISO-42'],
            proposedNormReferenceKeys: ['pending'],
          },
        ],
      }),
    )
    await dialog.getByRole('button', { name: 'Förhandsgranska krav' }).click()
    await dialog.getByRole('button', { name: 'Importera valda' }).click()
    await expect(dialog.getByRole('switch')).toHaveCount(1)
    const downloadButton = dialog.getByRole('button', {
      name: 'Ladda ner valda kandidater',
    })
    await expect(downloadButton).toBeDisabled()
    await expect(downloadButton).toHaveAttribute(
      'data-developer-mode-name',
      'download candidates button',
    )
    await dialog.getByRole('switch').click()
    await dialog.getByRole('button', { name: 'Expandera alla' }).click()
    await dialog.getByLabel(/^Kravtext/).fill('Corrected remaining candidate')
    const downloading = page.waitForEvent('download')
    await downloadButton.click()
    const download = await downloading
    expect(download.suggestedFilename()).toBe(
      'requirements-import-candidates.json',
    )
    const path = await download.path()
    if (!path) throw new Error('Candidate download has no local path')
    const payload = JSON.parse(await readFile(path, 'utf8'))
    expect(payload).toEqual({
      schemaVersion: 'requirement-import.v4',
      proposedNormReferences: [proposal],
      requirements: [
        {
          ...values,
          description: 'Corrected remaining candidate',
          normReferenceIds: ['ISO-42'],
          proposedNormReferenceKeys: ['pending'],
        },
      ],
    })
    await expect(dialog.getByLabel(/^Kravtext/)).toHaveValue(
      'Corrected remaining candidate',
    )
    await dialog.getByRole('button', { name: 'Stäng', exact: true }).click()
    await page
      .getByRole('button', { name: 'Stäng', exact: true })
      .last()
      .click()
    await expect(dialog).toHaveCount(0)
    await page
      .getByRole('button', { name: 'Importera krav', exact: true })
      .click()
    await dialog.getByLabel('Kravområde').selectOption({ index: 1 })
    await dialog.locator('input[type="file"]').setInputFiles(path)
    await dialog.getByRole('button', { name: 'Förhandsgranska krav' }).click()
    await dialog.getByRole('button', { name: 'Expandera alla' }).click()
    await expect(dialog.getByLabel(/^Kravtext/)).toHaveValue(
      'Corrected remaining candidate',
    )
    await expect(
      dialog.getByText('Normreferensen ISO-42 finns inte längre.'),
    ).toHaveCount(1)
    expect(previewRequests.at(-1)?.payload).toEqual(payload)
  })
})
