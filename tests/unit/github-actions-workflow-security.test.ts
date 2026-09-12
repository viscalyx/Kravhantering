import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml') as { load(source: string): unknown }

const WORKFLOWS_DIR = path.join(process.cwd(), '.github', 'workflows')
const ZAP_DIR = path.join(process.cwd(), '.github', 'zap')
const DEVCONTAINER_DOCKERFILE = path.join(
  process.cwd(),
  '.devcontainer',
  'Dockerfile',
)
const AZURE_HOST_BOOTSTRAP = path.join(
  process.cwd(),
  'scripts',
  'azure-dev',
  'templates',
  'bootstrap-host.sh',
)
type WorkflowDocument = {
  jobs?: Record<string, WorkflowJob>
  on?: Record<string, unknown>
  permissions?: Record<string, unknown>
}

type WorkflowJob = {
  if?: unknown
  name?: unknown
  needs?: unknown
  permissions?: Record<string, unknown>
  'runs-on'?: unknown
  steps?: WorkflowStep[]
  strategy?: unknown
  uses?: unknown
}

type WorkflowStep = {
  'continue-on-error'?: unknown
  env?: Record<string, unknown>
  id?: unknown
  if?: unknown
  name?: unknown
  run?: unknown
  uses?: unknown
  with?: Record<string, unknown>
}

