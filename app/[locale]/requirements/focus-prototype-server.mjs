// THROWAWAY: use the existing local Keycloak client registered for port 3001.
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const realm = JSON.parse(
  await readFile('dev/keycloak/realm-kravhantering-dev.json', 'utf8'),
)
const client = realm.clients.find(
  entry => entry.clientId === 'kravhantering-prodlike',
)
const server = spawn(
  'npm',
  ['run', 'dev', '--', '--port', '3001', '--hostname', '0.0.0.0'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      FOCUS_PROTOTYPE_SHARED_DEPS: '1',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3001',
      AUTH_OIDC_CLIENT_ID: client.clientId,
      AUTH_OIDC_CLIENT_SECRET: client.secret,
      AUTH_OIDC_REDIRECT_URI: 'http://localhost:3001/api/auth/callback',
      AUTH_OIDC_POST_LOGOUT_REDIRECT_URI: 'http://localhost:3001/',
      AUTH_SESSION_COOKIE_NAME: 'kravhantering_focus_prototype',
    },
  },
)
server.on('exit', code => {
  process.exitCode = code ?? 0
})
