export type RestAuthPolicy = 'public' | 'session'
export type RestCachePolicy = 'framework-default' | 'no-cache' | 'no-store'
export type RestContractPolicy = 'focused' | 'openapi'
export type RestCsrfPolicy = 'none' | 'same-origin'
export type RestSensitivity = 'authenticated' | 'public' | 'sensitive'
export const EXPLICIT_REST_METHODS = Object.freeze([
  'DELETE',
  'GET',
  'PATCH',
  'POST',
  'PUT',
] as const)
export type ExplicitRestMethod = (typeof EXPLICIT_REST_METHODS)[number]
export const REST_METHODS = Object.freeze([
  ...EXPLICIT_REST_METHODS,
  'HEAD',
  'OPTIONS',
] as const)
export type RestMethod = (typeof REST_METHODS)[number]

export interface RestOperation {
  auth: RestAuthPolicy
  cache: RestCachePolicy
  contract: RestContractPolicy
  csrf: RestCsrfPolicy
  method: ExplicitRestMethod
  sensitivity: RestSensitivity
  template: string
}

export interface ResolvedRestPolicy
  extends Omit<RestOperation, 'method' | 'template'> {
  method: string
  registered: boolean
  template: string | null
}

export type RestOperationDeclaration = readonly [
  method: ExplicitRestMethod,
  template: string,
  auth: RestAuthPolicy,
  csrf: RestCsrfPolicy,
  sensitivity: RestSensitivity,
  cache: RestCachePolicy,
  contract: RestContractPolicy,
]

