// Throwaway #1345 launcher. Uses the normal dev identity provider and read-only app data.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import net from 'node:net'

if (!existsSync('node_modules/next')) {
  console.error(
    'Run npm ci once in this worktree, then npm run prototype:1345.',
  )
  process.exit(1)
}
const port = 3001 // Registered development OIDC callback; do not silently choose another port.
const realm = JSON.parse(
  readFileSync('dev/keycloak/realm-kravhantering-dev.json', 'utf8'),
)
const client = realm.clients.find(
  entry => entry.clientId === 'kravhantering-prodlike',
)
const prototypeEnv = {
  ...process.env,
  NEXT_PUBLIC_PROTOTYPE_1345: 'true',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3001',
  AUTH_OIDC_CLIENT_ID: client.clientId,
  AUTH_OIDC_CLIENT_SECRET: client.secret,
  AUTH_OIDC_REDIRECT_URI: 'http://localhost:3001/api/auth/callback',
  AUTH_OIDC_POST_LOGOUT_REDIRECT_URI: 'http://localhost:3001/',
}
const probe = net.createServer()
probe.once('error', () => {
  console.error(
    'Port 3001 is occupied. Stop the other development server, then run npm run prototype:1345 again.',
  )
  process.exit(1)
})
probe.listen(port, '127.0.0.1', () =>
  probe.close(() => {
    const prepared = spawnSync('npm', ['run', 'dev:prepare'], {
      stdio: 'inherit',
    })
    if (prepared.status !== 0) process.exit(prepared.status ?? 1)
    console.log(
      '\nPrototype #1345 — Before / B / D\nOpen http://localhost:3001/sv/requirements?variant=B\nSign in: ada.admin / devpass (local development only).\nReview guide: docs/development/prototype-1345/README.md\nWrites are simulated in this throwaway browser UI.\n',
    )
    const child = spawn(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'dev', '--port', String(port)],
      {
        stdio: 'inherit',
        env: prototypeEnv,
      },
    )
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.on(signal, () => child.kill(signal))
    child.on('exit', code => process.exit(code ?? 0))
  }),
)
