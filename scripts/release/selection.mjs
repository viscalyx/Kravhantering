import integrationManifest from '../../tests/integration-chunks.manifest.json' with {
  type: 'json',
}

// Owner ids describe complete existing suites, never individual test cases.
export const VALIDATION_OWNERS = [
  'documents',
  'static',
  'unit',
  'packages',
  'build',
  'browser',
  'runtime',
  'sql',
  'performance',
  'developer',
  'candidates',
  'assembly',
  'hsa',
  'repository-security',
  'api',
  'zap-api',
  'dast',
  'mcp',
  'powershell',
  'devcontainer',
  'setup',
  'trusted',
]
const PR_ONLY = ['candidates', 'assembly', 'hsa', 'dast']
export const WORKFLOW_OWNERS = {
  'quality-checks': ['documents', 'static', 'unit', 'packages'],
  'build-check': ['build'],
  'integration-tests': ['browser', 'runtime', 'sql', 'developer'],
  'requirements-list-performance': ['performance'],
  'container-pr-smoke': ['candidates', 'assembly', 'hsa'],
  'container-release': ['trusted'],
  'security-repository': ['repository-security'],
  'security-api': ['api'],
  'security-dast-api': ['zap-api'],
  'security-dast': ['dast'],
  'security-mcp': ['mcp'],
  'powershell-tests': ['powershell'],
  'devcontainer-image-smoke': ['devcontainer'],
  'copilot-setup-steps': ['setup'],
  'security-dast-roles': ['dast'],
  'security-dast-full': ['dast'],
  'integration-isolation-weekly': ['browser'],
  'container-vulnerability-monitor': ['repository-security'],
  'dependency-drift': ['static', 'repository-security'],
  'operator-upgrade-gate': ['documents', 'unit'],
  'operator-upgrade-notes': ['documents', 'unit'],
  'ssdlc-gate': ['documents', 'unit'],
  'reusable-validation-selection': VALIDATION_OWNERS,
  'reusable-container-runner-metadata': [
    ...['candidates', 'assembly', 'hsa', 'trusted'],
  ],
}
const BROWSER_OWNERS = [
  'browser',
  'runtime',
  'developer',
  'api',
  'zap-api',
  'dast',
  'mcp',
  'assembly',
  'trusted',
]
const CONTAINER_OWNERS = ['candidates', 'assembly', 'hsa', 'trusted']
const APP_OWNERS = VALIDATION_OWNERS.filter(
  owner => !['powershell', 'devcontainer', 'setup'].includes(owner),
)
const rule = (category, owners, release = false) => ({
  category,
  owners: [
    ...new Set([
      ...owners,
      ...(owners.includes('assembly') || owners.includes('hsa')
        ? ['candidates']
        : []),
    ]),
  ],
  release,
})
const documentation =
  /^(?:docs\/|\.github\/(?:instructions|prompts|skills)\/|(?:.*\/)?(?:AGENTS|CLAUDE|CONTEXT|CONTEXT-MAP)\.md$)|^(?:README|CONTRIBUTING|SECURITY|CODE_OF_CONDUCT|LICENSE|CHANGELOG)(?:\.|$)/u
const prose = /\.(?:md|mdx|rst|txt)$/u

