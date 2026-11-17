import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHttpSpecificationEditorAdapter } from '@/app/[locale]/specifications/[specificationId]/specification-editor-http-adapter'
import { conflictError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

describe('specification editor HTTP adapter', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('classifies a serialized needs-reference conflict as requiring renewed review', async () => {
    const payload = toHttpErrorPayload(
      conflictError('Requirement applications changed during update', {
        reason: 'needs_reference_conflict',
      }),
    )
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(payload.body, { status: payload.status }),
        ),
    )
    const adapter = createHttpSpecificationEditorAdapter({
      specificationId: 1,
      loadItemsFailedMessage: 'Items unavailable',
      loadRequirementPackagesFailedMessage: 'Packages unavailable',
      needsReferenceConflictMessage:
        'Review the selected needs references again',
      refreshAvailableRequirements: async () => {},
      refreshNeedsReferences: async () => {},
      refreshNeedsReferencesFailedMessage: 'Needs references unavailable',
      refreshSavedDetails: async () => {},
    })

    await expect(
      adapter.assignNeedsReference(['lib:1'], 2, [
        { itemRef: 'lib:1', needsReferenceId: null },
      ]),
    ).rejects.toMatchObject({
      outcome: 'conflict',
      message: 'Review the selected needs references again',
    })
  })
  it.each(['assign', 'deviation', 'remove'] as const)(
    'retains the safe SQL reference for an uncertain %s save',
    async operation => {
      const fetch = vi.fn().mockResolvedValue(
        Response.json(
          {
            code: 'sql_failure',
            correlationId: 'bulk-sql-reference',
            timestamp: '2026-11-17T12:00:00.000Z',
            error: 'Safe server fallback',
          },
          { status: 500 },
        ),
      )
      vi.stubGlobal('fetch', fetch)
      const adapter = createHttpSpecificationEditorAdapter({
        specificationId: 1,
        loadItemsFailedMessage: 'Items unavailable',
        loadRequirementPackagesFailedMessage: 'Packages unavailable',
        refreshAvailableRequirements: async () => {},
        refreshNeedsReferences: async () => {},
        refreshNeedsReferencesFailedMessage: 'Needs references unavailable',
        refreshSavedDetails: async () => {},
      })
      const save =
        operation === 'assign'
          ? adapter.assignNeedsReference(['lib:1'], 2, [
              { itemRef: 'lib:1', needsReferenceId: null },
            ])
          : operation === 'deviation'
            ? adapter.createDeviation('lib:1', 'Reason')
            : adapter.removeItems(['lib:1'])
      await expect(save).rejects.toMatchObject({
        outcome: 'uncertain',
        message: expect.stringContaining('bulk-sql-reference'),
      })
      expect(fetch).toHaveBeenCalledTimes(1)
    },
  )
})
