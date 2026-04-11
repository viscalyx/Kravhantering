/**
 * Kravhantering — automatisk guidegenerering
 *
 * Genererar en komplett användarguide med skärmdumpar och beskrivande text
 * på svenska. Skärmdumparna sparas i docs/guide/images/ och guiden skrivs
 * till docs/guide/README.md.
 *
 * Kör med: npm run generate-guide
 *
 * OBS: Detta är ett engångsskript som muterar databasen (skapar krav,
 * avsteg och förbättringsförslag). Kör `npm run db:setup` för att
 * återställa databasen till seed-läget efteråt om det behövs.
 */

import fs from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

// ─── Lokalisering ──────────────────────────────────────────────────────────

const sv = JSON.parse(
  fs.readFileSync(path.resolve('messages/sv.json'), 'utf-8'),
) as Record<string, unknown>

/** Hämta ett värde ur sv.json med punktnotation, t.ex. "help.requirements.properties.area.body" */
function t(keyPath: string): string {
  const parts = keyPath.split('.')
  let node: unknown = sv
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return keyPath
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : keyPath
}

/** Bygg en markdown-tabell för egenskaper från hjälppanelen */
function helpPropsTable(keys: string[]): string {
  const rows = keys
    .map(key => {
      const base = `help.requirements.properties.${key}`
      return `| **${t(`${base}.heading`)}** | ${t(`${base}.body`)} |`
    })
    .join('\n')
  return `<!-- markdownlint-disable MD013 -->\n| Egenskap | Beskrivning |\n| --- | --- |\n${rows}\n<!-- markdownlint-enable MD013 -->`
}

/** Intro-text för egenskapsavsnittet från hjälppanelen */
const requirementPropertiesIntro = t('help.requirements.properties.body')

// ─── Utdatasökvägar ────────────────────────────────────────────────────────

const IMAGES_DIR = path.resolve('docs/guide/images')
const README_PATH = path.resolve('docs/guide/README.md')

// ─── Testdata ──────────────────────────────────────────────────────────────

const MOCK_DESCRIPTION =
  'Systemet ska stödja multifaktorautentisering för alla administrativa användare'
const MOCK_CRITERIA =
  'Användare måste verifiera sin identitet med minst två faktorer. Autentiseringen ska slutföras inom 30 sekunder.'
const MOCK_DEVIATION =
  'Tredjeparts­integration stödjer inte MFA för tillfället. Åtgärdas genom IP-begränsning tills leverantören tillhandahåller stöd.'
const MOCK_SUGGESTION =
  'Överväg att lägga till biometrisk autentisering som ett tredje faktoralternativ i en framtida version.'

// ─── Typer ─────────────────────────────────────────────────────────────────

interface ScreenshotEntry {
  description: string
  filename: string
  heading: string
  section: string
  seq: number
}

// ─── Tillstånd (modul-nivå, delas av beforeAll/afterAll/test) ─────────────

let seq = 0
let currentSection = ''
const entries: ScreenshotEntry[] = []
const sectionIntros = new Map<string, string>()

function setSectionIntro(text: string) {
  sectionIntros.set(currentSection, text)
}
// The uniqueId of the requirement created during the guide run (e.g. "ANV0042")
let createdRequirementUniqueId = ''

// ─── Hjälpfunktioner ───────────────────────────────────────────────────────

/**
 * Set a React controlled input/textarea value reliably by using the native
 * value setter and dispatching an `input` event with bubbles. This is more
 * reliable than fill() or pressSequentially() for inputs inside React portals.
 */
async function setReactInputValue(
  page: Page,
  id: string,
  value: string,
): Promise<void> {
  await page.evaluate(
    ([elId, val]) => {
      const el = document.getElementById(elId) as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null
      if (!el) return
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(el, val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    },
    [id, value],
  )
}

async function snap(
  page: Page,
  name: string,
  heading: string,
  description: string,
  options: { fullPage?: boolean; selector?: string } = {},
): Promise<void> {
  // Wait for any in-flight data fetches to finish before screenshotting
  await page
    .getByText(/Hämtar krav|Fetching requirements/i)
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {})
  await page
    .getByText(/^Laddar\.\.\.$/)
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {})

  seq++
  const filename = `${String(seq).padStart(3, '0')}-${name}.png`
  const filepath = path.join(IMAGES_DIR, filename)
  if (options.selector) {
    await page.locator(options.selector).screenshot({
      path: filepath,
      animations: 'disabled',
    })
  } else {
    await page.screenshot({
      path: filepath,
      fullPage: options.fullPage ?? true,
      animations: 'disabled',
    })
  }
  entries.push({ seq, filename, heading, description, section: currentSection })
}

/**
 * Navigate to a URL, retrying up to `retries` times if the server returns the
 * app 404 page. Turbopack can temporarily misroute pages during hot-reload.
 */
async function gotoRetry(
  page: Page,
  url: string,
  retries = 5,
  waitMs = 3_000,
): Promise<void> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    await page.goto(url)
    await page.waitForLoadState('networkidle')
    const is404 =
      (await page.locator('text=Sidan kunde inte hittas').count()) > 0
    if (!is404) return
    if (attempt < retries) await page.waitForTimeout(waitMs)
  }
  throw new Error(
    `gotoRetry: page at ${url} still showed 404 after ${retries} retries`,
  )
}

type ArrowSide = 'left' | 'right' | 'top' | 'bottom'

/**
 * Lägger till en röd ring och en pil som pekar på ett element i sidan.
 * Kan anropas flera gånger för att annotera flera element samtidigt.
 * Pilen placeras på angiven sida (standard: 'left' → pil pekar höger →).
 * Anropa removeAnnotation() för att ta bort alla annotationer.
 */
async function addAnnotation(
  page: Page,
  selector: string,
  options: { arrowSide?: ArrowSide } = {},
): Promise<void> {
  // Wait up to 5s for the element — if not found, skip annotation gracefully
  try {
    await page.locator(selector).waitFor({ state: 'visible', timeout: 5_000 })
  } catch {
    return
  }
  const box = await page.locator(selector).boundingBox()
  if (!box) return
  const { arrowSide = 'left' } = options
  await page.evaluate(
    ({ x, y, w, h, side }) => {
      const CLS = '__guide-annot__'
      const color = '#ef4444'
      const shadow =
        '1px 1px 0 #fff,-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff'

      const ring = document.createElement('div')
      ring.className = CLS
      ring.style.cssText = `
        position:fixed;left:${x - 5}px;top:${y - 5}px;
        width:${w + 10}px;height:${h + 10}px;
        border:3px solid ${color};border-radius:8px;
        box-shadow:0 0 0 3px rgba(239,68,68,.25);
        z-index:99999;pointer-events:none;`
      document.body.appendChild(ring)

      const chars: Record<string, string> = {
        left: '→',
        right: '←',
        top: '↓',
        bottom: '↑',
      }
      const pos: Record<string, string> = {
        left: `left:${x - 52}px;top:${y + h / 2 - 18}px;`,
        right: `left:${x + w + 8}px;top:${y + h / 2 - 18}px;`,
        top: `left:${x + w / 2 - 18}px;top:${y - 52}px;`,
        bottom: `left:${x + w / 2 - 18}px;top:${y + h + 8}px;`,
      }
      const arrow = document.createElement('div')
      arrow.className = CLS
      arrow.style.cssText = `
        position:fixed;${pos[side]}
        font-size:36px;line-height:1;color:${color};
        z-index:99999;pointer-events:none;
        text-shadow:${shadow};`
      arrow.textContent = chars[side]
      document.body.appendChild(arrow)
    },
    { x: box.x, y: box.y, w: box.width, h: box.height, side: arrowSide },
  )
}

