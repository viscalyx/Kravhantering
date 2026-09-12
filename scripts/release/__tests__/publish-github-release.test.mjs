import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  publishGitHubRelease,
  releaseAssetPaths,
} from '../publish-github-release.mjs'
import { publicationFixture } from './publication-fixture.mjs'

function fixture() {
  const { plan, evidence, metadata } = publicationFixture()
  evidence.checks['Verify final artifact attestations'] = 'success'
  evidence.checks['Verify deployment archive provenance'] = 'success'
  const input = {
    plan,
    metadata,
    notes: 'Release notes\n\nBack up SQL.',
    archiveNotes: evidence.notesContent,
    assets: releaseAssetPaths(plan.version).map(file => ({
      file,
      name: path.basename(file),
      digest: `sha256:${'b'.repeat(64)}`,
    })),
  }
  const state = { tag: undefined, release: undefined, assets: [] }
  const remote = {
    imageDigest: vi.fn(
      async tag => `sha256:${tag.split('/kravhantering-')[1].split(':')[0]}`,
    ),
    tag: vi.fn(async () => state.tag),
    release: vi.fn(async () => state.release),
    assets: vi.fn(async () => state.assets),
    assetDigest: vi.fn(async asset => asset.digest),
    createTag: vi.fn(async () => {
      state.tag = plan.commitSha
    }),
    createRelease: vi.fn(async body => {
      state.release = {
        id: 1,
        body,
        name: plan.releaseTagName,
        prerelease: plan.prerelease,
        draft: false,
      }
    }),
    uploadAsset: vi.fn(async (_id, asset) => {
      state.assets.push({ ...asset, id: state.assets.length + 1 })
    }),
  }
  return { input, evidence, remote, state, options: { evidence, remote } }
}
describe('GitHub release and asset publication', () => {
  it('publishes complete committed notes and assets then preserves a matching complete release', async () => {
    const f = fixture()
    const result = await publishGitHubRelease(f.input, f.options)
    expect(result.releasePage).toBe('published')
    expect(result.assets).toHaveLength(24)
    expect(result.environmentDeployment).toBe('not observed')
    const again = await publishGitHubRelease(f.input, f.options)
    expect(again.releasePage).toBe('preserved')
    expect(again.assets.every(asset => asset.outcome === 'preserved')).toBe(
      true,
    )
    expect(f.remote.createTag).toHaveBeenCalledTimes(1)
    expect(f.remote.createRelease).toHaveBeenCalledTimes(1)
    expect(f.remote.uploadAsset).toHaveBeenCalledTimes(24)
  })
  it('blocks missing validation, archive notes or required assets before writes', async () => {
    for (const mutate of [
      f => {
        f.evidence.checks['Verify production stack'] = 'skipped'
      },
      f => {
        f.input.archiveNotes = 'wrong'
      },
      f => {
        f.input.assets.pop()
      },
      f => {
        f.evidence.checks['Verify deployment archive provenance'] = undefined
      },
      f => {
        f.remote.imageDigest.mockResolvedValue('sha256:different')
      },
    ]) {
      const f = fixture()
      mutate(f)
      await expect(publishGitHubRelease(f.input, f.options)).rejects.toThrow()
      expect(f.remote.createTag).not.toHaveBeenCalled()
      expect(f.remote.createRelease).not.toHaveBeenCalled()
      expect(f.remote.uploadAsset).not.toHaveBeenCalled()
    }
  })
  it.each(['tag', 'page', 'asset'])(
    'preserves conflicting existing %s content',
    async kind => {
      const f = fixture()
      await publishGitHubRelease(f.input, f.options)
      if (kind === 'tag') f.state.tag = 'c'.repeat(40)
      if (kind === 'page') f.state.release.body = 'different'
      if (kind === 'asset') f.state.assets[0].digest = 'sha256:different'
      f.remote.uploadAsset.mockClear()
      await expect(publishGitHubRelease(f.input, f.options)).rejects.toThrow(
        /points at|Conflicting/,
      )
      expect(f.remote.uploadAsset).not.toHaveBeenCalled()
    },
  )
  it('completes missing assets under an existing verified page', async () => {
    const f = fixture()
    await publishGitHubRelease(f.input, f.options)
    f.state.assets.pop()
    f.remote.uploadAsset.mockClear()
    const result = await publishGitHubRelease(f.input, f.options)
    expect(
      result.assets.filter(asset => asset.outcome === 'published'),
    ).toHaveLength(1)
    expect(f.remote.uploadAsset).toHaveBeenCalledTimes(1)
  })
  it('observes uncertain tag, page and asset writes without repeating them', async () => {
    const f = fixture()
    for (const method of ['createTag', 'createRelease', 'uploadAsset']) {
      const write = f.remote[method].getMockImplementation()
      f.remote[method].mockImplementation(async (...args) => {
        await write(...args)
        throw new Error('response lost')
      })
    }
    expect(
      (await publishGitHubRelease(f.input, f.options)).assets,
    ).toHaveLength(24)
    expect(f.remote.createTag).toHaveBeenCalledTimes(1)
    expect(f.remote.createRelease).toHaveBeenCalledTimes(1)
    expect(f.remote.uploadAsset).toHaveBeenCalledTimes(24)
  })
  it('leaves successful earlier stages visible after delivery failure', async () => {
    const f = fixture()
    f.remote.uploadAsset.mockRejectedValue(new Error('network unavailable'))
    await expect(publishGitHubRelease(f.input, f.options)).rejects.toThrow(
      /incomplete/,
    )
    expect(f.state.release.name).toBe(f.input.plan.releaseTagName)
    expect(f.state.tag).toBe(f.input.plan.commitSha)
    expect(f.state.assets).toEqual([])
  })
  it('stops for unverifiable registry or API state', async () => {
    const f = fixture()
    f.remote.tag.mockRejectedValue(new Error('unauthorized'))
    await expect(publishGitHubRelease(f.input, f.options)).rejects.toThrow(
      /unauthorized/,
    )
    expect(f.remote.createTag).not.toHaveBeenCalled()
  })
})

