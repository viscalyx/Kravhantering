import { writeFile } from 'node:fs/promises'
import { expect, type Locator, type Page, test } from '@playwright/test'
import {
  type RequirementDetailPrefetchEvent,
  summarizeRequirementDetailPrefetchEvents,
} from '@/lib/requirements/detail-prefetch'
import {
  assessRequirementDetailPrefetchProxy,
  maximumRequestMultiplicity,
  type RequirementDetailPrefetchProxyRun,
  type RequirementDetailPrefetchProxySurface,
  type RequirementDetailPrefetchProxySurfaceRun,
  requirementDetailPrefetchProxySurfaces,
} from '@/tests/integration/requirement-detail-prefetch-proxy'

const specificationId = 8
const eventStorageKey = 'requirement-detail-prefetch-proxy-events'
const modeStorageKey = 'requirement-detail-prefetch-proxy-mode'
const directTrialCount = 5
const usedIntentTrialCount = 3

interface PreparedSurface {
  button: Locator
  row: Locator
}

async function installEventCollector(page: Page): Promise<void> {
  await page.addInitScript(
    ([storageKey, storedModeKey]) => {
      const validationWindow = window as typeof window & {
        __requirementDetailPrefetchValidationOverride?: boolean
      }
      validationWindow.__requirementDetailPrefetchValidationOverride =
        window.sessionStorage.getItem(storedModeKey) === 'on'
      window.addEventListener('krav:requirement-detail-prefetch', event => {
        const stored = JSON.parse(
          window.sessionStorage.getItem(storageKey) ?? '[]',
        ) as unknown[]
        stored.push((event as CustomEvent<unknown>).detail)
        window.sessionStorage.setItem(storageKey, JSON.stringify(stored))
      })
    },
    [eventStorageKey, modeStorageKey],
  )
}

async function setProxyMode(page: Page, mode: 'off' | 'on'): Promise<void> {
  await page.evaluate(
    ([storedModeKey, nextMode]) => {
      window.sessionStorage.setItem(storedModeKey, nextMode)
    },
    [modeStorageKey, mode],
  )
}

async function resetEvents(page: Page): Promise<void> {
  await page.evaluate(storageKey => {
    window.sessionStorage.setItem(storageKey, '[]')
  }, eventStorageKey)
}

async function readEvents(
  page: Page,
): Promise<RequirementDetailPrefetchEvent[]> {
  return await page.evaluate(storageKey => {
    return JSON.parse(
      window.sessionStorage.getItem(storageKey) ?? '[]',
    ) as RequirementDetailPrefetchEvent[]
  }, eventStorageKey)
}

async function waitForEvent(
  page: Page,
  predicate: (event: RequirementDetailPrefetchEvent) => boolean,
): Promise<void> {
  await expect
    .poll(async () => (await readEvents(page)).some(predicate))
    .toBe(true)
}

async function gotoSpecificationDetail(page: Page): Promise<void> {
  await page.goto(`/sv/specifications/${specificationId}`, {
    waitUntil: 'domcontentloaded',
  })
  await expect(page.getByRole('tab', { name: 'RFI-frågelista' })).toBeVisible()
  await expect(
    page.getByText(/^Det gick inte att läsa in tillgängliga krav:/u),
  ).toBeHidden()
}