/** Tar bort alla visuella annotationer tillagda av addAnnotation(). */
async function removeAnnotation(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.__guide-annot__')) el.remove()
  })
}

/**
 * Väljer det första riktiga alternativet i ett <select>-element.
 * Returnerar false om inga alternativ finns (förutom placeholder).
 */
async function safeSelectFirst(page: Page, id: string): Promise<boolean> {
  const select = page.locator(`#${id}`)
  const count = await select.locator('option').count()
  if (count < 2) return false
  const value = await select.locator('option').nth(1).getAttribute('value')
  if (!value) return false
  await select.selectOption(value)
  return true
}

/** Bygger markdown-guiden utifrån de insamlade skärmdumpsposterna. */
/** Wrap prose at ~80 chars at word boundaries. Passes through unchanged:
 *  - table rows (start with |)
 *  - fenced code blocks (``` ... ```)
 *  - headings (start with #)
 *  - blank lines
 *  - lines containing only inline-code (no wrapping needed for short tokens)
 */
function wrapProse(text: string, width = 80): string {
  const lines = text.split('\n')
  const out: string[] = []
  let inCodeBlock = false
  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      out.push(line)
      continue
    }
    if (
      inCodeBlock ||
      line === '' ||
      line.startsWith('#') ||
      line.startsWith('|') ||
      line.startsWith('>')
    ) {
      out.push(line)
      continue
    }
    // Wrap at word boundary
    if (line.length <= width) {
      out.push(line)
      continue
    }
    const words = line.split(' ')
    let current = ''
    for (const word of words) {
      if (current === '') {
        current = word
      } else if (current.length + 1 + word.length <= width) {
        current += ` ${word}`
      } else {
        out.push(current)
        current = word
      }
    }
    if (current !== '') out.push(current)
  }
  return out.join('\n')
}

function buildMarkdown(allEntries: ScreenshotEntry[]): string {
  const sections = [...new Set(allEntries.map(e => e.section))]

  const toc = sections
    .map((s, i) => {
      const anchor = s
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\p{L}\p{N}-]/gu, '')
      return `${i + 1}. [${s}](#${anchor})`
    })
    .join('\n')

  const body = sections
    .map(section => {
      const sectionEntries = allEntries.filter(e => e.section === section)
      const content = sectionEntries
        .map(
          e =>
            `### ${e.heading}\n\n${wrapProse(e.description)}\n\n![${e.heading}](images/${e.filename})`,
        )
        .join('\n\n')
      const intro = sectionIntros.get(section)
      const introBlock = intro ? `${wrapProse(intro)}\n\n` : ''
      return `## ${section}\n\n${introBlock}${content}`
    })
    .join('\n\n')

  const date = new Date().toISOString().split('T')[0]

  return [
    `<!-- AUTO-GENERERAD — redigera inte manuellt. Kör: npm run generate-guide -->`,
    `# Kravhantering — Användarguide`,
    '',
    `> Guiden genererades automatiskt av Playwright ${date}.`,
    `> Alla skärmdumpar visar det svenska gränssnittet.`,
    '',
    `## Innehållsförteckning`,
    '',
    toc,
    '',
    body,
    '',
  ].join('\n')
}

