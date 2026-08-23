import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const policyPath = path.join(
  process.cwd(),
  'scripts/azure-dev/templates/install-azure-codex-session-policy.sh',
)
const temporaryDirectories: string[] = []

function fixture(
  zshTemplate = [
    'export OPERATOR_CUSTOMIZATION=preserved',
    `export PATH="/operator/custom/bin:\${PATH}"`,
    '',
  ].join('\n'),
) {
  const root = mkdtempSync(path.join(tmpdir(), 'azure-codex-policy-'))
  temporaryDirectories.push(root)
  const userHome = path.join(root, 'home', 'vscode')
  const launcher = path.join(userHome, '.local', 'bin', 'codex')
  const zshSource = path.join(root, 'zshrc.template')
  const zshDestination = path.join(userHome, '.zshrc')
  const sshdConfig = path.join(
    root,
    'etc',
    'ssh',
    'sshd_config.d',
    'policy.conf',
  )
  const bashProfile = path.join(root, 'etc', 'profile.d', 'codex-path.sh')
  const fakeBin = path.join(root, 'fake-bin')
  const systemctlCapture = path.join(root, 'systemctl.txt')
  const managedPath = `${path.dirname(launcher)}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`

  mkdirSync(path.dirname(launcher), { recursive: true, mode: 0o700 })
  mkdirSync(fakeBin)
  writeFileSync(launcher, '#!/usr/bin/env bash\nprintf "codex-cli 1.2.3\\n"\n')
  chmodSync(launcher, 0o755)
  writeFileSync(zshSource, zshTemplate)
  const sshd = path.join(fakeBin, 'sshd')
  writeFileSync(
    sshd,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'if [ "$1" = -t ]; then exit 0; fi',
      'user=""',
      'for argument in "$@"; do',
      '  case "$argument" in user=*) user="$(printf \'%s\' "$argument" | cut -d= -f2 | cut -d, -f1)" ;; esac',
      'done',
      "printf 'acceptenv GH_TOKEN COPILOT_GITHUB_TOKEN\\n'",
      'if [ "$user" = "$EXPECTED_CODEX_USER" ]; then',
      '  printf \'setenv PATH=%s\\n\' "$EXPECTED_MANAGED_PATH"',
      'fi',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  const systemctl = path.join(fakeBin, 'systemctl')
  writeFileSync(
    systemctl,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" > '${systemctlCapture}'\n`,
    { mode: 0o755 },
  )

  return {
    bashProfile,
    env: {
      ...process.env,
      AZURE_DEV_BASH_CODEX_PATH_PROFILE: bashProfile,
      AZURE_DEV_CODEX_USER: userInfo().username,
      AZURE_DEV_CODEX_USER_HOME: userHome,
      AZURE_DEV_SSHD_BIN: sshd,
      AZURE_DEV_SSHD_ENVIRONMENT_CONFIG: sshdConfig,
      AZURE_DEV_SYSTEMCTL_BIN: systemctl,
      AZURE_DEV_ZSHRC_DESTINATION: zshDestination,
      AZURE_DEV_ZSHRC_SOURCE: zshSource,
      EXPECTED_CODEX_USER: userInfo().username,
      EXPECTED_MANAGED_PATH: managedPath,
    },
    launcher,
    managedPath,
    sshdConfig,
    systemctl,
    systemctlCapture,
    userHome,
    zshDestination,
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('Azure Codex session policy', () => {
  it('converges vscode-only SSH, Bash, and Zsh command resolution', () => {
    const target = fixture()

    const result = spawnSync('bash', [policyPath], {
      encoding: 'utf8',
      env: target.env,
    })

    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(target.sshdConfig, 'utf8')).toBe(
      [
        '# Managed by Kravhantering Azure development setup.',
        'AcceptEnv GH_TOKEN COPILOT_GITHUB_TOKEN',
        `Match User ${userInfo().username}`,
        `    SetEnv PATH=${target.managedPath}`,
        'Match all',
        '',
      ].join('\n'),
    )
    expect(readFileSync(target.systemctlCapture, 'utf8')).toBe(
      'reload ssh.service\n',
    )
    const installedZsh = readFileSync(target.zshDestination, 'utf8')
    expect(installedZsh).toContain('OPERATOR_CUSTOMIZATION=preserved')
    expect(
      installedZsh.indexOf('OPERATOR_CUSTOMIZATION=preserved'),
    ).toBeLessThan(
      installedZsh.indexOf('# BEGIN managed Azure Codex command path'),
    )

    const bashResolution = spawnSync(
      'bash',
      [
        '--noprofile',
        '--norc',
        '-c',
        `. '${target.bashProfile}'; command -v codex`,
      ],
      { encoding: 'utf8', env: { ...process.env, HOME: target.userHome } },
    )
    expect(bashResolution.status).toBe(0)
    expect(bashResolution.stdout.trim()).toBe(target.launcher)
    const zshResolution = spawnSync('zsh', ['-ic', 'whence -p codex'], {
      encoding: 'utf8',
      env: { ...process.env, HOME: target.userHome, ZDOTDIR: target.userHome },
    })
    expect(zshResolution.status).toBe(0)
    expect(zshResolution.stdout.trim()).toBe(target.launcher)
    const zshPath = spawnSync('zsh', ['-ic', `print -r -- "\${PATH}"`], {
      encoding: 'utf8',
      env: { ...process.env, HOME: target.userHome, ZDOTDIR: target.userHome },
    })
    expect(zshPath.status).toBe(0)
    expect(zshPath.stdout.trim().split(':')[0]).toBe(
      path.dirname(target.launcher),
    )
    expect(zshPath.stdout.trim().split(':')).toContain('/operator/custom/bin')
  })

  it.each(['alias codex=true\n', 'codex() { true; }\n'])(
    'rejects a custom Zsh template that masks codex: %s',
    masking => {
      const target = fixture(masking)

      const result = spawnSync('bash', [policyPath], {
        encoding: 'utf8',
        env: target.env,
      })

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('alias or function named codex')
      expect(existsSync(target.zshDestination)).toBe(false)
      expect(existsSync(target.sshdConfig)).toBe(false)
      expect(existsSync(target.bashProfile)).toBe(false)
      expect(existsSync(target.systemctlCapture)).toBe(false)
    },
  )

  it('restores every prior policy file when activation fails', () => {
    const target = fixture()
    const originals = {
      bash: '# prior Bash policy\n',
      ssh: '# prior SSH policy\n',
      zsh: '# prior Zsh profile\n',
    }
    mkdirSync(path.dirname(target.sshdConfig), { recursive: true })
    mkdirSync(path.dirname(target.bashProfile), { recursive: true })
    writeFileSync(target.sshdConfig, originals.ssh)
    writeFileSync(target.bashProfile, originals.bash)
    writeFileSync(target.zshDestination, originals.zsh)
    writeFileSync(target.systemctl, '#!/usr/bin/env bash\nexit 1\n', {
      mode: 0o755,
    })

    const result = spawnSync('bash', [policyPath], {
      encoding: 'utf8',
      env: target.env,
    })

    expect(result.status).not.toBe(0)
    expect(readFileSync(target.sshdConfig, 'utf8')).toBe(originals.ssh)
    expect(readFileSync(target.bashProfile, 'utf8')).toBe(originals.bash)
    expect(readFileSync(target.zshDestination, 'utf8')).toBe(originals.zsh)
  })
})
