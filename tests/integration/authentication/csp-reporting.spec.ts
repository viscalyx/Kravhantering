import { readFile } from 'node:fs/promises'
import { chromium, expect, test } from '@playwright/test'
import { startCspReportingEdge } from '../../helpers/csp-reporting-edge'

const reportLog =
  process.env.CSP_REPORT_SERVER_LOG ??
  'test-results/server-logs/prodlike/prodlike-runtime-contract.log'
async function cspEvents() {
  const text = await readFile(reportLog, 'utf8')
  return text.split('\n').flatMap(line => {
    try {
      const event = JSON.parse(line)
      return event.event === 'security.csp.violation_reported' ? [event] : []
    } catch {
      return []
    }
  })
}

test('AUTH-13: native CSP violations stay blocked and reach privacy-safe security logs', async ({
  request,
}, testInfo) => {
  test.skip(
    !testInfo.config.configFile?.endsWith('playwright.prodlike.config.ts'),
    'Requires production CSP and captured server stdout',
  )
  test.setTimeout(180_000)
  const original = await request.get('/api/admin/application-settings')
  expect(original.ok()).toBeTruthy()
  const { cspViolationLoggingEnabled: originalEnabled } = await original.json()
  const baseURL = String(testInfo.project.use.baseURL)
  const edge = await startCspReportingEdge(baseURL)
  // Native background reporting needs permission and an HTTPS endpoint.
  // Trust only this test's ephemeral certificate, without changing production headers.
  const browser = await chromium.launch({
    args: [
      '--short-reporting-delay',
      `--ignore-certificate-errors-spki-list=${edge.certificateFingerprint}`,
    ],
  })
  const context = await browser.newContext({
    baseURL: edge.origin,
    permissions: ['background-sync'],
    storageState: testInfo.project.use.storageState,
    extraHTTPHeaders: {},
  })
  const applicationPage = await context.newPage()
  const documentationContext = await browser.newContext({
    baseURL: edge.origin,
    permissions: ['background-sync'],
  })
  const documentationPage = await documentationContext.newPage()
  try {
    for (const [phase, enabled] of [true, false, true].entries()) {
      await test.step(`Phase ${phase + 1}: logging ${enabled ? 'enabled' : 'disabled'}`, async () => {
        await test.step('Verify reporting headers on both pages', async () => {
          // Load before changing the switch; fresh documents avoid duplicate suppression.
          for (const [page, path] of [
            [applicationPage, '/en/requirements'],
            [documentationPage, '/api-docs/hsa-person-lookup/index.html'],
          ] as const) {
            const response = await page.goto(path)
            expect(response?.headers()['content-security-policy']).toContain(
              'report-to csp',
            )
            expect(response?.headers()['reporting-endpoints']).toBe(
              'csp="/api/security/csp-reports"',
            )
          }
        })
        await test.step('Save the logging setting', async () => {
          const changed = await request.patch(
            '/api/admin/application-settings',
            {
              data: { cspViolationLoggingEnabled: enabled },
            },
          )
          expect(changed.ok()).toBeTruthy()
        })
        for (const [surface, page] of [
          ['application', applicationPage],
          ['documentation', documentationPage],
        ] as const) {
          const before = (await cspEvents()).length
          const beforeDelivered = edge.deliveries.length
          await test.step(`Inject a violation on ${surface}`, async () => {
            await page.evaluate(() => {
              const script = document.createElement('script')
              script.textContent =
                'window.__cspSensitiveProbe = "private-csp-test-value"'
              document.body.append(script)
            })
          })
          await test.step(`Verify delivery, enforcement and logs for ${surface}`, async () => {
            await expect
              .poll(() => edge.deliveries.length, { timeout: 45_000 })
              .toBeGreaterThan(beforeDelivered)
            expect(edge.deliveries.slice(beforeDelivered)).toEqual(
              expect.arrayContaining([
                {
                  status: 204,
                  media: 'application/reports+json',
                  customHeader: false,
                },
              ]),
            )
            expect(
              await page.evaluate(() => '__cspSensitiveProbe' in window),
            ).toBe(false)
            if (enabled) {
              await expect
                .poll(async () => (await cspEvents()).length)
                .toBeGreaterThan(before)
            }
            const events = (await cspEvents()).slice(before)
            if (enabled) {
              expect(events.length).toBeGreaterThan(0)
              expect(events).toEqual(
                expect.arrayContaining([
                  expect.objectContaining({
                    actor: { source: 'anonymous' },
                    request: {
                      method: 'POST',
                      path: '/api/security/csp-reports',
                    },
                    detail: expect.objectContaining({
                      // The ephemeral TLS port differs from the configured public origin.
                      surface: 'unknown',
                      directive: 'script-src-elem',
                      blockedResource: 'inline',
                    }),
                  }),
                ]),
              )
              expect(JSON.stringify(events)).not.toContain(
                'private-csp-test-value',
              )
            } else expect(events).toEqual([])
          })
        }
      })
    }
  } finally {
    await context.close()
    await documentationContext.close()
    await browser.close()
    await edge.close()
    expect(
      (
        await request.patch('/api/admin/application-settings', {
          data: { cspViolationLoggingEnabled: originalEnabled },
        })
      ).ok(),
    ).toBeTruthy()
  }
})