it('publishes through the GitHub and registry adapters with annotated tags and downloaded asset verification', async () => {
  const f = fixture()
  f.input.assets[0].digest =
    'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
  const execFileSync = vi.fn((command, args) => {
    if (command === 'skopeo')
      return `sha256:${args.at(-1).split('/kravhantering-')[1].split(':')[0]}`
    const endpoint = args.find(
      arg => arg.startsWith('repos/') || arg.startsWith('https://uploads.'),
    )
    const field = name =>
      args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1)
    if (args.includes('POST')) {
      if (endpoint.endsWith('/git/refs')) f.state.tag = f.input.plan.commitSha
      else if (endpoint.endsWith('/releases'))
        f.state.release = {
          id: 1,
          name: field('name'),
          body: field('body'),
          prerelease: field('prerelease') === 'true',
          draft: false,
        }
      else {
        const asset = f.input.assets.find(item => item.file === args.at(-1))
        f.state.assets.push({
          ...asset,
          id: f.state.assets.length + 1,
          digest: f.state.assets.length === 0 ? undefined : asset.digest,
        })
      }
      return '{}'
    }
    if (endpoint.includes('/git/ref/tags/') && f.state.tag)
      return JSON.stringify({ object: { type: 'tag', sha: 'annotated' } })
    if (endpoint.includes('/git/tags/'))
      return JSON.stringify({ object: { type: 'commit', sha: f.state.tag } })
    if (endpoint.includes('/releases/tags/') && f.state.release)
      return JSON.stringify(f.state.release)
    if (endpoint.includes('/assets?')) return JSON.stringify([f.state.assets])
    if (endpoint.includes('/releases/assets/')) return Buffer.from('hello')
    const error = new Error('not found')
    error.stderr = 'HTTP 404'
    throw error
  })
  const result = await publishGitHubRelease(f.input, {
    evidence: f.evidence,
    execFileSync,
  })
  expect(result.assets).toHaveLength(24)
  expect(
    (
      await publishGitHubRelease(f.input, {
        evidence: f.evidence,
        execFileSync,
      })
    ).releasePage,
  ).toBe('preserved')
})

it('stops uncertain writes when subsequent inspection cannot establish completion', async () => {
  for (const method of ['createTag', 'createRelease']) {
    const f = fixture()
    f.remote[method].mockRejectedValue(new Error('response lost'))
    await expect(publishGitHubRelease(f.input, f.options)).rejects.toThrow(
      /uncertain/,
    )
  }
  const f = fixture()
  f.state.release = { id: 1, name: f.input.plan.releaseTagName }
  await expect(publishGitHubRelease(f.input, f.options)).rejects.toThrow(
    /unverifiable tag/,
  )
})

it('rejects ambiguous remote assets and unverifiable created identities', async () => {
  const f = fixture()
  await publishGitHubRelease(f.input, f.options)
  f.state.assets.push(f.state.assets[0])
  await expect(publishGitHubRelease(f.input, f.options)).rejects.toThrow(
    /duplicate/,
  )
  const g = fixture()
  g.remote.createTag.mockResolvedValue(undefined)
  await expect(publishGitHubRelease(g.input, g.options)).rejects.toThrow(
    /tag could not/,
  )
  const h = fixture()
  h.remote.createRelease.mockResolvedValue(undefined)
  await expect(publishGitHubRelease(h.input, h.options)).rejects.toThrow(
    /page could not/,
  )
})

it('reports the completed page and earlier assets when a later delivery fails', async () => {
  const f = fixture()
  const write = f.remote.uploadAsset.getMockImplementation()
  f.remote.uploadAsset.mockImplementation(async (...args) => {
    if (f.state.assets.length === 2) throw new Error('network unavailable')
    await write(...args)
  })
  try {
    await publishGitHubRelease(f.input, f.options)
    expect.fail('Publication should stop')
  } catch (error) {
    expect(error.publicationResult.releasePage).toBe('published')
    expect(error.publicationResult.assets).toHaveLength(2)
    expect(error.publicationResult.imagePublication).toBe('verified')
  }
})
