// Throwaway launcher for #1350. Existing services, separate Next.js process.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseEnv } from 'node:util'

const common = execFileSync('git', ['rev-parse', '--git-common-dir'], {
  encoding: 'utf8',
}).trim()
const primary = dirname(resolve(common))
const localEnv = resolve(primary, '.env.development.local')
if (existsSync(localEnv)) process.loadEnvFile(localEnv)
const profile = parseEnv(readFileSync('.env.prodlike', 'utf8'))
for (const key of [
  'AUTH_OIDC_CLIENT_ID',
  'AUTH_OIDC_CLIENT_SECRET',
  'AUTH_OIDC_REDIRECT_URI',
]) {
  process.env[key] = profile[key]
}
console.log(
  '\n#1350 throwaway prototype: http://localhost:3001/sv/specifications?variant=A',
)
console.log(
  'Uses the existing Keycloak client for port 3001. Sign in normally. Ctrl+C stops only this server.\n',
)
const child = spawn('npm', ['run', 'dev', '--', '--port', '3001'], {
  stdio: 'inherit',
  env: process.env,
})
child.on('exit', code => {
  process.exitCode = code ?? 0
})
