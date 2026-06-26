import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

// cSpell:ignore FULLSEMVER showvariable

const require = createRequire(import.meta.url)
const {
  DEFAULT_MIGRATIONS_DIR,
  UNKNOWN_COMMIT_SHA,
  createBuildMetadata,
  readExpectedDatabaseSchemaVersion,
  writeBuildMetadata,
} = require('../build-metadata.js')

const tempDirs = []

function makeProject(version = '0.1.0') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-metadata-'))
  tempDirs.push(dir)
  const packageJsonPath = path.join(dir, 'package.json')
  fs.writeFileSync(packageJsonPath, JSON.stringify({ version }))
  addMigration(dir, '0001_initial.mjs', 'InitialSchema1713720000000')
  return { dir, packageJsonPath }
}

function addMigration(dir, filename, migrationName) {
  const migrationsDir = path.join(dir, DEFAULT_MIGRATIONS_DIR)
  fs.mkdirSync(migrationsDir, { recursive: true })
  fs.writeFileSync(
    path.join(migrationsDir, filename),
    [
      `export class ${migrationName} {`,
      `  name = '${migrationName}'`,
      '}',
      '',
    ].join('\n'),
  )
}

function addDotnetToolManifest(dir) {
  const configDir = path.join(dir, '.config')
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(
    path.join(configDir, 'dotnet-tools.json'),
    JSON.stringify({
      isRoot: true,
      tools: {
        'gitversion.tool': {
          commands: ['dotnet-gitversion'],
          version: '6.7.0',
        },
      },
      version: 1,
    }),
  )
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true })
  }
})

describe('build metadata generator', () => {
  it('prefers explicit build environment values', () => {
    const { dir, packageJsonPath } = makeProject()

    const metadata = createBuildMetadata({
      cwd: dir,
      env: {
        BUILD_EXPECTED_DATABASE_SCHEMA_VERSION:
          'ReleaseExpectedMigration1713900000000',
        BUILD_COMMIT_SHA: 'abc123',
        BUILD_IMAGE_TAG: 'registry.example/app:1.2.3',
        BUILD_TIME: '2026-05-21T19:00:00.000Z',
        BUILD_VERSION: '1.2.3',
        GITHUB_SHA: 'ignored',
        GITVERSION_FULLSEMVER: 'ignored',
      },
      execFileSync: () => 'ignored',
      packageJsonPath,
    })

    expect(metadata).toEqual({
      builtAt: '2026-05-21T19:00:00.000Z',
      commitSha: 'abc123',
      expectedDatabaseSchemaVersion: 'ReleaseExpectedMigration1713900000000',
      imageTag: 'registry.example/app:1.2.3',
      version: '1.2.3',
    })
  })

  it('falls back to GitVersion, package version, git SHA, and local image tag', () => {
    const { dir, packageJsonPath } = makeProject('0.1.0')

    const metadata = createBuildMetadata({
      cwd: dir,
      env: { GITVERSION_FULLSEMVER: '1.0.0-preview.1' },
      execFileSync: () => 'deadbeef\n',
      now: () => new Date('2026-05-21T20:00:00.000Z'),
      packageJsonPath,
    })

    expect(metadata).toEqual({
      builtAt: '2026-05-21T20:00:00.000Z',
      commitSha: 'deadbeef',
      expectedDatabaseSchemaVersion: 'InitialSchema1713720000000',
      imageTag: 'local-dev',
      version: '1.0.0-preview.1',
    })
  })

  it('uses local GitVersion SemVer when the dotnet tool manifest exists', () => {
    const { dir, packageJsonPath } = makeProject('0.1.0')
    addDotnetToolManifest(dir)
    const calls = []

    const metadata = createBuildMetadata({
      cwd: dir,
      env: { HOME: '/home/vscode' },
      execFileSync: (command, args) => {
        calls.push({ args, command })
        if (args[0] === 'tool') return '0.2.0-example.7\n'
        if (args[0] === 'rev-parse') return 'deadbeef\n'
        throw new Error(`Unexpected command: ${command}`)
      },
      now: () => new Date('2026-05-21T20:30:00.000Z'),
      packageJsonPath,
    })

    expect(metadata).toEqual({
      builtAt: '2026-05-21T20:30:00.000Z',
      commitSha: 'deadbeef',
      expectedDatabaseSchemaVersion: 'InitialSchema1713720000000',
      imageTag: 'local-dev',
      version: '0.2.0-example.7',
    })
    expect(calls[0]).toMatchObject({
      args: [
        'tool',
        'run',
        'dotnet-gitversion',
        '/output',
        'json',
        '/showvariable',
        'SemVer',
      ],
      command: '/home/vscode/.dotnet/dotnet',
    })
  })

  it('uses package version and unknown commit when git is unavailable', () => {
    const { dir, packageJsonPath } = makeProject('0.2.0')

    const metadata = createBuildMetadata({
      cwd: dir,
      env: {},
      execFileSync: () => {
        throw new Error('git unavailable')
      },
      now: () => new Date('2026-05-21T21:00:00.000Z'),
      packageJsonPath,
    })

    expect(metadata).toEqual({
      builtAt: '2026-05-21T21:00:00.000Z',
      commitSha: UNKNOWN_COMMIT_SHA,
      expectedDatabaseSchemaVersion: 'InitialSchema1713720000000',
      imageTag: 'local-dev',
      version: '0.2.0',
    })
  })

  it('derives the expected database schema version from the latest migration file', () => {
    const { dir, packageJsonPath } = makeProject('0.2.0')
    addMigration(dir, '0002_add_answers.mjs', 'AddAnswers1713800000000')

    expect(
      readExpectedDatabaseSchemaVersion({
        cwd: dir,
        env: {},
      }),
    ).toBe('AddAnswers1713800000000')

    const metadata = createBuildMetadata({
      cwd: dir,
      env: {},
      execFileSync: () => 'deadbeef\n',
      now: () => new Date('2026-05-21T21:30:00.000Z'),
      packageJsonPath,
    })

    expect(metadata.expectedDatabaseSchemaVersion).toBe(
      'AddAnswers1713800000000',
    )
  })

  it('writes public build metadata as formatted JSON', () => {
    const { dir, packageJsonPath } = makeProject('0.3.0')
    const outputPath = path.join(dir, 'public', 'build.json')

    const metadata = writeBuildMetadata({
      cwd: dir,
      env: {},
      execFileSync: () => 'cafef00d\n',
      now: () => new Date('2026-05-21T22:00:00.000Z'),
      outputPath,
      packageJsonPath,
    })

    const raw = fs.readFileSync(outputPath, 'utf8')
    expect(raw.endsWith('\n')).toBe(true)
    expect(JSON.parse(raw)).toEqual(metadata)
  })

  it('resolves relative output paths from the configured cwd', () => {
    const { dir, packageJsonPath } = makeProject('0.4.0')
    const outputPath = path.join('relative-build-output', 'build.json')

    const metadata = writeBuildMetadata({
      cwd: dir,
      env: {},
      execFileSync: () => 'facefeed\n',
      now: () => new Date('2026-05-21T23:00:00.000Z'),
      outputPath,
      packageJsonPath,
    })

    const raw = fs.readFileSync(path.join(dir, outputPath), 'utf8')
    expect(JSON.parse(raw)).toEqual(metadata)
    expect(fs.existsSync(path.join(process.cwd(), outputPath))).toBe(false)
  })
})
