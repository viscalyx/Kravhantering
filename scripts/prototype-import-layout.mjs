// THROWAWAY #1360: launch the isolated worktree against existing read services.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const source = process.env.PROTOTYPE_SOURCE_ROOT || '/workspace'
if (!existsSync(resolve(root, 'node_modules/next/package.json'))) {
  console.info('Copying installed dependencies into the prototype worktree…')
  execFileSync('cp', [
    '-a',
    '--reflink=auto',
    resolve(source, 'node_modules'),
    root,
  ])
}
const require = createRequire(resolve(root, 'package.json'))
require('@next/env').loadEnvConfig(source, true)
const port = process.env.PROTOTYPE_PORT || '3136'
console.info(
  `\nTHROWAWAY #1360 — http://localhost:${port}/sv/requirements?prototype=import&variant=A`,
)
console.info(
  'Sign in at http://localhost:3000 first; localhost cookies also work on this port.',
)
console.info(
  'Import preview is simulated in memory. No import is saved. Ctrl+C stops only this server.\n',
)
const child = spawn(
  'npm',
  ['run', 'dev', '--', '--hostname', '0.0.0.0', '--port', port],
  {
    cwd: root,
    env: { ...process.env, NEXT_PUBLIC_SITE_URL: `http://localhost:${port}` },
    stdio: 'inherit',
  },
)
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
child.on('exit', code => process.exit(code ?? 0))
