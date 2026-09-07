import { describe, expect, it, vi } from 'vitest'
import type { RequestContext } from '@/lib/requirements/auth'
import { createRequirementsService } from '@/lib/requirements/service'
import {
  STATUS_ARCHIVED,
  STATUS_DRAFT,
  STATUS_PUBLISHED,
  STATUS_REVIEW,
} from '@/lib/requirements/status-constants.mjs'

import { createRequirementVersionDatabase } from '@/tests/helpers/requirement-version-visibility'

function createFixture(statusId = STATUS_DRAFT, areaAuthor = false) {
  const db = createRequirementVersionDatabase(statusId, areaAuthor)
  return createRequirementsService(db, {
    logger: { info: vi.fn(), error: vi.fn() },
  })
}

describe.each(['rest', 'mcp'] as const)(
  '%s requirement version visibility',
  source => {
    function context(roles: string[] = []): RequestContext {
      return {
        actor: {
          id: 'reader',
          displayName: 'Reader',
          hsaId: 'SE5560000001-reader',
          isAuthenticated: true,
          roles,
          source: source === 'mcp' ? 'mcp' : 'oidc',
        },
        source,
        correlationId: 'version-visibility',
        requestId: 'version-visibility',
      }
    }

    it.each([
      ['draft', STATUS_DRAFT],
      ['review', STATUS_REVIEW],
      ['archived, previously published', STATUS_ARCHIVED],
    ] as const)(
      'denies an unassigned reader the %s version of a published requirement',
      async (_label, status) => {
        await expect(
          createFixture(status).getRequirement(context(), {
            id: 11,
            view: 'version',
            versionNumber: 2,
          }),
        ).rejects.toMatchObject({ code: 'forbidden', status: 403 })
      },
    )

    it.each(['detail', 'version'] as const)(
      'allows published %s reads without disclosing the newer draft',
      async view => {
        const result = await createFixture().getRequirement(context(), {
          uniqueId: 'INT0011',
          view,
          versionNumber: 1,
        })
        expect(result.requirement.versions).toMatchObject([
          {
            versionNumber: 1,
            description: 'Published baseline',
            status: STATUS_PUBLISHED,
          },
        ])
        expect(JSON.stringify(result)).not.toContain('Confidential')
      },
    )

    it.each([
      { label: 'area author', roles: [], areaAuthor: true },
      { label: 'Reviewer', roles: ['Reviewer'], areaAuthor: false },
      { label: 'Admin', roles: ['Admin'], areaAuthor: false },
    ])(
      'allows $label to read restricted versions',
      async ({ roles, areaAuthor }) => {
        for (const status of [STATUS_DRAFT, STATUS_REVIEW, STATUS_ARCHIVED]) {
          const result = await createFixture(status, areaAuthor).getRequirement(
            context(roles),
            {
              id: 11,
              view: 'version',
              versionNumber: 2,
            },
          )
          expect(result.version).toMatchObject({
            description: 'Confidential draft',
            acceptanceCriteria: 'Confidential criteria',
            versionNumber: 2,
            status,
          })
          expect(result.requirement.versions).toHaveLength(1)
        }
      },
    )

    it.each([undefined, 99])(
      'returns not_found for missing version number %s on a readable parent',
      async versionNumber => {
        await expect(
          createFixture().getRequirement(context(), {
            id: 11,
            view: 'version',
            versionNumber,
          }),
        ).rejects.toMatchObject({ code: 'not_found', status: 404 })
      },
    )

    it('requires assignment for full history even when the parent has a published version', async () => {
      await expect(
        createFixture().getRequirement(context(), {
          id: 11,
          view: 'history',
        }),
      ).rejects.toMatchObject({ code: 'forbidden', status: 403 })
    })
  },
)