export const REST_OPERATION_DECLARATIONS = [
  [
    'POST',
    '/api/admin/access-reviews/[id]/cancel',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/admin/access-reviews/[id]/complete',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/admin/access-reviews/[id]/export',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'PATCH',
    '/api/admin/access-reviews/[id]/items/[itemId]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/admin/access-reviews/[id]',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/admin/access-reviews',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/admin/access-reviews',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/admin/ai-safety-rules/[ruleId]/restore-defaults',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'GET',
    '/api/admin/ai-safety-rules',
    'session',
    'none',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'POST',
    '/api/admin/ai-safety-rules',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'PATCH',
    '/api/admin/ai-safety-rules/terms/[id]',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'DELETE',
    '/api/admin/ai-safety-rules/terms/[id]',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'POST',
    '/api/admin/ai-safety-rules/terms/remove',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'GET',
    '/api/admin/ai-settings',
    'session',
    'none',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'PUT',
    '/api/admin/ai-settings',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'PATCH',
    '/api/admin/ai-settings',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'GET',
    '/api/admin/application-settings',
    'session',
    'none',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'PATCH',
    '/api/admin/application-settings',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'POST',
    '/api/admin/archiving/exceptions',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'DELETE',
    '/api/admin/archiving/exceptions',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'POST',
    '/api/admin/archiving/exports',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'GET',
    '/api/admin/archiving/policies',
    'session',
    'none',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'POST',
    '/api/admin/archiving/preview',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'POST',
    '/api/admin/archiving/runs',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'GET',
    '/api/admin/audit-events',
    'session',
    'none',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'GET',
    '/api/admin/hsa-id-prefixes',
    'session',
    'none',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'PUT',
    '/api/admin/hsa-id-prefixes',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'GET',
    '/api/admin/requirement-columns',
    'session',
    'none',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'PUT',
    '/api/admin/requirement-columns',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'GET',
    '/api/ai/credits',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/ai/generate-requirement-import',
    'session',
    'same-origin',
    'authenticated',
    'no-cache',
    'focused',
  ],
  [
    'GET',
    '/api/ai/models',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/ai/repair-requirement-import-json',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/auth/callback',
    'public',
    'none',
    'public',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/auth/login',
    'public',
    'none',
    'public',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/auth/logout',
    'public',
    'none',
    'public',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/auth/logout',
    'public',
    'same-origin',
    'public',
    'no-store',
    'focused',
  ],
  ['GET', '/api/auth/me', 'public', 'none', 'sensitive', 'no-store', 'openapi'],
  [
    'GET',
    '/api/catalog/specification-item-statuses/[id]',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PUT',
    '/api/catalog/specification-item-statuses/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/catalog/specification-item-statuses',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/database-schema-status',
    'session',
    'none',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'POST',
    '/api/deviations/[id]/decision',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/deviations/[id]/request-review',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/deviations/[id]/revert-to-draft',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/deviations/[id]',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PUT',
    '/api/deviations/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'DELETE',
    '/api/deviations/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  ['GET', '/api/health', 'public', 'none', 'public', 'no-store', 'focused'],
  [
    'GET',
    '/api/hsa-id-prefixes',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/improvement-suggestions/[id]/request-review',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/improvement-suggestions/[id]/resolution',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/improvement-suggestions/[id]/revert-to-draft',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/improvement-suggestions/[id]',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PUT',
    '/api/improvement-suggestions/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'DELETE',
    '/api/improvement-suggestions/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/norm-reference-actions/[id]/archive',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'POST',
    '/api/norm-references/[id]/reactivate',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'GET',
    '/api/norm-references/[id]',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PUT',
    '/api/norm-references/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'DELETE',
    '/api/norm-references/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/norm-references',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'POST',
    '/api/norm-references',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/priority-levels/[id]',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PUT',
    '/api/priority-levels/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/priority-levels',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'POST',
    '/api/privacy/data-subject-export',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'openapi',
  ],
  [
    'POST',
    '/api/privacy/erasure-preview',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'openapi',
  ],
  [
    'POST',
    '/api/privacy/erasure-requests',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'openapi',
  ],
  [
    'PUT',
    '/api/quality-characteristics/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'DELETE',
    '/api/quality-characteristics/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/quality-characteristics',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'POST',
    '/api/quality-characteristics',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  ['GET', '/api/ready', 'public', 'none', 'public', 'no-store', 'focused'],
  [
    'GET',
    '/api/requirement-areas/[id]/co-authors',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PUT',
    '/api/requirement-areas/[id]/co-authors',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirement-areas/[id]',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'PUT',
    '/api/requirement-areas/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'DELETE',
    '/api/requirement-areas/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirement-areas',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'POST',
    '/api/requirement-areas',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirement-categories',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'POST',
    '/api/requirement-packages/[id]/archive',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirement-packages/[id]/co-authors',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PUT',
    '/api/requirement-packages/[id]/co-authors',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/requirement-packages/[id]/reactivate',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirement-packages/[id]',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PUT',
    '/api/requirement-packages/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'DELETE',
    '/api/requirement-packages/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirement-packages',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'POST',
    '/api/requirement-packages',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/requirement-responsibility-people/verify',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/requirement-selection-questions/[id]/activate',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/requirement-selection-questions/[id]/answers/[answerId]/activate',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/requirement-selection-questions/[id]/answers/[answerId]/archive',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/requirement-selection-questions/[id]/answers/[answerId]/deactivate',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/requirement-selection-questions/[id]/answers/[answerId]/reactivate',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PUT',
    '/api/requirement-selection-questions/[id]/answers/[answerId]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'DELETE',
    '/api/requirement-selection-questions/[id]/answers/[answerId]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/requirement-selection-questions/[id]/answers',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/requirement-selection-questions/[id]/archive',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/requirement-selection-questions/[id]/deactivate',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/requirement-selection-questions/[id]/duplicate',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/requirement-selection-questions/[id]/reactivate',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirement-selection-questions/[id]',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PUT',
    '/api/requirement-selection-questions/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'DELETE',
    '/api/requirement-selection-questions/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PUT',
    '/api/requirement-selection-questions/[id]/visibility',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirement-selection-questions/matched-requirements',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirement-selection-questions',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/requirement-selection-questions',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PUT',
    '/api/requirement-statuses/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirement-statuses',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'GET',
    '/api/requirement-suggestions/[id]',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/requirement-suggestions/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/requirement-transitions/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'GET',
    '/api/requirement-types',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'GET',
    '/api/requirements-specifications/[id]/available-requirements',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirements-specifications/[id]/co-authors',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PUT',
    '/api/requirements-specifications/[id]/co-authors',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirements-specifications/[id]/deviations',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirements-specifications/[id]/exports',
    'session',
    'none',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'GET',
    '/api/requirements-specifications/[id]/items/[itemId]',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PATCH',
    '/api/requirements-specifications/[id]/items/[itemId]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirements-specifications/[id]/items',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'POST',
    '/api/requirements-specifications/[id]/items',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PATCH',
    '/api/requirements-specifications/[id]/items',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'DELETE',
    '/api/requirements-specifications/[id]/items',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/requirements-specifications/[id]/local-requirements/[localRequirementId]/graduate',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirements-specifications/[id]/local-requirements/[localRequirementId]/graduation-target-areas',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirements-specifications/[id]/local-requirements/[localRequirementId]',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PUT',
    '/api/requirements-specifications/[id]/local-requirements/[localRequirementId]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'DELETE',
    '/api/requirements-specifications/[id]/local-requirements/[localRequirementId]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/requirements-specifications/[id]/local-requirements/import/execute',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'POST',
    '/api/requirements-specifications/[id]/local-requirements/import/preview',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'POST',
    '/api/requirements-specifications/[id]/local-requirements',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirements-specifications/[id]/needs-references',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/requirements-specifications/[id]/needs-references',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PATCH',
    '/api/requirements-specifications/[id]/needs-references',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'DELETE',
    '/api/requirements-specifications/[id]/needs-references',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirements-specifications/[id]/report-output',
    'session',
    'none',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'GET',
    '/api/requirements-specifications/[id]/requirement-packages',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'PUT',
    '/api/requirements-specifications/[id]/requirement-selection-answers/[questionId]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirements-specifications/[id]/requirement-selection-answers',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PUT',
    '/api/requirements-specifications/[id]/responsible',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PATCH',
    '/api/requirements-specifications/[id]/rfi-list/areas/[areaId]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirements-specifications/[id]/rfi-list/export',
    'session',
    'none',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'PATCH',
    '/api/requirements-specifications/[id]/rfi-list/items/[questionId]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/requirements-specifications/[id]/rfi-list/lock',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirements-specifications/[id]/rfi-list',
    'session',
    'none',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'POST',
    '/api/requirements-specifications/[id]/rfi-list/unlock',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirements-specifications/[id]',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PUT',
    '/api/requirements-specifications/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'DELETE',
    '/api/requirements-specifications/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/requirements-specifications/[id]/traceability-items',
    'session',
    'none',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'GET',
    '/api/requirements-specifications',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/requirements-specifications',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/requirements/[id]/delete-draft',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'POST',
    '/api/requirements/[id]/reactivate',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'POST',
    '/api/requirements/[id]/restore',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'GET',
    '/api/requirements/[id]',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'PUT',
    '/api/requirements/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'DELETE',
    '/api/requirements/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'GET',
    '/api/requirements/[id]/versions/[version]',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'GET',
    '/api/requirements/export',
    'session',
    'none',
    'sensitive',
    'no-store',
    'openapi',
  ],
  [
    'POST',
    '/api/requirements/import/execute',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'GET',
    '/api/requirements/import/instruction',
    'session',
    'none',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'POST',
    '/api/requirements/import/preview',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'GET',
    '/api/requirements/import/schema',
    'session',
    'none',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'GET',
    '/api/requirements',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'POST',
    '/api/requirements',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'openapi',
  ],
  [
    'POST',
    '/api/rfi-question-suggestions/[id]/request-review',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/rfi-question-suggestions/[id]/resolution',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'DELETE',
    '/api/rfi-question-suggestions/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/rfi-question-suggestions',
    'session',
    'none',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'POST',
    '/api/rfi-question-suggestions',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'POST',
    '/api/rfi-questions/[id]/reactivate',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/rfi-questions/[id]',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PUT',
    '/api/rfi-questions/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'DELETE',
    '/api/rfi-questions/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/rfi-questions',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/rfi-questions',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PUT',
    '/api/specification-governance-object-types/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'DELETE',
    '/api/specification-governance-object-types/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/specification-governance-object-types',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/specification-governance-object-types',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PUT',
    '/api/specification-implementation-types/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'DELETE',
    '/api/specification-implementation-types/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/specification-implementation-types',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/specification-implementation-types',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/specification-item-deviations/[itemId]',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/specification-item-deviations/[itemId]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/specification-item-resolutions/[id]',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PUT',
    '/api/specification-lifecycle-statuses/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'DELETE',
    '/api/specification-lifecycle-statuses/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/specification-lifecycle-statuses',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/specification-lifecycle-statuses',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/specification-local-deviations/[id]/decision',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/specification-local-deviations/[id]/request-review',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/specification-local-deviations/[id]/revert-to-draft',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'GET',
    '/api/specification-local-deviations/[id]',
    'session',
    'none',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'PUT',
    '/api/specification-local-deviations/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'DELETE',
    '/api/specification-local-deviations/[id]',
    'session',
    'same-origin',
    'authenticated',
    'framework-default',
    'focused',
  ],
  [
    'POST',
    '/api/specification-local-requirements/import/execute',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
  [
    'POST',
    '/api/specification-local-requirements/import/preview',
    'session',
    'same-origin',
    'sensitive',
    'no-store',
    'focused',
  ],
] as const satisfies readonly RestOperationDeclaration[]

const MUTATING_METHODS = new Set<ExplicitRestMethod>([
  'DELETE',
  'PATCH',
  'POST',
  'PUT',
])
const EXPLICIT_METHODS = new Set<string>(EXPLICIT_REST_METHODS)
const REST_METHOD_SET = new Set<string>(REST_METHODS)
const AUTH_POLICIES = new Set<string>(['public', 'session'])
const CACHE_POLICIES = new Set<string>([
  'framework-default',
  'no-cache',
  'no-store',
])
const CONTRACT_POLICIES = new Set<string>(['focused', 'openapi'])
const CSRF_POLICIES = new Set<string>(['none', 'same-origin'])
const SENSITIVITY_POLICIES = new Set<string>([
  'authenticated',
  'public',
  'sensitive',
])
const DYNAMIC_SEGMENT = /^\[[A-Za-z][A-Za-z0-9]*\]$/
const LITERAL_SEGMENT = /^[A-Za-z0-9._~-]+$/
const LOGOUT_OPERATION = 'POST /api/auth/logout'

const UNKNOWN_POLICY: ResolvedRestPolicy = {
  auth: 'session',
  cache: 'no-store',
  contract: 'focused',
  csrf: 'none',
  method: 'GET',
  registered: false,
  sensitivity: 'sensitive',
  template: null,
}

interface CompiledOperation extends RestOperation {
  segments: readonly string[]
}

export interface RestRouteRegistry {
  operations: readonly RestOperation[]
  resolve(method: string, urlOrPath: string | URL): ResolvedRestPolicy
  resolvePath(urlOrPath: string | URL): ResolvedRestPolicy
}

export function isRestMethod(method: string): method is RestMethod {
  return REST_METHOD_SET.has(method)
}

function splitTemplate(template: string): string[] {
  return template.slice(1).split('/')
}

function normalizedPathname(urlOrPath: string | URL): string {
  let pathname: string
  if (urlOrPath instanceof URL) {
    pathname = urlOrPath.pathname
  } else if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(urlOrPath)) {
    pathname = new URL(urlOrPath).pathname
  } else {
    pathname = urlOrPath.split(/[?#]/, 1)[0] ?? ''
  }

  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '')
  return pathname
}

function splitRequestPath(urlOrPath: string | URL): string[] {
  const pathname = normalizedPathname(urlOrPath)
  if (pathname === '/') return []
  if (!pathname.startsWith('/')) return ['']
  return pathname.slice(1).split('/')
}

function isDynamicSegment(segment: string): boolean {
  return DYNAMIC_SEGMENT.test(segment)
}

function validateTemplate(template: string): readonly string[] {
  if (
    !template.startsWith('/api/') ||
    template.endsWith('/') ||
    template.includes('//') ||
    template.includes('?') ||
    template.includes('#') ||
    template.includes('%')
  ) {
    throw new Error(`Noncanonical REST route template: ${template}`)
  }

  const segments = splitTemplate(template)
  for (const segment of segments) {
    if (
      segment.length === 0 ||
      segment === '.' ||
      segment === '..' ||
      segment.startsWith('[[...') ||
      segment.startsWith('[...') ||
      ((segment.includes('[') || segment.includes(']')) &&
        !isDynamicSegment(segment)) ||
      (!isDynamicSegment(segment) && !LITERAL_SEGMENT.test(segment))
    ) {
      throw new Error(`Noncanonical REST route template: ${template}`)
    }
  }
  return segments
}

function validatePolicy(operation: RestOperation): void {
  const key = `${operation.method} ${operation.template}`
  if (
    !EXPLICIT_METHODS.has(operation.method) ||
    !AUTH_POLICIES.has(operation.auth) ||
    !CACHE_POLICIES.has(operation.cache) ||
    !CONTRACT_POLICIES.has(operation.contract) ||
    !CSRF_POLICIES.has(operation.csrf) ||
    !SENSITIVITY_POLICIES.has(operation.sensitivity)
  ) {
    throw new Error(`Invalid explicit REST operation policy: ${key}`)
  }
  const mutation = MUTATING_METHODS.has(operation.method)

  if (mutation && operation.csrf !== 'same-origin') {
    throw new Error(`REST mutation must require same-origin CSRF: ${key}`)
  }
  if (!mutation && operation.csrf !== 'none') {
    throw new Error(`Safe REST operation cannot require CSRF: ${key}`)
  }
  if (
    operation.auth === 'public' &&
    operation.csrf === 'same-origin' &&
    key !== LOGOUT_OPERATION
  ) {
    throw new Error(`Only logout may combine public auth and CSRF: ${key}`)
  }
  if (operation.sensitivity === 'sensitive' && operation.cache !== 'no-store') {
    throw new Error(`Sensitive REST response must use no-store: ${key}`)
  }
}

function structuralTemplate(segments: readonly string[]): string {
  return segments
    .map(segment => (isDynamicSegment(segment) ? '[]' : segment))
    .join('/')
}

function matches(
  operation: CompiledOperation,
  requestSegments: readonly string[],
): boolean {
  return operation.segments.every(
    (segment, index) =>
      isDynamicSegment(segment) || segment === requestSegments[index],
  )
}

function compareSpecificity(
  left: CompiledOperation,
  right: CompiledOperation,
): number {
  for (let index = 0; index < left.segments.length; index += 1) {
    const leftDynamic = isDynamicSegment(left.segments[index] ?? '')
    const rightDynamic = isDynamicSegment(right.segments[index] ?? '')
    if (leftDynamic !== rightDynamic) return leftDynamic ? 1 : -1
  }
  return left.template.localeCompare(right.template)
}

function toResolved(
  operation: RestOperation,
  method: string = operation.method,
): ResolvedRestPolicy {
  return {
    auth: operation.auth,
    cache: operation.cache,
    contract: operation.contract,
    csrf: operation.csrf,
    method,
    registered: true,
    sensitivity: operation.sensitivity,
    template: operation.template,
  }
}

const AUTH_RANK: Record<RestAuthPolicy, number> = {
  public: 0,
  session: 1,
}
const CACHE_RANK: Record<RestCachePolicy, number> = {
  'framework-default': 0,
  'no-cache': 1,
  'no-store': 2,
}
const CSRF_RANK: Record<RestCsrfPolicy, number> = {
  none: 0,
  'same-origin': 1,
}
const SENSITIVITY_RANK: Record<RestSensitivity, number> = {
  public: 0,
  authenticated: 1,
  sensitive: 2,
}

function mostRestrictive(operations: readonly RestOperation[]): RestOperation {
  const [first, ...rest] = operations
  if (!first) throw new Error('Cannot combine an empty REST operation list')

  return rest.reduce<RestOperation>(
    (policy, operation) => ({
      auth:
        AUTH_RANK[operation.auth] > AUTH_RANK[policy.auth]
          ? operation.auth
          : policy.auth,
      cache:
        CACHE_RANK[operation.cache] > CACHE_RANK[policy.cache]
          ? operation.cache
          : policy.cache,
      contract: operation.contract === 'focused' ? 'focused' : policy.contract,
      csrf:
        CSRF_RANK[operation.csrf] > CSRF_RANK[policy.csrf]
          ? operation.csrf
          : policy.csrf,
      method: policy.method,
      sensitivity:
        SENSITIVITY_RANK[operation.sensitivity] >
        SENSITIVITY_RANK[policy.sensitivity]
          ? operation.sensitivity
          : policy.sensitivity,
      template: policy.template,
    }),
    first,
  )
}

function buildSegmentCountIndex(
  operations: readonly CompiledOperation[],
): Map<number, readonly CompiledOperation[]> {
  const index = new Map<number, readonly CompiledOperation[]>()
  for (const count of new Set(
    operations.map(operation => operation.segments.length),
  )) {
    index.set(
      count,
      operations
        .filter(operation => operation.segments.length === count)
        .sort(compareSpecificity),
    )
  }
  return index
}

export function compileRestRouteRegistry(
  declarations: readonly RestOperationDeclaration[],
): RestRouteRegistry {
  const operations: CompiledOperation[] = []
  const exactKeys = new Set<string>()
  const templatesByStructure = new Map<string, string>()

  for (const declaration of declarations) {
    const [method, template, auth, csrf, sensitivity, cache, contract] =
      declaration
    const segments = validateTemplate(template)
    const operation: CompiledOperation = {
      auth,
      cache,
      contract,
      csrf,
      method,
      segments,
      sensitivity,
      template,
    }
    validatePolicy(operation)

    const exactKey = `${method} ${template}`
    if (exactKeys.has(exactKey)) {
      throw new Error(`Duplicate REST operation: ${exactKey}`)
    }
    exactKeys.add(exactKey)

    const structure = structuralTemplate(segments)
    const existingTemplate = templatesByStructure.get(structure)
    if (existingTemplate !== undefined && existingTemplate !== template) {
      throw new Error(`Ambiguous REST operation template: ${exactKey}`)
    }
    templatesByStructure.set(structure, template)
    operations.push(operation)
  }

  const byMethodAndCount = new Map<
    string,
    Map<number, readonly CompiledOperation[]>
  >()
  for (const method of new Set(operations.map(operation => operation.method))) {
    byMethodAndCount.set(
      method,
      buildSegmentCountIndex(
        operations.filter(operation => operation.method === method),
      ),
    )
  }

  const byCount = buildSegmentCountIndex(operations)

  function matchingOperations(
    urlOrPath: string | URL,
    method?: string,
  ): CompiledOperation[] {
    const segments = splitRequestPath(urlOrPath)
    const candidates =
      method === undefined
        ? byCount.get(segments.length)
        : byMethodAndCount.get(method)?.get(segments.length)
    return (candidates ?? []).filter(operation => matches(operation, segments))
  }

  function resolvePath(urlOrPath: string | URL): ResolvedRestPolicy {
    const matched = matchingOperations(urlOrPath)
    if (matched.length === 0) return { ...UNKNOWN_POLICY }

    const selectedTemplate = matched[0]?.template
    const samePath = matched.filter(
      operation => operation.template === selectedTemplate,
    )
    return toResolved(mostRestrictive(samePath))
  }

  function resolve(
    method: string,
    urlOrPath: string | URL,
  ): ResolvedRestPolicy {
    const normalizedMethod = method.toUpperCase()
    if (normalizedMethod === 'OPTIONS') {
      const pathPolicy = resolvePath(urlOrPath)
      return {
        ...pathPolicy,
        csrf: 'none',
        method: 'OPTIONS',
      }
    }

    const lookupMethod = normalizedMethod === 'HEAD' ? 'GET' : normalizedMethod
    const pathMatches = matchingOperations(urlOrPath)
    const selectedTemplate = pathMatches[0]?.template
    const operation = matchingOperations(urlOrPath, lookupMethod).find(
      candidate => candidate.template === selectedTemplate,
    )
    if (!operation) {
      return {
        ...UNKNOWN_POLICY,
        csrf: MUTATING_METHODS.has(normalizedMethod as ExplicitRestMethod)
          ? 'same-origin'
          : 'none',
        method: normalizedMethod,
      }
    }
    return toResolved(operation, normalizedMethod)
  }

  return Object.freeze({
    operations: Object.freeze(
      operations.map(({ segments: _segments, ...operation }) =>
        Object.freeze(operation),
      ),
    ),
    resolve,
    resolvePath,
  })
}

export const REST_ROUTE_REGISTRY = compileRestRouteRegistry(
  REST_OPERATION_DECLARATIONS,
)

export const REST_OPERATIONS = REST_ROUTE_REGISTRY.operations

export function resolveRestPolicy(
  request: Pick<Request, 'method' | 'url'>,
): ResolvedRestPolicy {
  return REST_ROUTE_REGISTRY.resolve(request.method, request.url)
}

export function resolveRestPathPolicy(
  urlOrPath: string | URL,
): ResolvedRestPolicy {
  return REST_ROUTE_REGISTRY.resolvePath(urlOrPath)
}
