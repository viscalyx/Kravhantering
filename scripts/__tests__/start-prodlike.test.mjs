import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  launchProdlikeStandalone,
  runProdlikeStandalone,
  stageProdlikeStandaloneAssets,
} from '../start-prodlike.mjs'

const temporaryRoots = []

function createRuntimeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prodlike-runtime-'))
  temporaryRoots.push(root)

  fs.mkdirSync(path.join(root, 'public', 'images'), { recursive: true })
  fs.writeFileSync(path.join(root, 'public', 'images', 'logo.svg'), 'logo')
  fs.mkdirSync(path.join(root, '.next', 'static', 'chunks'), {
    recursive: true,
  })
  fs.writeFileSync(
    path.join(root, '.next', 'static', 'chunks', 'app.js'),
    'chunk',
  )
  fs.mkdirSync(path.join(root, '.next', 'standalone'), { recursive: true })
  fs.writeFileSync(path.join(root, '.next', 'standalone', 'server.js'), '')

  return root
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true })
  }
})

describe('prodlike standalone runtime', () => {
  it('rejects repository destinations, including symlink aliases', () => {
    const root = createRuntimeFixture()
    const aliasRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-alias-'))
    temporaryRoots.push(aliasRoot)
    const alias = path.join(aliasRoot, 'repository')
    fs.symlinkSync(root, alias, 'dir')
    for (const destination of [root, path.join(root, 'public'), alias]) {
      expect(() => stageProdlikeStandaloneAssets(root, destination)).toThrow(
        'Isolated runtime must be outside the repository',
      )
    }
  })

  it('rejects external destinations with ancestor dependencies', () => {
    const root = createRuntimeFixture()
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-parent-'))
    temporaryRoots.push(parent)
    const isolated = path.join(parent, 'runtime')
    fs.mkdirSync(isolated)
    fs.mkdirSync(path.join(parent, 'node_modules'))
    expect(() => stageProdlikeStandaloneAssets(root, isolated)).toThrow(
      'Isolated runtime has dependency ancestry',
    )
  })

  it('isolates traced dependencies from repository fallback resolution', () => {
    const root = createRuntimeFixture()
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'isolated-runtime-'))
    temporaryRoots.push(isolated)
    const dependency = path.join(root, 'node_modules', 'untraced-fixture')
    fs.mkdirSync(dependency, { recursive: true })
    fs.writeFileSync(path.join(dependency, 'index.js'), 'module.exports = 1')
    const paths = stageProdlikeStandaloneAssets(root, isolated)
    expect(paths.standaloneRoot).toBe(isolated)
    expect(fs.existsSync(paths.server)).toBe(true)
    expect(() =>
      createRequire(paths.server).resolve('untraced-fixture'),
    ).toThrow()
    expect(fs.existsSync(dependency)).toBe(true)
  })

  it('rejects a runtime destination containing an untraced module', () => {
    const root = createRuntimeFixture()
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-runtime-'))
    temporaryRoots.push(isolated)
    const dependency = path.join(isolated, 'node_modules', 'untraced-fixture')
    fs.mkdirSync(dependency, { recursive: true })
    fs.writeFileSync(path.join(dependency, 'index.js'), 'module.exports = 1')
    const server = path.join(isolated, 'server.js')
    expect(createRequire(server).resolve('untraced-fixture')).toBe(
      path.join(dependency, 'index.js'),
    )

    expect(() => stageProdlikeStandaloneAssets(root, isolated)).toThrow(
      'Isolated runtime must be empty before staging',
    )
    const originalRuntimeRoot = process.env.PRODLIKE_RUNTIME_DIR
    process.env.PRODLIKE_RUNTIME_DIR = isolated
    try {
      expect(() => launchProdlikeStandalone(root)).toThrow(
        'Isolated runtime must be empty before staging',
      )
    } finally {
      if (originalRuntimeRoot === undefined) {
        delete process.env.PRODLIKE_RUNTIME_DIR
      } else {
        process.env.PRODLIKE_RUNTIME_DIR = originalRuntimeRoot
      }
    }
    expect(fs.existsSync(server)).toBe(false)
  })

  it('stages public and static assets beside the generated server', () => {
    const root = createRuntimeFixture()

    const paths = stageProdlikeStandaloneAssets(root)

    expect(
      fs.readFileSync(
        path.join(paths.standaloneRoot, 'public', 'images', 'logo.svg'),
        'utf8',
      ),
    ).toBe('logo')
    expect(
      fs.readFileSync(
        path.join(paths.standaloneRoot, '.next', 'static', 'chunks', 'app.js'),
        'utf8',
      ),
    ).toBe('chunk')
  })

  it.each([
    [
      'generated standalone server',
      path.join('.next', 'standalone', 'server.js'),
    ],
    ['public assets', 'public'],
    ['generated static assets', path.join('.next', 'static')],
  ])('fails clearly without %s', (description, relativePath) => {
    const root = createRuntimeFixture()
    fs.rmSync(path.join(root, relativePath), { force: true, recursive: true })

    expect(() => stageProdlikeStandaloneAssets(root)).toThrow(
      `Missing ${description}`,
    )
  })

  it.each(['in-place', 'isolated'])(
    'launches server.js with the fixed prodlike host and port (%s)',
    mode => {
      const root = createRuntimeFixture()
      let runtimeRoot
      if (mode === 'isolated') {
        const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'launch-runtime-'))
        temporaryRoots.push(parent)
        runtimeRoot = path.join(parent, 'new', 'runtime')
        expect(fs.existsSync(runtimeRoot)).toBe(false)
      }
      const resultPath = path.join(root, 'launch.json')
      const serverPath = path.join(root, '.next', 'standalone', 'server.js')
      fs.writeFileSync(
        serverPath,
        [
          "const fs = require('node:fs')",
          'fs.writeFileSync(',
          '  process.env.PRODLIKE_TEST_RESULT_PATH,',
          '  JSON.stringify({',
          '    buildTarget: process.env.BUILD_TARGET,',
          '    keyring: process.env.AI_PROVIDER_SECRET_KEYRING_FILE,',
          '    hostname: process.env.HOSTNAME,',
          '    nodeEnv: process.env.NODE_ENV,',
          '    port: process.env.PORT,',
          '    preserved: process.env.PRODLIKE_TEST_PRESERVED,',
          '  }),',
          ')',
        ].join('\n'),
      )

      const originalEnvironment = {
        BUILD_TARGET: process.env.BUILD_TARGET,
        AI_PROVIDER_SECRET_KEYRING_FILE:
          process.env.AI_PROVIDER_SECRET_KEYRING_FILE,
        HOSTNAME: process.env.HOSTNAME,
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        PRODLIKE_RUNTIME_DIR: process.env.PRODLIKE_RUNTIME_DIR,
        PRODLIKE_TEST_PRESERVED: process.env.PRODLIKE_TEST_PRESERVED,
        PRODLIKE_TEST_RESULT_PATH: process.env.PRODLIKE_TEST_RESULT_PATH,
      }
      if (runtimeRoot) {
        process.env.PRODLIKE_RUNTIME_DIR = runtimeRoot
      } else {
        delete process.env.PRODLIKE_RUNTIME_DIR
      }
      process.env.PRODLIKE_TEST_PRESERVED = 'kept'
      process.env.PRODLIKE_TEST_RESULT_PATH = resultPath
      process.env.AI_PROVIDER_SECRET_KEYRING_FILE =
        '.local/ai-provider-secret-keyring.json'

      try {
        launchProdlikeStandalone(root)
      } finally {
        for (const [name, value] of Object.entries(originalEnvironment)) {
          if (value === undefined) {
            delete process.env[name]
          } else {
            process.env[name] = value
          }
        }
      }

      expect(JSON.parse(fs.readFileSync(resultPath, 'utf8'))).toEqual({
        buildTarget: 'local-prod',
        keyring: path.join(root, '.local', 'ai-provider-secret-keyring.json'),
        hostname: '127.0.0.1',
        nodeEnv: 'production',
        port: '3001',
        preserved: 'kept',
      })
      if (runtimeRoot) {
        expect(
          fs.readFileSync(
            path.join(runtimeRoot, 'public', 'images', 'logo.svg'),
            'utf8',
          ),
        ).toBe('logo')
        expect(
          fs.readFileSync(
            path.join(runtimeRoot, '.next', 'static', 'chunks', 'app.js'),
            'utf8',
          ),
        ).toBe('chunk')
      }
    },
  )

  it('reports a startup failure with a nonzero exit code', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prodlike-runtime-'))
    temporaryRoots.push(root)
    const consoleImplementation = { error: vi.fn() }

    expect(runProdlikeStandalone(root, consoleImplementation)).toBe(1)
    expect(consoleImplementation.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Missing generated standalone server'),
      }),
    )
  })
})
