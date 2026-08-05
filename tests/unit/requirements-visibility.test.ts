import { describe, expect, it, vi } from 'vitest'
import type { RequestContext } from '@/lib/requirements/auth'
import { resolveRequirementListVisibility } from '@/lib/requirements/visibility'

function context(roles: string[], hsaId: string | null): RequestContext {
  return {
    actor: {
      displayName: 'Test actor',
      hsaId,
      id: 'test-actor',
      isAuthenticated: true,
      roles,
      source: 'oidc',
    },
    correlationId: 'correlation-1',
    requestId: 'request-1',
    source: 'rest',
  }
}

describe('requirements list visibility', () => {
  it.each([['Admin'], ['Reviewer']])(
    'shows the complete library to %s actors',
    async role => {
      const query = vi.fn()

      await expect(
        resolveRequirementListVisibility(
          { query } as never,
          context([role], 'SE5560000001-reviewer'),
        ),
      ).resolves.toEqual({})
      expect(query).not.toHaveBeenCalled()
    },
  )

  it('shows published requirements plus assigned-area drafts to authors', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 4 }, { id: 9 }])

    await expect(
      resolveRequirementListVisibility(
        { query } as never,
        context(['Author'], 'SE5560000001-author'),
      ),
    ).resolves.toEqual({ publishedOrAreaIds: [4, 9] })
  })

  it('shows only published requirements when the actor has no assigned area', async () => {
    const query = vi.fn()

    await expect(
      resolveRequirementListVisibility(
        { query } as never,
        context(['Author'], null),
      ),
    ).resolves.toEqual({ publishedOnly: true })
    expect(query).not.toHaveBeenCalled()
  })
})
