import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  githubPublicationClient,
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
        tag_name: plan.releaseTagName,
        prerelease: plan.prerelease,
        draft: true,
      }
    }),
    publishRelease: vi.fn(async () => {
      expect(state.assets).toHaveLength(input.assets.length)
      expect(state.assets.every(asset => asset.state === 'uploaded')).toBe(true)
      state.release.draft = false
    }),
    removeUnfinishedAsset: vi.fn(async asset => {
      expect(asset.state).toBe('starter')
      expect(asset.digest).toBeFalsy()
      state.assets = state.assets.filter(item => item.id !== asset.id)
    }),
    uploadAsset: vi.fn(async (_id, asset) => {
      state.assets.push({
        ...asset,
        id: state.assets.length + 1,
        state: 'uploaded',
      })
    }),
  }
  return {
    input,
    evidence,
    remote,
    state,
    options: { evidence, remote, sleep: vi.fn(async () => {}) },
  }
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
    for (const method of [
      'createTag',
      'createRelease',
      'uploadAsset',
      'publishRelease',
    ]) {
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
    expect(f.state.release.draft).toBe(true)
    expect(f.remote.publishRelease).not.toHaveBeenCalled()
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
          tag_name: field('tag_name'),
          body: field('body'),
          prerelease: field('prerelease') === 'true',
          draft: field('draft') === 'true',
        }
      else {
        const asset = f.input.assets.find(item => item.file === args.at(-1))
        f.state.assets.push({
          ...asset,
          state: 'uploaded',
          id: f.state.assets.length + 1,
          digest: f.state.assets.length === 0 ? undefined : asset.digest,
        })
      }
      return '{}'
    }
    if (args.includes('PATCH')) {
      expect(f.state.release.draft).toBe(true)
      expect(f.state.assets).toHaveLength(24)
      expect(field('draft')).toBe('false')
      expect(field('make_latest')).toBe('false')
      f.state.release.draft = false
      return '{}'
    }
    if (endpoint.includes('/releases?'))
      return JSON.stringify([[f.state.release].filter(Boolean)])
    if (endpoint.includes('/git/ref/tags/') && f.state.tag)
      return JSON.stringify({ object: { type: 'tag', sha: 'annotated' } })
    if (endpoint.includes('/git/tags/'))
      return JSON.stringify({ object: { type: 'commit', sha: f.state.tag } })
    if (
      endpoint.includes('/releases/tags/') &&
      f.state.release &&
      !f.state.release.draft
    )
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

it('retains the draft and earlier assets when a later delivery fails', async () => {
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
    expect(error.publicationResult.releasePage).toBe('draft')
    expect(error.publicationResult.assets).toHaveLength(2)
    expect(error.publicationResult.imagePublication).toBe('verified')
  }
})

it('recovers a starter upload without replacing completed assets and resumes drafts', async () => {
  const f = fixture()
  const upload = f.remote.uploadAsset.getMockImplementation()
  f.remote.uploadAsset.mockImplementation(async (id, asset) => {
    if (f.state.assets.length === 1) {
      f.state.assets.push({ ...asset, id: 2, state: 'starter', digest: null })
      throw new Error('HTTP 502')
    }
    await upload(id, asset)
  })
  await expect(publishGitHubRelease(f.input, f.options)).rejects.toThrow(
    'HTTP 502',
  )
  expect(f.state.release.draft).toBe(true)
  expect(f.state.assets[0].state).toBe('uploaded')
  expect(
    f.remote.assetDigest.mock.calls.every(
      ([asset]) => asset.state === 'uploaded',
    ),
  ).toBe(true)
  expect(f.remote.removeUnfinishedAsset).toHaveBeenCalledTimes(2)
  f.remote.uploadAsset.mockImplementation(upload)
  f.remote.uploadAsset.mockClear()
  await publishGitHubRelease(f.input, f.options)
  expect(f.state.release.draft).toBe(false)
  expect(f.remote.createRelease).toHaveBeenCalledTimes(1)
  expect(f.remote.uploadAsset).toHaveBeenCalledTimes(23)
  expect(f.remote.removeUnfinishedAsset).toHaveBeenCalledTimes(3)
})

