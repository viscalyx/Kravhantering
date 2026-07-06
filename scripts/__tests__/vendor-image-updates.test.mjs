import { describe, expect, it } from 'vitest'
import {
  companionImageReference,
  IMAGE_CONFIGS,
  parseArgs,
  parseKongTag,
  prBody,
  renderVendorImagePrTemplate,
  setTemplateChecklistState,
  setTemplateSectionBody,
  templateChecklistRow,
  updateDependentServiceLock,
} from '../../.github/workflows/vendor-image-updates.mjs'

describe('vendor image updater policy', () => {
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
        branch: 'automation/vendor-image/kong-3',
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
    expect(body).toContain('### Kong Gateway 3.x')
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
})
