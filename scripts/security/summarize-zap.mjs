import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

function plainText(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[`<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1000)
}

function location(value) {
  try {
    const url = new URL(value)
    return plainText(`${url.origin}${url.pathname}`)
  } catch {
    return '(URL unavailable)'
  }
}

export function summarizeZap(report, rules, outcome) {
  const actions = new Map()
  for (const line of rules.split(/\r?\n/)) {
    const match = line.match(/^(\d+)\s+(IGNORE|INFO|PASS|WARN|FAIL)\b/)
    if (match) actions.set(match[1], match[2])
  }
  if (!Array.isArray(report?.site)) {
    throw new Error('ZAP report has no site array')
  }
  const alerts = report.site.flatMap(site => site.alerts ?? [])
  const blocking = alerts.filter(alert =>
    ['WARN', 'FAIL'].includes(actions.get(String(alert.pluginid)) ?? 'WARN'),
  )
  const lines = [
    `ZAP baseline outcome: ${plainText(outcome)}`,
    `Blocking ZAP alerts: ${blocking.length} (WARN and FAIL both block this job, regardless of risk).`,
  ]
  const annotations = []
  for (const alert of blocking.slice(0, 50)) {
    const action = actions.get(String(alert.pluginid)) ?? 'WARN'
    const instances = alert.instances ?? []
    const title = `[${plainText(alert.pluginid)}] ${plainText(alert.name ?? alert.alert)}; risk: ${plainText(alert.riskdesc)}; action: ${action}; instances: ${plainText(alert.count ?? instances.length)}`
    const details = plainText(alert.otherinfo || alert.desc)
    lines.push('', title, `  Details: ${details}`)
    for (const instance of instances.slice(0, 3)) {
      lines.push(
        `  Affected: ${plainText(instance.method)} ${location(instance.uri)}`,
      )
      if (instance.otherinfo) {
        lines.push(`  Instance details: ${plainText(instance.otherinfo)}`)
      }
    }
    if (instances.length > 3) {
      lines.push(
        `  ${instances.length - 3} more instances in zap_scan/report_json.json.`,
      )
    }
    lines.push(`  Remediation: ${plainText(alert.solution)}`)
    if (outcome === 'failure') annotations.push(`${title}. ${details}`)
  }
  if (blocking.length > 50) lines.push('Only the first 50 alerts are shown.')
  if (outcome === 'failure' && blocking.length === 0) {
    lines.push(
      'ZAP failed without blocking alerts in the report. Inspect "Run OWASP ZAP baseline scan" for execution, timeout, or report-generation errors.',
    )
  }
  lines.push(
    '',
    'Full details: zap_scan artifact (report_html.html and report_json.json).',
  )
  return { text: lines.join('\n'), annotations }
}

function annotation(level, message) {
  const escaped = message
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A')
  console.log(`::${level}::${escaped}`)
}

export function printZapSummary({
  reportPath = 'report_json.json',
  rulesPath = '.zap/rules.tsv',
  outcome = process.env.ZAP_SCAN_OUTCOME,
  summaryPath = process.env.GITHUB_STEP_SUMMARY,
} = {}) {
  let result
  try {
    result = summarizeZap(
      JSON.parse(readFileSync(reportPath, 'utf8')),
      readFileSync(rulesPath, 'utf8'),
      outcome,
    )
  } catch {
    result = {
      text: `ZAP baseline outcome: ${plainText(outcome)}. Cannot summarize ZAP: report_json.json or the staged rules are missing, unreadable, or invalid. Inspect "Run OWASP ZAP baseline scan" for the scanner error and the zap_scan artifact if available.`,
      annotations: [],
    }
    annotation('warning', result.text)
  }
  // Prefix report text so it cannot introduce GitHub workflow commands.
  for (const line of result.text.split('\n')) console.log(`ZAP | ${line}`)
  for (const message of result.annotations) annotation('error', message)
  if (summaryPath) {
    try {
      appendFileSync(
        summaryPath,
        `\n## ZAP baseline findings\n\n\`\`\`text\n${result.text}\n\`\`\`\n`,
      )
    } catch {
      annotation(
        'warning',
        'Could not write the ZAP step summary; see the job log above.',
      )
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  printZapSummary()
}
