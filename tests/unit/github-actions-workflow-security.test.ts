import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml') as { load(source: string): unknown }

const WORKFLOWS_DIR = path.join(process.cwd(), '.github', 'workflows')
const ACTIONS_DIR = path.join(process.cwd(), '.github', 'actions')
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

function stepRunText(job: WorkflowJob | undefined, stepName: string) {
  expect(job, `Expected job for step "${stepName}" to exist`).toBeDefined()
  const step = job?.steps?.find(candidate => candidate.name === stepName)
  expect(step, `Expected step "${stepName}" to exist`).toBeDefined()
  expect(typeof step?.run).toBe('string')
  return step?.run as string
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

  it('observes rolling tools in the complete devcontainer image', () => {
    const workflow = readWorkflowYaml('devcontainer-image-smoke.yml')
    const triggers = workflow.on as
      | Record<string, { paths?: unknown[] }>
      | undefined

    for (const eventName of ['pull_request', 'push']) {
      expect(triggers?.[eventName]?.paths).toContain(
        'scripts/azure-dev/templates/install-codex.sh',
      )
      expect(triggers?.[eventName]?.paths).toContain(
        'scripts/azure-dev/templates/install-dotenv-linter.sh',
      )
    }

    const job = workflow.jobs?.['development-tools']
    const buildCommand = stepRunText(job, 'Build observable development stage')
    expect(buildCommand).toContain('--target development')

    const observeCommand = stepRunText(
      job,
      'Observe installed development tools',
    )
    expect(observeCommand).toContain('codex --version')
    expect(observeCommand).toContain('dotenv-linter --version')
  })

  it('reports independent runtime and browser-functional results with early validation', () => {
    const jobs = readWorkflowYaml('integration-tests.yml').jobs ?? {}
    expect(jobs['dev-server-smoke']?.name).toBe(
      'Dev Server Smoke (Developer Mode)',
    )
    for (const [id, name] of [
      ['test-prodlike-pruned', 'Pruned Runtime Contract'],
      ['browser-functional', 'Browser Functional Integration'],
    ]) {
      const job = jobs[id]
      expect(job?.name).toBe(name)
      expect(job?.needs).toBeUndefined()
      expect(job?.strategy).toBeUndefined()
      const steps = job?.steps ?? []
      const manifestIndex = steps.findIndex(
        step => step.run === 'npm run test:integration:chunks:check',
      )
      const serviceIndex = steps.findIndex(step => step.run === 'npm run db:up')
      expect(manifestIndex).toBeGreaterThanOrEqual(0)
      expect(manifestIndex).toBeLessThan(serviceIndex)
      expect(
        steps.find(step => step.name === 'Capture owned service diagnostics')
          ?.if,
      ).toBe('always()')
    }
    expect(
      stepRunText(
        jobs['test-prodlike-pruned'],
        'Start pruned prod-like server',
      ),
    ).toContain('mktemp -d /tmp/krav-pruned-XXXXXX')
    expect(
      stepRunText(jobs['browser-functional'], 'Run browser-functional chunks'),
    ).toContain('npm run test:integration')
  })

  it('keeps support candidate failures independent of core assembly acceptance', () => {
    const jobs = readWorkflowYaml('container-pr-smoke.yml').jobs ?? {}
    expect(jobs['production-assembly']?.needs).toEqual(['core-candidate'])
    expect(jobs['production-assembly']?.name).toBe(
      'Production Assembly Acceptance',
    )
    expect(readWorkflowYaml('container-pr-smoke.yml').on).toEqual({
      pull_request: null,
    })
    expect(jobs['hsa-required']).toMatchObject({
      name: 'HSA mTLS topology required',
      needs: ['hsa-build', 'hsa-topology', 'hsa-rotation'],
    })
    for (const id of ['hsa-topology', 'hsa-rotation']) {
      expect(jobs[id]).toMatchObject({
        needs: ['hsa-build', 'support-candidate'],
        if: [
          '${{',
          "!cancelled() && needs.hsa-build.result == 'success'",
          '}}',
        ].join(' '),
      })
      const artifacts = jobs[id]?.steps
        ?.filter(step =>
          String(step.uses).startsWith('actions/download-artifact@'),
        )
        .map(step => step.with?.name)
      expect(artifacts).toEqual([
        'hsa-mtls-current-commit-oci',
        'container-candidate-hsa-directory-mock',
        'container-candidate-hsa-person-lookup-adapter',
      ])
    }
    for (const id of ['core-candidate', 'support-candidate']) {
      expect(jobs[id]?.name).toBe(
        [
          'Candidate Build and Vulnerability Policy (${{',
          'matrix.label',
          '}})',
        ].join(' '),
      )
      expect(jobs[id]?.strategy).toMatchObject({ 'fail-fast': false })
      expect(jobs[id]?.needs).toBeUndefined()
      expect(jobs[id]?.permissions).toEqual({ contents: 'read' })
      expect(
        jobs[id]?.steps?.find(
          step => step.name === 'Upload candidate and evidence',
        )?.if,
      ).toBe('always()')
    }
    expect(jobs['core-candidate']?.strategy).toMatchObject({
      matrix: {
        include: [
          { candidate: 'app-runtime', label: 'app-runtime' },
          { candidate: 'db-job', label: 'db-job' },
        ],
      },
    })
    expect(jobs['support-candidate']?.strategy).toMatchObject({
      matrix: {
        include: [
          { candidate: 'demo-seed', label: 'demo-seed' },
          { candidate: 'hsa-directory-mock', label: 'HSA directory mock' },
          {
            candidate: 'hsa-person-lookup-adapter',
            label: 'HSA person lookup adapter',
          },
        ],
      },
    })
    const downloads = jobs['production-assembly']?.steps?.filter(step =>
      String(step.uses).startsWith('actions/download-artifact@'),
    )
    expect(downloads?.map(step => step.with?.name)).toEqual([
      'container-candidate-app-runtime',
      'container-candidate-db-job',
    ])
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

  it('attests the deployment archive only for successful releases', () => {
    const workflow = readWorkflowYaml('container-release.yml')
    const releaseJob = workflow.jobs?.['trusted-release']
    const attestStep = releaseJob?.steps?.find(
      step => step.name === 'Attest production deployment archive',
    )

    // Dependabot owns action revision updates. Assert immutable pinning without
    // coupling this behavior test to the specific commit it currently selects.
    expect(attestStep?.uses).toMatch(/^actions\/attest@[a-f\d]{40}$/u)
    expect(attestStep?.with).toMatchObject({
      'predicate-path':
        'tmp/container-release-artifacts/metadata/deployment-release-predicate.json',
      'predicate-type':
        'https://github.com/viscalyx/Kravhantering/attestations/deployment-release/v1',
      'push-to-registry': false,
      'subject-path':
        'tmp/container-release-artifacts/kravhantering-production-deploy-$' +
        '{{ env.RELEASE_VERSION }}.tar.gz',
    })
    expect(
      releaseJob?.steps?.some(
        step => step.name === 'Verify deployment archive provenance',
      ),
    ).toBe(true)
    expect(
      releaseJob?.steps?.some(
        step => step.name === 'Append deployment provenance release notes',
      ),
    ).toBe(true)
    const stepNames = releaseJob?.steps?.map(step => step.name) ?? []
    expect(stepNames).toContain('Stage deployment archive verification guide')
    expect(
      stepNames.indexOf('Stage deployment archive verification guide'),
    ).toBeLessThan(stepNames.indexOf('Archive production deployment bundle'))
    expect(
      stepNames.indexOf('Archive production deployment bundle'),
    ).toBeLessThan(stepNames.indexOf('Attest production deployment archive'))
    expect(
      releaseJob?.steps?.find(
        step => step.name === 'Stage deployment archive verification guide',
      )?.if,
    ).toBe("success() && env.RELEASE_CREATE_GITHUB_RELEASE == 'true'")
    for (const stepName of [
      'Write deployment archive release predicate',
      'Attest production deployment archive',
      'Stage deployment provenance assets',
      'Verify deployment archive provenance',
      'Append deployment provenance release notes',
    ]) {
      expect(releaseJob?.steps?.find(step => step.name === stepName)?.if).toBe(
        "success() && env.RELEASE_CREATE_GITHUB_RELEASE == 'true'",
      )
    }
    for (const stepName of [
      'Collect production Quadlet evidence',
      'Remove production Quadlet stack',
      'Write artifact hashes',
      'Stage release artifacts',
    ]) {
      expect(releaseJob?.steps?.find(step => step.name === stepName)?.if).toBe(
        'always()',
      )
    }
    for (const stepName of [
      'Stage production deployment bundle',
      'Archive production deployment bundle',
      'Write release notes',
    ]) {
      expect(releaseJob?.steps?.find(step => step.name === stepName)?.if).toBe(
        'success()',
      )
    }
  })

  it('gates PR and release candidates with the same vulnerability policy', () => {
    const workflow = readWorkflowYaml('container-release.yml')
    const releaseJob = workflow.jobs?.['trusted-release']
    const steps = releaseJob?.steps ?? []
    const stepNames = steps.map(step => step.name)
    const indexOf = (name: string) => {
      const index = stepNames.indexOf(name)
      expect(index, `Expected release step "${name}"`).toBeGreaterThanOrEqual(0)
      return index
    }
    const candidateBuilds = steps.filter(step =>
      String(step.name).match(/^Build .+ candidate OCI artifact$/u),
    )
    const gateAction = yaml.load(
      readFileSync(
        path.join(ACTIONS_DIR, 'container-vulnerability-gate', 'action.yml'),
        'utf8',
      ),
    ) as { runs?: { steps?: WorkflowStep[] } }
    const gateSteps = gateAction.runs?.steps ?? []
    const candidateSbomSteps = gateSteps.filter(step =>
      String(step.name).match(/^Generate .+ SBOM$/u),
    )

    expect(candidateBuilds).toHaveLength(6)
    expect(candidateSbomSteps).toHaveLength(7)
    for (const step of candidateSbomSteps) {
      expect(step.with?.format).toBe('spdx-json')
      expect(step.with?.['upload-artifact']).toBe(false)
    }

    const identityIndex = indexOf('Record exact candidate image identities')
    const gateIndex = indexOf(
      'Gate complete candidate SBOMs against vulnerability policy',
    )
    const releaseGate = steps[gateIndex]
    expect(releaseGate?.uses).toBe(
      './.github/actions/container-vulnerability-gate',
    )
    expect(releaseGate?.with?.metadata).toBe(
      'tmp/container-release-artifacts/metadata/release-metadata.json',
    )
    for (const inputName of [
      'app-runtime',
      'db-job',
      'demo-seed',
      'hsa-directory-mock',
      'hsa-person-lookup-adapter',
    ]) {
      expect(releaseGate?.with?.[inputName]).toMatch(/^oci-archive:/u)
    }

    const scanStep = gateSteps.find(
      step =>
        step.name ===
        'Scan complete candidate SBOMs with current Grype database',
    )
    expect(
      gateSteps.find(step => step.name === 'Install pinned Grype')?.with?.[
        'cache-db'
      ],
    ).toBe(false)
    const scanRun = String(scanStep?.run)
    expect(scanRun).toContain('for attempt in 1 2 3; do')
    expect(scanRun).toContain(
      ['if "$', '{GRYPE_CMD}" db update; then'].join(''),
    )
    expect(scanRun).toContain(
      ['if [[ "$', '{attempt}" -eq 3 ]]; then'].join(''),
    )
    expect(scanRun).toContain(['sleep "$', '{attempt}"'].join(''))
    expect(scanRun).toContain('exit 1')
    const policyStep = gateSteps.find(
      step => step.name === 'Evaluate committed vulnerability exceptions',
    )
    expect(policyStep?.['continue-on-error']).toBeUndefined()
    expect(String(policyStep?.run)).toContain('--images')
    expect(String(policyStep?.run)).toContain('--metadata')

    const smokeIndex = indexOf('Verify production stack')
    const loginIndex = indexOf('Log in to GHCR after validation gates')
    const promotionIndex = indexOf(
      'Promote unchanged candidate OCI artifacts and verify digests',
    )
    const attestationIndex = indexOf('Attest app-runtime provenance')
    const verifyAttestationIndex = indexOf('Verify final artifact attestations')
    const releaseIndex = indexOf('Publish GitHub Release')

    expect(identityIndex).toBeLessThan(gateIndex)
    expect(gateIndex).toBeLessThan(smokeIndex)
    expect(smokeIndex).toBeLessThan(loginIndex)
    expect(loginIndex).toBeLessThan(promotionIndex)
    expect(promotionIndex).toBeLessThan(attestationIndex)
    expect(attestationIndex).toBeLessThan(verifyAttestationIndex)
    expect(verifyAttestationIndex).toBeLessThan(releaseIndex)

    expect(steps[loginIndex]?.id).toBe('ghcr-login')
    expect(steps[loginIndex]?.uses).toBe(
      './.github/actions/ghcr-credential-helper',
    )
    expect(steps[loginIndex]?.with).toEqual({
      token: ['${{', 'github.token', '}}'].join(' '),
      username: ['${{', 'github.actor', '}}'].join(' '),
    })
    expect(steps[promotionIndex]?.if).toBe('success()')
    expect(steps[promotionIndex]?.env?.GHCR_TOKEN).toBe(
      ['${{', 'github.token', '}}'].join(' '),
    )
    expect(steps[promotionIndex]?.env?.REGISTRY_AUTH_FILE).toBe(
      ['${{', 'steps.ghcr-login.outputs.authfile', '}}'].join(' '),
    )
    expect(steps[attestationIndex]?.if).toBe('success()')
    expect(steps[verifyAttestationIndex]?.if).toBe('success()')
    expect(steps[releaseIndex]?.if).toBe(
      "success() && env.RELEASE_CREATE_GITHUB_RELEASE == 'true'",
    )

    const uploadEvidence = steps.find(
      step => step.name === 'Upload release metadata artifacts',
    )
    expect(uploadEvidence?.if).toBe('always()')
    expect(uploadEvidence?.with?.path).toContain(
      'tmp/container-release-artifacts/reports/',
    )
    expect(uploadEvidence?.with?.path).toContain(
      'tmp/container-release-artifacts/sbom/',
    )
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
