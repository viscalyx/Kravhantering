export const REQUIREMENT_IMPORT_SCREENING_ROW_COUNTS = Object.freeze([
  1, 50, 100, 250, 500,
])

const SOURCES = Object.freeze(['rest', 'mcp'])
const DESTINATIONS = Object.freeze([
  'requirements_library',
  'requirements_specification',
])
const ROW_SHAPES = Object.freeze(['light', 'maximum-related'])

const FORBIDDEN_EVIDENCE_KEY =
  /(?:actor|identity|importedContent|requirementText|sqlText|token|rawDatabaseEvent|(?:destination|requirement)Id)/iu

export function createScreeningMatrix() {
  return SOURCES.flatMap(source =>
    DESTINATIONS.flatMap(destination =>
      ROW_SHAPES.flatMap(rowShape =>
        REQUIREMENT_IMPORT_SCREENING_ROW_COUNTS.map(rowCount => ({
          destination,
          rowCount,
          rowShape,
          source,
        })),
      ),
    ),
  )
}

function roundMilliseconds(value) {
  return Math.round(value * 100) / 100
}

function nearestRank(values, percentile) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)
  return sorted[Math.min(index, sorted.length - 1)]
}

export function summarizeDurations(values) {
  return {
    maximumMs: roundMilliseconds(Math.max(0, ...values)),
    p50Ms: roundMilliseconds(nearestRank(values, 50)),
    p95Ms: roundMilliseconds(nearestRank(values, 95)),
  }
}

function collectDatabaseErrorValues(value, seen, values) {
  if (value == null) return
  if (typeof value === 'string' || typeof value === 'number') {
    values.push(value)
    return
  }
  if (typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  for (const key of [
    'code',
    'number',
    'message',
    'originalError',
    'driverError',
  ]) {
    collectDatabaseErrorValues(value[key], seen, values)
  }
}

export function classifyDatabaseOutcome(error) {
  const values = []
  collectDatabaseErrorValues(error, new Set(), values)
  const text = values.join(' ').toLowerCase()

  if (values.includes(1205) || /deadlock/.test(text)) return 'deadlock'
  if (/failed to acquire mcp import-validation quota lock/.test(text)) {
    return 'application_lock_timeout'
  }
  if (
    values.includes(1222) ||
    /lock request time out|lock timeout/.test(text)
  ) {
    return 'lock_timeout'
  }
  if (
    values.includes('ETIMEOUT') ||
    /request.*timed out|statement timeout/.test(text)
  ) {
    return 'statement_timeout'
  }
  return 'failure'
}

export function assertBoundedBenchmarkEvidence(value) {
  const visit = (entry, path, seen) => {
    if (entry == null || typeof entry !== 'object') return
    if (seen.has(entry)) return
    seen.add(entry)

    for (const [key, nested] of Object.entries(entry)) {
      const nextPath = path ? `${path}.${key}` : key
      if (FORBIDDEN_EVIDENCE_KEY.test(key)) {
        throw new Error(
          `Benchmark evidence contains forbidden field ${nextPath}`,
        )
      }
      visit(nested, nextPath, seen)
    }
  }

  visit(value, '', new Set())
  return value
}
