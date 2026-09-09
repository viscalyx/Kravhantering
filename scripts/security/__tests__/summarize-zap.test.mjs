// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { printZapSummary, summarizeZap } from '../summarize-zap.mjs'

const notice =
  'The report-uri directive has been deprecated in favor of the new report-to directive'
const alert = {
  pluginid: '10055',
  name: 'CSP: Notices',
  riskdesc: 'Low (High)',
  count: '5',
  otherinfo: `<p>Warnings:</p><p>${notice}</p>`,
  solution: '<p>Configure the Content-Security-Policy header.</p>',
  instances: Array.from({ length: 5 }, (_, index) => ({
    method: 'GET',
    uri: `http://localhost:3001/sv/${index}`,
    otherinfo: notice,
  })),
}
const report = (...alerts) => ({ site: [{ alerts }] })

describe('ZAP failure diagnostics', () => {
  it('explains a blocking low-risk CSP notice with affected URLs and remediation', () => {
    const result = summarizeZap(report(alert), '', 'failure')
    expect(result.text).toContain('Blocking ZAP alerts: 1')
    expect(result.text).toContain(
      '[10055] CSP: Notices; risk: Low (High); action: WARN; instances: 5',
    )
    expect(result.text).toContain(`Details: Warnings: ${notice}`)
    expect(result.text).toContain('Affected: GET http://localhost:3001/sv/0')
    expect(result.text).toContain(
      '2 more instances in zap_scan/report_json.json',
    )
    expect(result.text).toContain(
      'Remediation: Configure the Content-Security-Policy header.',
    )
    expect(result.annotations).toEqual([expect.stringContaining(notice)])
  })

  it('uses the staged rule policy, including default WARN and explicit FAIL', () => {
    const alerts = [1, 2, 3, 4, 5, 6].map(pluginid => ({ ...alert, pluginid }))
    const result = summarizeZap(
      report(...alerts),
      '# rule overrides\r\n1\tIGNORE\tNoise\r\n2\tINFO\tInfo\n3\tPASS\tPassed\n4\tWARN\tWarn\n5\tFAIL\tFail\n',
      'failure',
    )
    expect(result.annotations).toHaveLength(3)
    expect(result.annotations[0]).toContain('[4]')
    expect(result.annotations[1]).toContain('action: FAIL')
    expect(result.annotations[2]).toContain('[6]')
  })

  it('directs execution failures without blocking findings to the scanner log', () => {
    const result = summarizeZap({ site: [{}] }, '', 'failure')
    expect(result.text).toContain('ZAP failed without blocking alerts')
    expect(result.text).toContain('timeout')
    expect(result.annotations).toEqual([])
  })

  it('reports successful and skipped outcomes without error annotations', () => {
    expect(summarizeZap(report(alert), '', 'success').annotations).toEqual([])
    expect(summarizeZap(report(), '', 'skipped').text).toContain(
      'outcome: skipped',
    )
  })

  it('supports multiple sites and optional alert fields', () => {
    const result = summarizeZap(
      {
        site: [
          {
            alerts: [
              { pluginid: '1', alert: 'Fallback title', desc: 'Description' },
            ],
          },
          { alerts: [alert] },
        ],
      },
      '',
      'failure',
    )
    expect(result.annotations).toHaveLength(2)
    expect(result.text).toContain(
      'Fallback title; risk: ; action: WARN; instances: 0',
    )
    expect(result.text).toContain('Details: Description')
  })

  it('bounds alert count and diagnostic field lengths', () => {
    const result = summarizeZap(
      report(
        ...Array.from({ length: 51 }, () => ({
          ...alert,
          name: 'x'.repeat(2000),
        })),
      ),
      '',
      'failure',
    )
    expect(result.annotations).toHaveLength(50)
    expect(result.text).toContain('Only the first 50 alerts are shown.')
    expect(result.text).not.toContain('x'.repeat(1001))
  })

  it('omits URL secrets and raw evidence from public diagnostics', () => {
    const result = summarizeZap(
      report({
        ...alert,
        evidence: 'secret-evidence',
        instances: [
          {
            uri: 'https://user:password@localhost/path?token=secret-query#secret-fragment',
            method: 'GET',
            evidence: 'secret-instance',
          },
          { uri: 'invalid secret-url' },
        ],
      }),
      '',
      'failure',
    )
    expect(result.text).toContain('https://localhost/path')
    expect(result.text).toContain('(URL unavailable)')
    expect(result.text).not.toMatch(/secret-|password|user:/)
  })

  it.each([null, {}, { site: 'invalid' }])(
    'rejects an unsupported report shape: %j',
    value => {
      expect(() => summarizeZap(value, '', 'failure')).toThrow(
        'ZAP report has no site array',
      )
    },
  )
})

describe('ZAP report output', () => {
  let directory
  let options
  let log

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'zap-summary-'))
    options = {
      reportPath: path.join(directory, 'report.json'),
      rulesPath: path.join(directory, 'rules.tsv'),
      summaryPath: path.join(directory, 'summary.md'),
      outcome: 'failure',
    }
    writeFileSync(options.reportPath, JSON.stringify(report(alert)))
    writeFileSync(options.rulesPath, '')
    log = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    rmSync(directory, { recursive: true, force: true })
  })

  it('prints actionable errors and writes the same details to the job summary', () => {
    printZapSummary(options)
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(`::error::[10055] CSP: Notices`),
    )
    expect(log).toHaveBeenCalledWith(expect.stringContaining(notice))
    expect(readFileSync(options.summaryPath, 'utf8')).toContain(notice)
  })

  it.each(['missing report', 'invalid JSON', 'missing rules', 'invalid shape'])(
    'keeps scan evaluation running with useful diagnostics for %s',
    scenario => {
      if (scenario === 'missing report') rmSync(options.reportPath)
      if (scenario === 'invalid JSON') writeFileSync(options.reportPath, '{')
      if (scenario === 'missing rules') rmSync(options.rulesPath)
      if (scenario === 'invalid shape') writeFileSync(options.reportPath, '{}')
      expect(() => printZapSummary(options)).not.toThrow()
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(
          '::warning::ZAP baseline outcome: failure. Cannot summarize ZAP',
        ),
      )
      expect(readFileSync(options.summaryPath, 'utf8')).toContain(
        'Inspect "Run OWASP ZAP baseline scan"',
      )
    },
  )

  it('keeps diagnostics visible if the summary file cannot be written', () => {
    printZapSummary({ ...options, summaryPath: directory })
    expect(log).toHaveBeenCalledWith(
      '::warning::Could not write the ZAP step summary; see the job log above.',
    )
  })

  it('works with environment defaults and no summary file', () => {
    vi.stubEnv('ZAP_SCAN_OUTCOME', 'skipped')
    vi.stubEnv('GITHUB_STEP_SUMMARY', '')
    printZapSummary()
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('ZAP baseline outcome: skipped'),
    )
  })

  it('prevents report text from injecting workflow commands or summary fences', () => {
    writeFileSync(
      options.reportPath,
      JSON.stringify(
        report({ ...alert, name: 'Injected\n::error::fake %0A ```' }),
      ),
    )
    printZapSummary(options)
    const output = log.mock.calls.map(([line]) => line)
    expect(output.filter(line => line.startsWith('::error::'))).toHaveLength(1)
    expect(output.find(line => line.startsWith('::error::'))).toContain('%250A')
    expect(
      readFileSync(options.summaryPath, 'utf8').match(/```/g),
    ).toHaveLength(2)
  })
})
