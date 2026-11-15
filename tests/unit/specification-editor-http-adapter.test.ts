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
})
