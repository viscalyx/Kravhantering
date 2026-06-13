// cSpell:words privacyofficer
import {
  type APIRequestContext,
  type APIResponse,
  request as playwrightRequest,
  type TestInfo,
} from '@playwright/test'

export const ROLE_STORAGE_STATE = {
  admin: 'test-results/auth/admin.json',
  adminOnly: 'test-results/auth/admin-only.json',
  areaCoauthor: 'test-results/auth/area-coauthor.json',
  areaOwner: 'test-results/auth/area-owner.json',
  noRoles: 'test-results/auth/no-roles.json',
  packageCoauthor: 'test-results/auth/package-coauthor.json',
  packageLead: 'test-results/auth/package-lead.json',
  privacyOfficer: 'test-results/auth/privacy-officer.json',
  reviewer: 'test-results/auth/reviewer.json',
  specificationCoauthor: 'test-results/auth/specification-coauthor.json',
  specificationResponsible: 'test-results/auth/specification-responsible.json',
} as const

export type RoleContext = keyof typeof ROLE_STORAGE_STATE

export const HSA = {
  admin: 'SE5560000001-admin1',
  areaCoauthor: 'SE5560000001-areaco1',
  areaOwner: 'SE5560000001-areaowner1',
  noRoles: 'SE5560000001-noroles1',
  packageCoauthor: 'SE5560000001-pkgco1',
  packageLead: 'SE5560000001-pkglead1',
  specificationCoauthor: 'SE5560000001-specco1',
  specificationResponsible: 'SE5560000001-specresp1',
} as const

export const STATUS_ARCHIVED = 4

const MANUAL_CASE_LINKS = {
  'AUTH-03':
    'docs/manuella-testfall.md#auth-03-anonym-api-begaran-ger-json-401',
  'AUTH-06':
    'docs/manuella-testfall.md#auth-06-admin-utan-dataskyddsroll-kan-inte-anvanda-dataskyddsflikar',
  'AUTH-07':
    'docs/manuella-testfall.md#auth-07-dataskyddsansvarig-utan-adminbehorighet',
  'AUTH-08':
    'docs/manuella-testfall.md#auth-08-anvandare-utan-roll-nekas-privilegierat-arbete',
  'AUTH-10':
    'docs/manuella-testfall.md#auth-10-behorighetsmatris-for-ansvarstilldelningar',
  'AUTH-11':
    'docs/manuella-testfall.md#auth-11-playwrightfaser-for-behorighetsroller',
} as const

export type ManualCaseId = keyof typeof MANUAL_CASE_LINKS

export interface AuthorizationFixture {
  areaId: number
  areaPrefix: string
  packageId: number
  packageName: string
  specificationId: number
  specificationName: string
  specificationSlug: string
}

export interface AuthMeResponse {
  authenticated: boolean
  hsaId: string
  roles: string[]
}

export interface RequirementAreaResponse {
  id: number
  ownerHsaId: string
  prefix: string
}

export interface RequirementPackageResponse {
  coAuthors?: { hsaId: string }[]
  id: number
  leadHsaId: string
  name: string
}

export interface SpecificationResponse {
  id: number
  name: string
  permissions: {
    canEditContent: boolean
    canManageAssignments: boolean
    canReviewDecisions: boolean
    canUseAi: boolean
  }
  uniqueId: string
}

export interface SpecificationListResponse {
  collectionPermissions: {
    canCreateSpecification: boolean
  }
  specifications: { id: number; uniqueId: string }[]
}

export interface DataSubjectExportResponse {
  sources: {
    key: string
  }[]
  subject: {
    hsaId: string
  }
}

export function referenceManualCases(
  testInfo: TestInfo,
  ...caseIds: ManualCaseId[]
): void {
  for (const caseId of caseIds) {
    testInfo.annotations.push({
      description: `${caseId}: ${MANUAL_CASE_LINKS[caseId]}`,
      type: 'manual-test-case',
    })
  }
}

function baseUrlFor(testInfo: TestInfo): string {
  return String(
    testInfo.project.use.baseURL ??
      process.env.PLAYWRIGHT_BASE_URL ??
      'http://localhost:3000',
  ).replace(/\/$/, '')
}

function originFor(baseUrl: string): string {
  return new URL(baseUrl).origin
}

export async function newRoleContext(
  testInfo: TestInfo,
  role: RoleContext,
): Promise<APIRequestContext> {
  const baseURL = baseUrlFor(testInfo)

  return playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: {
      Origin: originFor(baseURL),
      'X-Requested-With': 'XMLHttpRequest',
    },
    storageState: ROLE_STORAGE_STATE[role],
  })
}

export async function newAnonymousContext(
  testInfo: TestInfo,
): Promise<APIRequestContext> {
  const baseURL = baseUrlFor(testInfo)

  return playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: {
      Origin: originFor(baseURL),
      'X-Requested-With': 'XMLHttpRequest',
    },
    storageState: { cookies: [], origins: [] },
  })
}

export function aiGenerationBody(scope?: {
  scopeId: number
  scopeType: 'requirement_area' | 'specification'
}): Record<string, unknown> {
  return {
    locale: 'sv',
    topic: 'Behörighetskontroll som ska stoppas före AI-provider.',
    ...(scope ?? {}),
  }
}

