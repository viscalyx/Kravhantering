import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

interface PackageDocument {
  scripts?: Record<string, string>
}

function readPackageDocument(): PackageDocument {
  return JSON.parse(
    readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
  ) as PackageDocument
}

describe('HSA support CI contract', () => {
  it('uses one local command for all nested HSA support packages', () => {
    const scripts = readPackageDocument().scripts

    expect(scripts).toBeDefined()
    expect(scripts?.check?.split(' && ')).toContain('npm run test:hsa-support')
    expect(scripts?.['test:hsa-support']).toBe(
      'npm run test:hsa-mock && npm run test:hsa-adapter && npm run test:hsa-provisioner',
    )
    expect(scripts?.['test:hsa-mock']).toContain(
      'npm --prefix containers/hsa-directory-mock ci',
    )
    expect(scripts?.['test:hsa-mock']).toContain(
      'npm --prefix containers/hsa-directory-mock test',
    )
    expect(scripts?.['test:hsa-adapter']).toContain(
      'npm --prefix containers/hsa-person-lookup-adapter ci',
    )
    expect(scripts?.['test:hsa-adapter']).toContain(
      'npm --prefix containers/hsa-person-lookup-adapter test',
    )
    expect(scripts?.['test:hsa-provisioner']).toContain(
      'npm --prefix containers/hsa-mtls-provisioner ci',
    )
    expect(scripts?.['test:hsa-provisioner']).toContain(
      'npm --prefix containers/hsa-mtls-provisioner test',
    )
  })
})
