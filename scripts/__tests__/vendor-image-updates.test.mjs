import { describe, expect, it } from 'vitest'
import {
  companionImageReference,
  IMAGE_CONFIGS,
  parseArgs,
  parseKongTag,
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
})
