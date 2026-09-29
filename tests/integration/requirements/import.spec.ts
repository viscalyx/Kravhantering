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

      const support = dialog.getByRole('complementary', {
        name: 'Låt en extern AI ta fram krav',
      })
      await expect(support).toHaveAttribute(
        'data-developer-mode-name',
        'support panel',
      )
      await expect(support.getByRole('listitem')).toHaveCount(3)
      const ownPromptToggle = support.getByRole('button', {
        name: 'Egen prompt eller validering',
      })
      await expect(ownPromptToggle).toHaveAttribute('aria-expanded', 'false')
      await expect(
        support.getByRole('button', { name: 'Ladda ner schema' }),
      ).toHaveCount(0)
      await dialog.getByRole('button', { name: 'Stäng' }).focus()
      await page.keyboard.press('Tab')
      await expect(dialog.getByLabel('Kravområde')).toBeFocused()
      await page.keyboard.press('Tab')
      const upload = dialog.getByRole('button', { name: /Släpp en JSON-fil/ })
      await expect(upload).toBeFocused()
      const chooserPromise = page.waitForEvent('filechooser')
      await page.keyboard.press('Enter')
      const chooser = await chooserPromise
      await chooser.setFiles({
        name: 'requirements.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(validImportPayload)),
      })
      await expect(dialog.getByLabel('Import-JSON')).toHaveValue(
        JSON.stringify(validImportPayload),
      )
      await page.keyboard.press('Tab')
      await expect(dialog.getByLabel('Import-JSON')).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(
        support.getByRole('button', { name: 'AI-anropsmall' }),
      ).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(
        support.getByRole('button', { name: 'Referensdatafil' }),
      ).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(ownPromptToggle).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(ownPromptToggle).toHaveAttribute('aria-expanded', 'true')
      await page.keyboard.press('Tab')
      await expect(
        support.getByRole('button', { name: 'Ladda ner schema' }),
      ).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(
        support.getByRole('button', { name: 'Ladda ner importinstruktion' }),
      ).toBeFocused()
      await page.keyboard.press('Shift+Tab')
      await expect(
        support.getByRole('button', { name: 'Ladda ner schema' }),
      ).toBeFocused()
      await dialog.getByLabel('Import-JSON').fill('')

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
          /Schemat och importinstruktionen innehåller bara formatregler och referensdata/,
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
  test('REQ-17: keeps the import form and support readable across themes and viewport sizes', async ({
    page,
  }) => {
    await page.goto('/sv/requirements')
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
      { width: 320, height: 844 },
    ]) {
      await page.setViewportSize(viewport)
      for (const theme of ['light', 'dark']) {
        await test.step(`${viewport.width} × ${viewport.height}, ${theme} theme`, async () => {
          await page.evaluate(
            theme =>
              document.documentElement.classList.toggle(
                'dark',
                theme === 'dark',
              ),
            theme,
          )
          await page
            .getByRole('button', { name: 'Importera krav', exact: true })
            .click()
          const dialog = page.getByRole('dialog', {
            name: 'Importera krav',
            exact: true,
          })
          const input = dialog.locator(
            '[data-developer-mode-name="input panel"]',
          )
          const support = dialog.getByRole('complementary', {
            name: 'Låt en extern AI ta fram krav',
          })
          await expect(input).toHaveCount(1)
          await expect(support).toHaveCount(1)
          await expect
            .poll(async () => {
              const mainBox = await input.boundingBox()
              const supportBox = await support.boundingBox()
              if (!mainBox || !supportBox) return false
              return viewport.width >= 768
                ? supportBox.x >= mainBox.x + mainBox.width &&
                    Math.abs(mainBox.y - supportBox.y) < 1
                : supportBox.y >= mainBox.y + mainBox.height
            })
            .toBe(true)
          const panel = dialog
          await expect
            .poll(async () =>
              Math.round((await panel.boundingBox())?.width ?? 0),
            )
            .toBe(viewport.width >= 768 ? 960 : 288)
          await expect
            .poll(() =>
              panel.evaluate(
                element => element.scrollWidth <= element.clientWidth,
              ),
            )
            .toBe(true)
          const ownPromptToggle = support.getByRole('button', {
            name: 'Egen prompt eller validering',
          })
          await ownPromptToggle.scrollIntoViewIfNeeded()
          await expect(ownPromptToggle).toBeInViewport()
          await ownPromptToggle.click()
          await support
            .getByRole('button', { name: 'Ladda ner schema' })
            .scrollIntoViewIfNeeded()
          await expect(
            support.getByRole('button', { name: 'Ladda ner schema' }),
          ).toBeInViewport()
          await dialog.getByRole('button', { name: 'Stäng' }).click()
        })
      }
    }
  })

  test('REQ-17c: reads external JSON responses, explains each problem before review, and copies a repair prompt', async ({
    context,
    page,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const previewRequests: Array<{ payload: unknown }> = []
    await page.route('**/api/requirements/import/preview', async route => {
      previewRequests.push(route.request().postDataJSON())
      await fulfillJson(route, {
        previewToken: 'external-json-preview-token',
        proposals: [],
        rows: [
          {
            errors: [],
            infos: [],
            proposedNormReferenceKeys: [],
            reviewRowId: 'external-json-row-1',
            selected: true,
            sourceIndex: 0,
            values: {
              acceptanceCriteria: null,
              categoryId: null,
              description: 'Krav från kodblock',
              needsReferenceId: null,
              normReferenceIds: [],
              priorityLevelId: null,
              qualityCharacteristicId: null,
              requirementPackageIds: [],
              typeId: null,
              verifiable: false,
              verificationMethod: null,
            },
            warnings: [],
          },
        ],
        summary: { errorCount: 0, rowCount: 1, warningCount: 0 },
      })
    })
    const codeBlockPayload = {
      requirements: [{ description: 'Krav från kodblock' }],
      schemaVersion: 'requirement-import.v4',
    }
    const validJson = JSON.stringify(codeBlockPayload, null, 2)

    await page.goto('/sv/requirements')
    await page
      .getByRole('button', { name: 'Importera krav', exact: true })
      .click()
    const dialog = page.getByRole('dialog', { name: /^Importera krav/ })
    const rawJson = dialog.getByLabel('Import-JSON')
    const previewButton = dialog.getByRole('button', {
      name: 'Förhandsgranska krav',
    })
    const blocker = dialog.getByRole('status').first()
    const copyRepairPrompt = dialog.getByRole('button', {
      name: 'Kopiera reparationsprompt',
    })
    const repairPromptPreview = dialog.getByRole('textbox', {
      name: 'Reparationsprompt',
    })
    await dialog.getByLabel('Kravområde').selectOption({ index: 1 })

    await test.step('explain a response without JSON', async () => {
      await rawJson.fill('Jag behöver referensdatafilen först.')
      await expect(blocker).toHaveText(
        'Svaret innehåller ingen JSON. Läs AI-assistentens svar. Behovet eller referensdatafilen kan saknas.',
      )
      await expect(previewButton).toBeDisabled()
      await expect(copyRepairPrompt).toHaveCount(0)
    })

    await test.step('explain a truncated JSON response', async () => {
      await rawJson.fill(validJson.slice(0, validJson.indexOf('Krav')))
      await expect(blocker).toHaveText(
        'Svaret är troligen avkortat. Be om färre krav per förfrågan.',
      )
      await expect(previewButton).toBeDisabled()
      await expect(copyRepairPrompt).toHaveCount(0)
    })

    await test.step('reject several code blocks without extracting JSON', async () => {
      await rawJson.fill(
        `Förslag 1:\n\`\`\`json\n${validJson}\n\`\`\`\nFörslag 2:\n\`\`\`json\n${validJson}\n\`\`\``,
      )
      await expect(blocker).toContainText('Svaret innehåller 2 kodblock.')
      await expect(previewButton).toBeDisabled()
      await expect(dialog.getByText(/JSON togs ut ur kodblocket/)).toHaveCount(
        0,
      )
      await expect(copyRepairPrompt).toHaveCount(0)
    })

    await test.step('show syntax errors with line and column and a repair prompt', async () => {
      await rawJson.fill(
        '{\n  "schemaVersion": "requirement-import.v4",\n  "requirements": [{ "description": "Krav" }],\n}',
      )
      await expect(blocker).toHaveText(
        'JSON har ett syntaxfel på rad 4, kolumn 1: oväntat tecken ”}”.',
      )
      await expect(previewButton).toBeDisabled()
      await expect(copyRepairPrompt).toBeEnabled()
      const previewToggle = dialog.getByRole('button', {
        name: 'Förhandsvisa reparationsprompt',
      })
      await expect(previewToggle).toHaveAttribute('aria-expanded', 'false')
      await expect(repairPromptPreview).toBeHidden()
      await previewToggle.click()
      await expect(previewToggle).toHaveAttribute('aria-expanded', 'true')
      await expect(repairPromptPreview).toHaveValue(
        new RegExp(
          escapeRegExp(
            '- $: JSON har ett syntaxfel på rad 4, kolumn 1: oväntat tecken ”}”.',
          ),
        ),
      )
    })

    await test.step('explain a wrong schemaVersion and offer a repair prompt', async () => {
      await rawJson.fill(
        JSON.stringify({
          ...codeBlockPayload,
          schemaVersion: 'requirement-import.v1',
        }),
      )
      await expect(blocker).toHaveText(
        'schemaVersion ska vara requirement-import.v4.',
      )
      await expect(previewButton).toBeDisabled()
      await expect(copyRepairPrompt).toBeEnabled()
      await expect(repairPromptPreview).toHaveValue(
        new RegExp(
          escapeRegExp(
            '- $.schemaVersion: schemaVersion ska vara requirement-import.v4.',
          ),
        ),
      )
    })

    await test.step('list at most 20 schema errors with JSON paths', async () => {
      await rawJson.fill(
        JSON.stringify({
          requirements: Array.from({ length: 23 }, () => ({})),
          schemaVersion: 'requirement-import.v4',
        }),
      )
      await expect(blocker).toHaveText(
        'JSON följer inte importschemat. Rätta 23 fel:',
      )
      const errors = dialog.getByRole('list', { name: 'Valideringsfel' })
      // `has` matches relative to each status, so the inner locator starts
      // at the page.
      await expect(
        dialog.getByRole('status').filter({
          has: page.getByRole('list', { name: 'Valideringsfel' }),
        }),
      ).toHaveCount(1)
      await expect(errors.getByRole('listitem')).toHaveCount(20)
      await expect(errors.getByRole('listitem').first()).toHaveText(
        '$.requirements[0].description: Fältet saknas men är obligatoriskt.',
      )
      await expect(dialog.getByText('och 3 fel till')).toHaveCount(1)
      await expect(previewButton).toBeDisabled()
    })

    await test.step('copy the repair prompt for the schema errors', async () => {
      await copyRepairPrompt.click()
      await expect(
        dialog.getByRole('status').filter({
          hasText:
            'Reparationsprompten är kopierad. Klistra in den i samma samtal med AI-assistenten.',
        }),
      ).toHaveCount(1)
      const copied = await page.evaluate(() => navigator.clipboard.readText())
      await expect(repairPromptPreview).toHaveValue(copied)
      expect(copied).toMatch(
        /^Ditt JSON-svar validerade inte mot importkontraktet\./u,
      )
      expect(
        copied.split('\n').filter(line => line.startsWith('- $.requirements[')),
      ).toHaveLength(23)
      expect(copied).toContain(
        '- $.requirements[22].description: Fältet saknas men är obligatoriskt.',
      )
      expect(copied).not.toMatch(/[{}]/u)
    })

    await test.step('preview JSON taken from exactly one code block', async () => {
      const response = `Här är kraven:\n\n\`\`\`json\n${validJson}\n\`\`\`\n\nSäg till om du vill ha fler.`
      await rawJson.fill(response)
      await expect(
        dialog.getByRole('status').filter({
          hasText:
            'JSON togs ut ur kodblocket i svaret. Texten i fältet är oförändrad.',
        }),
      ).toHaveCount(1)
      await expect(rawJson).toHaveValue(response)
      await expect(previewButton).toBeEnabled()
      await previewButton.click()
      await expect(page.getByRole('tab', { name: /Krav 1/ })).toBeVisible()
      expect(previewRequests.at(-1)?.payload).toEqual(codeBlockPayload)
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
