import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

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

describe('security tooling configuration', () => {
  it('keeps Azure and devcontainer Lychee versions aligned', () => {
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
    expect(dockerfileVersion).toBeDefined()
    expect(azureHostVersion).toBe(dockerfileVersion)
    expect(dockerfileHashes).toHaveLength(2)
    expect(azureHostHashes).toEqual(dockerfileHashes)
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
})
