import { describe, expect, it } from 'vitest'
import {
  companionImageReference,
  IMAGE_CONFIGS,
  parseArgs,
  parseKongTag,
} from '../../.github/workflows/vendor-image-updates.mjs'

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
})
