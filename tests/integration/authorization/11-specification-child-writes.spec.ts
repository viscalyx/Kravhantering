import { test } from '@playwright/test'
import {
  expectOk,
  expectStatus,
  newRoleContext,
  type RequirementListResponse,
  referenceManualCases,
} from './authorization-test-helpers'

interface ChildWriteFixture {
  foreignSpecificationId: number
  localRequirementId: number
  publishedRequirementId: number
  specificationId: number
}

const AUTHORIZATION_SPECIFICATION_ID = 910400
const FOREIGN_SPECIFICATION_ID = 1

let fixture: ChildWriteFixture

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
  const responsible = await newRoleContext(testInfo, 'specificationResponsible')
  try {
    const localRequirementResponse = await responsible.post(
      `/api/requirements-specifications/${AUTHORIZATION_SPECIFICATION_ID}/local-requirements`,
      {
        data: {
          description: 'Scoped child authorization fixture.',
          verifiable: true,
          verificationMethod: 'Focused authorization route check.',
        },
      },
    )
    await expectStatus(
      localRequirementResponse,
      201,
      'create specification-local requirement fixture',
    )
    const localRequirementPayload = (await localRequirementResponse.json()) as {
      localRequirement: { id: number }
    }

    const publishedRequirementsResponse = await responsible.get(
      '/api/requirements?limit=1&statuses=3',
    )
    await expectOk(
      publishedRequirementsResponse,
      'find published requirement fixture',
    )
    const publishedRequirements =
      (await publishedRequirementsResponse.json()) as RequirementListResponse
    const publishedRequirement = publishedRequirements.requirements[0]
    if (!publishedRequirement) {
      throw new Error('No published requirement available for authorization')
    }

    fixture = {
      foreignSpecificationId: FOREIGN_SPECIFICATION_ID,
      localRequirementId: localRequirementPayload.localRequirement.id,
      publishedRequirementId: publishedRequirement.id,
      specificationId: AUTHORIZATION_SPECIFICATION_ID,
    }
  } finally {
    await responsible.dispose()
  }
})

test('AUTHZ-11: requirements-specification child writes inherit specification authorship', async ({
  page: _page,
}, testInfo) => {
  referenceManualCases(testInfo, 'AUTHZ-11')
  const responsible = await newRoleContext(testInfo, 'specificationResponsible')
  const coauthor = await newRoleContext(testInfo, 'specificationCoauthor')
  const admin = await newRoleContext(testInfo, 'admin')
  const noRoles = await newRoleContext(testInfo, 'noRoles')
  const areaAuthor = await newRoleContext(testInfo, 'areaOwner')
  const reviewer = await newRoleContext(testInfo, 'reviewer')
  const localItemRef = `local:${fixture.localRequirementId}`
  const encodedLocalItemRef = encodeURIComponent(localItemRef)
  const savedAnswerPath = `/api/requirements-specifications/${fixture.specificationId}/requirement-selection-answers/2147483000`

  try {
    for (const [label, actor] of [
      ['responsible', responsible],
      ['co-author', coauthor],
      ['Admin', admin],
    ] as const) {
      await expectOk(
        await actor.patch(
          `/api/requirements-specifications/${fixture.specificationId}/items/${encodedLocalItemRef}`,
          { data: { note: `AUTHZ-11 ${label}` } },
        ),
        `${label} requirement application update`,
      )
      await expectOk(
        await actor.put(savedAnswerPath, { data: { answerIds: [] } }),
        `${label} saved-answer replacement`,
      )
    }

    for (const [label, actor] of [
      ['unassigned actor', noRoles],
      ['requirement-area author', areaAuthor],
      ['Reviewer', reviewer],
    ] as const) {
      await expectStatus(
        await actor.patch(
          `/api/requirements-specifications/${fixture.specificationId}/items/${encodedLocalItemRef}`,
          { data: { note: `Denied ${label}` } },
        ),
        403,
        `${label} requirement application update`,
      )
      await expectStatus(
        await actor.put(savedAnswerPath, { data: { answerIds: [] } }),
        403,
        `${label} saved-answer replacement`,
      )
      await expectStatus(
        await actor.delete(
          `/api/requirements-specifications/${fixture.specificationId}/items`,
          { data: { itemRefs: [localItemRef] } },
        ),
        403,
        `${label} item-ref removal`,
      )
      await expectStatus(
        await actor.delete(
          `/api/requirements-specifications/${fixture.specificationId}/items`,
          { data: { requirementIds: [fixture.publishedRequirementId] } },
        ),
        403,
        `${label} requirement-id removal`,
      )
    }

    await expectStatus(
      await coauthor.patch(
        `/api/requirements-specifications/${fixture.foreignSpecificationId}/items/${encodedLocalItemRef}`,
        { data: { note: 'Denied foreign-parent update' } },
      ),
      403,
      'foreign specification author parent mismatch',
    )
  } finally {
    await Promise.all([
      responsible.dispose(),
      coauthor.dispose(),
      admin.dispose(),
      noRoles.dispose(),
      areaAuthor.dispose(),
      reviewer.dispose(),
    ])
  }
})
