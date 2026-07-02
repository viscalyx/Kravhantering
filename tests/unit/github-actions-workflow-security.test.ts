import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml') as { load(source: string): unknown }

const WORKFLOWS_DIR = path.join(process.cwd(), '.github', 'workflows')
const ACTIONS_DIR = path.join(process.cwd(), '.github', 'actions')
const ZAP_DIR = path.join(process.cwd(), '.github', 'zap')
const FULL_COMMIT_SHA = /^[a-f0-9]{40}$/iu
const USES_LINE = /^\s*uses:\s*([^#\s]+)(?:\s+#\s*(.+))?\s*$/u
const PERSIST_CREDENTIALS_FALSE_LINE =
  /^\s*persist-credentials:\s*['"]?false['"]?(?:\s+#.*)?$/iu

type WorkflowDocument = {
  jobs?: Record<string, WorkflowJob>
  on?: Record<string, unknown>
}

type WorkflowJob = {
  name?: unknown
  steps?: WorkflowStep[]
  strategy?: unknown
}

type WorkflowStep = {
  env?: Record<string, unknown>
  name?: unknown
  run?: unknown
}

function yamlFiles(
  root: string,
): Array<{ absolutePath: string; relativePath: string }> {
  const files: Array<{ absolutePath: string; relativePath: string }> = []

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(absolutePath)
      } else if (/\.(?:ya?ml)$/u.test(entry.name)) {
        files.push({
          absolutePath,
          relativePath: path.relative(process.cwd(), absolutePath),
        })
      }
    }
  }

  walk(root)
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

function workflowAndActionFiles() {
  return [...yamlFiles(WORKFLOWS_DIR), ...yamlFiles(ACTIONS_DIR)]
}

function readWorkflowYaml(fileName: string): WorkflowDocument {
  return yaml.load(
    readFileSync(path.join(WORKFLOWS_DIR, fileName), 'utf8'),
  ) as WorkflowDocument
}

function isLocalOrContainerReference(reference: string) {
  return (
    reference.startsWith('./') ||
    reference.startsWith('../') ||
    reference.startsWith('docker://')
  )
}

function readZapRules(fileName: string) {
  const rules = new Map<string, string>()
  const content = readFileSync(path.join(ZAP_DIR, fileName), 'utf8')

  for (const line of content.split(/\r?\n/u)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue

    const [ruleId, action] = line.split('\t')
    if (ruleId && action) {
      rules.set(ruleId, action)
    }
  }

  return rules
}

function disablesCheckoutCredentialPersistence(
  lines: string[],
  usesLineIndex: number,
) {
  const usesLineIndent = lines[usesLineIndex].search(/\S/u)

  for (
    let lineIndex = usesLineIndex + 1;
    lineIndex < lines.length;
    lineIndex += 1
  ) {
    const line = lines[lineIndex]
    if (!line.trim() || line.trimStart().startsWith('#')) continue

    if (line.search(/\S/u) < usesLineIndent) return false
    if (PERSIST_CREDENTIALS_FALSE_LINE.test(line)) return true
  }

  return false
}

function stepRunText(job: WorkflowJob | undefined, stepName: string) {
  expect(job, `Expected job for step "${stepName}" to exist`).toBeDefined()
  const step = job?.steps?.find(candidate => candidate.name === stepName)
  expect(step, `Expected step "${stepName}" to exist`).toBeDefined()
  expect(typeof step?.run).toBe('string')
  return step?.run as string
}

describe('GitHub Actions workflow security', () => {
  it('pins external actions and hardens checkout credentials', () => {
    const unpinnedReferences: string[] = []

    for (const { absolutePath, relativePath } of workflowAndActionFiles()) {
      const lines = readFileSync(absolutePath, 'utf8').split(/\r?\n/u)

      lines.forEach((line, index) => {
        if (line.trimStart().startsWith('#')) return
        const match = line.match(USES_LINE)
        const reference = match?.[1]
        if (!reference || isLocalOrContainerReference(reference)) return

        const refSeparatorIndex = reference.lastIndexOf('@')
        const ref =
          refSeparatorIndex === -1
            ? undefined
            : reference.slice(refSeparatorIndex + 1)
        const versionComment = match[2]?.trim()

        if (!ref || !FULL_COMMIT_SHA.test(ref) || !versionComment) {
          unpinnedReferences.push(`${relativePath}:${index + 1} ${reference}`)
        }

        if (
          reference.startsWith('actions/checkout') &&
          !disablesCheckoutCredentialPersistence(lines, index)
        ) {
          unpinnedReferences.push(
            `${relativePath}:${index + 1} ${reference} missing persist-credentials: false`,
          )
        }
      })
    }

    expect(unpinnedReferences).toEqual([])
  })

  it('keeps Playwright integration CI consolidated on the pruned prodlike gate', () => {
    const workflow = readWorkflowYaml('integration-tests.yml')
    const jobs = workflow.jobs ?? {}
    const devSmoke = jobs['dev-server-smoke']
    const prodlikePruned = jobs['test-prodlike-pruned']

    expect(workflow.on).toHaveProperty('pull_request')
    expect(workflow.on).toHaveProperty('push')
    expect(jobs).not.toHaveProperty('test-server')

    expect(devSmoke?.name).toBe('Dev Server Smoke (Developer Mode)')
    expect(devSmoke?.strategy).toBeUndefined()
    const devSmokeCommand = stepRunText(
      devSmoke,
      'Run Developer Mode smoke against dev server',
    )
    expect(devSmokeCommand).toContain('npm run test:integration --')
    expect(devSmokeCommand).toContain(
      'tests/integration/developer-mode/overlay.spec.ts',
    )
    expect(devSmokeCommand).toContain(
      '--grep "DEVTOOLS-01: shows chip on hover and copies a contextual reference"',
    )
    expect(devSmokeCommand).not.toMatch(/npm run test:integration\s*$/mu)
    expect(devSmokeCommand).not.toContain('npm run test:integration:prodlike')
    expect(
      devSmoke?.steps?.some(
        step => step.run === 'npm run test:integration:chunks:check',
      ),
    ).toBe(false)

    expect(prodlikePruned?.name).toBe(
      'Canonical Playwright Gate (Prod-like, Pruned Dependencies)',
    )
    expect(
      stepRunText(prodlikePruned, 'Check integration chunk manifest'),
    ).toBe('npm run test:integration:chunks:check')
    expect(
      stepRunText(prodlikePruned, 'Start pruned prod-like server'),
    ).toContain('npm run start:prodlike-pruned')
    expect(
      stepRunText(
        prodlikePruned,
        'Run Playwright tests against pruned prod-like server',
      ),
    ).toContain('npm run test:integration:prodlike')
    const prodlikeRunStep = prodlikePruned?.steps?.find(
      step =>
        step.name === 'Run Playwright tests against pruned prod-like server',
    )
    expect(prodlikeRunStep?.env).toMatchObject({
      PLAYWRIGHT_BASE_URL: 'http://localhost:3001',
      PLAYWRIGHT_FORCE_AUTH_SETUP: '1',
      PLAYWRIGHT_SKIP_WEBSERVER: '1',
    })
  })

  it('keeps the fork-compatible SSDLC gate on trusted base code', () => {
    const workflow = readFileSync(
      path.join(WORKFLOWS_DIR, 'ssdlc-gate.yml'),
      'utf8',
    )

    expect(workflow).toContain('pull_request_target:')
    expect(workflow).toContain('contents: read')
    expect(workflow).toContain('pull-requests: read')
    expect(workflow).toContain(
      ['ref: $', '{{ github.event.pull_request.base.sha }}'].join(''),
    )
    expect(workflow).not.toMatch(/github\.event\.pull_request\.head/iu)
    expect(workflow).not.toMatch(/\bgithub\.head_ref\b/iu)
    expect(workflow).not.toMatch(/\bnpm\s+(?:ci|install|run)\b/iu)
  })

  it('keeps prodlike cleanup and DAST scan target guards fail-closed', () => {
    const cleanupAction = readFileSync(
      path.join(ACTIONS_DIR, 'prodlike-cleanup', 'action.yml'),
      'utf8',
    )
    const apiDastWorkflow = readFileSync(
      path.join(WORKFLOWS_DIR, 'security-dast-api.yml'),
      'utf8',
    )
    const roleDastWorkflow = readFileSync(
      path.join(WORKFLOWS_DIR, 'security-dast-roles.yml'),
      'utf8',
    )

    expect(cleanupAction).toMatch(
      /- name: Stop prodlike app\s+continue-on-error: true\s+shell: bash\s+run: bash scripts\/security\/prodlike-app\.sh stop/u,
    )
    expect(apiDastWorkflow).toContain(
      "const contractPath = 'test-results/security-dast-api/openapi.json'",
    )
    expect(apiDastWorkflow).toContain(
      'return resolved.origin === allowedOrigin',
    )
    expect(roleDastWorkflow).toContain('name: Guard role-scan target')
    expect(roleDastWorkflow).toContain(
      'Refusing to run ZAP role scan against target',
    )
  })

  it('keeps localhost-only ZAP warnings non-blocking', () => {
    for (const fileName of [
      'rules.api.tsv',
      'rules.full.tsv',
      'rules.prodlike.tsv',
      'rules.roles.tsv',
    ]) {
      expect(readZapRules(fileName).get('10106')).toBe('IGNORE')
    }

    expect(readZapRules('rules.api.tsv').get('100001')).toBe('INFO')
  })

  it('keeps the fork-compatible operator upgrade gate on trusted base code', () => {
    const workflow = readFileSync(
      path.join(WORKFLOWS_DIR, 'operator-upgrade-gate.yml'),
      'utf8',
    )

    expect(workflow).toContain('pull_request_target:')
    expect(workflow).toContain('contents: read')
    expect(workflow).toContain('pull-requests: read')
    expect(workflow).toContain(
      ['ref: $', '{{ github.event.pull_request.base.sha }}'].join(''),
    )
    expect(workflow).toContain(
      'node scripts/release/operator-upgrade-gate.mjs --github-pr',
    )
    expect(workflow).not.toMatch(/github\.event\.pull_request\.head/iu)
    expect(workflow).not.toMatch(/\bgithub\.head_ref\b/iu)
    expect(workflow).not.toMatch(/\bnpm\s+(?:ci|install|run)\b/iu)
  })

  it('keeps merged PR operator notes persistence on trusted main code', () => {
    const workflow = readFileSync(
      path.join(WORKFLOWS_DIR, 'operator-upgrade-notes.yml'),
      'utf8',
    )

    expect(workflow).toContain('pull_request_target:')
    expect(workflow).toContain('branches: [main]')
    expect(workflow).toContain('types: [closed]')
    expect(workflow).toContain('contents: write')
    expect(workflow).toContain('pull-requests: read')
    expect(workflow).toContain('if: github.event.pull_request.merged == true')
    expect(workflow).toContain('ref: main')
    expect(workflow).toContain('persist-credentials: false')
    expect(workflow).toContain(
      'node scripts/release/operator-upgrade-notes.mjs sync-pr --github-pr',
    )
    expect(workflow).toContain(
      'git diff --quiet -- "docs/operations/operator-upgrade-notes.md"',
    )
    expect(workflow).not.toMatch(/github\.event\.pull_request\.head/iu)
    expect(workflow).not.toMatch(/\bgithub\.head_ref\b/iu)
    expect(workflow).not.toMatch(/\bnpm\s+(?:ci|install|run)\b/iu)
  })
})
