// Throwaway orchestration only. No database setup, migrations or seed operations.
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import net from 'node:net'

const port = 3002
const probe = net.createServer()
probe.once('error', () => {
  console.error(
    'Port 3002 is occupied. Reuse the running #1346 preview or stop it before restarting.',
  )
  process.exit(1)
})
probe.listen(port, '127.0.0.1', () =>
  probe.close(async () => {
    // A dedicated, disposable client keeps other dev servers and their sessions intact.
    const idp = 'http://localhost:8080'
    const realm = JSON.parse(
      readFileSync('dev/keycloak/realm-kravhantering-dev.json', 'utf8'),
    )
    const template = realm.clients.find(
      client => client.clientId === 'kravhantering-app',
    )
    const clientId = 'kravhantering-prototype-1346'
    const clientSecret = 'dev-only-prototype-1346-secret'
    const tokenResponse = await fetch(
      `${idp}/realms/master/protocol/openid-connect/token`,
      {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: 'admin-cli',
          username: process.env.PROTOTYPE_IDP_ADMIN_USER ?? 'admin',
          password: process.env.PROTOTYPE_IDP_ADMIN_PASSWORD ?? 'admin',
        }),
        signal: AbortSignal.timeout(10000),
      },
    )
    if (!tokenResponse.ok)
      throw new Error(
        'Local Keycloak admin login failed. Start the dev IdP or set PROTOTYPE_IDP_ADMIN_USER / PROTOTYPE_IDP_ADMIN_PASSWORD.',
      )
    const { access_token: accessToken } = await tokenResponse.json()
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }
    const endpoint = `${idp}/admin/realms/${realm.realm}/clients`
    const existingResponse = await fetch(`${endpoint}?clientId=${clientId}`, {
      headers,
    })
    if (!existingResponse.ok)
      throw new Error('Cannot inspect local prototype login client.')
    const existing = await existingResponse.json()
    if (!existing.length) {
      const created = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...template,
          clientId,
          name: 'THROWAWAY prototype #1346',
          secret: clientSecret,
          redirectUris: ['http://localhost:3002/api/auth/callback'],
          webOrigins: ['http://localhost:3002'],
          attributes: {
            ...template.attributes,
            'post.logout.redirect.uris': 'http://localhost:3002/',
          },
        }),
      })
      if (!created.ok)
        throw new Error('Cannot create local prototype login client.')
    }
    const prototypeEnv = {
      ...process.env,
      NEXT_PUBLIC_PROTOTYPE_1346: 'true',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3002',
      AUTH_OIDC_CLIENT_ID: clientId,
      AUTH_OIDC_CLIENT_SECRET: clientSecret,
      AUTH_OIDC_REDIRECT_URI: 'http://localhost:3002/api/auth/callback',
      AUTH_OIDC_POST_LOGOUT_REDIRECT_URI: 'http://localhost:3002/',
      AUTH_SESSION_COOKIE_NAME: 'prototype1346_session',
    }
    const prepared = spawnSync('npm', ['run', 'dev:prepare'], {
      stdio: 'inherit',
    })
    if (prepared.status !== 0) process.exit(prepared.status ?? 1)
    console.log(
      '\nTHROWAWAY #1346 — Before / Proposed\nOpen http://localhost:3002/sv/admin?variant=after\nSign in: ada.admin / devpass (local dev only).\nDedicated local login client and session; other dev servers are unchanged.\nReview: docs/development/prototype-1346/README.md\nProduct writes are blocked. Stop with Ctrl+C.\n',
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
