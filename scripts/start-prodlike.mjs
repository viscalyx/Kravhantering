import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

export function resolveProdlikeStandalonePaths(root = process.cwd()) {
  const workspaceRoot = path.resolve(root)
  const standaloneRoot = path.join(workspaceRoot, '.next', 'standalone')

  return {
    publicSource: path.join(workspaceRoot, 'public'),
    publicTarget: path.join(standaloneRoot, 'public'),
    server: path.join(standaloneRoot, 'server.js'),
    standaloneRoot,
    staticSource: path.join(workspaceRoot, '.next', 'static'),
    staticTarget: path.join(standaloneRoot, '.next', 'static'),
  }
}

export function stageProdlikeStandaloneAssets(root = process.cwd()) {
  const paths = resolveProdlikeStandalonePaths(root)
  const requiredPaths = [
    ['generated standalone server', paths.server],
    ['public assets', paths.publicSource],
    ['generated static assets', paths.staticSource],
  ]

  for (const [description, requiredPath] of requiredPaths) {
    if (!fs.existsSync(requiredPath)) {
      throw new Error(`Missing ${description}: ${requiredPath}`)
    }
  }

  fs.cpSync(paths.publicSource, paths.publicTarget, {
    force: true,
    recursive: true,
  })
  fs.cpSync(paths.staticSource, paths.staticTarget, {
    force: true,
    recursive: true,
  })

  return paths
}

export function launchProdlikeStandalone(root = process.cwd()) {
  const paths = stageProdlikeStandaloneAssets(root)
  const providerSecretKeyring =
    process.env.AI_PROVIDER_SECRET_KEYRING_FILE?.trim()
  if (providerSecretKeyring && !path.isAbsolute(providerSecretKeyring)) {
    process.env.AI_PROVIDER_SECRET_KEYRING_FILE = path.resolve(
      root,
      providerSecretKeyring,
    )
  }

  process.env.BUILD_TARGET = 'local-prod'
  process.env.HOSTNAME = '127.0.0.1'
  process.env.NODE_ENV = 'production'
  process.env.PORT = '3001'

  require(paths.server)
}

export function runProdlikeStandalone(
  root = process.cwd(),
  consoleImplementation = console,
) {
  try {
    launchProdlikeStandalone(root)
    return 0
  } catch (error) {
    consoleImplementation.error(error)
    return 1
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMainModule) {
  process.exitCode = runProdlikeStandalone()
}
