export type RequirementListResourceState =
  | { status: 'initial-loading' }
  | { status: 'initial-failure' }
  | { status: 'ready' }
  | { status: 'refreshing' }
  | { status: 'refresh-failure' }
  | { cursor: string; status: 'page-loading' }
  | { cursor: string; status: 'page-failure' }
  | { status: 'cursor-recovering' }
  | { status: 'cursor-recovery-failure' }

export type RequirementListResourceAction =
  | { type: 'reset' }
  | { type: 'refresh-started' }
  | { type: 'refresh-succeeded' }
  | { type: 'refresh-failed' }
  | { cursor: string; type: 'page-started' }
  | { type: 'page-succeeded' }
  | { cursor: string; type: 'page-failed' }
  | { type: 'cursor-recovery-started' }
  | { type: 'cursor-recovery-failed' }
  | { type: 'authentication-expired' }

export const INITIAL_REQUIREMENT_LIST_RESOURCE_STATE: RequirementListResourceState =
  {
    status: 'initial-loading',
  }

export function requirementListResourceReducer(
  state: RequirementListResourceState,
  action: RequirementListResourceAction,
): RequirementListResourceState {
  switch (action.type) {
    case 'reset':
      return INITIAL_REQUIREMENT_LIST_RESOURCE_STATE
    case 'refresh-started':
      return state.status === 'initial-loading' ||
        state.status === 'initial-failure'
        ? INITIAL_REQUIREMENT_LIST_RESOURCE_STATE
        : { status: 'refreshing' }
    case 'refresh-succeeded':
    case 'page-succeeded':
      return { status: 'ready' }
    case 'refresh-failed':
      return state.status === 'initial-loading'
        ? { status: 'initial-failure' }
        : { status: 'refresh-failure' }
    case 'page-started':
      return { cursor: action.cursor, status: 'page-loading' }
    case 'page-failed':
      return { cursor: action.cursor, status: 'page-failure' }
    case 'cursor-recovery-started':
      return { status: 'cursor-recovering' }
    case 'cursor-recovery-failed':
      return { status: 'cursor-recovery-failure' }
    case 'authentication-expired':
      return state.status === 'initial-loading' ||
        state.status === 'initial-failure'
        ? INITIAL_REQUIREMENT_LIST_RESOURCE_STATE
        : { status: 'ready' }
  }
}

export function isRequirementListRequestActive(
  state: RequirementListResourceState,
): boolean {
  return (
    state.status === 'initial-loading' ||
    state.status === 'refreshing' ||
    state.status === 'page-loading' ||
    state.status === 'cursor-recovering'
  )
}

export function hasRequirementListSnapshot(
  state: RequirementListResourceState,
): boolean {
  return (
    state.status !== 'initial-loading' && state.status !== 'initial-failure'
  )
}
