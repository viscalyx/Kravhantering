// THROWAWAY #1352. Reuses existing services; never seeds or migrates data.
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { connect, createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { parse } from 'dotenv'

const controlPath = `/tmp/krav-prototype-1352-${createHash('sha256').update(process.cwd()).digest('hex').slice(0, 12)}.sock`
if (process.argv.includes('--stop')) {
  const socket = connect(controlPath, () => socket.end('stop'))
  socket.on('error', () => {
    console.log('No prototype launcher is listening for this worktree.')
    process.exit(1)
  })
  socket.on('close', () => process.exit(0))
  await new Promise(() => {})
}

const common = spawnSync(
  'git',
  ['rev-parse', '--path-format=absolute', '--git-common-dir'],
  { encoding: 'utf8' },
).stdout.trim()
const source = dirname(common)
const local = resolve(source, '.env.development.local')
const env = {
  ...process.env,
  ...(existsSync(local) ? parse(readFileSync(local)) : {}),
  AUTH_OIDC_CLIENT_ID: 'kravhantering-prodlike',
  AUTH_OIDC_CLIENT_SECRET: 'prodlike-kc-app-secret',
  AUTH_OIDC_REDIRECT_URI: 'http://localhost:3001/api/auth/callback',
  AUTH_OIDC_POST_LOGOUT_REDIRECT_URI: 'http://localhost:3001/',
  AUTH_SESSION_COOKIE_NAME: 'prototype_1352_session',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3001',
  NEXT_PUBLIC_PROTOTYPE_1352: 'true',
  PROTOTYPE_1352: 'true',
}
const preparation = spawnSync('npm', ['run', 'dev:prepare'], {
  env,
  stdio: 'inherit',
})
if (preparation.status !== 0) process.exit(preparation.status ?? 1)
console.log(
  'Live prototype: http://localhost:3001/sv/specifications/8?variant=0',
)
console.log('Before/after gallery: http://localhost:3136')
console.log(
  'Read-only preview. 0=baseline, A=wide table, B=text first, C=reading cards. Ctrl+C stops both servers.',
)
const gallery = spawn(
  'python3',
  [
    '-m',
    'http.server',
    '3136',
    '--bind',
    '0.0.0.0',
    '--directory',
    'app/[locale]/specifications/[specificationId]/prototype-review',
  ],
  { stdio: 'inherit' },
)
const child = spawn(
  process.execPath,
  [
    'node_modules/next/dist/bin/next',
    'dev',
    '--port',
    '3001',
    '--hostname',
    '0.0.0.0',
  ],
  { env, stdio: 'inherit', detached: true },
)
const control = createServer(socket => {
  socket.on('data', data => {
    if (data.toString() === 'stop') stop()
  })
}).listen(controlPath)
control.unref()
function stop() {
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {}
  gallery.kill('SIGTERM')
  control.close()
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop)
child.on('exit', code => {
  gallery.kill()
  control.close(() => process.exit(code ?? 0))
})