function readWorkflowYaml(fileName: string): WorkflowDocument {
  return yaml.load(
    readFileSync(path.join(WORKFLOWS_DIR, fileName), 'utf8'),
  ) as WorkflowDocument
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

describe('GitHub Actions workflow security', () => {
  it('restricts scheduled jobs to the canonical repository', () => {
    const workflowNames = readdirSync(WORKFLOWS_DIR)
      .filter(fileName => /\.ya?ml$/u.test(fileName))
      .sort()
    const scheduledWorkflows = workflowNames
      .map(fileName => ({ fileName, workflow: readWorkflowYaml(fileName) }))
      .filter(({ workflow }) => workflow.on?.schedule !== undefined)

    expect(scheduledWorkflows.length).toBeGreaterThan(0)
    for (const { fileName, workflow } of scheduledWorkflows) {
      for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
        const condition = String(job.if ?? '')
        expect(condition, `${fileName}:${jobId}`).toContain(
          "github.repository == 'viscalyx/Kravhantering'",
        )
      }
    }
  })

  it('keeps Azure, devcontainer, and CI Lychee versions aligned', () => {
    const dockerfile = readFileSync(DEVCONTAINER_DOCKERFILE, 'utf8')
    const dockerfileVersion = dockerfile.match(
      /^ARG LYCHEE_VERSION=(v\d+\.\d+\.\d+)$/mu,
    )?.[1]
    const azureHostBootstrap = readFileSync(AZURE_HOST_BOOTSTRAP, 'utf8')
    const azureHostVersion = azureHostBootstrap.match(
      /^LYCHEE_VERSION="(v\d+\.\d+\.\d+)"$/mu,
    )?.[1]
    const sha256Pattern = /lychee_sha256='([a-f\d]{64})'/gu
    const dockerfileHashes = [...dockerfile.matchAll(sha256Pattern)].map(
      match => match[1],
    )
    const azureHostHashes = [...azureHostBootstrap.matchAll(sha256Pattern)].map(
      match => match[1],
    )
    const workflow = readWorkflowYaml('quality-checks.yml')
    const lycheeStep = workflow.jobs?.['quality-checks']?.steps?.find(
      step => step.name === 'Run Lychee Markdown link check',
    )

    expect(dockerfileVersion).toBeDefined()
    expect(azureHostVersion).toBe(dockerfileVersion)
    expect(dockerfileHashes).toHaveLength(2)
    expect(azureHostHashes).toEqual(dockerfileHashes)
    expect(lycheeStep).toBeDefined()
    expect(lycheeStep?.with?.args).toBe('--config .lychee.toml . .github')
    expect(lycheeStep?.with?.lycheeVersion).toBe(dockerfileVersion)
  })

  it('exposes coordinated tool and base-image lanes in the dependency-drift selector', () => {
    const workflow = readWorkflowYaml('dependency-drift.yml')
    const workflowDispatch = workflow.on?.workflow_dispatch as
      | {
          inputs?: { unit?: { options?: unknown[] } }
        }
      | undefined

    expect(workflowDispatch?.inputs?.unit?.options).toContain('lychee')
    expect(workflowDispatch?.inputs?.unit?.options).toContain(
      'devcontainer-base',
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

  it('keeps the ZAP modern spider choice explicit', () => {
    let modernSpiderSteps = 0

    for (const fileName of [
      'security-dast.yml',
      'security-dast-full.yml',
      'security-dast-roles.yml',
    ]) {
      const workflow = readWorkflowYaml(fileName)

      for (const job of Object.values(workflow.jobs ?? {})) {
        for (const step of job.steps ?? []) {
          if (
            typeof step.uses !== 'string' ||
            !step.uses.startsWith('zaproxy/action-') ||
            typeof step.with?.cmd_options !== 'string' ||
            !/(?:^|\s)-j(?:\s|$)/u.test(step.with.cmd_options)
          ) {
            continue
          }

          modernSpiderSteps += 1
          expect(step.with.cmd_options).toMatch(
            /(?:^|\s)--ajax-spider(?:\s|$)/u,
          )
        }
      }
    }

    expect(modernSpiderSteps).toBe(4)
  })

  it('keeps DAST app-log publication from overriding the scan outcome', () => {
    const workflow = readWorkflowYaml('security-dast.yml')
    const appLogUpload = workflow.jobs?.['zap-baseline']?.steps?.find(
      step => step.name === 'Upload app log',
    )

    expect(appLogUpload).toBeDefined()
    expect(appLogUpload?.['continue-on-error']).toBe(true)
  })

  it('runs PR and main smoke through the same Ubuntu production Quadlet seam', () => {
    for (const [fileName, jobId] of [
      ['container-pr-smoke.yml', 'production-assembly'],
      ['container-release.yml', 'trusted-release'],
    ]) {
      const workflow = readWorkflowYaml(fileName)
      const job = workflow.jobs?.[jobId]
      expect(job, `${fileName} must define ${jobId}`).toBeDefined()
      const steps = job?.steps ?? []
      const stepNames = steps.map(step => step.name)
      const runtimeSetupIndex = stepNames.indexOf(
        'Install container runtime tools',
      )
      const npmRestoreIndex = stepNames.indexOf(
        'Restore repository npm after container runtime setup',
      )
      const verification = steps.find(
        step => step.name === 'Verify production stack',
      )
      const npmRestore = steps[npmRestoreIndex]

      expect(job?.['runs-on']).toBe('ubuntu-24.04')
      expect(stepNames).toEqual(
        expect.arrayContaining([
          'Install production archive with rootless Quadlet',
          'Verify production stack',
          'Collect production Quadlet evidence',
          'Remove production Quadlet stack',
        ]),
      )
      expect(runtimeSetupIndex).toBeGreaterThanOrEqual(0)
      expect(npmRestoreIndex).toBeGreaterThan(runtimeSetupIndex)
      expect(npmRestore?.run).toBe('node scripts/install-repository-npm.mjs')
      expect(verification?.run).toBe(
        'scripts/containers/production-smoke.sh verify',
      )
    }
  })

  it('uses the production deployment as the PR container acceptance boundary', () => {
    const workflow = readWorkflowYaml('container-pr-smoke.yml')
    const steps = workflow.jobs?.['production-assembly']?.steps ?? []
    const stepNames = steps.map(step => step.name)

    expect(stepNames).not.toContain('Verify OCI archives')
    expect(
      steps.some(
        step =>
          typeof step.run === 'string' &&
          step.run.includes('container:oci:verify'),
      ),
    ).toBe(false)
    expect(stepNames).toContain(
      'Install production archive with rootless Quadlet',
    )
    expect(stepNames).toContain('Verify production stack')
    expect(
      stepNames.indexOf('Install production archive with rootless Quadlet'),
    ).toBeLessThan(stepNames.indexOf('Verify production stack'))
  })

  it('keeps container runtime diagnostics bounded and cancellation-safe', () => {
    const cases = [
      {
        fileName: 'container-pr-smoke.yml',
        jobId: 'production-assembly',
        permissions: { actions: 'read', contents: 'read' },
      },
      {
        fileName: 'container-release.yml',
        jobId: 'trusted-release',
        permissions: {
          actions: 'read',
          attestations: 'write',
          contents: 'write',
          'id-token': 'write',
          packages: 'write',
        },
      },
    ]

    for (const { fileName, jobId, permissions } of cases) {
      const workflow = readWorkflowYaml(fileName)
      const job = workflow.jobs?.[jobId]
      const diagnostics = job?.steps?.find(
        step => step.name === 'Collect container runtime diagnostics',
      )

      expect(workflow.permissions).toBeUndefined()
      expect(job?.permissions).toEqual(permissions)
      expect(diagnostics).toMatchObject({
        'continue-on-error': true,
        if: ['${{', '!cancelled()', '}}'].join(' '),
        run: 'scripts/containers/ci-container-runtime.sh collect',
        'timeout-minutes': 2,
      })
      expect(diagnostics?.env).toBeUndefined()
    }

    const prWorkflow = readWorkflowYaml('container-pr-smoke.yml')
    for (const name of [
      'Collect production Quadlet evidence',
      'Remove production Quadlet stack',
    ]) {
      const step = prWorkflow.jobs?.['production-assembly']?.steps?.find(
        step => step.name === name,
      )
      expect(step).toMatchObject({ if: 'always()', 'timeout-minutes': 3 })
      expect(step?.run).toMatch(/^timeout --kill-after=10s 120s /)
    }
    expect(prWorkflow.jobs?.['runner-metadata']?.if).toBe(
      [
        '${{',
        "always() && needs.production-assembly.result != 'skipped'",
        '}}',
      ].join(' '),
    )
  })

  it('pins the vulnerability monitor external actions by identity', () => {
    const workflow = readWorkflowYaml('container-vulnerability-monitor.yml')
    const references = Object.values(workflow.jobs ?? {})
      .flatMap(job => job.steps ?? [])
      .map(step => step.uses)
      .filter(
        (reference): reference is string =>
          typeof reference === 'string' && !reference.startsWith('./'),
      )
    const identities = references
      .map(reference => reference.slice(0, reference.lastIndexOf('@')))
      .sort()

    expect(identities).toEqual(
      [
        'actions/checkout',
        'actions/setup-node',
        'actions/upload-artifact',
        'anchore/scan-action/download-grype',
      ].sort(),
    )
    for (const reference of references) {
      expect(reference).toMatch(/^[^@\s]+@[a-f\d]{40}$/u)
    }
  })

  it('keeps vulnerability evaluation fail closed and retains its evidence', () => {
    const workflow = readWorkflowYaml('container-vulnerability-monitor.yml')
    const steps =
      workflow.jobs?.['container-vulnerability-monitor']?.steps ?? []
    const evaluate = steps.find(step => step.id === 'evaluate')
    const upload = steps.find(step => step.id === 'upload')
    const stepOutcome = (stepId: string) =>
      ['${{', `steps.${stepId}.outcome`, '}}'].join(' ')

    expect(evaluate).toMatchObject({
      env: {
        ATTESTATION_OUTCOME: stepOutcome('attestation'),
        CHECKOUT_OUTCOME: stepOutcome('checkout'),
        GHCR_LOGIN_OUTCOME: stepOutcome('ghcr-login'),
        GRYPE_OUTCOME: stepOutcome('grype'),
        SCAN_OUTCOME: stepOutcome('scan'),
        SELECTION_OUTCOME: stepOutcome('selection'),
        SETUP_NODE_OUTCOME: stepOutcome('setup-node'),
        TRACKER_PREFLIGHT_OUTCOME: stepOutcome('tracker-preflight'),
      },
      id: 'evaluate',
      if: 'always()',
    })
    for (const outcome of Object.keys(evaluate?.env ?? {})) {
      expect(evaluate?.run).toContain(`"\${${outcome}}"`)
    }
    expect(evaluate?.run).toContain('grep -qvx success')

    expect(upload).toMatchObject({
      id: 'upload',
      if: 'always()',
      with: {
        'if-no-files-found': 'error',
        path: 'tmp/container-vulnerability-monitor/',
        'retention-days': 30,
      },
    })
  })
})