function classifyPath(file) {
  if (file.startsWith('.github/actions/report-validation/'))
    return rule('shared validation reporting', VALIDATION_OWNERS, true)
  if (
    /^containers\/hsa-mtls-topology\/(?:topology-test\.mjs|runtime-(?:substitution|wrong-server)-test\.sh|wrong-server-decoy\.mjs)$/u.test(
      file,
    )
  )
    return rule('HSA topology test inputs', [
      'static',
      'unit',
      ...CONTAINER_OWNERS,
    ])
  if (
    documentation.test(file) ||
    (prose.test(file) &&
      /^(?:containers|packages|scripts|\.github)\//u.test(file))
  ) {
    return rule('documentation', ['documents'])
  }
  if (/^containers\/hsa-[^/]+\/test\//u.test(file))
    return rule('package tests', ['static', 'packages'])
  if (file.startsWith('tests/integration/')) {
    if (file.startsWith('tests/integration/developer-mode/'))
      return rule('developer tests', ['static', 'developer'])
    if (file.startsWith('tests/integration/mcp/'))
      return rule('MCP tests', ['static', 'mcp'])
    const runtime = integrationManifest.suites.prodlike.chunks.some(chunk =>
      chunk.paths.includes(file),
    )
    return rule('browser tests', ['static', runtime ? 'runtime' : 'browser'])
  }
  if (file.startsWith('tests/sql-integration/'))
    return rule('SQL tests', ['static', 'sql'])
  if (file.startsWith('tests/performance/'))
    return rule('performance tests', ['static', 'unit', 'performance'])
  if (file.startsWith('tests/release-smoke/'))
    return rule('release smoke tests', ['static', ...CONTAINER_OWNERS])
  if (file.startsWith('tests/container-integration/'))
    return rule('container tests', ['static', 'unit', ...CONTAINER_OWNERS])
  if (file.startsWith('tests/powershell/'))
    return rule('PowerShell tests', ['static', 'powershell'])
  if (
    /^tests\/(?:helpers|fixtures)\/|^tests\/(?:global-|auth\.)|^playwright\.|^tests\/integration-chunks/u.test(
      file,
    )
  )
    return rule('shared browser inputs', [
      'static',
      'unit',
      'sql',
      ...BROWSER_OWNERS,
    ])
  if (/^vitest\.|^test-utils\/|^tests\/unit\//u.test(file))
    return rule('unit configuration', ['static', 'unit', 'sql'])
  if (
    /(?:^|\/)(?:__tests__|test|tests)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(
      file,
    )
  )
    return rule('unit tests', ['static', 'unit'])
  if (/^\.github\/workflows\//u.test(file)) {
    const name = file
      .split('/')
      .at(-1)
      .replace(/\.ya?ml$/u, '')
    const owners = WORKFLOW_OWNERS[name]
    return owners
      ? rule(
          'controlling workflow',
          ['static', 'unit', ...owners],
          [
            'container-release',
            'reusable-validation-selection',
            'reusable-container-runner-metadata',
          ].includes(name),
        )
      : rule('unknown workflow', VALIDATION_OWNERS, true)
  }
  if (file.startsWith('.github/actions/container-candidate/'))
    return rule('candidate validation action', [
      'static',
      'unit',
      'candidates',
      'assembly',
      'hsa',
    ])
  if (/^\.github\/actions\/(?:container-|ghcr-)/u.test(file))
    return rule(
      'container action',
      ['static', 'unit', ...CONTAINER_OWNERS],
      true,
    )
  if (file.startsWith('.github/actions/prodlike-'))
    return rule('browser action', ['static', 'unit', ...BROWSER_OWNERS])
  if (
    /^\.github\/production-smoke\/|^scripts\/hsa-strict-runtime-contract\.mjs$/u.test(
      file,
    )
  )
    return rule('release test inputs', ['static', 'unit', ...CONTAINER_OWNERS])
  if (
    /^\.out-of-scope\/|^\.github\/ISSUE_TEMPLATE\/|^\.github\/CODEOWNERS$/u.test(
      file,
    )
  )
    return rule('contributor documentation', ['documents'])
  if (
    /^\.env\.(?:development|prodlike|sqlserver|azure)|^dev\/devspaces\//u.test(
      file,
    )
  )
    return rule('development and test configuration', [
      'static',
      'unit',
      'sql',
      'powershell',
      'devcontainer',
      'setup',
      ...BROWSER_OWNERS,
    ])
  if (
    /^\.env\.(?:production|example)$|^\.config\/dotnet-tools\.json$|^\.github\/(?:release\.yml|container-release-support\.json)$/u.test(
      file,
    )
  )
    return rule(
      'release configuration',
      ['static', 'unit', ...CONTAINER_OWNERS],
      true,
    )
  if (
    /^scripts\/(?:dev-|check-port|kill-dev-server|extract-pids|azure-dev\.ps1)|^scripts\/lib\/(?:dev-login-core|keycloak-login-form)|^\.codex\/|^\.git(?:ignore|attributes)$/u.test(
      file,
    )
  )
    return rule('development tooling', [
      'static',
      'unit',
      'setup',
      'powershell',
      ...BROWSER_OWNERS,
    ])
  if (
    /^scripts\/(?:biome-|lint-|dependency-maintenance)|^\.(?:biomeignore|editorconfig)$|^codecov\.yml$|^\.github\/dependency-maintenance\.json$/u.test(
      file,
    )
  )
    return rule('static tooling', [
      'documents',
      'static',
      'unit',
      'repository-security',
    ])
  if (
    /^scripts\/check-.*bundle|^scripts\/check-standalone|^scripts\/lib\/client-bundle-budget/u.test(
      file,
    )
  )
    return rule('build checks', [
      'static',
      'unit',
      'build',
      'runtime',
      'trusted',
    ])
  if (
    /^scripts\/guide\/|^schemathesis\.toml$|^\.trivyignore\.yaml$/u.test(file)
  )
    return rule('test and security configuration', [
      'static',
      'unit',
      'repository-security',
      ...BROWSER_OWNERS,
    ])
  if (
    /^scripts\/(?:openapi|provision-ai-provider-secret|generate-status-icon)/u.test(
      file,
    )
  )
    return rule('production generators', APP_OWNERS, true)
  if (/^\.devcontainer\/|^devcontainer-lock\.json$/u.test(file))
    return rule('development environment', [
      'static',
      'unit',
      'devcontainer',
      'setup',
      'powershell',
    ])
  if (
    /^scripts\/(?:azure-dev|devcontainer)\/|^scripts\/test-powershell-integration\.mjs$|^\.vscode\//u.test(
      file,
    )
  )
    return rule('development tooling', [
      'static',
      'unit',
      'devcontainer',
      'setup',
      'powershell',
    ])
  if (/^scripts\/security\/|^\.github\/(?:zap|nuclei)\//u.test(file))
    return rule('security tooling', [
      'static',
      'unit',
      'repository-security',
      'api',
      'zap-api',
      'dast',
      'mcp',
    ])
  if (
    /^scripts\/.*(?:test|smoke|performance|prodlike)|^scripts\/containers\/(?:ci-|collect-|download-candidate|verify-candidate)/u.test(
      file,
    )
  )
    return rule('test runners', [
      'static',
      'unit',
      'performance',
      ...BROWSER_OWNERS,
      ...CONTAINER_OWNERS,
    ])
  if (
    /^(?:package(?:-lock)?\.json|\.nvmrc|\.npmrc|tsconfig.*\.json|next\.config\..*|postcss\.config\..*|\.dockerignore|GitVersion\.yml)$/u.test(
      file,
    )
  )
    return rule('shared production inputs', VALIDATION_OWNERS, true)
  if (
    /^(?:app|components|hooks|lib|i18n|messages|public|typeorm|openapi)\/|^proxy\./u.test(
      file,
    )
  )
    return rule('production application', APP_OWNERS, true)
  if (
    /^containers\/|^scripts\/(?:release|containers)\/|^container-.*\.json$|^\.github\/container-vulnerability/u.test(
      file,
    )
  )
    return rule(
      'release and deployment',
      [
        'documents',
        'static',
        'unit',
        'packages',
        'repository-security',
        ...CONTAINER_OWNERS,
      ],
      true,
    )
  if (
    /^scripts\/(?:prebuild|build-metadata|db-|ai-provider-secret|keycloak-demo-users|install-repository-npm)|^dev\/keycloak\/|^docker-compose/u.test(
      file,
    )
  )
    return rule('shared runtime inputs', VALIDATION_OWNERS, true)
  if (
    /^(?:biome\.json|cspell.*|\.markdownlint.*|\.lychee\.toml|pyrightconfig\.json|\.github\/dependabot\.yml)$/u.test(
      file,
    )
  )
    return rule('static configuration', [
      'documents',
      'static',
      'unit',
      'repository-security',
    ])
  return rule('unknown path', VALIDATION_OWNERS, true)
}

/** Complete facts in, scoped owners and publication permission out. Throws on uncertainty. */
export function selectValidation(input) {
  const {
    eventName,
    ref,
    commitSha,
    collection,
    preview = false,
    workflow,
  } = input
  if (workflow && !WORKFLOW_OWNERS[workflow])
    throw new Error(`Unknown workflow scope: ${workflow}`)
  if (!/^[a-f0-9]{40}$/u.test(commitSha ?? ''))
    throw new Error('Exact source SHA is required.')
  if (
    !['push', 'pull_request', 'workflow_dispatch', 'schedule'].includes(
      eventName,
    )
  )
    throw new Error(`Unsupported event: ${eventName}`)
  if (
    collection?.complete !== true ||
    collection.truncated ||
    !Array.isArray(collection.files)
  )
    throw new Error('Changed-path collection must be complete and untruncated.')
  if (
    preview &&
    (eventName !== 'workflow_dispatch' || ref !== 'refs/heads/main')
  )
    throw new Error('Preview requests require the dispatch source on main.')
  const stable =
    eventName !== 'pull_request' && /^refs\/tags\/v\d+\.\d+\.\d+$/u.test(ref)
  const full = stable || ['workflow_dispatch', 'schedule'].includes(eventName)
  const facts = collection.files.map(fact => {
    const file = typeof fact === 'string' ? fact : fact?.filename
    if (
      typeof file !== 'string' ||
      !file ||
      file.startsWith('/') ||
      file.split('/').includes('..') ||
      /[\r\n\0]/u.test(file)
    )
      throw new Error('Invalid changed path.')
    return { path: file, ...classifyPath(file) }
  })
  const applicable = VALIDATION_OWNERS.filter(owner => {
    if (workflow && !WORKFLOW_OWNERS[workflow]?.includes(owner)) return false
    if (eventName === 'pull_request') return owner !== 'trusted'
    if (PR_ONLY.includes(owner)) return false
    if (owner === 'zap-api' && eventName === 'push') return false
    return true
  })
  const reasons = {}
  const owners = applicable.filter(owner => {
    const matches = facts.filter(fact => fact.owners.includes(owner))
    reasons[owner] = full
      ? `${stable ? 'stable tag' : eventName}: complete applicable validation`
      : matches.length
        ? [...new Set(matches.map(fact => fact.category))].join(', ')
        : 'Excluded: no changed path selects this owner'
    return full || matches.length > 0
  })
  return {
    eventName,
    ref,
    commitSha,
    collection,
    preview,
    workflow,
    classifications: facts.map(({ path, category }) => ({ path, category })),
    owners,
    reasons,
    releaseEligible:
      stable ||
      (ref === 'refs/heads/main' &&
        (preview ||
          (eventName === 'push' && facts.some(fact => fact.release)))),
    releaseReason: stable
      ? 'stable tag'
      : preview
        ? 'explicit main preview'
        : facts.some(fact => fact.release)
          ? 'release input changed; publication also requires a main push'
          : 'documentation, test or development changes exclude automatic publication',
  }
}
