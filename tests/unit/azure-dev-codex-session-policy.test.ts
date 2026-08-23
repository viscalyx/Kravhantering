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
const rootPolicyFixtureImage = readFileSync(
  path.join(
    process.cwd(),
    'scripts/containers/production-smoke-debug.Containerfile',
  ),
  'utf8',
).match(/^FROM (ubuntu:[^\s]+@sha256:[a-f0-9]{64})$/m)?.[1]
if (!rootPolicyFixtureImage) {
  throw new Error('Pinned Ubuntu policy-fixture image reference is missing')
}
const candidateZshExpression = '$' + '{MANAGED_ZSHRC:-$' + '{ZDOTDIR}/.zshrc}'

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

  it('keeps validated candidates and rollback bytes outside vscode control', () => {
    const fixtureScript = String.raw`
set -euo pipefail
useradd --create-home --uid 2000 --shell /bin/bash vscode
install -d -o vscode -g vscode -m 0700 /case/home/vscode/.local/bin
printf '#!/usr/bin/env bash\nprintf "codex-cli 1.2.3\\n"\n' > /case/home/vscode/.local/bin/codex
chown vscode:vscode /case/home/vscode/.local/bin/codex
chmod 0755 /case/home/vscode/.local/bin/codex
install -d -m 0755 /case/bin /case/etc/ssh /case/etc/profile.d
printf '# original SSH policy\n' > /case/etc/ssh/policy.conf
printf '# original Bash policy\n' > /case/etc/profile.d/codex.sh
printf '# original Zsh profile\n' > /case/home/vscode/.zshrc
chown vscode:vscode /case/home/vscode/.zshrc
chmod 0640 /case/etc/ssh/policy.conf
chmod 0600 /case/etc/profile.d/codex.sh
chmod 0644 /case/home/vscode/.zshrc
cp /case/etc/ssh/policy.conf /case/expected-ssh
cp /case/etc/profile.d/codex.sh /case/expected-bash
cp /case/home/vscode/.zshrc /case/expected-zsh
stat -c '%u:%g %a' /case/etc/ssh/policy.conf > /case/expected-ssh-metadata
stat -c '%u:%g %a' /case/etc/profile.d/codex.sh > /case/expected-bash-metadata
stat -c '%u:%g %a' /case/home/vscode/.zshrc > /case/expected-zsh-metadata
printf 'export CUSTOM_VALUE=preserved\n' > /case/zshrc.template
install -o vscode -g vscode -m 0600 /dev/null /case/candidate-directory

cat > /case/bin/sshd <<'FAKE_SSHD'
#!/usr/bin/env bash
set -euo pipefail
if [ "$1" = -t ]; then exit 0; fi
user=''
for argument in "$@"; do
  case "$argument" in user=*) user="$(printf '%s' "$argument" | cut -d= -f2 | cut -d, -f1)" ;; esac
done
if [ "$user" = vscode ]; then
  printf 'setenv PATH=%s\n' "$EXPECTED_MANAGED_PATH"
fi
FAKE_SSHD

cat > /case/bin/zsh <<'FAKE_ZSH'
#!/usr/bin/env bash
set -euo pipefail
candidate="${candidateZshExpression}"
dirname -- "$candidate" > /case/candidate-directory
: > /case/candidate-metadata
for staged_candidate in \
  "$(dirname -- "$candidate")/sshd-policy.conf" \
  "$(dirname -- "$candidate")/bash-policy.sh" \
  "$candidate"; do
  stat -c '%u:%g %a' "$staged_candidate" >> /case/candidate-metadata
  if printf '# vscode candidate tamper\n' >> "$staged_candidate" 2>/dev/null; then
    touch /case/candidate-writable
  fi
done
FAKE_ZSH

cat > /case/bin/systemctl <<'FAKE_SYSTEMCTL'
#!/usr/bin/env bash
set -euo pipefail
staging="$(cat /case/candidate-directory)"
: > /case/backup-metadata
for backup in "$staging"/rollback-*/content; do
  stat -c '%u:%g %a' "$backup" >> /case/backup-metadata
  if runuser -u vscode -- sh -c 'printf "# vscode backup tamper\n" >> "$1"' sh "$backup" 2>/dev/null; then
    touch /case/backup-writable
  fi
done
exit 1
FAKE_SYSTEMCTL
chmod 0755 /case/bin/*
install -m 0755 /case/bin/zsh /usr/local/bin/zsh

set +e
EXPECTED_MANAGED_PATH=/case/home/vscode/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
AZURE_DEV_CODEX_USER=vscode \
AZURE_DEV_CODEX_USER_HOME=/case/home/vscode \
AZURE_DEV_ZSHRC_SOURCE=/case/zshrc.template \
AZURE_DEV_ZSHRC_DESTINATION=/case/home/vscode/.zshrc \
AZURE_DEV_SSHD_ENVIRONMENT_CONFIG=/case/etc/ssh/policy.conf \
AZURE_DEV_BASH_CODEX_PATH_PROFILE=/case/etc/profile.d/codex.sh \
AZURE_DEV_SSHD_BIN=/case/bin/sshd \
AZURE_DEV_SYSTEMCTL_BIN=/case/bin/systemctl \
AZURE_DEV_ZSH_BIN=/case/bin/zsh \
  bash /policy.sh
policy_status=$?
set -e

emit_observation() {
  printf 'KRAV_POLICY_SECURITY_%s=%s\n' "$1" "$2"
}
file_hash() {
  sha256sum "$1" | cut -d' ' -f1
}
presence() {
  if [ -e "$1" ]; then printf 'true\n'; else printf 'false\n'; fi
}

emit_observation policyStatus "$policy_status"
emit_observation candidateCount "$(wc -l < /case/candidate-metadata)"
emit_observation candidateMetadata "$(sort -u /case/candidate-metadata)"
emit_observation candidateWritable "$(presence /case/candidate-writable)"
emit_observation backupCount "$(wc -l < /case/backup-metadata)"
emit_observation backupMetadata "$(sort -u /case/backup-metadata)"
emit_observation backupWritable "$(presence /case/backup-writable)"
for policy_name in ssh bash zsh; do
  case "$policy_name" in
    ssh) restored_path=/case/etc/ssh/policy.conf ;;
    bash) restored_path=/case/etc/profile.d/codex.sh ;;
    zsh) restored_path=/case/home/vscode/.zshrc ;;
  esac
  emit_observation "$policy_name"ExpectedHash "$(file_hash "/case/expected-$policy_name")"
  emit_observation "$policy_name"ActualHash "$(file_hash "$restored_path")"
  emit_observation "$policy_name"ExpectedMetadata "$(cat "/case/expected-$policy_name-metadata")"
  emit_observation "$policy_name"ActualMetadata "$(stat -c '%u:%g %a' "$restored_path")"
done
`
    const imageAvailability = spawnSync(
      'docker',
      ['image', 'inspect', rootPolicyFixtureImage],
      { encoding: 'utf8' },
    )
    expect(
      imageAvailability.status,
      `Provision the pinned policy fixture first: docker pull '${rootPolicyFixtureImage}'`,
    ).toBe(0)
    const result = spawnSync(
      'docker',
      [
        'run',
        '--rm',
        '--network=none',
        '--pull=never',
        '--tmpfs',
        '/case:rw,exec,nosuid,nodev,size=32m',
        '--mount',
        `type=bind,source=${policyPath},target=/policy.sh,readonly`,
        rootPolicyFixtureImage,
        'bash',
        '-c',
        fixtureScript,
      ],
      { encoding: 'utf8' },
    )

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    const observations = Object.fromEntries(
      result.stdout
        .split('\n')
        .filter(line => line.startsWith('KRAV_POLICY_SECURITY_'))
        .map(line => {
          const separator = line.indexOf('=')
          return [
            line.slice('KRAV_POLICY_SECURITY_'.length, separator),
            line.slice(separator + 1),
          ]
        }),
    )
    expect(observations).toMatchObject({
      backupCount: '3',
      backupMetadata: '0:0 600',
      backupWritable: 'false',
      candidateCount: '3',
      candidateMetadata: '0:0 644',
      candidateWritable: 'false',
      policyStatus: '1',
    })
    for (const policyName of ['ssh', 'bash', 'zsh']) {
      expect(observations[`${policyName}ActualHash`]).toBe(
        observations[`${policyName}ExpectedHash`],
      )
      expect(observations[`${policyName}ActualMetadata`]).toBe(
        observations[`${policyName}ExpectedMetadata`],
      )
    }
    expect(observations.sshExpectedMetadata).toBe('0:0 640')
    expect(observations.bashExpectedMetadata).toBe('0:0 600')
    expect(observations.zshExpectedMetadata).toMatch(/^2000:\d+ 644$/)
  }, 15_000)
})
