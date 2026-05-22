import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildEnvLocalContent,
  parseArgs,
  parseOverride,
  writeEnvLocalFiles,
} from '../containers/write-env-local.mjs'

const tempDirs = []

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'container-env-'))
  tempDirs.push(dir)
  for (const [container, fileName] of [
    ['app', '.env.app.example'],
    ['db-job', '.env.db-job.example'],
    ['keycloak', '.env.keycloak.demo.example'],
    ['sqlserver', '.env.sqlserver.example'],
  ]) {
    const directory = path.join(dir, 'containers', container)
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(
      path.join(directory, fileName),
      `# Example for ${container}\nCOMMON=value\n${container.toUpperCase().replace('-', '_')}_ONLY=yes\n`,
    )
  }
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true })
  }
})

describe('container local env writer', () => {
  it('replaces matching keys and appends missing runtime overrides', () => {
    const content = buildEnvLocalContent(
      '# Demo\nDB_PASSWORD=demo\n',
      new Map([
        ['DB_PASSWORD', 'secret'],
        ['EXTRA_VALUE', 'runtime'],
      ]),
    )

    expect(content).toBe(
      '# Demo\nDB_PASSWORD=secret\n\n# Runtime overrides supplied by write-env-local.mjs.\nEXTRA_VALUE=runtime\n',
    )
  })

  it('writes only the selected per-container local env file', () => {
    const cwd = makeProject()
    const writes = writeEnvLocalFiles({
      container: 'app',
      cwd,
      overrides: new Map([['COMMON', 'overridden']]),
    })

    expect(writes).toHaveLength(1)
    expect(writes[0].relativeLocalPath).toBe('containers/app/.env.app.local')
    expect(
      fs.readFileSync(path.join(cwd, 'containers/app/.env.app.local'), 'utf8'),
    ).toContain('COMMON=overridden')
    expect(fs.existsSync(path.join(cwd, '.env.local'))).toBe(false)
    expect(
      fs.existsSync(path.join(cwd, 'containers/db-job/.env.db-job.local')),
    ).toBe(false)
  })

  it('writes all known container local env files when requested', () => {
    const cwd = makeProject()
    const writes = writeEnvLocalFiles({ container: 'all', cwd })

    expect(writes.map(write => write.relativeLocalPath).sort()).toEqual([
      'containers/app/.env.app.local',
      'containers/db-job/.env.db-job.local',
      'containers/keycloak/.env.keycloak.local',
      'containers/sqlserver/.env.sqlserver.local',
    ])
  })

  it('keeps runtime overrides scoped to a single container', () => {
    const cwd = makeProject()

    expect(() =>
      writeEnvLocalFiles({
        container: 'all',
        cwd,
        overrides: new Map([['DB_PASSWORD', 'secret']]),
      }),
    ).toThrow('single container')
  })

  it('refuses to overwrite local env files without force', () => {
    const cwd = makeProject()
    fs.writeFileSync(path.join(cwd, 'containers/app/.env.app.local'), 'old\n')

    expect(() => writeEnvLocalFiles({ container: 'app', cwd })).toThrow(
      'already exists',
    )
    expect(() =>
      writeEnvLocalFiles({ container: 'app', cwd, force: true }),
    ).not.toThrow()
  })

  it('parses CLI overrides without printing their values', () => {
    expect(parseOverride('DB_PASSWORD=secret')).toEqual([
      'DB_PASSWORD',
      'secret',
    ])
    expect(() => parseOverride('bad-key=value')).toThrow(
      'Invalid environment key',
    )
    expect(parseArgs(['app', '--set', 'A=B', '--force'])).toMatchObject({
      container: 'app',
      force: true,
      overrides: new Map([['A', 'B']]),
    })
  })
})
