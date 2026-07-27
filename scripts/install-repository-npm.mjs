#!/usr/bin/env node
import childProcess from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function packageManagerVersion(packageJson) {
  const match = packageJson?.packageManager?.match(/^npm@(\d+\.\d+\.\d+)$/u)
  if (!match) {
    throw new Error(
      'package.json must declare packageManager as an exact npm version.',
    )
  }
  return match[1]
}

export function installRepositoryNpm(
  root = process.cwd(),
  execFileSync = childProcess.execFileSync,
) {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  )
  const version = packageManagerVersion(packageJson)
  const bootstrapDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'repository-npm-bootstrap-'),
  )

  try {
    execFileSync('npm', ['install', '--global', `npm@${version}`], {
      cwd: bootstrapDirectory,
      stdio: 'inherit',
    })
    const installed = execFileSync('npm', ['--version'], {
      cwd: bootstrapDirectory,
      encoding: 'utf8',
    }).trim()
    if (installed !== version) {
      throw new Error(
        `Expected npm ${version}, but npm ${installed} is active.`,
      )
    }
  } finally {
    fs.rmSync(bootstrapDirectory, { recursive: true })
  }

  console.log(`Using repository npm ${version}.`)
  return version
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  installRepositoryNpm()
}
