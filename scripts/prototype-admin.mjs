// Throwaway issue #1359 preview. Only orchestrates an isolated dev process.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, symlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const commonGit = execFileSync('git', ['rev-parse', '--git-common-dir'], {
  cwd: root,
  encoding: 'utf8',
}).trim()
const source = dirname(resolve(root, commonGit))
if (!existsSync(resolve(root, 'node_modules'))) {
  if (source !== root && existsSync(resolve(source, 'node_modules'))) {
    execFileSync('cp', [
      '-a',
      '--reflink=auto',
      resolve(source, 'node_modules'),
      resolve(root, 'node_modules'),
    ])
  } else {
    execFileSync('npm', ['ci'], { cwd: root, stdio: 'inherit' })
  }
}
for (const name of ['.env.development.local', '.env.sqlserver']) {
  if (
    source !== root &&
    !existsSync(resolve(root, name)) &&
    existsSync(resolve(source, name))
  ) {
    symlinkSync(resolve(source, name), resolve(root, name))
  }
}
const port = process.env.PROTOTYPE_PORT || '3139'
const galleryPort = process.env.PROTOTYPE_GALLERY_PORT || '3140'
console.info(
  `\nIssue #1359 — throwaway layout preview\nOpen http://localhost:${port}/sv/admin?variant=A\nBefore/after review: http://localhost:${galleryPort} (no sign-in needed)\nSign in at http://localhost:3000 first, then return to the preview.\nForward ports ${port} and ${galleryPort} in VS Code if using the remote workspace.\nColumns Save is simulated in memory. Ctrl+C stops only this preview.\n`,
)
execFileSync('npm', ['run', 'dev:prepare'], { cwd: root, stdio: 'inherit' })
const gallery = spawn(
  'python3',
  [
    '-m',
    'http.server',
    galleryPort,
    '--bind',
    '0.0.0.0',
    '--directory',
    resolve(root, 'public/prototype-admin-layout'),
  ],
  { cwd: root, stdio: 'inherit', detached: true },
)
const child = spawn(
  process.execPath,
  [
    resolve(root, 'node_modules/next/dist/bin/next'),
    'dev',
    '--hostname',
    '0.0.0.0',
    '--port',
    port,
  ],
  {
    cwd: root,
    stdio: 'inherit',
    detached: true,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      NEXT_PUBLIC_ADMIN_LAYOUT_PROTOTYPE: 'true',
    },
  },
)
const stop = (processId, signal = 'SIGTERM') => {
  if (!processId) return
  try {
    process.kill(-processId, signal)
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stop(child.pid, signal)
    stop(gallery.pid, signal)
  })
child.on('exit', code => {
  stop(gallery.pid)
  process.exitCode = code ?? 0
})
