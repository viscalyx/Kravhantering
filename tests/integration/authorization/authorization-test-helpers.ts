// cSpell:words privacyofficer
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import {
  type APIRequestContext,
  type APIResponse,
  request as playwrightRequest,
  type TestInfo,
} from '@playwright/test'
import type { DataSource } from 'typeorm'
import { upsertRequirementResponsibilityPerson } from '@/lib/dal/requirement-responsibility-people'
import type { RequirementResponsibilityPersonRecord } from '@/lib/requirements/responsibility-person'
import { SPECIFICATION_LIFECYCLE_STATUS_MANAGEMENT_ID } from '@/lib/specifications/lifecycle-status-constants'
import {
  createSqlServerDataSource,
  getSqlServerDatabaseUrl,
  type SqlServerRuntimeEnv,
} from '@/lib/typeorm/sqlserver-config'

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

const AUTHORIZATION_RESPONSIBILITY_PEOPLE: Record<
  string,
  RequirementResponsibilityPersonRecord
> = {
  [HSA.admin]: {
    email: 'ada.admin@example.test',
    givenName: 'Ada',
    hsaId: HSA.admin,
    middleName: null,
    surname: 'Admin',
  },
  [HSA.areaCoauthor]: {
    email: 'cora.coauthor@example.test',
    givenName: 'Cora',
    hsaId: HSA.areaCoauthor,
    middleName: null,
    surname: 'CoAuthor',
  },
  [HSA.areaOwner]: {
    email: 'olle.areaowner@example.test',
    givenName: 'Olle',
    hsaId: HSA.areaOwner,
    middleName: null,
    surname: 'AreaOwner',
  },
  [HSA.packageCoauthor]: {
    email: 'paul.pkgcoauthor@example.test',
    givenName: 'Paul',
    hsaId: HSA.packageCoauthor,
    middleName: null,
    surname: 'PkgCoAuthor',
  },
  [HSA.packageLead]: {
    email: 'leo.pkglead@example.test',
    givenName: 'Leo',
    hsaId: HSA.packageLead,
    middleName: null,
    surname: 'PackageLead',
  },
  [HSA.specificationCoauthor]: {
    email: 'signe.speccoauthor@example.test',
    givenName: 'Signe',
    hsaId: HSA.specificationCoauthor,
    middleName: null,
    surname: 'SpecCoAuthor',
  },
  [HSA.specificationResponsible]: {
    email: 'petra.specresp@example.test',
    givenName: 'Petra',
    hsaId: HSA.specificationResponsible,
    middleName: null,
    surname: 'specresp',
  },
}

const MANUAL_CASE_LINKS = {
  'AUTH-03':
    'docs/governance/manuella-testfall.md#auth-03-anonym-api-begaran-ger-json-401',
  'AUTH-06':
    'docs/governance/manuella-testfall.md#auth-06-admin-utan-dataskyddsroll-kan-inte-anvanda-dataskyddsflikar',
  'AUTH-07':
    'docs/governance/manuella-testfall.md#auth-07-dataskyddsansvarig-utan-adminbehorighet',
  'AUTH-08':
    'docs/governance/manuella-testfall.md#auth-08-anvandare-utan-roll-nekas-privilegierat-arbete',
  'AUTH-10':
    'docs/governance/manuella-testfall.md#auth-10-behorighetsmatris-for-ansvarstilldelningar',
  'AUTH-11':
    'docs/governance/manuella-testfall.md#auth-11-playwrightfaser-for-behorighetsroller',
  'AUTHZ-00':
    'docs/governance/manuella-testfall.md#authz-00-fas-0-testdata-och-identiteter',
  'AUTHZ-01':
    'docs/governance/manuella-testfall.md#authz-01-ingen-global-roll-och-ingen-ansvarstilldelning',
  'AUTHZ-02': 'docs/governance/manuella-testfall.md#authz-02-kravomradesagare',
  'AUTHZ-03':
    'docs/governance/manuella-testfall.md#authz-03-kravomradesmedforfattare',
  'AUTHZ-04':
    'docs/governance/manuella-testfall.md#authz-04-kravunderlagsansvarig',
  'AUTHZ-05':
    'docs/governance/manuella-testfall.md#authz-05-kravunderlagsmedforfattare',
  'AUTHZ-06':
    'docs/governance/manuella-testfall.md#authz-06-kravpaketsansvarig',
  'AUTHZ-07':
    'docs/governance/manuella-testfall.md#authz-07-kravpaketsmedforfattare',
  'AUTHZ-08': 'docs/governance/manuella-testfall.md#authz-08-admin',
  'AUTHZ-09': 'docs/governance/manuella-testfall.md#authz-09-reviewer',
  'AUTHZ-10':
    'docs/governance/manuella-testfall.md#authz-10-dataskyddsansvarig',
  'ADMIN-10':
    'docs/governance/manuella-testfall.md#admin-10-arkiveringsgallring-kraver-dataskyddsroll',
  'ADMIN-13':
    'docs/governance/manuella-testfall.md#admin-13-byte-av-kravomradesagare-anvander-hsa-id',
  'LIFE-11':
    'docs/governance/manuella-testfall.md#life-11-detaljrapporter-finns-per-status',
  'REQ-10':
    'docs/governance/manuella-testfall.md#req-10-rapport-fran-kravlistan-fungerar',
  'SPEC-10':
    'docs/governance/manuella-testfall.md#spec-10-generera-kravunderlagsrapport',
  'SPEC-10d':
    'docs/governance/manuella-testfall.md#spec-10d-kravunderlagsrapporter-kraver-lasbehorighet',
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

export interface RequirementDetailResponse {
  id: number
  permissions: {
    allowedTransitionStatusIds: number[]
    canArchive: boolean
    canDeleteDraft: boolean
    canEdit: boolean
    canReactivate: boolean
    canRestore: boolean
  }
  uniqueId: string
}

export interface RequirementListResponse {
  requirements: Array<{
    id: number
    uniqueId: string
  }>
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

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}

  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const normalized = line.startsWith('export ')
          ? line.slice('export '.length).trim()
          : line
        const separatorIndex = normalized.indexOf('=')
        if (separatorIndex === -1) return null

        const key = normalized.slice(0, separatorIndex).trim()
        let value = normalized.slice(separatorIndex + 1).trim()
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1)
        }

        return [key, value] as const
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  )
}

