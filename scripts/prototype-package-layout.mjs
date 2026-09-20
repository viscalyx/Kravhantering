// Throwaway #1353 launcher. Existing dev services and environment files stay intact.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const root = process.cwd()
const source = process.env.PROTOTYPE_SOURCE ?? '/workspace'
const port = process.env.PROTOTYPE_PORT ?? '3133'
if (!existsSync(resolve(root, 'node_modules/next/dist/bin/next'))) {
  const copy = spawnSync(
    'cp',
    ['-a', '--reflink=auto', `${source}/node_modules`, root],
    { stdio: 'inherit' },
  )
  if (copy.status !== 0) process.exit(copy.status ?? 1)
}
const require = createRequire(resolve(root, 'package.json'))
require('@next/env').loadEnvConfig(source, true, {
  info() {},
  error: console.error,
})
const url = `http://localhost:${port}/sv/requirements/stewardship?tab=packages&variant=A`
console.log(
  `\nThrowaway prototype #1353\n${url}\n\nSign in at http://localhost:3000 first, then open the prototype URL.\nPackage actions only change memory. Ctrl+C stops this server.\n`,
)
const child = spawn(
  process.execPath,
  [
    require.resolve('next/dist/bin/next'),
    'dev',
    '--port',
    port,
    '--hostname',
    '0.0.0.0',
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      BUILD_TARGET: 'dev',
      NEXT_PUBLIC_PACKAGE_LAYOUT_PROTOTYPE: 'true',
    },
    stdio: 'inherit',
  },
)
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal))
child.on('exit', code => process.exit(code ?? 0))
