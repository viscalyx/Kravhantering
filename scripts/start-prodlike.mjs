import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

export function resolveProdlikeStandalonePaths(
  root = process.cwd(),
  runtimeRoot,
) {
  const workspaceRoot = path.resolve(root)
  const standaloneRoot = runtimeRoot
    ? path.resolve(runtimeRoot)
    : path.join(workspaceRoot, '.next', 'standalone')

  return {
    publicSource: path.join(workspaceRoot, 'public'),
    publicTarget: path.join(standaloneRoot, 'public'),
    server: path.join(standaloneRoot, 'server.js'),
    standaloneRoot,
    staticSource: path.join(workspaceRoot, '.next', 'static'),
    staticTarget: path.join(standaloneRoot, '.next', 'static'),
  }
}

export function stageProdlikeStandaloneAssets(
  root = process.cwd(),
  runtimeRoot,
) {
  const source = resolveProdlikeStandalonePaths(root)
  const paths = resolveProdlikeStandalonePaths(root, runtimeRoot)
  const requiredPaths = [
    ['generated standalone server', source.server],
    ['public assets', paths.publicSource],
    ['generated static assets', paths.staticSource],
  ]

  for (const [description, requiredPath] of requiredPaths) {
    if (!fs.existsSync(requiredPath)) {
      throw new Error(`Missing ${description}: ${requiredPath}`)
    }
  }

  if (runtimeRoot) {
    const workspaceRoot = fs.realpathSync(root)
    const destination = fs.realpathSync(paths.standaloneRoot)
    if (
      destination === workspaceRoot ||
      destination.startsWith(`${workspaceRoot}${path.sep}`)
    ) {
      throw new Error('Isolated runtime must be outside the repository')
    }
    for (
      let ancestor = path.dirname(destination);
      ;
      ancestor = path.dirname(ancestor)
    ) {
      if (fs.existsSync(path.join(ancestor, 'node_modules'))) {
        throw new Error(`Isolated runtime has dependency ancestry: ${ancestor}`)
      }
      if (ancestor === path.dirname(ancestor)) break
    }
    if (fs.readdirSync(destination).length > 0) {
      throw new Error('Isolated runtime must be empty before staging')
    }
    fs.cpSync(source.standaloneRoot, paths.standaloneRoot, {
      recursive: true,
      dereference: true,
    })
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
  const runtimeRoot = process.env.PRODLIKE_RUNTIME_DIR
  if (runtimeRoot) {
    fs.mkdirSync(runtimeRoot, { recursive: true })
  }
  const paths = stageProdlikeStandaloneAssets(root, runtimeRoot)
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