function getPlaywrightSqlServerEnv(): SqlServerRuntimeEnv {
  return {
    ...readEnvFile('.env.prodlike'),
    ...readEnvFile('.env.sqlserver'),
    ...process.env,
  } as SqlServerRuntimeEnv
}

async function withPlaywrightSqlServerDataSource<T>(
  callback: (dataSource: DataSource) => Promise<T>,
): Promise<T> {
  const env = getPlaywrightSqlServerEnv()
  const dataSource = createSqlServerDataSource({
    env,
    url: getSqlServerDatabaseUrl(env),
  })

  await dataSource.initialize()
  try {
    return await callback(dataSource)
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy()
    }
  }
}

async function seedAuthorizationResponsibilityPeople() {
  await withPlaywrightSqlServerDataSource(async dataSource => {
    for (const person of Object.values(AUTHORIZATION_RESPONSIBILITY_PEOPLE)) {
      await upsertRequirementResponsibilityPerson(dataSource, person)
    }
  })
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
  areaId?: number
  mode?: 'library' | 'specification-local'
  specificationId?: number
}): Record<string, unknown> {
  return {
    locale: 'sv',
    mode: scope?.mode ?? 'library',
    need: 'Behörighetskontroll som ska stoppas före AI-provider.',
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
        mode: input.mode ?? 'reuse_local',
        purpose: input.purpose,
        ...(input.scopeId ? { scopeId: input.scopeId } : {}),
      },
    }),
    `verify ${input.purpose} ${input.hsaId}`,
  )
}

function stamp(): string {
  return `${Date.now().toString(36)}${randomUUID().slice(0, 8)}`.toUpperCase()
}

export async function createAuthorizationFixture(
  testInfo: TestInfo,
): Promise<AuthorizationFixture> {
  await seedAuthorizationResponsibilityPeople()

  const admin = await newRoleContext(testInfo, 'admin')
  const specificationResponsible = await newRoleContext(
    testInfo,
    'specificationResponsible',
  )
  const uniqueStamp = stamp()
  const areaPrefix = `AZ${uniqueStamp.slice(-8)}`
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
          specificationLifecycleStatusId:
            SPECIFICATION_LIFECYCLE_STATUS_MANAGEMENT_ID,
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
        name: packageName,
        purposeAndScope: 'Playwright fixture for package authorization.',
      },
    })
    await expectStatus(packageResponse, 201, 'create package fixture')
    const requirementPackage =
      (await packageResponse.json()) as RequirementPackageResponse
    await expectOk(
      await admin.put(`/api/requirement-packages/${requirementPackage.id}`, {
        data: {
          leadHsaId: HSA.packageLead,
        },
      }),
      'assign package lead fixture',
    )
    await expectOk(
      await admin.put(
        `/api/requirement-packages/${requirementPackage.id}/co-authors`,
        {
          data: {
            coAuthorHsaIds: [HSA.packageCoauthor],
          },
        },
      ),
      'assign package co-author fixture',
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
