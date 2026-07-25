import { describe, expect, it } from 'vitest'
import {
  hasRequirementListSnapshot,
  INITIAL_REQUIREMENT_LIST_RESOURCE_STATE,
  isRequirementListRequestActive,
  type RequirementListResourceState,
  requirementListResourceReducer,
} from '@/lib/requirements/list-resource-state'

describe('requirementListResourceReducer', () => {
  it('models initial failure and retry outcomes', () => {
    const failed = requirementListResourceReducer(
      INITIAL_REQUIREMENT_LIST_RESOURCE_STATE,
      { type: 'refresh-failed' },
    )

    expect(failed).toEqual({ status: 'initial-failure' })
    expect(hasRequirementListSnapshot(failed)).toBe(false)

    const retrying = requirementListResourceReducer(failed, {
      type: 'refresh-started',
    })
    expect(retrying).toEqual({ status: 'initial-loading' })
    expect(isRequirementListRequestActive(retrying)).toBe(true)
    expect(
      requirementListResourceReducer(retrying, {
        type: 'refresh-succeeded',
      }),
    ).toEqual({ status: 'ready' })
    expect(
      requirementListResourceReducer(retrying, { type: 'refresh-failed' }),
    ).toEqual({ status: 'initial-failure' })
  })

  it('models stale refreshes while retaining a successful snapshot', () => {
    const ready: RequirementListResourceState = { status: 'ready' }
    const refreshing = requirementListResourceReducer(ready, {
      type: 'refresh-started',
    })

    expect(refreshing).toEqual({ status: 'refreshing' })
    expect(hasRequirementListSnapshot(refreshing)).toBe(true)
    expect(isRequirementListRequestActive(refreshing)).toBe(true)
    expect(
      requirementListResourceReducer(refreshing, { type: 'refresh-failed' }),
    ).toEqual({ status: 'refresh-failure' })
  })

  it('retains the failed cursor for an additional-page retry', () => {
    const loading = requirementListResourceReducer(
      { status: 'ready' },
      { cursor: 'cursor-1', type: 'page-started' },
    )

    expect(loading).toEqual({
      cursor: 'cursor-1',
      status: 'page-loading',
    })
    expect(
      requirementListResourceReducer(loading, {
        type: 'page-succeeded',
      }),
    ).toEqual({ status: 'ready' })
    expect(
      requirementListResourceReducer(loading, {
        cursor: 'cursor-1',
        type: 'page-failed',
      }),
    ).toEqual({
      cursor: 'cursor-1',
      status: 'page-failure',
    })
  })

  it('models invalid-cursor recovery and recovery failure', () => {
    const recovering = requirementListResourceReducer(
      { cursor: 'expired', status: 'page-loading' },
      { type: 'cursor-recovery-started' },
    )

    expect(recovering).toEqual({ status: 'cursor-recovering' })
    expect(
      requirementListResourceReducer(recovering, {
        type: 'cursor-recovery-failed',
      }),
    ).toEqual({ status: 'cursor-recovery-failure' })
  })

  it('returns to a non-error presentation when authentication expires', () => {
    expect(
      requirementListResourceReducer(
        { status: 'initial-failure' },
        { type: 'authentication-expired' },
      ),
    ).toEqual({ status: 'initial-loading' })
    expect(
      requirementListResourceReducer(
        { status: 'refresh-failure' },
        { type: 'authentication-expired' },
      ),
    ).toEqual({ status: 'ready' })
  })

  it('resets locale-specific snapshots to initial loading', () => {
    expect(
      requirementListResourceReducer({ status: 'ready' }, { type: 'reset' }),
    ).toEqual(INITIAL_REQUIREMENT_LIST_RESOURCE_STATE)
  })

  it.each([
    [{ status: 'initial-loading' }, true],
    [{ status: 'refreshing' }, true],
    [{ cursor: 'cursor-1', status: 'page-loading' }, true],
    [{ status: 'cursor-recovering' }, true],
    [{ status: 'ready' }, false],
    [{ status: 'refresh-failure' }, false],
  ] as const)('reports whether %j has an active request', (state, expected) => {
    expect(isRequirementListRequestActive(state)).toBe(expected)
  })
})
