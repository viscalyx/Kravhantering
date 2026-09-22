#!/usr/bin/env node
// THROWAWAY launcher. Reuses development services; does not start or reset them.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'

const port = Number(process.env.PROTOTYPE_PORT ?? 3137)
if (!existsSync('.env.development.local')) {
  console.error(
    'Link the existing read-only .env.development.local into this worktree before starting. See docs/development/issue-1357-prototype.md.',
  )
  process.exit(1)
}
const probe = createServer()
probe.once('error', () => {
  console.error(
    `Port ${port} is in use. Choose PROTOTYPE_PORT=3138 npm run prototype:1357.`,
  )
  process.exit(1)
})
probe.listen(port, '0.0.0.0', () =>
  probe.close(() => {
    const prepared = spawnSync(
      process.execPath,
      ['scripts/prebuild.js', '--metadata-only'],
      { stdio: 'inherit' },
    )
    if (prepared.status !== 0) process.exit(prepared.status ?? 1)
    console.log(
      `\n#1357 throwaway prototype\nSign in at http://localhost:3000 first, then open:\nhttp://localhost:${port}/sv/requirements/stewardship/workspaces/information-requests?variant=A\nVariants: original, A, B, C. Review panel contains measurements and current state.\nLong-text and archived examples are in memory. API writes through the UI are blocked.\nCtrl+C stops only this prototype.\n`,
    )
    const child = spawn(
      process.execPath,
      [
        'node_modules/next/dist/bin/next',
        'dev',
        '--hostname',
        '0.0.0.0',
        '--port',
        String(port),
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, NEXT_PUBLIC_ISSUE_1357_PROTOTYPE: 'true' },
      },
    )
    process.on('SIGINT', () => child.kill('SIGINT'))
    process.on('SIGTERM', () => child.kill('SIGTERM'))
    child.on('exit', code => process.exit(code ?? 0))
  }),
)