it('retries a failed upload with no remote asset within a bounded budget', async () => {
  const f = fixture()
  f.remote.uploadAsset.mockRejectedValueOnce(new Error('HTTP 503'))
  await publishGitHubRelease(f.input, f.options)
  expect(f.remote.uploadAsset).toHaveBeenCalledTimes(25)
  expect(f.options.sleep).toHaveBeenCalledWith(1000)
  expect(f.remote.removeUnfinishedAsset).not.toHaveBeenCalled()
})

it('recovers an interrupted upload within the same run before publishing', async () => {
  const f = fixture()
  f.remote.uploadAsset.mockImplementationOnce(async (_id, asset) => {
    f.state.assets.push({ ...asset, id: 1, state: 'starter', digest: null })
    throw new Error('HTTP 502')
  })
  await publishGitHubRelease(f.input, f.options)
  expect(f.remote.uploadAsset).toHaveBeenCalledTimes(25)
  expect(f.remote.removeUnfinishedAsset).toHaveBeenCalledTimes(1)
  expect(f.state.release.draft).toBe(false)
})

it('repairs an incomplete published release while preserving its completed assets', async () => {
  const f = fixture()
  await publishGitHubRelease(f.input, f.options)
  f.state.assets = [
    f.state.assets[0],
    { ...f.state.assets[1], state: 'starter', digest: null },
  ]
  f.remote.publishRelease.mockClear()
  f.remote.uploadAsset.mockClear()
  await publishGitHubRelease(f.input, f.options)
  expect(f.remote.uploadAsset).toHaveBeenCalledTimes(23)
  expect(f.remote.removeUnfinishedAsset).toHaveBeenCalledTimes(1)
  expect(f.remote.publishRelease).not.toHaveBeenCalled()
  expect(f.state.release.draft).toBe(false)
})

it('retains upload and verification errors when inspection also fails', async () => {
  const f = fixture()
  f.remote.uploadAsset.mockRejectedValue(new Error('original HTTP 502'))
  f.remote.assets.mockRejectedValue(new Error('inspection HTTP 404'))
  await expect(publishGitHubRelease(f.input, f.options)).rejects.toThrow(
    /original HTTP 502.*inspection HTTP 404/,
  )
  expect(f.remote.uploadAsset).toHaveBeenCalledTimes(1)
  expect(f.remote.publishRelease).not.toHaveBeenCalled()
})

it.each(['duplicate', 'digest', 'unknown', 'starter-with-digest'])(
  'preserves ambiguous or conflicting uploads: %s',
  async reason => {
    const f = fixture()
    f.remote.uploadAsset.mockImplementation(async (_id, asset) => {
      const current = { ...asset, id: 1, state: 'uploaded' }
      if (reason === 'digest') current.digest = 'sha256:different'
      if (reason === 'unknown') current.state = 'unknown'
      if (reason === 'starter-with-digest') current.state = 'starter'
      f.state.assets.push(current)
      if (reason === 'duplicate') f.state.assets.push(current)
    })
    await expect(publishGitHubRelease(f.input, f.options)).rejects.toThrow(
      /incomplete or conflicting/,
    )
    expect(f.remote.uploadAsset).toHaveBeenCalledTimes(1)
    expect(f.remote.removeUnfinishedAsset).not.toHaveBeenCalled()
    expect(f.remote.publishRelease).not.toHaveBeenCalled()
  },
)

