import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryDirectories: string[] = []
const orchestrationPath = path.join(
  process.cwd(),
  'scripts/azure-dev/templates/install-azure-codex.sh',
)

function runOrchestration(installerOutput: string) {
  const root = mkdtempSync(path.join(tmpdir(), 'azure-codex-orchestration-'))
  temporaryDirectories.push(root)
  const installerPath = path.join(root, 'install-codex.sh')
  const argumentsPath = path.join(root, 'arguments.txt')
  mkdirSync(path.join(root, 'codex-home'))
  mkdirSync(path.join(root, 'install-bin'))
  writeFileSync(
    installerPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'printf \'%s\\n\' "$@" > "$FAKE_INSTALLER_ARGUMENTS"',
      'printf \'%s\' "$FAKE_INSTALLER_OUTPUT"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )

  const result = spawnSync('bash', [orchestrationPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      AZURE_DEV_CODEX_INSTALLER: installerPath,
      CODEX_HOME: path.join(root, 'codex-home'),
      CODEX_INSTALL_DIR: path.join(root, 'install-bin'),
      FAKE_INSTALLER_ARGUMENTS: argumentsPath,
      FAKE_INSTALLER_OUTPUT: installerOutput,
      GH_TOKEN: 'fixture-forwarded-token',
    },
  })

  return { argumentsPath, result }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('Azure Codex installation orchestration', () => {
  it('emits one validated target-version result for a successful installation', () => {
    const { result } = runOrchestration(
      '{"schemaVersion":1,"targetVersion":"1.2.3"}\n',
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toBe(
      'KRAV_AZURE_CODEX_RESULT={"schemaVersion":1,"targetVersion":"1.2.3"}\n',
    )
  })

  it.each([
    ['missing', ''],
    ['malformed', '{"targetVersion":'],
    [
      'ambiguous',
      '{"schemaVersion":1,"targetVersion":"1.2.3"}\n' +
        '{"schemaVersion":1,"targetVersion":"1.2.3"}\n',
    ],
    [
      'conflicting',
      '{"schemaVersion":1,"targetVersion":"1.2.3"}\n' +
        '{"schemaVersion":1,"targetVersion":"1.2.4"}\n',
    ],
    [
      'conflicting duplicate field',
      '{"schemaVersion":1,"targetVersion":"1.2.3","targetVersion":"1.2.4"}\n',
    ],
    ['unstable', '{"schemaVersion":1,"targetVersion":"1.2.3-beta.1"}\n'],
  ])('fails closed for a %s installer result', (_name, output) => {
    const { result } = runOrchestration(output)

    expect(result.status).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('Codex installer result is invalid')
  })

  it('keeps forwarded token values out of output and installer arguments', () => {
    const { argumentsPath, result } = runOrchestration(
      '{"schemaVersion":1,"targetVersion":"1.2.3"}\n',
    )

    expect(result.status).toBe(0)
    expect(`${result.stdout}${result.stderr}`).not.toContain(
      'fixture-forwarded-token',
    )
    expect(readFileSync(argumentsPath, 'utf8')).not.toContain(
      'fixture-forwarded-token',
    )
  })
})
