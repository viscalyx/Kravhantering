import type { ImprovementSuggestionRow } from '@/lib/dal/improvement-suggestions'
import type {
  AuthorizationService,
  RequestContext,
} from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { STATUS_PUBLISHED } from '@/lib/requirements/status-constants.mjs'

export interface SuggestionImplementation {
  recordedAt: string
  version: {
    id: number
    requirementId: number
    versionNumber: number
    statusId: number
    statusNameEn: string
    statusNameSv: string
  } | null
}

export function mapSuggestionImplementation(
  row: ImprovementSuggestionRow,
): SuggestionImplementation | null {
  if (!row.implementationRecordedAt) return null
  return {
    recordedAt: row.implementationRecordedAt,
    version:
      row.implementingRequirementVersionId != null &&
      row.implementingVersionNumber != null &&
      row.implementingVersionStatusId != null
        ? {
            id: row.implementingRequirementVersionId,
            requirementId: row.requirementId,
            versionNumber: row.implementingVersionNumber,
            statusId: row.implementingVersionStatusId,
            statusNameEn: row.implementingVersionStatusNameEn ?? '',
            statusNameSv: row.implementingVersionStatusNameSv ?? '',
          }
        : null,
  }
}

export async function readSuggestionImplementation(
  authorization: AuthorizationService,
  context: RequestContext,
  row: ImprovementSuggestionRow,
): Promise<SuggestionImplementation | null> {
  const implementation = mapSuggestionImplementation(row)
  if (!implementation?.version) return implementation
  try {
    await authorization.assertAuthorized(
      {
        kind: 'get_requirement',
        id: row.requirementId,
        view: 'version',
        versionNumber: implementation.version.versionNumber,
        versionStatusId: implementation.version.statusId,
      },
      context,
    )
    return implementation
  } catch (error) {
    if (!isRequirementsServiceError(error) || error.status !== 403) throw error
    return { recordedAt: implementation.recordedAt, version: null }
  }
}

/** Called after suggestion-list authorization for this requirement. */
export async function readSuggestionImplementations(
  authorization: AuthorizationService,
  context: RequestContext,
  requirementId: number,
  rows: ImprovementSuggestionRow[],
): Promise<Array<SuggestionImplementation | null>> {
  const implementations = rows.map(mapSuggestionImplementation)
  if (
    !implementations.some(
      item => item?.version && item.version.statusId !== STATUS_PUBLISHED,
    )
  )
    return implementations

  // Published versions are readable by authenticated suggestion readers.
  // Every other version of this requirement shares history authorization.
  try {
    await authorization.assertAuthorized(
      { kind: 'get_requirement', id: requirementId, view: 'history' },
      context,
    )
    return implementations
  } catch (error) {
    if (!isRequirementsServiceError(error) || error.status !== 403) throw error
    return implementations.map(item =>
      item?.version && item.version.statusId !== STATUS_PUBLISHED
        ? { recordedAt: item.recordedAt, version: null }
        : item,
    )
  }
}
