import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  branchName,
  companionImageReference,
  IMAGE_CONFIGS,
  parseArgs,
  parseKongTag,
  prBody,
  processCandidate,
  processImages,
  renderVendorImagePrTemplate,
  selectCandidates,
  setTemplateChecklistState,
  setTemplateSectionBody,
  stalePrClosure,
  templateChecklistRow,
  updateDependentServiceLock,
  updateFiles,
} from '../../.github/workflows/vendor-image-updates.mjs'

const tempDirs = []

const KEYCLOAK_LOCK = {
  imageId:
    'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  manifestDigest:
    'sha256:1111111111111111111111111111111111111111111111111111111111111111',
  tag: '26.6.3',
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true })
  }
})

describe('vendor image updater policy', () => {
  it('covers SQL Server release and developer companion refs', () => {
    expect(IMAGE_CONFIGS.sqlserver.companionFiles).toContain(
      'docker-compose.sqlserver.yml',
    )
    expect(IMAGE_CONFIGS.sqlserver.companionFiles).toContain(
      '.devcontainer/docker-compose.yml',
    )
    expect(IMAGE_CONFIGS.sqlserver.companionFiles).toContain(
      '.devcontainer/elevated/docker-compose.yml',
    )
    expect(IMAGE_CONFIGS.sqlserver.companionFiles).toContain(
      'containers/production/env/release.env.template',
    )
  })

  it('tracks every checked-in Keycloak image reference', () => {
    expect(IMAGE_CONFIGS.keycloak.companionFiles).toEqual([
      'docker-compose.idp.yml',
      '.devcontainer/docker-compose.yml',
      '.devcontainer/elevated/docker-compose.yml',
      'containers/production/env/release.env.template',
      'docs/development/auth-developer-workflow.md',
      'scripts/__tests__/container-release.test.mjs',
    ])
    expect(
      IMAGE_CONFIGS.keycloak.companionFiles.every(filePath =>
        fs.existsSync(filePath),
      ),
    ).toBe(true)
  })

  it('supports the Kong Gateway 3.x lane', () => {
    const parsed = parseKongTag('3.10.0.8-20260210-ubuntu')

    expect(parsed).toMatchObject({
      buildDate: 20260210,
      major: 3,
      minor: 10,
      patch: 0,
      revision: 8,
      tag: '3.10.0.8-20260210-ubuntu',
    })
    expect(parseKongTag('3.10')).toBeNull()
    expect(IMAGE_CONFIGS.kong).toMatchObject({
      image: 'docker.io/kong/kong-gateway',
      lockPath: 'containers/kong/image.lock.json',
      name: 'kong',
      registryRepository: 'kong/kong-gateway',
    })
    expect(IMAGE_CONFIGS.kong.laneFromVersion(parsed)).toBe('3')
    expect(IMAGE_CONFIGS.kong.companionFiles).toContain(
      '.devcontainer/docker-compose.yml',
    )
    expect(IMAGE_CONFIGS.kong.companionFiles).toContain(
      'containers/production/env/release.env.template',
    )
    expect(IMAGE_CONFIGS.kong.companionFiles).toContain(
      'scripts/__tests__/container-release.test.mjs',
    )
    expect(IMAGE_CONFIGS.kong.dependentLockPaths).toContain(
      'container-hsa-integration-support.lock.json',
    )
    expect(parseArgs(['--image', 'kong'], {})).toMatchObject({
      image: 'kong',
    })
  })

  it('keeps Kong devcontainer refs digest-pinned but release env refs tag-only', () => {
    const candidate = {
      version: {
        tag: '3.11.1.0-20260601-ubuntu',
      },
    }
    const identity = {
      manifestDigest: 'sha256:kong-manifest',
    }

    expect(
      companionImageReference(
        IMAGE_CONFIGS.kong,
        '.devcontainer/docker-compose.yml',
        candidate,
        identity,
      ),
    ).toBe(
      'docker.io/kong/kong-gateway:3.11.1.0-20260601-ubuntu@sha256:kong-manifest',
    )
    expect(
      companionImageReference(
        IMAGE_CONFIGS.kong,
        'containers/production/env/release.env.template',
        candidate,
        identity,
      ),
    ).toBe('docker.io/kong/kong-gateway:3.11.1.0-20260601-ubuntu')
  })

  it('uses exact image versions in automation branches', () => {
    const config = IMAGE_CONFIGS.keycloak
    const version = config.parseTag('26.6.4-1')

    expect(branchName(config, version)).toBe(
      'automation/vendor-image/keycloak-26.6.4-1',
    )
  })

  it('selects the latest tag per lane with an exact-version branch', () => {
    const { candidates, currentLane, currentVersion } = selectCandidates(
      IMAGE_CONFIGS.keycloak,
      ['25.0.6', '26.6.3', '26.6.4-1', '26.7.0', '27.0.0', '27.0.1'],
      KEYCLOAK_LOCK,
      false,
    )

    expect(currentLane).toBe('26')
    expect(currentVersion.tag).toBe('26.6.3')
    expect(
      candidates.map(candidate => ({
        branch: candidate.branch,
        lane: candidate.lane,
        tag: candidate.version.tag,
      })),
    ).toEqual([
      {
        branch: 'automation/vendor-image/keycloak-26.7.0',
        lane: '26',
        tag: '26.7.0',
      },
      {
        branch: 'automation/vendor-image/keycloak-27.0.1',
        lane: '27',
        tag: '27.0.1',
      },
    ])
  })

  it('uses an exact-version branch when refreshing the current tag', () => {
    const { candidates } = selectCandidates(
      IMAGE_CONFIGS.keycloak,
      ['26.6.3'],
      KEYCLOAK_LOCK,
      true,
    )

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      branch: 'automation/vendor-image/keycloak-26.6.3',
      lane: '26',
      version: { tag: '26.6.3' },
    })
  })

  it('keeps the selected exact-version branch out of stale cleanup', () => {
    const currentVersion = IMAGE_CONFIGS.keycloak.parseTag('26.6.3')
    const expectedBranches = new Set([
      'automation/vendor-image/keycloak-26.7.0',
    ])

    expect(
      stalePrClosure(
        IMAGE_CONFIGS.keycloak,
        currentVersion,
        'automation/vendor-image/keycloak-26.7.0',
        expectedBranches,
      ),
    ).toBeNull()
  })

  it('closes superseded exact-version and retired lane branches', () => {
    const currentVersion = IMAGE_CONFIGS.keycloak.parseTag('26.6.3')
    const expectedBranches = new Set([
      'automation/vendor-image/keycloak-26.7.0',
    ])

    expect(
      stalePrClosure(
        IMAGE_CONFIGS.keycloak,
        currentVersion,
        'automation/vendor-image/keycloak-26.6.4-1',
        expectedBranches,
      ),
    ).toMatchObject({
      summary:
        'keycloak 26.6.4-1: keycloak on main already contains this update version, or the upstream tag is no longer selected.',
    })

    expect(
      stalePrClosure(
        IMAGE_CONFIGS.keycloak,
        currentVersion,
        'automation/vendor-image/keycloak-26',
        expectedBranches,
      ),
    ).toMatchObject({
      reason:
        'keycloak automation branch automation/vendor-image/keycloak-26 uses retired lane branch naming or an unsupported version tag.',
    })
  })

  it('closes exact-version branches that main has advanced past', () => {
    const currentVersion = IMAGE_CONFIGS.keycloak.parseTag('27.0.0')

    expect(
      stalePrClosure(
        IMAGE_CONFIGS.keycloak,
        currentVersion,
        'automation/vendor-image/keycloak-26.7.0',
        new Set(),
      ),
    ).toMatchObject({
      reason: 'keycloak has already advanced past 26.7.0 on main.',
    })
  })

  it('updates dependent service locks from the primary vendor lock', () => {
    const lock = {
      schemaVersion: 1,
      services: [
        {
          image: 'docker.io/kong/kong-gateway',
          imageId: 'sha256:old-image',
          manifestDigest: 'sha256:old-manifest',
          name: 'kong',
          role: 'api-management',
          source: 'https://hub.docker.com/r/kong/kong-gateway',
          tag: '3.10.0.8-20260210-ubuntu',
        },
        {
          image: 'ghcr.io/viscalyx/kravhantering-hsa-person-lookup-adapter',
          imageId: 'sha256:adapter-image',
          manifestDigest: 'sha256:adapter-manifest',
          name: 'hsa-person-lookup-adapter',
          role: 'hsa-person-lookup-adapter',
          source: 'ghcr-release',
          tag: '1.2.3',
        },
      ],
    }

    const updated = updateDependentServiceLock(lock, {
      image: 'docker.io/kong/kong-gateway',
      imageId: 'sha256:new-image',
      manifestDigest: 'sha256:new-manifest',
      name: 'kong',
      role: 'api-management',
      source: 'https://hub.docker.com/r/kong/kong-gateway',
      tag: '3.15.0.0-20260702-ubuntu',
    })

    expect(updated.services).toEqual([
      {
        image: 'docker.io/kong/kong-gateway',
        imageId: 'sha256:new-image',
        manifestDigest: 'sha256:new-manifest',
        name: 'kong',
        role: 'api-management',
        source: 'https://hub.docker.com/r/kong/kong-gateway',
        tag: '3.15.0.0-20260702-ubuntu',
      },
      lock.services[1],
    ])
  })

  it('does not write partial image updates when companion validation fails', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-image-update-'))
    tempDirs.push(dir)
    const lockPath = path.join(dir, 'image.lock.json')
    const validCompanionPath = path.join(dir, 'docker-compose.yml')
    const missingCompanionPath = path.join(dir, 'missing-devfile.yaml')
    const currentLock = {
      ...KEYCLOAK_LOCK,
      image: IMAGE_CONFIGS.keycloak.image,
      name: 'keycloak',
      role: 'identity-provider',
      source: 'https://quay.io/repository/keycloak/keycloak',
    }
    const originalLock = `${JSON.stringify(currentLock, null, 2)}\n`
    const originalCompanion = `image: ${IMAGE_CONFIGS.keycloak.image}:${currentLock.tag}\n`
    fs.writeFileSync(lockPath, originalLock)
    fs.writeFileSync(validCompanionPath, originalCompanion)

    expect(() =>
      updateFiles(
        {
          ...IMAGE_CONFIGS.keycloak,
          companionFiles: [validCompanionPath, missingCompanionPath],
          dependentLockPaths: [],
          lockPath,
        },
        currentLock,
        { version: { tag: '26.7.0-0' } },
        {
          imageId: 'sha256:new-image',
          manifestDigest: 'sha256:new-manifest',
        },
      ),
    ).toThrow(/missing-devfile\.yaml/u)

    expect(fs.readFileSync(lockPath, 'utf8')).toBe(originalLock)
    expect(fs.readFileSync(validCompanionPath, 'utf8')).toBe(originalCompanion)
  })

  it('checks template checklist rows by marker while preserving row text', () => {
    const template = [
      '- [ ] Future operator wording. <!-- DO NOT REMOVE: operator-upgrade:no-notes -->',
      '- [ ] Future SSDLC wording. <!-- DO NOT REMOVE: ssdlc:requirements -->',
    ].join('\n')

    expect(
      setTemplateChecklistState(template, 'operator-upgrade:no-notes', true),
    ).toContain(
      '- [x] Future operator wording. <!-- DO NOT REMOVE: operator-upgrade:no-notes -->',
    )
    expect(
      setTemplateChecklistState(template, 'ssdlc:requirements', false),
    ).toContain(
      '- [ ] Future SSDLC wording. <!-- DO NOT REMOVE: ssdlc:requirements -->',
    )
    expect(
      templateChecklistRow(template, 'operator-upgrade:no-notes', true),
    ).toBe(
      '- [x] Future operator wording. <!-- DO NOT REMOVE: operator-upgrade:no-notes -->',
    )
  })

  it('sets template section bodies without requiring optional comments', () => {
    const template = [
      '## Description',
      '',
      '## Related Issues',
      '',
      '## Reviewer Notes',
      '',
      '## Operator Upgrade Impact',
      '',
      '- [ ] No operator notes needed. <!-- DO NOT REMOVE: operator-upgrade:no-notes -->',
      '',
      '<!-- DO NOT REMOVE: operator-upgrade:notes start -->',
      'Write operator upgrade notes here...',
      '<!-- DO NOT REMOVE: operator-upgrade:notes end -->',
      '',
      '## SSDLC (Secure Software Development Life Cycle) Gate',
      '',
      '- [ ] SSDLC row. <!-- DO NOT REMOVE: ssdlc:requirements -->',
    ].join('\n')

    expect(
      setTemplateSectionBody(template, 'Reviewer Notes', 'Generated notes'),
    ).toContain(`## Reviewer Notes\n\nGenerated notes`)

    const body = renderVendorImagePrTemplate(template, {
      description: 'Generated description',
      reviewerNotes: 'Generated notes',
    })

    expect(body).toContain('Generated description')
    expect(body).toContain('Generated notes')
    expect(body).toContain('Relates to automated vendor image maintenance.')
    expect(body).toContain(
      'No operator notes needed for this vendor image lock update.',
    )
    expect(body).toContain(
      'Automated vendor image maintenance was reviewed for security, data protection, threat-model, and security-testing impacts.',
    )
    expect(body).toMatch(
      /^- \[x\].*<!-- DO NOT REMOVE: operator-upgrade:no-notes -->$/mu,
    )
    expect(body).toMatch(
      /^- \[x\].*<!-- DO NOT REMOVE: ssdlc:requirements -->$/mu,
    )
  })

  it('renders vendor image PRs through the repository pull request template', () => {
    const body = prBody(
      IMAGE_CONFIGS.kong,
      {
        branch: 'automation/vendor-image/kong-3.15.0.0-20260702-ubuntu',
        lane: '3',
        version: {
          tag: '3.15.0.0-20260702-ubuntu',
        },
      },
      {
        imageId: 'sha256:old-image',
        manifestDigest: 'sha256:old-manifest',
        tag: '3.10.0.8-20260210-ubuntu',
      },
      {
        imageId: 'sha256:new-image',
        manifestDigest: 'sha256:new-manifest',
      },
      ['containers/kong/image.lock.json'],
    )

    expect(body).toContain('## Description')
    expect(body).toContain('## Operator Upgrade Impact')
    expect(body).toContain(
      '## SSDLC (Secure Software Development Life Cycle) Gate',
    )
    expect(body).toContain('### kong 3.15.0.0-20260702-ubuntu')
    expect(body).toContain('Lane: `Kong Gateway 3.x`')
    expect(body).not.toContain('| Lane |')
    expect(body).toContain(
      '| `3.10.0.8-20260210-ubuntu` | `3.15.0.0-20260702-ubuntu` |',
    )
    expect(body).not.toContain(
      '<!-- Fixes #123, Closes #123, or Relates to #123 -->',
    )
    expect(body).not.toContain(
      '<!-- Optional: screenshots, test notes, rollout notes, or review context. -->',
    )
    expect(body).not.toContain('<!-- Optional: what changed and why? -->')
    expect(body).not.toContain('Complete this section for every PR.')
    expect(body).not.toContain('Write operator upgrade notes here...')
    expect(body).not.toContain('request a security review')
    expect(body).toContain('Relates to automated vendor image maintenance.')
    expect(body).toContain(
      'No operator notes needed for this vendor image lock update.',
    )
    expect(body).toContain(
      'Automated vendor image maintenance was reviewed for security, data protection, threat-model, and security-testing impacts.',
    )
    expect(body).toMatch(
      /^- \[x\].*<!-- DO NOT REMOVE: operator-upgrade:no-notes -->$/mu,
    )
    expect(body).toMatch(
      /^- \[x\].*<!-- DO NOT REMOVE: ssdlc:requirements -->$/mu,
    )
  })

  it('stops processing images after the first image failure', async () => {
    const results = {
      closed: [],
      created: [],
      failed: [],
      unchanged: [],
      updated: [],
    }
    const consoleObj = { error: vi.fn() }
    const processImage = vi.fn(config => {
      if (config.name === 'keycloak') {
        throw new Error(
          "ENOENT: no such file or directory, open 'devfile.example.yaml'",
        )
      }
      results.created.push(config.name)
    })

    await processImages(
      [IMAGE_CONFIGS.keycloak, IMAGE_CONFIGS.kong],
      { includeCurrent: false },
      results,
      { consoleObj, processImage },
    )

    expect(processImage).toHaveBeenCalledTimes(1)
    expect(processImage).toHaveBeenCalledWith(
      IMAGE_CONFIGS.keycloak,
      { includeCurrent: false },
      results,
    )
    expect(results.created).toEqual([])
    expect(results.failed).toEqual([
      "keycloak: ENOENT: no such file or directory, open 'devfile.example.yaml'",
    ])
    expect(consoleObj.error).toHaveBeenCalledWith(results.failed[0])
  })

  it('refuses to start a candidate update with a dirty worktree', async () => {
    const candidate = {
      branch: 'automation/vendor-image/keycloak-26.7.0-0',
      lane: '26',
      version: { tag: '26.7.0-0' },
    }
    const resolveImageIdentity = vi.fn()
    const checkoutUpdateBranch = vi.fn()

    await expect(
      processCandidate(
        IMAGE_CONFIGS.keycloak,
        KEYCLOAK_LOCK,
        candidate,
        {
          closed: [],
          created: [],
          failed: [],
          unchanged: [],
          updated: [],
        },
        {
          checkoutUpdateBranch,
          findOpenPr: vi.fn(() => null),
          gitStatusPorcelain: vi.fn(
            () => ' M containers/keycloak/image.lock.json',
          ),
          resolveImageIdentity,
        },
      ),
    ).rejects.toThrow(/dirty worktree/u)

    expect(resolveImageIdentity).not.toHaveBeenCalled()
    expect(checkoutUpdateBranch).not.toHaveBeenCalled()
  })

  it('skips an existing candidate PR before checkout or push', async () => {
    const candidate = {
      branch: 'automation/vendor-image/keycloak-26.7.0',
      lane: '26',
      version: {
        tag: '26.7.0',
      },
    }
    const results = {
      closed: [],
      created: [],
      failed: [],
      unchanged: [],
      updated: [],
    }
    const findOpenPr = vi.fn(() => ({
      headRefName: candidate.branch,
      number: 42,
      title: 'chore: update keycloak container to 26.7.0',
    }))
    const resolveImageIdentity = vi.fn(() => {
      throw new Error('resolveImageIdentity should not run')
    })
    const checkoutUpdateBranch = vi.fn(() => {
      throw new Error('checkoutUpdateBranch should not run')
    })
    const pushUpdateBranch = vi.fn(() => {
      throw new Error('pushUpdateBranch should not run')
    })
    const createOrUpdatePr = vi.fn(() => {
      throw new Error('createOrUpdatePr should not run')
    })

    await processCandidate(
      IMAGE_CONFIGS.keycloak,
      KEYCLOAK_LOCK,
      candidate,
      results,
      {
        checkoutUpdateBranch,
        createOrUpdatePr,
        findOpenPr,
        pushUpdateBranch,
        resolveImageIdentity,
      },
    )

    expect(findOpenPr).toHaveBeenCalledWith(candidate.branch)
    expect(results.unchanged).toEqual(['keycloak: 26.7.0 already has PR #42'])
    expect(results.created).toEqual([])
    expect(results.updated).toEqual([])
    expect(resolveImageIdentity).not.toHaveBeenCalled()
    expect(checkoutUpdateBranch).not.toHaveBeenCalled()
    expect(pushUpdateBranch).not.toHaveBeenCalled()
    expect(createOrUpdatePr).not.toHaveBeenCalled()
  })
})
