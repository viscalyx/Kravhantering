import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const mergerPath = 'scripts/azure-dev/templates/merge-codex-config.py'
const managedConfigPath = 'scripts/azure-dev/templates/codex-config.toml'
const temporaryDirectories: string[] = []

function createTemporaryConfig(content: string) {
  const directory = mkdtempSync(join(tmpdir(), 'krav-codex-config-'))
  temporaryDirectories.push(directory)
  const configPath = join(directory, 'config.toml')
  writeFileSync(configPath, content)
  return configPath
}

function mergeConfig(configPath: string) {
  execFileSync('python3', [mergerPath, managedConfigPath, configPath])
  return readFileSync(configPath, 'utf8')
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('Azure development Codex configuration', () => {
  it('merges the managed profile without replacing existing user settings', () => {
    const configPath = createTemporaryConfig(`personality = "pragmatic"
model = "gpt-existing"

[mcp_servers.example]
command = "example"

[projects."/workspace"]
trust_level = "untrusted"
`)

    const firstMerge = mergeConfig(configPath)

    expect(firstMerge).toContain('personality = "pragmatic"')
    expect(firstMerge).toContain('model = "gpt-existing"')
    expect(firstMerge).toContain('[mcp_servers.example]')
    expect(firstMerge).toContain(
      'default_permissions = "kravhantering-azure-dev"',
    )
    expect(firstMerge).toContain('[permissions.kravhantering-azure-dev]')
    expect(firstMerge).toContain(
      '[permissions.kravhantering-azure-dev.filesystem.":workspace_roots"]',
    )
    expect(firstMerge).toContain('".git" = "write"')
    expect(firstMerge).toContain('allow_local_binding = true')
    expect(firstMerge).toContain('"127.0.0.1" = "allow"')
    expect(firstMerge.match(/\[projects\."\/workspace"\]/g)).toHaveLength(1)
    expect(firstMerge).toContain('trust_level = "trusted"')

    expect(mergeConfig(configPath)).toBe(firstMerge)
  })

  it('migrates a previously copied devcontainer profile', () => {
    const configPath = createTemporaryConfig(`approval_policy = "never"
default_permissions = "kravhantering-devcontainer"

[projects."/workspace"]
trust_level = "trusted"

[permissions.kravhantering-devcontainer]
description = "Old profile"
extends = ":workspace"

[permissions.kravhantering-devcontainer.network]
enabled = true

[mcp_servers.example]
command = "example"
`)

    const merged = mergeConfig(configPath)

    expect(merged).not.toContain('kravhantering-devcontainer')
    expect(merged).toContain('default_permissions = "kravhantering-azure-dev"')
    expect(merged).toContain('[mcp_servers.example]')
  })
})
