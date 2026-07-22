import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml') as { load(source: string): unknown }

interface PackageDocument {
  scripts?: Record<string, string>
}

interface WorkflowDocument {
  jobs?: Record<string, WorkflowJob>
  on?: {
    pull_request?: WorkflowTrigger
    push?: WorkflowTrigger
  }
}

interface WorkflowJob {
  steps?: WorkflowStep[]
}

interface WorkflowStep {
  name?: unknown
  run?: unknown
}

interface WorkflowTrigger {
  branches?: string[]
}

function readPackageDocument(): PackageDocument {
  return JSON.parse(
    readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
  ) as PackageDocument
}

function readQualityWorkflow(): WorkflowDocument {
  return yaml.load(
    readFileSync(
      path.join(process.cwd(), '.github', 'workflows', 'quality-checks.yml'),
      'utf8',
    ),
  ) as WorkflowDocument
}

describe('HSA support CI contract', () => {
  it('uses one local command for both nested HSA support packages', () => {
    const scripts = readPackageDocument().scripts

    expect(scripts).toBeDefined()
    expect(scripts?.check?.split(' && ')).toContain('npm run test:hsa-support')
    expect(scripts?.['test:hsa-support']).toBe(
      'npm run test:hsa-mock && npm run test:hsa-adapter',
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
  })

  it('runs the canonical HSA support command for pull requests and main', () => {
    const workflow = readQualityWorkflow()
    const hsaSupportStep = workflow.jobs?.['quality-checks']?.steps?.find(
      step => step.name === 'Run HSA support package tests',
    )

    expect(workflow.on?.pull_request?.branches).toContain('main')
    expect(workflow.on?.push?.branches).toContain('main')
    expect(hsaSupportStep?.run).toBe('npm run test:hsa-support')
  })
})
