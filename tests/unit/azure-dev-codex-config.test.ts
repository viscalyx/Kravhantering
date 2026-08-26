import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const mergerPath = 'scripts/azure-dev/templates/merge-codex-config.py'
const managedConfigPath = 'scripts/azure-dev/templates/codex-config.toml'
const devcontainerConfigPath = '.devcontainer/codex-config.toml'
const temporaryDirectories: string[] = []
const disabledSystemSkillPaths = [
  '/home/vscode/.codex/skills/.system/plugin-creator/SKILL.md',
  '/home/vscode/.codex/skills/.system/review-agent/SKILL.md',
  '/home/vscode/.codex/skills/.system/skill-creator/SKILL.md',
  '/home/vscode/.codex/skills/.system/skill-installer/SKILL.md',
]
const disabledPluginNames = ['openai-templates', 'plugin-management']
const validateMergedConfigScript = `
import importlib.util
from pathlib import Path
import sys
import tomllib

spec = importlib.util.spec_from_file_location("merge_codex_config", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
managed = tomllib.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
module.validate_merged_config(sys.stdin.read(), managed)
`

function expectDisabledPlugins(content: string) {
  for (const pluginName of disabledPluginNames) {
    expect(content).toMatch(
      new RegExp(
        `\\[plugins\\.(?:"${pluginName}"|${pluginName})\\]\\nenabled = false`,
        'u',
      ),
    )
  }
}

function createTemporaryConfig(content: string) {
  const directory = mkdtempSync(join(tmpdir(), 'krav-codex-config-'))
  temporaryDirectories.push(directory)
  const configPath = join(directory, 'config.toml')
  writeFileSync(configPath, content)
  return configPath
}

function mergeConfig(configPath: string, sourceConfigPath = managedConfigPath) {
  execFileSync('python3', [mergerPath, sourceConfigPath, configPath])
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

[plugins.openai-templates]
enabled = true

[projects."/workspace"]
trust_level = "untrusted"
`)

    const firstMerge = mergeConfig(configPath)

    expect(firstMerge).toContain('personality = "pragmatic"')
    expect(firstMerge).toContain('model = "gpt-existing"')
    expect(firstMerge).toContain('[mcp_servers.example]')
    expect(firstMerge).toContain(
      'default_permissions = "kravhantering-development"',
    )
    expect(firstMerge).toContain('[permissions.kravhantering-development]')
    expect(firstMerge).toContain(
      '[permissions.kravhantering-development.filesystem]',
    )
    expect(firstMerge).toContain('"~/.codex/skills" = "write"')
    expect(firstMerge).toContain(
      '[permissions.kravhantering-development.filesystem.":workspace_roots"]',
    )
    expect(firstMerge).toContain('".codex" = "write"')
    expect(firstMerge).toContain('".git" = "write"')
    expect(firstMerge).toContain('allow_local_binding = true')
    expect(firstMerge).toContain('"127.0.0.1" = "allow"')
    expect(firstMerge.match(/\[projects\."\/workspace"\]/g)).toHaveLength(1)
    expect(firstMerge).toContain('trust_level = "trusted"')
    expectDisabledPlugins(firstMerge)
    expect(firstMerge).not.toContain('/plugins/cache/')
    expect(firstMerge.match(/\[\[skills\.config\]\]/g)).toHaveLength(4)
    for (const path of disabledSystemSkillPaths) {
      expect(firstMerge).toContain(`path = "${path}"`)
    }

    expect(mergeConfig(configPath)).toBe(firstMerge)
  })

  it('merges the same disabled plugins and system skills for devcontainers', () => {
    const configPath = createTemporaryConfig('personality = "pragmatic"\n')

    const merged = mergeConfig(configPath, devcontainerConfigPath)

    expectDisabledPlugins(merged)
    expect(merged).not.toContain('/plugins/cache/')
    expect(merged.match(/\[\[skills\.config\]\]/g)).toHaveLength(4)
    for (const path of disabledSystemSkillPaths) {
      expect(merged).toContain(`path = "${path}"`)
    }
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
    expect(merged).toContain(
      'default_permissions = "kravhantering-development"',
    )
    expect(merged).toContain('[mcp_servers.example]')
  })

  it('replaces an enabled managed skill without changing unmanaged skills', () => {
    const managedSkillPath = disabledSystemSkillPaths[0]
    const unmanagedSkillPath = '/home/vscode/.codex/skills/example/SKILL.md'
    const configPath = createTemporaryConfig(`[plugins.openai-templates]
enabled = true

[[skills.config]]
path = "${managedSkillPath}"
enabled = true

[[skills.config]]
path = "${unmanagedSkillPath}"
enabled = true
`)

    const merged = mergeConfig(configPath)

    expect(merged.split(`path = "${managedSkillPath}"`)).toHaveLength(2)
    expect(merged).toContain(`path = "${managedSkillPath}"\nenabled = false`)
    expect(merged).toContain(`path = "${unmanagedSkillPath}"\nenabled = true`)
  })

  it('rejects duplicate managed skill paths during post-merge validation', () => {
    const configPath = createTemporaryConfig('personality = "pragmatic"\n')
    const managedSkillPath = disabledSystemSkillPaths[0]
    const duplicateConfig = `${mergeConfig(configPath)}
[[skills.config]]
path = "${managedSkillPath}"
enabled = true
`

    const validation = spawnSync(
      'python3',
      ['-c', validateMergedConfigScript, mergerPath, managedConfigPath],
      { encoding: 'utf8', input: duplicateConfig },
    )

    expect(validation.status).toBe(1)
    expect(validation.stderr).toContain(
      `merged disabled skill configuration is incorrect for ${managedSkillPath}`,
    )
  })
})
