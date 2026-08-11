import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SIGNATURES = [
  {
    name: 'conmon_missing_journald',
    pattern: /include journald in compilation path/iu,
  },
  {
    name: 'cgroup_oom',
    pattern:
      /(?:^|\n)oom_kill[ \t]+[1-9][0-9]*(?:\n|$)|memory cgroup out of memory/imu,
  },
  {
    name: 'host_oom',
    pattern:
      /out of memory:\s+killed process|oom-kill:.*(?:global_oom|constraint=none)/iu,
  },
  {
    name: 'disk_exhausted',
    pattern: /no space left on device|\benospc\b|disk quota exceeded/iu,
  },
  {
    name: 'service_timeout',
    pattern:
      /(?:job for .*\.service|start operation|timed out waiting for).*timed out|timed out waiting for/iu,
  },
]

export function classifyRuntimeEvidence(evidence) {
  const classifications = SIGNATURES.filter(({ pattern }) =>
    pattern.test(evidence),
  ).map(({ name }) => name)
  return classifications.length > 0 ? classifications : ['unknown']
}

export function formatRuntimeClassification(classifications) {
  return `Container runtime classification: ${classifications
    .map(classification => `\`${classification}\``)
    .join(', ')}`
}

export function readEvidenceDirectory(directory) {
  if (!fs.existsSync(directory)) return ''
  const evidenceChunks = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      evidenceChunks.push(readEvidenceDirectory(entryPath))
    } else if (entry.isFile() && fs.statSync(entryPath).size <= 5_000_000) {
      evidenceChunks.push(fs.readFileSync(entryPath, 'utf8'))
    }
  }
  return evidenceChunks.join('\n')
}

export function parseRuntimeClassifierArguments(args) {
  const options = { evidenceDirectories: [] }
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index]
    const value = args[index + 1]
    if (!value) throw new Error(`Missing value for ${option ?? '<end>'}.`)
    if (option === '--evidence-dir') {
      options.evidenceDirectories.push(value)
    } else if (option === '--output') {
      options.output = value
    } else if (option === '--summary') {
      options.summary = value
    } else {
      throw new Error(`Unsupported option: ${option}.`)
    }
  }
  if (options.evidenceDirectories.length === 0 || !options.output) {
    throw new Error('Expected at least one --evidence-dir and one --output.')
  }
  return options
}

export function runRuntimeClassifier(args) {
  const options = parseRuntimeClassifierArguments(args)
  const evidence = options.evidenceDirectories
    .map(readEvidenceDirectory)
    .join('\n')
  const classifications = classifyRuntimeEvidence(evidence)
  const formatted = formatRuntimeClassification(classifications)
  fs.mkdirSync(path.dirname(options.output), { recursive: true })
  fs.writeFileSync(options.output, `${classifications.join('\n')}\n`)
  if (options.summary) fs.appendFileSync(options.summary, `${formatted}\n`)
  process.stdout.write(`${formatted}\n`)
}

/* v8 ignore start -- CLI orchestration delegates to the tested public functions. */
if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(fileURLToPath(import.meta.url))
) {
  try {
    runRuntimeClassifier(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
/* v8 ignore stop */
