import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const createdTempDirs = []
const helperScript = path.resolve(
  process.cwd(),
  '.github',
  'skills',
  'report-dead-code',
  'scripts',
  'find_dead_code_candidates.py',
)

const makeTempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dead-code-test-'))
  createdTempDirs.push(dir)
  return dir
}

const writeFile = (filePath, content) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

const runHelperScript = dir =>
  spawnSync('python3', [helperScript, '--root', dir, '--format', 'json'], {
    encoding: 'utf8',
  })

afterEach(() => {
  createdTempDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
  createdTempDirs.length = 0
})

describe('find_dead_code_candidates.py', () => {
  it('preserves external package script paths instead of treating repo files as entrypoints', () => {
    const dir = makeTempDir()
    const absoluteExternalName = `outside-${path.basename(dir)}.js`

    writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify(
        {
          scripts: {
            'external:relative': 'node ../shared/external-entry.js',
            'external:absolute': `node /tmp/${absoluteExternalName}`,
          },
        },
        null,
        2,
      ),
    )
    writeFile(
      path.join(dir, 'shared', 'external-entry.js'),
      'module.exports = { relative: true }\n',
    )
    writeFile(
      path.join(dir, 'tmp', absoluteExternalName),
      'module.exports = { absolute: true }\n',
    )

    const result = runHelperScript(dir)

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toEqual([
      {
        inbound_references: 0,
        lines: 1,
        path: 'shared/external-entry.js',
        referenced_by: [],
        why_flagged:
          'No static imports, re-exports, or package.json script entrypoints reference this file.',
      },
      {
        inbound_references: 0,
        lines: 1,
        path: `tmp/${absoluteExternalName}`,
        referenced_by: [],
        why_flagged:
          'No static imports, re-exports, or package.json script entrypoints reference this file.',
      },
    ])
  })

  it('follows CommonJS requires that include the target file extension', () => {
    const dir = makeTempDir()

    writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify(
        {
          scripts: {
            'check:port': 'node ./scripts/check-port.js',
          },
        },
        null,
        2,
      ),
    )
    writeFile(
      path.join(dir, 'scripts', 'check-port.js'),
      "const { extractPids } = require('./extract-pids.js')\nmodule.exports = { extractPids }\n",
    )
    writeFile(
      path.join(dir, 'scripts', 'extract-pids.js'),
      'module.exports = { extractPids() { return [] } }\n',
    )

    const result = runHelperScript(dir)

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toEqual([])
  })

  it('treats root-level Next proxy entry imports as live', () => {
    const dir = makeTempDir()

    writeFile(
      path.join(dir, 'app', 'page.tsx'),
      'export default function Page() { return null }\n',
    )
    writeFile(path.join(dir, 'proxy.ts'), "import './lib/live.ts'\n")
    writeFile(path.join(dir, 'lib', 'live.ts'), 'export const live = true\n')

    const result = runHelperScript(dir)

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toEqual([])
  })
})
