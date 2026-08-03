import fs from 'node:fs'
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

  it('launches server.js with the fixed prodlike host and port', () => {
    const root = createRuntimeFixture()
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
      HOSTNAME: process.env.HOSTNAME,
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      PRODLIKE_TEST_PRESERVED: process.env.PRODLIKE_TEST_PRESERVED,
      PRODLIKE_TEST_RESULT_PATH: process.env.PRODLIKE_TEST_RESULT_PATH,
    }
    process.env.PRODLIKE_TEST_PRESERVED = 'kept'
    process.env.PRODLIKE_TEST_RESULT_PATH = resultPath

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
      hostname: '127.0.0.1',
      nodeEnv: 'production',
      port: '3001',
      preserved: 'kept',
    })
  })

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
