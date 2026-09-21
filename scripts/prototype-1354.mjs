// Throwaway #1354 launcher. Reuses existing SQL Server and Keycloak read-only.
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import nextEnv from '@next/env'

const root = process.cwd()
const commonGit = execFileSync('git', ['rev-parse', '--git-common-dir'], {
  encoding: 'utf8',
}).trim()
const sharedRoot = dirname(resolve(root, commonGit))
// Read the existing development configuration without copying or editing it.
nextEnv.loadEnvConfig(sharedRoot, true)
const realm = JSON.parse(
  readFileSync(
    resolve(root, 'dev/keycloak/realm-kravhantering-dev.json'),
    'utf8',
  ),
)
const client = realm.clients.find(
  entry => entry.clientId === 'kravhantering-prodlike',
)
const port = 3001
// This is the existing registered callback port. Never stop an occupying server.
const probe = createServer()
await new Promise((accept, reject) => {
  probe.once('error', () =>
    reject(
      new Error(
        'Port 3001 is busy. Leave that service running and use the offline review gallery, or retry once the port is free.',
      ),
    ),
  )
  probe.listen(port, '0.0.0.0', () => probe.close(accept))
})
console.log(
  '\n#1354 throwaway prototype\nhttp://localhost:3001/sv/requirement-areas?variant=A&sample=stress\nSign in with ada.admin / devpass. Use Before, A, B, C to compare.\n',
)
const child = spawn('npm', ['run', 'dev', '--', '--port', String(port)], {
  cwd: root,
  env: {
    ...process.env,
    AUTH_OIDC_API_AUDIENCE: client.clientId,
    AUTH_OIDC_CLIENT_ID: client.clientId,
    AUTH_OIDC_CLIENT_SECRET: client.secret,
    AUTH_OIDC_REDIRECT_URI: 'http://localhost:3001/api/auth/callback',
    AUTH_OIDC_POST_LOGOUT_REDIRECT_URI: 'http://localhost:3001/',
    AUTH_SESSION_COOKIE_NAME: 'kravhantering_prototype_1354',
    NODE_ENV: 'development',
  },
  stdio: 'inherit',
})
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal))
child.on('exit', code => {
  process.exitCode = code ?? 0
})