export async function expectStatus(
  response: APIResponse,
  status: number,
  label: string,
): Promise<void> {
  if (response.status() === status) return

  throw new Error(
    `${label} returned ${response.status()} instead of ${status}: ${await response.text()}`,
  )
}

export async function expectOk(
  response: APIResponse,
  label: string,
): Promise<void> {
  if (response.ok()) return

  throw new Error(
    `${label} returned ${response.status()}: ${await response.text()}`,
  )
}

async function verifyResponsibilityPerson(
  request: APIRequestContext,
  input: {
    hsaId: string
    mode?: 'refresh' | 'reuse_local'
    purpose:
      | 'requirement_area_co_author'
      | 'requirement_area_owner'
      | 'requirement_package_co_author'
      | 'requirement_package_lead'
      | 'requirements_specification_co_author'
      | 'requirements_specification_responsible'
    scopeId?: number
  },
): Promise<void> {
  await expectOk(
    await request.post('/api/requirement-responsibility-people/verify', {
      data: {
        hsaId: input.hsaId,
        mode: input.mode ?? 'refresh',
        purpose: input.purpose,
        ...(input.scopeId ? { scopeId: input.scopeId } : {}),
      },
    }),
    `verify ${input.purpose} ${input.hsaId}`,
  )
}

function stamp(): string {
  return Date.now().toString(36).toUpperCase()
}

export async function createAuthorizationFixture(
  testInfo: TestInfo,
): Promise<AuthorizationFixture> {
  const admin = await newRoleContext(testInfo, 'admin')
  const specificationResponsible = await newRoleContext(
    testInfo,
    'specificationResponsible',
  )
  const uniqueStamp = stamp()
  const areaPrefix = `AZ${uniqueStamp.slice(-4)}`
  const specificationSlug = `AUTHZ-${uniqueStamp}`
  const specificationName = `Behörighetsmatris ${uniqueStamp}`
  const packageName = `Behörighetspaket ${uniqueStamp}`

  try {
    await verifyResponsibilityPerson(admin, {
      hsaId: HSA.areaOwner,
      purpose: 'requirement_area_owner',
    })

    const areaResponse = await admin.post('/api/requirement-areas', {
      data: {
        description: 'Playwright fixture for authorization role coverage.',
        name: `Behörighetsyta ${uniqueStamp}`,
        ownerHsaId: HSA.areaOwner,
        prefix: areaPrefix,
      },
    })
    await expectStatus(areaResponse, 201, 'create requirement area fixture')
    const area = (await areaResponse.json()) as RequirementAreaResponse

    await verifyResponsibilityPerson(admin, {
      hsaId: HSA.areaCoauthor,
      purpose: 'requirement_area_co_author',
      scopeId: area.id,
    })
    await expectOk(
      await admin.put(`/api/requirement-areas/${area.id}/co-authors`, {
        data: { coAuthorHsaIds: [HSA.areaCoauthor] },
      }),
      'assign requirement area co-author',
    )

    await verifyResponsibilityPerson(specificationResponsible, {
      hsaId: HSA.specificationResponsible,
      purpose: 'requirements_specification_responsible',
    })
    const specificationResponse = await specificationResponsible.post(
      '/api/requirements-specifications',
      {
        data: {
          businessNeedsReference:
            'Playwright fixture for assignment authorization.',
          name: specificationName,
          uniqueId: specificationSlug,
        },
      },
    )
    await expectStatus(
      specificationResponse,
      201,
      'create specification fixture',
    )
    const specification =
      (await specificationResponse.json()) as SpecificationResponse

    await verifyResponsibilityPerson(specificationResponsible, {
      hsaId: HSA.specificationCoauthor,
      purpose: 'requirements_specification_co_author',
      scopeId: specification.id,
    })
    await expectOk(
      await specificationResponsible.put(
        `/api/requirements-specifications/${specificationSlug}/co-authors`,
        {
          data: { coAuthorHsaIds: [HSA.specificationCoauthor] },
        },
      ),
      'assign specification co-author',
    )

    await verifyResponsibilityPerson(admin, {
      hsaId: HSA.admin,
      purpose: 'requirement_package_lead',
    })
    await verifyResponsibilityPerson(admin, {
      hsaId: HSA.packageLead,
      purpose: 'requirement_package_lead',
    })
    await verifyResponsibilityPerson(admin, {
      hsaId: HSA.packageCoauthor,
      purpose: 'requirement_package_co_author',
    })
    const packageResponse = await admin.post('/api/requirement-packages', {
      data: {
        coAuthorHsaIds: [HSA.packageCoauthor],
        description: 'Playwright fixture for package authorization.',
        name: packageName,
      },
    })
    await expectStatus(packageResponse, 201, 'create package fixture')
    const requirementPackage =
      (await packageResponse.json()) as RequirementPackageResponse
    await expectOk(
      await admin.put(`/api/requirement-packages/${requirementPackage.id}`, {
        data: {
          coAuthorHsaIds: [HSA.packageCoauthor],
          leadHsaId: HSA.packageLead,
        },
      }),
      'assign package lead fixture',
    )

    return {
      areaId: area.id,
      areaPrefix,
      packageId: requirementPackage.id,
      packageName,
      specificationId: specification.id,
      specificationName,
      specificationSlug,
    }
  } finally {
    await Promise.all([admin.dispose(), specificationResponsible.dispose()])
  }
}