it.each(['asset', 'tag', 'page'])(
  'keeps the draft private if %s changes before final publication',
  async kind => {
    const f = fixture()
    const upload = f.remote.uploadAsset.getMockImplementation()
    f.remote.uploadAsset.mockImplementation(async (...args) => {
      await upload(...args)
      if (f.state.assets.length === 24) {
        if (kind === 'asset') f.state.assets.shift()
        if (kind === 'tag') f.state.tag = undefined
        if (kind === 'page') f.state.release.id = 99
      }
    })
    // Return snapshots as the API does, rather than shared mutable fixture objects.
    f.remote.release.mockImplementation(
      async () => f.state.release && { ...f.state.release },
    )
    await expect(publishGitHubRelease(f.input, f.options)).rejects.toThrow(
      /unverified|missing|identity changed/,
    )
    expect(f.state.release.draft).toBe(true)
    expect(f.remote.publishRelease).not.toHaveBeenCalled()
  },
)

it('retains an unpublished draft and reports the original finalization error', async () => {
  const f = fixture()
  f.remote.publishRelease.mockRejectedValue(new Error('PATCH HTTP 503'))
  await expect(publishGitHubRelease(f.input, f.options)).rejects.toThrow(
    /PATCH HTTP 503.*could not be verified/,
  )
  expect(f.state.release.draft).toBe(true)
  expect(f.state.assets).toHaveLength(24)
})

describe('GitHub draft and unfinished asset adapters', () => {
  it.each([false, true])(
    'creates a draft and applies latest policy only at publication (preview=%s)',
    async prerelease => {
      const execFileSync = vi.fn(() => '{}')
      const client = githubPublicationClient(
        { repository: 'owner/repo', releaseTagName: 'v1', prerelease },
        { execFileSync },
      )
      await client.createRelease('notes')
      expect(execFileSync.mock.calls[0][1]).toEqual([
        'api',
        '-X',
        'POST',
        'repos/owner/repo/releases',
        '-f',
        'tag_name=v1',
        '-f',
        'name=v1',
        '-f',
        'body=notes',
        '-F',
        `prerelease=${prerelease}`,
        '-F',
        'draft=true',
        '-f',
        'make_latest=false',
      ])
      await client.publishRelease(123)
      expect(execFileSync.mock.calls[1][1]).toEqual([
        'api',
        '-X',
        'PATCH',
        'repos/owner/repo/releases/123',
        '-F',
        'draft=false',
        '-f',
        `make_latest=${!prerelease}`,
      ])
    },
  )

  it.each(['starter', 'uploaded', 'renamed', 'starter-with-digest'])(
    'rechecks asset identity and state before deletion: %s',
    async state => {
      const execFileSync = vi.fn((_command, args) => {
        if (args.includes('DELETE')) return ''
        return JSON.stringify({
          name: state === 'renamed' ? 'different' : 'lock.json',
          state: state === 'starter-with-digest' ? 'starter' : state,
          digest: state === 'starter-with-digest' ? 'sha256:known' : null,
        })
      })
      const client = githubPublicationClient(
        { repository: 'owner/repo' },
        { execFileSync },
      )
      const result = client.removeUnfinishedAsset({
        id: 123,
        name: 'lock.json',
      })
      if (state === 'starter') {
        await result
        expect(execFileSync).toHaveBeenLastCalledWith(
          'gh',
          ['api', '-X', 'DELETE', 'repos/owner/repo/releases/assets/123'],
          expect.anything(),
        )
      } else {
        await expect(result).rejects.toThrow('Refusing to delete')
        expect(execFileSync).toHaveBeenCalledTimes(1)
      }
    },
  )

  it('rejects duplicate draft identities and propagates API authorization errors', async () => {
    const execFileSync = vi.fn((_command, args) => {
      if (args.includes('--paginate'))
        return JSON.stringify([[{ tag_name: 'v1' }, { tag_name: 'v1' }]])
      throw Object.assign(new Error('not found'), { stderr: 'HTTP 404' })
    })
    const client = githubPublicationClient(
      { repository: 'owner/repo', releaseTagName: 'v1' },
      { execFileSync },
    )
    await expect(client.release()).rejects.toThrow('duplicate')
    execFileSync.mockImplementation(() => {
      throw new Error('HTTP 403')
    })
    await expect(client.release()).rejects.toThrow('HTTP 403')
  })
})
