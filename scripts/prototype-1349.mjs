#!/usr/bin/env node
// Throwaway launcher: isolated Next.js output and cookie; existing SQL/Keycloak.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, symlinkSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const git = spawnSync(
  'git',
  ['rev-parse', '--path-format=absolute', '--git-common-dir'],
  { cwd: root, encoding: 'utf8' },
)
if (git.status !== 0)
  throw new Error('Run this command inside the prototype worktree.')
const source = dirname(git.stdout.trim())
if (!existsSync(resolve(root, 'node_modules/next/package.json'))) {
  if (!existsSync(resolve(source, 'node_modules/next/package.json')))
    throw new Error(
      'Install the project dependencies in the main checkout first.',
    )
  console.log('Preparing an independent dependency copy for this worktree…')
  const copy = spawnSync(
    'cp',
    ['-a', `${source}/node_modules/.`, `${root}/node_modules/`],
    { stdio: 'inherit' },
  )
  if (copy.status !== 0) process.exit(copy.status ?? 1)
}
const localEnv = resolve(root, '.env.development.local')
if (
  !existsSync(localEnv) &&
  existsSync(resolve(source, '.env.development.local'))
) {
  symlinkSync(resolve(source, '.env.development.local'), localEnv)
}
await new Promise((ok, fail) => {
  const probe = createServer()
  probe.once('error', () =>
    fail(
      new Error(
        'Port 3001 is occupied. Stop only the existing prototype/prodlike server on that port, then retry. The launcher never stops other services.',
      ),
    ),
  )
  probe.listen(3001, () => probe.close(ok))
})
const realm = JSON.parse(
  readFileSync(
    resolve(root, 'dev/keycloak/realm-kravhantering-dev.json'),
    'utf8',
  ),
)
const client = realm.clients.find(
  value => value.clientId === 'kravhantering-prodlike',
)
const env = {
  ...process.env,
  NODE_ENV: 'development',
  BUILD_TARGET: 'dev',
  PROTOTYPE_1349: 'true',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3001',
  AUTH_OIDC_CLIENT_ID: client.clientId,
  AUTH_OIDC_CLIENT_SECRET: client.secret,
  AUTH_OIDC_REDIRECT_URI: 'http://localhost:3001/api/auth/callback',
  AUTH_OIDC_POST_LOGOUT_REDIRECT_URI: 'http://localhost:3001/',
  AUTH_SESSION_COOKIE_NAME: 'kravhantering_prototype_1349',
}
const prepare = spawnSync(
  process.execPath,
  ['scripts/prebuild.js', '--metadata-only'],
  { cwd: root, env, stdio: 'inherit' },
)
if (prepare.status !== 0) process.exit(prepare.status ?? 1)
console.log(
  '\nPrototype #1349: http://localhost:3001/sv/requirements/new?variant=A',
)
console.log(
  'Baseline: ?variant=baseline | A: wider norms | B: stacked rail | C: associations below',
)
console.log(
  'Sign in normally. Prototype Save/New only change memory. Ctrl+C stops this server.\n',
)
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--port', '3001'],
  { cwd: root, env, stdio: 'inherit' },
)
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal))
child.on('exit', code => process.exit(code ?? 0))
