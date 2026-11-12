import { readFile } from 'node:fs/promises'
import { type Download, expect, type Page, test } from '@playwright/test'
import { REQUIREMENTS_IMPORT_SCHEMA_VERSION } from '@/lib/requirements/import-schema'
import { DESKTOP_VIEWPORT } from '../../helpers/desktop-viewport'

async function downloadFrom(page: Page, click: () => Promise<void>) {
  const downloading = page.waitForEvent('download')
  await click()
  return downloading
}

async function downloadedBytes(download: Download): Promise<Buffer> {
  const path = await download.path()
  if (!path) throw new Error('Download did not expose a local path.')
  return readFile(path)
}

test.describe('Requirements import AI request files', () => {
  test.use({ viewport: DESKTOP_VIEWPORT })

  test('REQ-17b: downloads the AI request template and reference data file for the requirements library', async ({
    page,
  }) => {
    await page.goto('/sv/requirements')
    await page
      .getByRole('button', { name: 'Importera krav', exact: true })
      .click()
    const dialog = page.getByRole('dialog', {
      name: 'Importera krav',
      exact: true,
    })
    const support = dialog.getByRole('complementary', {
      name: 'Låt en extern AI ta fram krav',
    })
    const steps = support.getByRole('listitem')
    const templateButton = support.getByRole('button', {
      name: 'AI-anropsmall',
    })
    const referenceDataButton = support.getByRole('button', {
      name: 'Referensdatafil',
    })

    await test.step('show the step guide with both file names', async () => {
      await expect(steps).toHaveCount(3)
      await expect(steps.nth(0)).toContainText('Hämta två filer')
      await expect(steps.nth(1)).toContainText('Fråga AI-assistenten')
      await expect(steps.nth(2)).toContainText('Lägg in svaret här')
      await expect(support).toContainText(
        'Referensdatafilen speglar kravbiblioteket just nu.',
      )
      await expect(templateButton).toBeEnabled()
      await expect(templateButton).toHaveAccessibleDescription(
        'kravimport-ai-anropsmall-kravbibliotek.md',
      )
      await expect(referenceDataButton).toBeEnabled()
      await expect(referenceDataButton).toHaveAccessibleDescription(
        'kravimport-referensdata-kravbibliotek.json',
      )
    })

    await test.step('download the AI request template', async () => {
      const download = await downloadFrom(page, () => templateButton.click())
      expect(download.suggestedFilename()).toBe(
        'kravimport-ai-anropsmall-kravbibliotek.md',
      )
      const bytes = await downloadedBytes(download)
      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
      const template = bytes.subarray(3).toString('utf8')
      const lines = template.replace(/\n$/u, '').split('\n')
      expect(lines[0]).toBe(
        '===== BÖRJAN PÅ AI-ANROPSMALL FÖR KRAVIMPORT =====',
      )
      expect(lines.at(-1)).toBe('===== SLUT PÅ AI-ANROPSMALL =====')
      expect(template).toContain(`\`${REQUIREMENTS_IMPORT_SCHEMA_VERSION}\``)
      expect(template).toContain('`requirements_library` (kravbibliotek)')
      expect(template.match(/```json\n/gu)).toHaveLength(1)
      expect(template).not.toContain('## Referensdata')
      expect(template.slice(0, template.indexOf('```json'))).not.toMatch(
        /\{[A-Za-z][A-Za-z0-9]*\}/u,
      )
      expect(template).not.toMatch(/Copilot|ChatGPT|Microsoft|OpenAI/u)
    })

    await test.step('download the reference data file', async () => {
      const download = await downloadFrom(page, () =>
        referenceDataButton.click(),
      )
      expect(download.suggestedFilename()).toBe(
        'kravimport-referensdata-kravbibliotek.json',
      )
      const bytes = await downloadedBytes(download)
      expect(bytes[0]).toBe('{'.charCodeAt(0))
      const text = bytes.toString('utf8')
      expect(text).not.toContain('\n')
      const file = JSON.parse(text) as Record<string, unknown>
      expect(Object.keys(file)).toEqual([
        'generatedAt',
        'schemaVersion',
        'locale',
        'destination',
        'referenceData',
      ])
      expect(file).toMatchObject({
        destination: { kind: 'requirements_library' },
        locale: 'sv',
        schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
      })
      expect(new Date(String(file.generatedAt)).toISOString()).toBe(
        file.generatedAt,
      )
      expect(Object.keys(file.referenceData as object).sort()).toEqual([
        'categories',
        'normReferences',
        'priorityLevels',
        'requirementPackages',
        'types',
      ])
    })

    await expect(dialog.getByRole('alert')).toHaveCount(0)
  })
})
