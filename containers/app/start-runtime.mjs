import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REQUIRED_AUTH_FIELDS = [
  'AUTH_OIDC_ISSUER_URL',
  'AUTH_OIDC_CLIENT_ID',
  'AUTH_OIDC_CLIENT_SECRET',
  'AUTH_OIDC_REDIRECT_URI',
  'AUTH_OIDC_POST_LOGOUT_REDIRECT_URI',
  'AUTH_SESSION_COOKIE_PASSWORD',
]

const SHIPPED_AUTH_SECRET_MARKERS = [
  'dev-only-',
  'local-kc-',
  'not-for-production',
  'prodlike-',
  'replace-with-',
]

export class RuntimeAuthConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'RuntimeAuthConfigError'
  }
}

function readRequiredAuthValue(env, field) {
  const value = env[field]?.trim()
  if (!value) {
    throw new RuntimeAuthConfigError(
      `Missing required authentication configuration: ${field}.`,
    )
  }
  return value
}

function assertInjectedSecret(field, value) {
  if (SHIPPED_AUTH_SECRET_MARKERS.some(marker => value.includes(marker))) {
    throw new RuntimeAuthConfigError(
      `${field} must not use a shipped authentication placeholder.`,
    )
  }
}

export function validateRuntimeAuthEnvironment(env = process.env) {
  const values = new Map(
    REQUIRED_AUTH_FIELDS.map(field => [
      field,
      readRequiredAuthValue(env, field),
    ]),
  )
  const clientSecret = values.get('AUTH_OIDC_CLIENT_SECRET')
  const cookiePassword = values.get('AUTH_SESSION_COOKIE_PASSWORD')

  assertInjectedSecret('AUTH_OIDC_CLIENT_SECRET', clientSecret)
  assertInjectedSecret('AUTH_SESSION_COOKIE_PASSWORD', cookiePassword)
  if (cookiePassword.length < 32) {
    throw new RuntimeAuthConfigError(
      'AUTH_SESSION_COOKIE_PASSWORD must be at least 32 characters.',
    )
  }
}

export async function startRuntime(options = {}) {
  const env = options.env ?? process.env
  const serverUrl = pathToFileURL(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.js'),
  ).href
  const loadServer = options.loadServer ?? (() => import(serverUrl))
  validateRuntimeAuthEnvironment(env)
  await loadServer()
}

const invokedPath = process.argv[1]
const invokedDirectly =
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href

if (invokedDirectly) {
  try {
    await startRuntime()
  } catch (error) {
    const diagnostic =
      error instanceof RuntimeAuthConfigError
        ? error.message
        : 'Application server initialization failed.'
    console.error(`kravhantering-app: ${diagnostic}`)
    process.exitCode = 1
  }
}