// ─── Testsvit ──────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('Kravhantering — Guidegenerering', () => {
  test.beforeAll(() => {
    // Wipe images dir so stale screenshots from previous runs don't linger
    fs.rmSync(IMAGES_DIR, { recursive: true, force: true })
    fs.mkdirSync(IMAGES_DIR, { recursive: true })
  })

  test.afterAll(() => {
    fs.mkdirSync(path.dirname(README_PATH), { recursive: true })
    fs.writeFileSync(README_PATH, buildMarkdown(entries))
    process.stdout.write(`\n✓ Guide skriven till ${README_PATH}\n`)
    process.stdout.write(
      `✓ ${entries.length} skärmdumpar sparade i ${IMAGES_DIR}\n`,
    )
  })

  test('Generera användarguide', async ({ page }) => {
    // ── Sektion 1: Översikt och navigering ─────────────────────────────────
    currentSection = 'Översikt och navigering'

    await test.step('Startsida', async () => {
      // Use uniqueIdSearch URL param to pre-filter to a short, readable list
      await page.goto('/sv/requirements?uniqueIdSearch=INT00')
      await page.waitForLoadState('networkidle')
      await expect(
        page.locator('[data-sticky-table-header="true"]'),
      ).toBeVisible({ timeout: 15_000 })
      // Wait for rows to render with the filter applied
      await expect(page.locator('tbody tr').first()).toBeVisible({
        timeout: 10_000,
      })
      await snap(
        page,
        'startsida',
        'Startsida — Kravkatalogen',
        'Kravhantering öppnas i Kravkatalogen som är programmets centrala nav. Härifrån kan du söka, filtrera och hantera alla krav i systemet.',
        { fullPage: false },
      )
    })

    await test.step('Navigationsfält', async () => {
      await snap(
        page,
        'navigering',
        'Navigationsfält',
        'Det övre navigationsfältet ger åtkomst till alla huvuddelar: **Kravkatalogen** (Krav), **Kravpaket**, **Admininställningar** (kugghjulsikonen) samt language-väljare och tema (ljust/mörkt läge).',
        { selector: 'nav[aria-label="Huvudnavigation"]' },
      )
    })

    await test.step('Språkväljare', async () => {
      // Navigate to the English locale to show the UI in English
      await page.goto('/en/requirements?uniqueIdSearch=INT00')
      await page.waitForLoadState('networkidle')
      await expect(
        page.locator('[data-sticky-table-header="true"]'),
      ).toBeVisible({ timeout: 10_000 })
      // Annotate the language switcher button so it's easy to spot
      await addAnnotation(page, 'button[aria-label="Switch language"]')
      await snap(
        page,
        'sprakväljare',
        'Språkväljare',
        'Applikationen stödjer svenska och engelska. I bilden har engelska valts, vilket gör att alla gränssnittstexter — knappar, etiketter, rubriker och navigering — visas på engelska. Observera att kravegenskaper som kravtext och acceptanskriterier inte lokaliseras av systemet; dessa skrivs på det språk som användaren själv väljer för varje krav.',
        { fullPage: false },
      )
      await removeAnnotation(page)
      // Switch back to Swedish for the rest of the guide
      await page.goto('/sv/requirements')
      await page.waitForLoadState('networkidle')
    })

    // ── Sektion 2: Kravkatalogen ───────────────────────────────────────────
    currentSection = 'Kravkatalogen'

    await test.step('Kravtabell', async () => {
      await page.goto('/sv/requirements')
      await page.waitForLoadState('networkidle')
      await expect(
        page.locator('[data-sticky-table-header="true"]'),
      ).toBeVisible({ timeout: 15_000 })
      // Filter by INT00 for a compact, readable table
      const tableSearchInput = page
        .locator(
          'input[type="search"], input[placeholder*="Sök"], input[placeholder*="sök"]',
        )
        .first()
      if ((await tableSearchInput.count()) > 0) {
        await tableSearchInput.fill('INT00')
        await page.waitForTimeout(600)
      }
      await snap(
        page,
        'kravkatalog',
        'Kravkatalogen — Översikt',
        'Kravkatalogen listar alla krav i en sorterbar och filtrerbar tabell. Varje rad visar nyckeluppgifter som ID, kravtext, område, status och risknivå. Kolumnerna kan konfigureras efter behov.',
        { fullPage: false },
      )
      if ((await tableSearchInput.count()) > 0) {
        await tableSearchInput.clear()
        await page.waitForTimeout(400)
      }
    })

    await test.step('Sök och filtrera', async () => {
      const searchInput = page
        .locator(
          'input[type="search"], input[placeholder*="Sök"], input[placeholder*="sök"]',
        )
        .first()
      if ((await searchInput.count()) > 0) {
        await searchInput.fill('SÄK')
        await page.waitForTimeout(600)
        await snap(
          page,
          'kravkatalog-sok',
          'Sökning och filtrering',
          'Skriv i sökrutan för att filtrera krav i realtid. Du kan även använda avancerade filter för att begränsa listan efter område, status, risknivå, kravtyp och kvalitetsegenskaper.',
        )
        await searchInput.clear()
        await page.waitForTimeout(400)
      }
    })

    await test.step('Kolumnkonfiguration', async () => {
      const picker = page.locator('[data-column-picker-trigger="true"]')
      if ((await picker.count()) > 0) {
        await addAnnotation(page, '[data-column-picker-trigger="true"]')
        await picker.click()
        await page.waitForTimeout(300)
        await snap(
          page,
          'kolumnkonfig',
          'Kolumnkonfiguration',
          'Klicka på kolumnväljaren (tabellikon) för att visa eller dölja kolumner. Du kan anpassa vyn efter din arbetsprocess. Inställningarna sparas i webbläsaren.',
          { fullPage: false },
        )
        await removeAnnotation(page)
        await picker.click()
        await page.waitForTimeout(200)
      }
    })

    await test.step('Filtrering och sortering', async () => {
      await page.goto('/sv/requirements')
      await page.waitForLoadState('networkidle')
      await expect(
        page.locator('[data-sticky-table-header="true"]'),
      ).toBeVisible({ timeout: 10_000 })

      // Highlight both the sort and filter icons on the Krav-ID column
      const filterBtn = page.getByLabel('Filtrera efter Krav-ID')
      await addAnnotation(
        page,
        '[data-requirement-header-control="uniqueId"]',
        { arrowSide: 'bottom' },
      )
      await snap(
        page,
        'kolumnfilter',
        'Filtrering och sortering',
        'Varje kolumn har en sorteringspil (↑↓) och en filterikon (▽) i kolumnrubriken. Klicka på sorteringspilen för att växla mellan stigande och fallande ordning. Klicka på filterikonen för att öppna ett textfält där du kan filtrera listan på det kolumnens värde.',
        { selector: '[data-sticky-table-header="true"]' },
      )
      await removeAnnotation(page)

      // Apply filter IDN0001 — stays active for all remaining catalog screenshots
      await filterBtn.click()
      const filterInput = page.getByRole('textbox', { name: 'Krav-ID' })
      await filterInput.fill('IDN0001')
      await addAnnotation(page, 'input[aria-label="Krav-ID"]', {
        arrowSide: 'bottom',
      })
      await snap(
        page,
        'kolumnfilter-ifyllt',
        'Filtrering — sökfält ifyllt',
        'Skriv in ett värde i filterfältet för att begränsa listan. Här filtreras på Krav-ID "IDN0001" vilket visar enbart matchande krav. Tryck Enter eller klicka utanför för att tillämpa filtret. Tryck Esc för att stänga filterfältet.',
        { fullPage: false },
      )
      await removeAnnotation(page)
      await filterInput.press('Enter')
      await expect(page.locator('tbody tr').first()).toBeVisible({
        timeout: 10_000,
      })
    })

    await test.step('Inline-detaljvy — öppna', async () => {
      // IDN0001 column filter is active from the previous step — click the single row to open detail
      await expect(page.locator('tbody tr').first()).toBeVisible({
        timeout: 10_000,
      })
      const firstRow = page.locator('tbody tr').first()
      if ((await firstRow.count()) > 0) {
        await firstRow.evaluate((el: Element) => (el as HTMLElement).click())
        await expect(
          page.locator('[data-expanded-detail-cell="true"]'),
        ).toBeVisible({ timeout: 10_000 })
        // Remove any stale annotation and blur focus so neither shows in screenshot
        await removeAnnotation(page)
        await page.evaluate(() =>
          (document.activeElement as HTMLElement)?.blur(),
        )
        await snap(
          page,
          'inline-detaljvy',
          'Inline-detaljvy',
          'Klicka på en rad i kravkatalogen för att öppna inline-detaljvyn direkt i tabellen. Detta är det primära arbetsflödet — du behöver inte lämna katalogen för att se eller hantera ett krav.',
        )
      }
    })

    await test.step('Inline-detaljvy — övre del', async () => {
      const detailPanel = page.locator('[data-expanded-detail-cell="true"]')
      if ((await detailPanel.count()) > 0) {
        // Temporarily hide förbättringsförslag so the full-page screenshot
        // ends after the version pills, without the suggestions section.
        await page.evaluate(() => {
          const el = document.querySelector(
            'section[aria-labelledby="improvementSuggestionsHeading"]',
          ) as HTMLElement | null
          if (el) el.style.display = 'none'
        })

        await snap(
          page,
          'inline-detaljvy-ovre',
          'Detaljpanelen — övre del',
          `${requirementPropertiesIntro}\n\n` +
            helpPropsTable([
              'requirementId',
              'area',
              'description',
              'acceptanceCriteria',
              'category',
              'type',
              'qualityCharacteristic',
              'riskLevel',
              'verifiable',
              'verificationMethod',
              'scenarios',
              'normReferences',
              'status',
            ]),
        )

        await page.evaluate(() => {
          const el = document.querySelector(
            'section[aria-labelledby="improvementSuggestionsHeading"]',
          ) as HTMLElement | null
          if (el) el.style.display = ''
        })
      }
    })

    await test.step('Inline-detaljvy — versionsnavigering', async () => {
      const detailPanel = page.locator('[data-expanded-detail-cell="true"]')
      if ((await detailPanel.count()) > 0) {
        const expandToggle = page.locator(
          '[data-developer-mode-name="version history toggle"]',
        )
        const hasToggle = (await expandToggle.count()) > 0

        if (hasToggle) {
          // Hide suggestions only for the screenshots that need it (010, 011)
          await page.evaluate(() => {
            const el = document.querySelector(
              'section[aria-labelledby="improvementSuggestionsHeading"]',
            ) as HTMLElement | null
            if (el) el.style.display = 'none'
          })

          // Annotate the expand toggle button
          await addAnnotation(
            page,
            '[data-developer-mode-name="version history toggle"]',
            { arrowSide: 'top' },
          )
          await snap(
            page,
            'versioner-fler',
            'Versionshistorik',
            'Redigering av ett publicerat krav samt återställning av ett arkiverat krav skapar en ny version. Versionshistoriken visar alla versioner med tidsstämplar, status och vem som gjorde ändringen. Du kan navigera till äldre versioner för att se den historiska lydelsen.\n\nNär ett krav har fler versioner än vad som ryms i vyn visas en knapp med "+N" som visar hur många dolda versioner det finns. Klicka på den för att expandera och se alla versioner.',
          )
          await removeAnnotation(page)

          // Expand to show all versions
          await expandToggle.first().click()
          await page.waitForTimeout(300)
          await snap(
            page,
            'versioner-expanderad',
            'Versionshistorik — expanderad lista',
            'När versionshistoriken är expanderad visas alla versioner som versionspillar i rad. Den aktuella versionen är markerad. Klicka på valfri pil för att navigera till den versionen.',
            { selector: '[data-developer-mode-name="version history"]' },
          )

          // Restore before navigating to a historical version so the DOM is
          // in its natural state (same as when 009 was taken)
          await page.evaluate(() => {
            const el = document.querySelector(
              'section[aria-labelledby="improvementSuggestionsHeading"]',
            ) as HTMLElement | null
            if (el) el.style.display = ''
          })
        }

        // Click an archived or draft version pill (not the currently selected one)
        const versionPills = page.locator(
          '[data-developer-mode-name="version pill"]',
        )
        const pillCount = await versionPills.count()
        if (pillCount > 1) {
          // Click the last pill (oldest version)
          await versionPills.last().click()
          await page.waitForTimeout(300)
          // Scroll back to top so the stepper is visible — same position as 009
          await page.evaluate(() =>
            window.scrollTo({ top: 0, behavior: 'instant' }),
          )
          await page.waitForTimeout(150)
          await page.evaluate(() => {
            const el = document.querySelector(
              'section[aria-labelledby="improvementSuggestionsHeading"]',
            ) as HTMLElement | null
            if (el) el.style.display = 'none'
          })
          await snap(
            page,
            'versioner-historisk',
            'Versionshistorik — historisk version',
            'Klicka på en versionspil för att visa den versionen av kravet. Den valda versionen markeras och kravtexten uppdateras för att visa hur kravet såg ut vid det tillfället. Användbara för revision och spårbarhet.',
          )
          // Return to latest version
          await versionPills.first().click()
          await page.waitForTimeout(300)
        }

        // ── Cleanup before next step ──────────────────────────────────────
        // Restore any elements hidden during this step and reset scroll so
        // subsequent steps start from a clean, known state.
        await page.evaluate(() => {
          const el = document.querySelector(
            'section[aria-labelledby="improvementSuggestionsHeading"]',
          ) as HTMLElement | null
          if (el) el.style.display = ''
        })
        await page.evaluate(() =>
          window.scrollTo({ top: 0, behavior: 'instant' }),
        )
      }
    })

    // ── Sektion 3: Skapa krav ──────────────────────────────────────────────
    currentSection = 'Skapa ett nytt krav'

    await test.step('Formulär — tomt', async () => {
      await gotoRetry(page, '/sv/requirements/new')
      await snap(
        page,
        'nytt-krav-tomt',
        'Skapa krav — tomt formulär',
        'Navigera till "Skapa nytt krav" via knappen i katalogen. Formuläret innehåller fält för alla kravegenskaper: kravtext, acceptanskriterier, område, kategori, typ, risknivå, kvalitetsegenskaper, verifieringsmetod, normreferenser och användningsscenarier.',
      )
    })

    await test.step('Formulär — ifyllt', async () => {
      await page.waitForSelector('#description', {
        state: 'visible',
        timeout: 15_000,
      })
      await page.fill('#description', MOCK_DESCRIPTION)

      const criteriaField = page.locator('#acceptanceCriteria')
      if ((await criteriaField.count()) > 0) {
        await criteriaField.fill(MOCK_CRITERIA)
      }

      await safeSelectFirst(page, 'areaId')
      await safeSelectFirst(page, 'categoryId')
      await safeSelectFirst(page, 'typeId')
      await safeSelectFirst(page, 'riskLevelId')

      await snap(
        page,
        'nytt-krav-ifyllt',
        'Skapa krav — ifyllt formulär',
        'Fyll i kravtext och acceptanskriterier. Välj sedan område, kategori, typ och risknivå i respektive rullgardinsmeny. Alla obligatoriska fält markeras med asterisk (*). Klicka på "Spara" när formuläret är komplett.',
      )
    })

    await test.step('Krav skapat — inline-detaljvy', async () => {
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/sv\/requirements/, { timeout: 15_000 })
      expect(page.url()).not.toContain('undefined')

      // Capture the uniqueId before the ?selected= param is cleaned from URL
      const postCreateUrl = page.url()
      const selectedParam = new URL(postCreateUrl).searchParams.get('selected')
      if (selectedParam) createdRequirementUniqueId = selectedParam

      await expect(
        page.locator('[data-expanded-detail-cell="true"]'),
      ).toBeVisible({ timeout: 10_000 })

      // If URL param wasn't available, read uniqueId from the dev marker context
      if (!createdRequirementUniqueId) {
        const ctx = await page
          .locator('[data-developer-mode-context*="inline detail pane"]')
          .first()
          .getAttribute('data-developer-mode-context')
        const match = ctx?.match(/inline detail pane:\s*(\S+)/)
        if (match?.[1]) createdRequirementUniqueId = match[1]
      }

      const panel = page.locator('[data-expanded-detail-cell="true"]')

      if (createdRequirementUniqueId) {
        // Navigate with ?selected= so the panel is open before filtering.
        // Filter after the panel is open — the selected row stays visible in
        // the filtered results, so React keeps the panel open.
        await page.goto(
          `/sv/requirements?selected=${createdRequirementUniqueId}`,
        )
        await page.waitForLoadState('networkidle')
        await expect(panel).toBeVisible({ timeout: 10_000 })

        const filterBtn = page.getByLabel('Filtrera efter Krav-ID')
        await filterBtn.click()
        const filterInput = page.getByRole('textbox', { name: 'Krav-ID' })
        await filterInput.fill(createdRequirementUniqueId)
        await filterInput.press('Enter')
        await expect(page.locator('tbody tr').first()).toBeVisible({
          timeout: 10_000,
        })
        await page.evaluate(() =>
          (document.activeElement as HTMLElement)?.blur(),
        )
        // Give React time to settle selection state after filter re-render
        await page.waitForTimeout(500)
      }

      await expect(panel).toBeVisible({ timeout: 10_000 })

      // Walk the offsetParent chain to get the stepper's absolute document
      // position (bypasses inner scroll containers that intercept scrollIntoView),
      // then scroll window so the stepper sits just below the sticky header.
      await page.evaluate(() => {
        const stepper = document.querySelector(
          '[data-developer-mode-name="status stepper"]',
        ) as HTMLElement | null
        if (!stepper) return
        let top = 0
        let el: HTMLElement | null = stepper
        while (el) {
          top += el.offsetTop
          el = el.offsetParent as HTMLElement | null
        }
        const stickyHeader = document.querySelector(
          '[data-sticky-table-header="true"]',
        ) as HTMLElement | null
        const headerHeight = stickyHeader?.offsetHeight ?? 0
        window.scrollTo({
          top: Math.max(0, top - headerHeight - 8),
          behavior: 'instant',
        })
      })
      await page.waitForTimeout(150)
      await page.setViewportSize({ width: 1440, height: 1200 })
      // Remove any stale annotations and blur focus so neither shows in screenshot
      await removeAnnotation(page)
      await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())

      await snap(
        page,
        'krav-skapat',
        'Krav skapat',
        'Efter att formuläret sparats återgår applikationen till kravkatalogen med det nyss skapade kravet öppet i inline-detaljvyn. Kravet startar i status **Utkast**.',
        { fullPage: false },
      )

      await page.setViewportSize({ width: 1440, height: 900 })
    })

    // ── Sektion 4: Kravdetaljer och statusövergångar ───────────────────────
    currentSection = 'Kravdetaljer och statusövergångar'

    await test.step('Statusstegare — närbild', async () => {
      await page.setViewportSize({ width: 1440, height: 1200 })
      await snap(
        page,
        'statusstegare',
        'Statusstegare',
        'Statusstegaren visar kravets position i livscykeln: **Utkast** → **Granskning** → **Publicerad** → **Arkiverad**. Den aktuella statusen är markerad. Knappar för statusövergångar visas intill stegaren.',
        { fullPage: false },
      )
      await page.setViewportSize({ width: 1440, height: 900 })
    })

    await test.step('Övergång till Granskning', async () => {
      const granskning = page.getByRole('button', { name: 'Granskning ↗' })
      await expect(granskning).toBeVisible({ timeout: 10_000 })

      await page.setViewportSize({ width: 1440, height: 1200 })
      await snap(
        page,
        'overgang-utkast',
        'Status: Utkast',
        'Ett krav i **Utkast**-status har knappen "Granskning ↗" tillgänglig. Klicka på den för att skicka kravet till granskning. Det innebär att kravet är klart för kollegial granskning och godkännande.',
        { fullPage: false },
      )
      await page.setViewportSize({ width: 1440, height: 900 })

      if (createdRequirementUniqueId) {
        const transitionRes = await page.request.post(
          `/api/requirement-transitions/${createdRequirementUniqueId}`,
          { data: { statusId: 2 } },
        )
        if (!transitionRes.ok()) {
          const body = await transitionRes.text()
          throw new Error(
            `Transition to Granskning failed: HTTP ${transitionRes.status()} — ${body.slice(0, 200)}`,
          )
        }
      }

      const grTarget = createdRequirementUniqueId
        ? `/sv/requirements?selected=${createdRequirementUniqueId}`
        : '/sv/requirements'
      await page.goto(grTarget)
      await expect(
        page.locator('[data-expanded-detail-cell="true"]'),
      ).toBeVisible({ timeout: 10_000 })
      // Wait for fetchTransitions effect to fire and populate the new buttons
      await expect(
        page.getByRole('button', { name: 'Publicera ↗' }),
      ).toBeVisible({ timeout: 15_000 })

      if (createdRequirementUniqueId) {
        const filterBtn = page.getByLabel('Filtrera efter Krav-ID')
        await filterBtn.click()
        const filterInput = page.getByRole('textbox', { name: 'Krav-ID' })
        await filterInput.fill(createdRequirementUniqueId)
        await filterInput.press('Enter')
        await expect(page.locator('tbody tr').first()).toBeVisible({
          timeout: 10_000,
        })
        await page.evaluate(() =>
          (document.activeElement as HTMLElement)?.blur(),
        )
        await page.waitForTimeout(500)
      }

      await page.evaluate(() => {
        const stepper = document.querySelector(
          '[data-developer-mode-name="status stepper"]',
        ) as HTMLElement | null
        if (!stepper) return
        let top = 0
        let el: HTMLElement | null = stepper
        while (el) {
          top += el.offsetTop
          el = el.offsetParent as HTMLElement | null
        }
        const stickyHeader = document.querySelector(
          '[data-sticky-table-header="true"]',
        ) as HTMLElement | null
        const headerHeight = stickyHeader?.offsetHeight ?? 0
        window.scrollTo({
          top: Math.max(0, top - headerHeight - 8),
          behavior: 'instant',
        })
      })
      await page.waitForTimeout(150)

      await page.setViewportSize({ width: 1440, height: 1200 })
      await snap(
        page,
        'overgang-granskning',
        'Status: Granskning',
        'Kravet är nu i **Granskning**-status. Stegaren uppdateras för att reflektera detta. Knappen "Publicera ↗" visas för att godkänna och publicera kravet, och "← Utkast" för att återföra det till utkastläge om ändringar behövs.',
        { fullPage: false },
      )
      await page.setViewportSize({ width: 1440, height: 900 })
    })

    await test.step('Övergång till Publicerad', async () => {
      const publicera = page.getByRole('button', { name: 'Publicera ↗' })
      await expect(publicera).toBeVisible({ timeout: 10_000 })

      // The dialog overlays everything — no need for a filtered table behind it.
      // Apply filter + scroll only later, for the "Status: Publicerad" snap.
      await page.setViewportSize({ width: 1440, height: 1200 })
      await publicera.click()
      const confirmBtn = page.getByRole('button', { name: 'Bekräfta' })
      await expect(confirmBtn).toBeVisible({ timeout: 5_000 })
      // Wait for the framer-motion enter animation (duration: 0.15s) to finish
      await page.waitForTimeout(200)

      await snap(
        page,
        'overgang-publicera-bekrafta',
        'Publicera — bekräftelsedialog',
        'Innan kravet publiceras visas en bekräftelsedialog. Klicka på "Bekräfta" för att slutföra publiceringen, eller "Avbryt" för att avbryta.',
        { fullPage: false },
      )

      // Dismiss dialog and perform the transition via the API directly to avoid
      // the same dev-server routing issue as the Granskning transition.
      await page.keyboard.press('Escape')
      await expect(page.locator('[role="dialog"]')).toBeHidden({
        timeout: 5_000,
      })

      if (createdRequirementUniqueId) {
        const transitionRes = await page.request.post(
          `/api/requirement-transitions/${createdRequirementUniqueId}`,
          { data: { statusId: 3 } },
        )
        if (!transitionRes.ok()) {
          const body = await transitionRes.text()
          throw new Error(
            `Transition to Publicerad failed: HTTP ${transitionRes.status()} — ${body.slice(0, 200)}`,
          )
        }
      }

      const pubTarget = createdRequirementUniqueId
        ? `/sv/requirements?selected=${createdRequirementUniqueId}`
        : '/sv/requirements'
      await page.goto(pubTarget)
      await expect(
        page.locator('[data-expanded-detail-cell="true"]'),
      ).toBeVisible({ timeout: 10_000 })
      // Wait for the Publicera button to be gone (confirms Published state)
      await expect(
        page.getByRole('button', { name: 'Publicera ↗' }),
      ).toBeHidden({ timeout: 15_000 })

      if (createdRequirementUniqueId) {
        const filterBtn = page.getByLabel('Filtrera efter Krav-ID')
        await filterBtn.click()
        const filterInput = page.getByRole('textbox', { name: 'Krav-ID' })
        await filterInput.fill(createdRequirementUniqueId)
        await filterInput.press('Enter')
        await expect(page.locator('tbody tr').first()).toBeVisible({
          timeout: 10_000,
        })
        await page.evaluate(() =>
          (document.activeElement as HTMLElement)?.blur(),
        )
        await page.waitForTimeout(500)
      }

      await page.evaluate(() => {
        const stepper = document.querySelector(
          '[data-developer-mode-name="status stepper"]',
        ) as HTMLElement | null
        if (!stepper) return
        let top = 0
        let el: HTMLElement | null = stepper
        while (el) {
          top += el.offsetTop
          el = el.offsetParent as HTMLElement | null
        }
        const stickyHeader = document.querySelector(
          '[data-sticky-table-header="true"]',
        ) as HTMLElement | null
        const headerHeight = stickyHeader?.offsetHeight ?? 0
        window.scrollTo({
          top: Math.max(0, top - headerHeight - 8),
          behavior: 'instant',
        })
      })
      await page.waitForTimeout(150)

      await snap(
        page,
        'overgang-publicerad',
        'Status: Publicerad',
        'Kravet är nu **Publicerat** och utgör den aktiva, godkända versionen. Vid redigering av ett Publicerat krav skapas en ny Utkast-version medan den publicerade versionen förblir aktiv tills det nya utkastet genomgått granskningsprocessen.',
        { fullPage: false },
      )
      await page.setViewportSize({ width: 1440, height: 900 })
    })

    // ── Sektion 5: Kravpaket ──────────────────────────────────────────────
    currentSection = 'Kravpaket'
    setSectionIntro(
      'Ett **kravpaket** samlar en uppsättning krav som hör ihop inom ramen för ett specifikt projekt, en leverans eller ett verksamhetsområde. Paketet fungerar som en spårbar enhet — du kan följa implementationsstatus per krav, begära avsteg och generera granskningsrapporter direkt från paketet.',
    )

    await test.step('Kravpaketslista', async () => {
      await page.goto('/sv/requirement-packages')
      await page.waitForLoadState('networkidle')
      await snap(
        page,
        'kravpaketslista',
        'Kravpaketslista',
        'Listan visar paketens namn, ID, livscykelstatus och genomförandeform. Klicka på ett paket för att se dess detaljer.',
      )
    })

    await test.step('Sök kravpaket', async () => {
      const searchInput = page
        .locator(
          'input[type="search"], input[placeholder*="Sök"], input[placeholder*="namn"]',
        )
        .first()
      if ((await searchInput.count()) > 0) {
        await searchInput.fill('Införande')
        await page.waitForTimeout(500)
        await snap(
          page,
          'kravpaketslista-sok',
          'Sökning bland kravpaket',
          'Filtrera paket genom att skriva i sökrutan. Listan uppdateras i realtid.',
        )
        await searchInput.clear()
        await page.waitForTimeout(300)
      }
    })

    await test.step('Skapa nytt kravpaket', async () => {
      const newPkgBtn = page.getByRole('button', { name: 'Nytt kravpaket' })
      if ((await newPkgBtn.count()) > 0) {
        await newPkgBtn.click()
        await page.waitForTimeout(400)
        await snap(
          page,
          'skapa-kravpaket',
          'Skapa nytt kravpaket',
          'Klicka på **"Nytt kravpaket"** för att skapa ett nytt paket. Ange ett namn — ett unikt ID (slug) genereras automatiskt. Kravpaket används för att samla krav som hör till ett specifikt projekt eller leverans.',
          { fullPage: false },
        )
        await page.keyboard.press('Escape')
        await page.waitForTimeout(200)
      }
    })

    await test.step('Kravpaketdetalj', async () => {
      await page.goto('/sv/requirement-packages/ETJANSTPLATT')
      await page.waitForLoadState('networkidle')
      await snap(
        page,
        'kravpaketdetalj',
        'Kravpaketdetalj — delad vy',
        'Kravpaketdetaljsidan har en delad layout: **vänster panel** listar krav som ingår i paketet med deras implementationsstatus, och **höger panel** visar tillgängliga krav att lägga till. Klicka på en rad för att se kravets fullständiga detaljer.',
        { fullPage: false },
      )
    })

    await test.step('Lägg till krav i paket', async () => {
      // The page has two tables side by side; right panel = second tbody.
      const rightRows = page.locator('tbody').nth(1).locator('tr')
      const hasRightRows = (await rightRows.count()) > 0

      if (hasRightRows) {
        // Click the checkbox cell of the first row to select it
        const firstCheckbox = rightRows
          .first()
          .locator('input[type="checkbox"]')
        if ((await firstCheckbox.count()) > 0) {
          await firstCheckbox.check()
        } else {
          await rightRows
            .first()
            .evaluate((el: Element) => (el as HTMLElement).click())
        }
        await page.evaluate(() =>
          (document.activeElement as HTMLElement)?.blur(),
        )
        await page.waitForTimeout(300)

        await snap(
          page,
          'lagg-till-krav-valt',
          'Välj krav att lägga till',
          'Markera ett eller flera krav i den högra panelen "Tillgängliga krav". Knappen **"Lägg till valda (N)"** visas i panelens rubrik när minst ett krav är markerat.',
          { fullPage: false },
        )

        const addBtn = page.getByRole('button', { name: /Lägg till valda/i })
        if ((await addBtn.count()) > 0) {
          await addBtn.click()
          await expect(page.locator('[role="dialog"]')).toBeVisible({
            timeout: 5_000,
          })

          await snap(
            page,
            'lagg-till-krav-modal',
            'Lägg till krav — behovsreferens',
            'När du lägger till krav i ett paket kan du koppla en **behovsreferens** till dem. En behovsreferens är en fritext som beskriver det verksamhetsbehov eller funktionella krav som kravet ska uppfylla i det här paketet — t.ex. ett ärendenummer, ett mål eller ett avsnitt i en kravspecifikation. Du kan välja en befintlig referens eller skriva en ny. Fältet är valfritt.',
            { fullPage: false },
          )

          const cancelAddBtn = page
            .getByRole('button', { name: 'Avbryt' })
            .last()
          await cancelAddBtn.click()
          await expect(page.locator('[role="dialog"]')).toBeHidden({
            timeout: 5_000,
          })
        }
      }
    })

    await test.step('Redigera kravpaket', async () => {
      const editBtn = page.getByRole('button', { name: /Redigera/i }).first()
      if ((await editBtn.count()) > 0) {
        await editBtn.click()
        await page.waitForTimeout(400)
        await snap(
          page,
          'redigera-kravpaket',
          'Redigera kravpaket',
          'Redigeringspanelen låter dig uppdatera paketets namn, verksamhetsreferens, livscykelstatus, genomförandeform och verksamhetsobjekt. Klicka på "Spara" för att tillämpa ändringarna.',
          { fullPage: false },
        )
        const cancelBtn = page
          .getByRole('button', { name: /Avbryt|Stäng/i })
          .first()
        if ((await cancelBtn.count()) > 0) await cancelBtn.click()
      }
    })

    // ── Sektion 6: Avsteg ─────────────────────────────────────────────────
    currentSection = 'Avsteg'
    setSectionIntro(
      'Ett **avsteg** dokumenterar att ett krav i ett kravpaket inte kan uppfyllas fullt ut som specificerat, och varför. Avstegsprocessen är trestegsbaserad: **Utkast** → **Granskning begärd** → **Beslutad** (godkänd eller avslagen). Nedan visas varje steg i processen.',
    )

    await test.step('Paket med kravposter', async () => {
      await page.goto('/sv/requirement-packages/ETJANSTPLATT')
      await page.waitForLoadState('networkidle')

      await snap(
        page,
        'paket-for-avsteg',
        'Kravpaket — avstegskontext',
        '**Steg 1 — Navigera till kravpaketet.** Avsteg hanteras i kontexten av ett kravpaket. Klicka på ett paket för att öppna detaljvyn med listan "Krav i paketet".',
        { fullPage: false },
      )
    })

    await test.step('Kravposter — expanderat krav', async () => {
      // The left panel only renders when packageItems.length > 0 — wait for it to appear
      // (it's absent while items are loading or if the package is empty)
      await page
        .locator('[data-package-detail-list-panel="items"]')
        .waitFor({ state: 'visible', timeout: 15_000 })
        .catch(() => {})

      // Scope to the left panel (items in package) — right panel is "available" requirements
      const allRows = page.locator(
        '[data-package-detail-list-panel="items"] tbody tr',
      )
      const rowCount = await allRows.count()

      if (rowCount > 0) {
        // BEH0002 is seeded without deviations — locate it by identifier text.
        const firstRow = allRows.filter({ hasText: 'BEH0002' })
        await firstRow
          .first()
          .evaluate((el: Element) => (el as HTMLElement).click())
        await expect(
          page.locator('[data-expanded-detail-cell="true"]'),
        ).toBeVisible({ timeout: 10_000 })

        // Wait for the deviation fetch inside the panel to complete —
        // "Begär ett avsteg" only renders once the fetch returns no existing deviations
        const deviationBtn = page.getByRole('button', {
          name: 'Begär ett avsteg',
        })
        await deviationBtn.waitFor({ state: 'visible', timeout: 10_000 })
        // Blur active element so no focus ring appears in the screenshot
        await page.evaluate(() =>
          (document.activeElement as HTMLElement)?.blur(),
        )
        await snap(
          page,
          'krav-i-paket-expanderat',
          'Krav expanderat i paketkontext',
          '**Steg 2 — Expandera ett krav.** Klicka på en rad i listan för att öppna kravets detaljpanel. Om inget aktivt avsteg finns visas knappen **"Begär ett avsteg"** — klicka på den för att starta avstegsprocessen.',
          { fullPage: false },
        )

        await test.step('Avstegsformulär — öppet', async () => {
          await deviationBtn.click()
          await expect(page.locator('[role="dialog"]')).toBeVisible({
            timeout: 5_000,
          })

          await snap(
            page,
            'avstegsformular-tomt',
            'Formulär för avstegsansökan',
            '**Steg 3 — Fyll i avstegsformuläret.** Ange en motivering som förklarar varför kravet inte kan uppfyllas som specificerat och vilka kompenserande åtgärder som vidtas. Fältet "Registrerat av" är valfritt.',
            { fullPage: false },
          )
        })

        await test.step('Avstegsformulär — ifyllt', async () => {
          await page.locator('#deviation-motivation').fill(MOCK_DEVIATION)
          await page.locator('#deviation-createdBy').fill('Playwright Guide')

          await snap(
            page,
            'avstegsformular-ifyllt',
            'Avstegsformulär ifyllt',
            'Klicka på **"Registrera avsteg"** för att spara. Motiveringstexten ingår sedan i avstegsgranskningsrapporten.',
            { fullPage: false },
          )
        })

        await test.step('Avsteg registrerat', async () => {
          const submitBtn = page.getByRole('button', {
            name: 'Registrera avsteg',
          })
          // Ensure button is enabled (fill() should have updated React state)
          await expect(submitBtn).toBeEnabled({ timeout: 3_000 })
          // Set up the response listener BEFORE clicking so we don't miss a fast response
          const deviationResPromise = page.waitForResponse(
            /\/api\/package-item-deviations\//,
            { timeout: 15_000 },
          )
          await submitBtn.click()
          const deviationRes = await deviationResPromise
          if (!deviationRes.ok()) {
            throw new Error(
              `Deviation POST failed: ${deviationRes.status()} ${await deviationRes.text()}`,
            )
          }
          // Dialog closes on success
          await expect(page.locator('[role="dialog"]')).not.toBeVisible({
            timeout: 5_000,
          })
          await page.waitForTimeout(500)

          await snap(
            page,
            'avsteg-registrerat',
            'Avsteg registrerat — Utkast',
            '**Steg 4 — Utkastläge.** Avsteget visas nu i detaljpanelen med sin motivering. I utkastläget kan det fortfarande redigeras eller tas bort. När det är klart, klicka **"Granskning ↗"** för att skicka det till granskning.',
            { fullPage: false },
          )
        })

        await test.step('Avsteg — skicka för granskning', async () => {
          const reviewBtn = page.getByRole('button', { name: /Granskning\s*↗/ })
          if ((await reviewBtn.count()) > 0) {
            await reviewBtn.click()
            // Wait for the button to disappear — confirms the transition has
            // completed and the stepper has re-rendered to "Granskning"
            await reviewBtn.waitFor({ state: 'hidden', timeout: 10_000 })

            await snap(
              page,
              'avsteg-granskning',
              'Avsteg — granskning begärd',
              '**Steg 5 — Granskning begärd.** Avsteget är nu låst för redigering och inväntar beslut. En behörig granskare klickar **"Beslutad ↗"** för att registrera ett beslut, eller **"← Utkast"** för att återföra det om komplettering behövs.',
              { fullPage: false },
            )
          }
        })

        await test.step('Avsteg — beslut', async () => {
          const decidedBtn = page.getByRole('button', { name: /Beslutad\s*↗/ })
          if ((await decidedBtn.count()) > 0) {
            await decidedBtn.click()
            await expect(page.locator('[role="dialog"]')).toBeVisible({
              timeout: 5_000,
            })

            await snap(
              page,
              'avsteg-beslut-formular',
              'Registrera beslut',
              '**Steg 6 — Registrera beslut.** Granskaren anger en **beslutsmotivering**, vem som fattat beslutet och datum. Välj sedan **"Godkänn"** eller **"Avslå"** för att slutföra beslutet.',
              { fullPage: false },
            )

            await page.keyboard.press('Escape')
            await expect(page.locator('[role="dialog"]')).toBeHidden({
              timeout: 5_000,
            })
          }
        })

        await test.step('Avsteg — granskningsrapport', async () => {
          const reportBtn = page.getByRole('button', {
            name: /granskningsrapport/i,
          })
          if ((await reportBtn.count()) > 0) {
            await addAnnotation(page, 'button:has-text("granskningsrapport")', {
              arrowSide: 'left',
            })
            await snap(
              page,
              'avsteg-rapport-knapp',
              'Granskningsrapport för avsteg',
              '**Steg 7 — Granskningsrapport.** När ett beslut har registrerats kan du generera en **granskningsrapport** direkt från detaljpanelen. Rapporten sammanställer kravets text, avstegets motivering och beslutet — i ett format lämpligt för dokumentation och revision. Den kan skrivas ut eller laddas ned som PDF.',
              { fullPage: false },
            )
            await removeAnnotation(page)
          }
        })
      }
    })

    // ── Sektion 7: Förbättringsförslag ────────────────────────────────────
    currentSection = 'Förbättringsförslag'

    await test.step('Förbättringsförslag — lämna förslag på ANV0002', async () => {
      // Navigate to catalog filtered on ANV0002 — clean requirement with no existing suggestions
      await page.goto('/sv/requirements?selected=ANV0002')
      await page.waitForLoadState('networkidle')
      await expect(
        page.locator('[data-expanded-detail-cell="true"]'),
      ).toBeVisible({ timeout: 10_000 })

      // Scroll the improvement suggestions section into view
      const suggSection = page.locator(
        'section[aria-labelledby="improvementSuggestionsHeading"]',
      )
      await suggSection.scrollIntoViewIfNeeded()
      await page.waitForTimeout(300)

      await snap(
        page,
        'forslag-sektion-tom',
        'Förbättringsförslag — tom sektion',
        'Längst ned i inline-detaljvyn finns sektionen **Förbättringsförslag**. En ansvarig för ett kravpaket (upphandling, projekt, förvaltning) kan lämna ett förslag på förbättring av kravet. Klicka på **"+ Registrera förslag"** för att öppna formuläret.',
        { fullPage: false },
      )
    })

    await test.step('Förbättringsförslag — formulär öppet', async () => {
      await page.getByRole('button', { name: /Registrera förslag/i }).click()
      await expect(page.locator('[role="dialog"]')).toBeVisible({
        timeout: 5_000,
      })

      await snap(
        page,
        'forslagsformular-tomt',
        'Formulär för förbättringsförslag',
        'Formuläret öppnas som en modal dialog. Ange förbättringsidén i textfältet och valfritt ditt namn i "Registrerat av". Klicka på **"Spara"** för att registrera förslaget.',
        { fullPage: false },
      )
    })

    await test.step('Förbättringsförslag — formulär ifyllt', async () => {
      await setReactInputValue(page, 'suggestion-content', MOCK_SUGGESTION)
      await setReactInputValue(page, 'suggestion-createdBy', 'Playwright Guide')

      await snap(
        page,
        'forslagsformular-ifyllt',
        'Förbättringsförslag ifyllt',
        'Förslagstexten beskriver en konkret förbättringsidé. Knappen **"Spara"** aktiveras när innehållsfältet har text.',
        { fullPage: false },
      )
    })

    await test.step('Förbättringsförslag — registrerat på ANV0002', async () => {
      await page.getByRole('button', { name: 'Spara' }).click()
      await expect(
        page.getByRole('dialog', { name: /Registrera förslag/i }),
      ).not.toBeVisible({ timeout: 5_000 })

      const suggSection = page.locator(
        'section[aria-labelledby="improvementSuggestionsHeading"]',
      )
      await suggSection.scrollIntoViewIfNeeded()
      await page.waitForTimeout(500)

      await snap(
        page,
        'forslag-registrerat',
        'Förbättringsförslag registrerat',
        'Det registrerade förslaget visas i sektionen med sin arbetsflödesstatus: **Utkast → Granskning begärd → Granskad**. Förslaget kan redigeras och skickas för granskning via knappen **"Granskning ↗"**.',
        { fullPage: false },
      )
    })

    await test.step('Förbättringsförslag — flera förslag på IDN0001', async () => {
      // IDN0001 has multiple seeded improvement suggestions — good for illustrating the list
      await page.goto('/sv/requirements?selected=IDN0001')
      await page.waitForLoadState('networkidle')
      await expect(
        page.locator('[data-expanded-detail-cell="true"]'),
      ).toBeVisible({ timeout: 10_000 })

      const suggSection = page.locator(
        'section[aria-labelledby="improvementSuggestionsHeading"]',
      )
      await suggSection.scrollIntoViewIfNeeded()
      await page.waitForTimeout(300)

      await snap(
        page,
        'forslag-flera',
        'Flera förbättringsförslag',
        'Ett krav kan ha flera förbättringsförslag från olika intressenter. Varje förslag hanteras individuellt genom sitt eget arbetsflöde. Listan ger en samlad bild av alla inkomna synpunkter på kravet.',
        { fullPage: false },
      )
    })

    // ── Sektion 9: Administrationscenter ─────────────────────────────────
    currentSection = 'Administrationscenter'

    await test.step('Admin — Benämningar', async () => {
      await page.goto('/sv/admin')
      await page.waitForLoadState('networkidle')
      await snap(
        page,
        'admin-benamningar',
        'Admin — Benämningar',
        'Administrationscenterets flik **Benämningar** låter dig anpassa gränssnittsetiketter för domänspecifika termer. Till exempel kan "Kravtext" byta namn till en term som passar din organisations vokabulär.',
      )
    })

    await test.step('Admin — Kolumner', async () => {
      await page.getByRole('tab', { name: 'Kolumner' }).click()
      await page.waitForTimeout(300)
      await snap(
        page,
        'admin-kolumner',
        'Admin — Kolumnhantering',
        'Fliken **Kolumner** konfigurerar vilka kolumner som visas som standard i kravkatalogen och deras ordning. Ändringar gäller för alla användare. Du kan också ange standardvyer för olika kontexter.',
      )
    })

    await test.step('Admin — Referensdata', async () => {
      await page.getByRole('tab', { name: 'Referensdata' }).click()
      await page.waitForTimeout(300)
      await snap(
        page,
        'admin-referensdata',
        'Admin — Referensdata',
        'Fliken **Referensdata** innehåller länkar till alla taxonomihanteringssidor: områden, typer, statusar, risknivåer, kvalitetsegenskaper, normreferenser och användningsscenarier. Här bygger du upp de grunddata som krav refererar till.',
      )
    })

    // ── Sektion 9: Referensdatahantering ─────────────────────────────────
    currentSection = 'Referensdatahantering'

    await test.step('Kravområden', async () => {
      await page.goto('/sv/requirement-areas')
      await page.waitForLoadState('networkidle')
      await snap(
        page,
        'kravomraden',
        'Kravområden',
        'Kravområden organiserar krav efter organisatorisk domän. Varje område har en ägare, ett prefix som används i krav-ID (t.ex. "SÄK" ger ID:n som "SÄK0001") och en beskrivning.',
      )
    })

    await test.step('Kravstatusar', async () => {
      await page.goto('/sv/requirement-statuses')
      await page.waitForLoadState('networkidle')
      await snap(
        page,
        'kravstatusar',
        'Kravstatusar',
        'Kravstatusar definierar livscykelstegen. De fyra systemstatusarna (Utkast, Granskning, Publicerad, Arkiverad) kan inte tas bort eller byta namn — de utgör ryggraden i arbetsflödet. Övriga statusar kan anpassas.',
      )
    })

    await test.step('Risknivåer', async () => {
      await page.goto('/sv/risk-levels')
      await page.waitForLoadState('networkidle')
      await snap(
        page,
        'risknivåer',
        'Risknivåer',
        'Risknivåer klassificerar kravets kritikalitet. Varje nivå kan tilldelas en färg för visuell identifiering i katalogen och detaljvyer. Färgkodningen gör det enkelt att snabbt bedöma ett kravs vikt.',
      )
    })

    await test.step('Kravtyper', async () => {
      await page.goto('/sv/requirement-types')
      await page.waitForLoadState('networkidle')
      await snap(
        page,
        'kravtyper',
        'Kravtyper',
        'Kravtyper kategoriserar kravets karaktär (t.ex. funktionellt, icke-funktionellt, säkerhetskrav). Typer används för filtrering, rapportering och för att säkerställa rätt kvalitetsegenskaper kopplas till kravet.',
      )
    })

    await test.step('Kvalitetsegenskaper', async () => {
      await page.goto('/sv/quality-characteristics')
      await page.waitForLoadState('networkidle')
      await snap(
        page,
        'kvalitetsegenskaper',
        'Kvalitetsegenskaper',
        'Kvalitetsegenskaper är ett hierarkiskt taxonomi som beskriver icke-funktionella krav (t.ex. tillgänglighet, prestanda, säkerhet). Egenskaperna kopplas till krav för att säkerställa täckning av kvalitetskraven.',
      )
    })

    await test.step('Normreferenser', async () => {
      await page.goto('/sv/norm-references')
      await page.waitForLoadState('networkidle')
      await snap(
        page,
        'normreferenser',
        'Normreferenser',
        'Normreferenser är ett bibliotek med externa standarder och regelverk (t.ex. ISO-standarder, GDPR). Krav kan referera till en eller flera normreferenser för att tydliggöra vilka regelverk de härstammar från.',
      )
    })

    await test.step('Ägare', async () => {
      await page.goto('/sv/owners')
      await page.waitForLoadState('networkidle')
      await snap(
        page,
        'agare',
        'Ägare',
        'Ägare är de personer eller roller som ansvarar för kravområden. Varje kravområde tilldelas en ägare som är ansvarig för kravens kvalitet och aktualitet.',
      )
    })

    // ── Sektion 10: Rapporter ─────────────────────────────────────────────
    currentSection = 'Rapporter'

    await test.step('Rapporter från kravkatalogen', async () => {
      await page.goto('/sv/requirements')
      await page.waitForLoadState('networkidle')
      await expect(
        page.locator('[data-sticky-table-header="true"]'),
      ).toBeVisible({ timeout: 10_000 })

      // Select one or more requirements to show the report button
      const firstCheckbox = page
        .locator('tbody tr input[type="checkbox"]')
        .first()
      if ((await firstCheckbox.count()) > 0) {
        await firstCheckbox.click()
        await page.waitForTimeout(300)
        await snap(
          page,
          'rapporter-kravkatalog',
          'Rapportgenerering från katalogen',
          'Markera ett eller flera krav i katalogen för att aktivera rapportknappar i verktygsfältet. Du kan generera PDF-rapporter för granskningsunderlag, avstegsöversikter, ändringshistorik och mer.',
        )
        // Deselect
        await firstCheckbox.click()
      } else {
        await snap(
          page,
          'rapporter-kravkatalog',
          'Rapporter',
          'Markera krav i katalogen för att aktivera rapportfunktionerna. Systemet stödjer PDF- och utskriftsrapporter för granskning, avstegsöversikter och ändringshistorik.',
        )
      }
    })

    await test.step('Rapporter från kravdetalj', async () => {
      await page.goto('/sv/requirements/1')
      await page.waitForLoadState('networkidle')

      const reportBtn = page
        .getByRole('button', { name: /Skriv ut|Rapport|Print/i })
        .first()
      if ((await reportBtn.count()) > 0) {
        await reportBtn.click()
        await page.waitForTimeout(300)
        await snap(
          page,
          'rapporter-kravdetalj',
          'Rapporter från kravdetaljsidan',
          'Från kravdetaljsidan kan du öppna rapportmenyn för att ladda ned eller skriva ut: **Ändringshistorik** (alla versioner), **Förbättringsförslagshistorik** och granskningsunderlag. Rapporterna är formaterade för utskrift och PDF-export.',
          { fullPage: false },
        )
        await page.keyboard.press('Escape')
      }
    })
  })
})