async function prepareSurface(
  page: Page,
  surface: RequirementDetailPrefetchProxySurface,
): Promise<PreparedSurface> {
  if (surface === 'requirements-library:library-requirement') {
    await page.goto('/sv/requirements', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Filtrera efter Krav-ID' }).click()
    const filter = page.getByRole('textbox', { name: 'Krav-ID' })
    await filter.fill('INT0001')
    await filter.press('Enter')
    const button = page.getByRole('button', { name: /^INT0001\b/u })
    await expect(button).toBeVisible()
    return { button, row: button.locator('xpath=ancestor::tr[1]') }
  }

  await gotoSpecificationDetail(page)
  const leftPanel = page.locator(
    '[data-specification-detail-list-panel="items"]',
  )
  if (surface === 'specification-left:specification-local-requirement') {
    const marker = leftPanel
      .locator('[data-specification-local-marker="true"]')
      .first()
    await expect(marker).toBeVisible()
    const row = marker.locator('xpath=ancestor::tr[1]')
    return { button: row.getByRole('button').first(), row }
  }
  if (surface === 'specification-left:library-requirement') {
    const row = leftPanel
      .locator('tbody tr:not(:has([data-specification-local-marker="true"]))')
      .filter({ has: page.getByRole('button') })
      .first()
    await expect(row).toBeVisible()
    return { button: row.getByRole('button').first(), row }
  }

  const rightPanel = page.locator(
    '[data-specification-detail-list-panel="available"]',
  )
  const row = rightPanel
    .getByRole('table', { name: 'Lista över krav' })
    .locator('tbody tr')
    .filter({ has: page.getByRole('button') })
    .first()
  await expect(row).toBeVisible()
  return { button: row.getByRole('button').first(), row }
}

async function armUsableContentProbe(button: Locator): Promise<void> {
  await button.evaluate(node => {
    const target = window as typeof window & {
      __requirementDetailPrefetchProbe?: { durationMs: number | null }
    }
    target.__requirementDetailPrefetchProbe = { durationMs: null }
    node.addEventListener(
      'click',
      () => {
        const startedAt = performance.now()
        const observer = new MutationObserver(() => {
          const usable = [...document.querySelectorAll('h3')].some(
            heading => heading.textContent?.trim() === 'Kravtext',
          )
          if (!usable) return
          observer.disconnect()
          if (target.__requirementDetailPrefetchProbe) {
            target.__requirementDetailPrefetchProbe.durationMs =
              performance.now() - startedAt
          }
        })
        observer.observe(document.body, { childList: true, subtree: true })
      },
      { capture: true, once: true },
    )
  })
}

async function readUsableContentDuration(page: Page): Promise<number> {
  let durationMs: number | null = null
  await expect
    .poll(async () => {
      durationMs = await page.evaluate(() => {
        const target = window as typeof window & {
          __requirementDetailPrefetchProbe?: { durationMs: number | null }
        }
        return target.__requirementDetailPrefetchProbe?.durationMs ?? null
      })
      return durationMs
    })
    .not.toBeNull()
  if (durationMs === null) {
    throw new Error('Requirement detail never became usable')
  }
  return durationMs
}

function emptySurfaceRun(): RequirementDetailPrefetchProxySurfaceRun {
  return {
    directClickMs: [],
    directMainRequestCounts: [],
    intentClickMs: [],
    intentMainRequestCounts: [],
    invalidationSafe: false,
    prefetch: {
      classified: 0,
      duplicateOutcomes: 0,
      orphanOutcomes: 0,
      started: 0,
      unresolved: 0,
      unused: 0,
      unusedRate: null,
      used: 0,
    },
  }
}

function addSummary(
  aggregate: RequirementDetailPrefetchProxySurfaceRun['prefetch'],
  events: RequirementDetailPrefetchEvent[],
): void {
  const summary = summarizeRequirementDetailPrefetchEvents(events)
  aggregate.classified += summary.classified
  aggregate.duplicateOutcomes += summary.duplicateOutcomes
  aggregate.orphanOutcomes += summary.orphanOutcomes
  aggregate.started += summary.started
  aggregate.unresolved += summary.unresolved
  aggregate.unused += summary.unused
  aggregate.used += summary.used
  aggregate.unusedRate =
    aggregate.started === 0 ? null : aggregate.unused / aggregate.started
}

async function verifyRealInvalidation(page: Page): Promise<boolean> {
  await gotoSpecificationDetail(page)
  await resetEvents(page)
  const rightPanel = page.locator(
    '[data-specification-detail-list-panel="available"]',
  )
  const row = rightPanel
    .getByRole('table', { name: 'Lista över krav' })
    .locator('tbody tr')
    .filter({ has: page.getByRole('checkbox') })
    .first()
  const detailButton = row.getByRole('button').first()
  const uniqueId = (await detailButton.innerText()).trim().split(/\s+/u)[0]
  if (!uniqueId) throw new Error('Available requirement has no Requirement ID')

  const detailRequestPaths: string[] = []
  const countRequest = (request: { method(): string; url(): string }) => {
    const path = new URL(request.url()).pathname
    if (request.method() === 'GET' && /\/api\/requirements\/\d+$/u.test(path)) {
      detailRequestPaths.push(path)
    }
  }
  page.on('request', countRequest)
  await row.hover()
  await waitForEvent(page, event => event.type === 'prefetch-started')
  await expect.poll(() => detailRequestPaths.length).toBeGreaterThanOrEqual(1)
  const prefetchedPath = detailRequestPaths[0]

  await row.getByRole('checkbox').check()
  await rightPanel.getByRole('button', { name: 'Lägg till valda (1)' }).click()
  const dialog = page.getByRole('dialog').filter({
    hasText: 'Lägger till 1 krav i underlaget',
  })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Lägg till' }).click()
  await expect(dialog).toBeHidden()

  const leftPanel = page.locator(
    '[data-specification-detail-list-panel="items"]',
  )
  const addedButton = leftPanel.getByRole('button', {
    name: new RegExp(`^${uniqueId}\\b`, 'u'),
  })
  await expect(addedButton).toBeVisible()
  await armUsableContentProbe(addedButton)
  await addedButton.click()
  await readUsableContentDuration(page)
  await expect
    .poll(() => detailRequestPaths.filter(path => path === prefetchedPath))
    .toHaveLength(2)
  await waitForEvent(
    page,
    event =>
      event.type === 'prefetch-outcome' &&
      event.outcome === 'invalidated-unused',
  )
  page.off('request', countRequest)
  return true
}

test.describe('Requirement detail prefetch prodlike decision proxy', () => {
  test.setTimeout(900_000)
  test.use({ viewport: { height: 1200, width: 1440 } })

  test('PREFETCH-01: deterministic off/on profile produces complete decision evidence', async ({
    page,
  }, testInfo) => {
    const outputPath = process.env.REQUIREMENT_DETAIL_PREFETCH_PROXY_OUTPUT
    test.skip(!outputPath, 'Run through test:prefetch-proxy:prodlike')
    if (!outputPath) {
      throw new Error('REQUIREMENT_DETAIL_PREFETCH_PROXY_OUTPUT is required')
    }

    await installEventCollector(page)
    let activeDetailRequestPaths: string[] = []
    page.on('request', request => {
      const path = new URL(request.url()).pathname
      if (
        request.method() === 'GET' &&
        (/\/api\/requirements\/\d+$/u.test(path) ||
          /\/api\/requirements-specifications\/\d+\/local-requirements\/\d+$/u.test(
            path,
          ))
      ) {
        activeDetailRequestPaths.push(path)
      }
    })

    const createRun = (
      mode: RequirementDetailPrefetchProxyRun['mode'],
    ): RequirementDetailPrefetchProxyRun => ({
      mode,
      surfaces: Object.fromEntries(
        requirementDetailPrefetchProxySurfaces.map(surface => [
          surface,
          emptySurfaceRun(),
        ]),
      ) as RequirementDetailPrefetchProxyRun['surfaces'],
    })
    const baseline = createRun('off')
    const candidate = createRun('on')

    for (const surface of requirementDetailPrefetchProxySurfaces) {
      if (page.url().startsWith('http')) {
        await setProxyMode(page, 'off')
      }
      const baselineResult = baseline.surfaces[surface]
      for (let trial = 0; trial < directTrialCount; trial += 1) {
        const prepared = await prepareSurface(page, surface)
        await resetEvents(page)
        activeDetailRequestPaths = []
        await armUsableContentProbe(prepared.button)
        await prepared.button.click()
        baselineResult.directClickMs.push(await readUsableContentDuration(page))
        await expect
          .poll(() => activeDetailRequestPaths.length)
          .toBeGreaterThanOrEqual(1)
        baselineResult.directMainRequestCounts.push(
          maximumRequestMultiplicity(activeDetailRequestPaths),
        )
      }

      await setProxyMode(page, 'on')
      const candidateResult = candidate.surfaces[surface]
      for (let trial = 0; trial < directTrialCount; trial += 1) {
        const prepared = await prepareSurface(page, surface)
        await resetEvents(page)
        activeDetailRequestPaths = []
        await armUsableContentProbe(prepared.button)
        await prepared.button.click()
        candidateResult.directClickMs.push(
          await readUsableContentDuration(page),
        )
        await expect
          .poll(() => activeDetailRequestPaths.length)
          .toBeGreaterThanOrEqual(1)
        candidateResult.directMainRequestCounts.push(
          maximumRequestMultiplicity(activeDetailRequestPaths),
        )
      }

      for (let trial = 0; trial < usedIntentTrialCount; trial += 1) {
        const prepared = await prepareSurface(page, surface)
        await resetEvents(page)
        activeDetailRequestPaths = []
        await prepared.row.hover()
        await waitForEvent(page, event => event.type === 'prefetch-started')
        await expect
          .poll(() => activeDetailRequestPaths.length)
          .toBeGreaterThanOrEqual(1)
        await armUsableContentProbe(prepared.button)
        await prepared.button.click()
        candidateResult.intentClickMs.push(
          await readUsableContentDuration(page),
        )
        candidateResult.intentMainRequestCounts.push(
          maximumRequestMultiplicity(activeDetailRequestPaths),
        )
        await waitForEvent(
          page,
          event =>
            event.type === 'prefetch-outcome' && event.outcome === 'used',
        )
        addSummary(candidateResult.prefetch, await readEvents(page))
      }

      const prepared = await prepareSurface(page, surface)
      await resetEvents(page)
      activeDetailRequestPaths = []
      await prepared.row.hover()
      await waitForEvent(page, event => event.type === 'prefetch-started')
      await expect
        .poll(() => activeDetailRequestPaths.length)
        .toBeGreaterThanOrEqual(1)
      const destination =
        surface === 'requirements-library:library-requirement'
          ? page.getByRole('link', { name: 'Kravunderlag', exact: true })
          : page.getByRole('link', { name: 'Kravbibliotek', exact: true })
      await destination.click()
      await waitForEvent(
        page,
        event =>
          event.type === 'prefetch-outcome' &&
          event.outcome === 'page-disposed-unused',
      )
      candidateResult.intentMainRequestCounts.push(
        maximumRequestMultiplicity(activeDetailRequestPaths),
      )
      addSummary(candidateResult.prefetch, await readEvents(page))
    }

    const invalidationSafe = await verifyRealInvalidation(page)
    for (const surface of requirementDetailPrefetchProxySurfaces) {
      candidate.surfaces[surface].invalidationSafe = invalidationSafe
    }

    const assessment = assessRequirementDetailPrefetchProxy(baseline, candidate)
    const report = { assessment, baseline, candidate }
    await testInfo.attach('requirement-detail-prefetch-proxy', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    })

    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
    for (const surface of requirementDetailPrefetchProxySurfaces) {
      expect(assessment.surfaces[surface]).toMatchObject({
        completeOutcomes: true,
        deduplicated: true,
        directClickPass: true,
        invalidationSafe: true,
        latencyPass: true,
        unusedPass: true,
      })
    }
  })
})
