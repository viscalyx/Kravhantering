import { describe, expect, it } from 'vitest'
import {
  executeArchivingRetention,
  previewArchivingRetention,
} from '@/lib/archiving/retention'
import {
  createSuggestion,
  getSuggestion,
} from '@/lib/dal/improvement-suggestions'
import {
  deleteDraftVersion,
  editRequirement,
  transitionStatus,
} from '@/lib/dal/requirements'
import { AssignmentBasedAuthorizationService } from '@/lib/requirements/assignment-authorization'
import {
  attachImprovementSuggestionImplementationWithAudit,
  requestImprovementSuggestionReview,
  resolveImprovementSuggestionWithAudit,
} from '@/lib/requirements/improvement-suggestion-mutations'
import { createSuggestionWorkflow } from '@/lib/requirements/service-suggestions'
import {
  createArea,
  createPublishedRequirement,
  makeRequestContext,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

describe('Suggestion implementation evidence', () => {
  const appDb = useSqlIntegrationDatabase()

  async function fixture() {
    const db = appDb()
    const area = await createArea(db)
    const requirement = await createPublishedRequirement(
      db,
      area.id,
      'Feedback subject',
    )
    const implementingVersion = await editRequirement(
      db,
      requirement.requirementId,
      {
        baseVersionId: requirement.publishedVersionId,
        baseRevisionToken: requirement.revisionToken,
        description: 'Implements feedback',
      },
    )
    const suggestion = await createSuggestion(db, {
      requirementId: requirement.requirementId,
      requirementVersionId: requirement.publishedVersionId,
      content: 'Clarify the requirement',
    })
    await requestImprovementSuggestionReview(db, suggestion.id)
    const context = await makeRequestContext()
    const resolution = {
      resolution: 1,
      resolutionMotivation: 'Clarified in the implementing version',
      resolvedBy: 'SQL Integration Actor',
      resolvedByHsaId: 'SE5560000001-sqltest1',
    }
    return {
      db,
      requirement,
      implementingVersion,
      suggestion,
      context,
      resolution,
    }
  }

  it('preserves feedback and decision while attaching evidence after publication', async () => {
    const f = await fixture()
    await resolveImprovementSuggestionWithAudit(
      f.db,
      f.suggestion.id,
      f.resolution,
      f.context,
    )
    const decision = await getSuggestion(f.db, f.suggestion.id)
    expect(decision.implementationRecordedAt).toBeNull()
    await transitionStatus(f.db, f.requirement.requirementId, 2)
    await transitionStatus(f.db, f.requirement.requirementId, 3)
    await attachImprovementSuggestionImplementationWithAudit(
      f.db,
      f.suggestion.id,
      f.implementingVersion.id,
      f.context,
    )
    const attached = await getSuggestion(f.db, f.suggestion.id)
    expect(attached).toMatchObject({
      requirementVersionId: f.requirement.publishedVersionId,
      implementingRequirementVersionId: f.implementingVersion.id,
      implementingVersionNumber: 2,
      implementingVersionStatusId: 3,
      resolution: decision.resolution,
      resolutionMotivation: decision.resolutionMotivation,
      resolvedAt: decision.resolvedAt,
      resolvedBy: decision.resolvedBy,
      resolvedByHsaId: decision.resolvedByHsaId,
    })
    expect(attached.implementationRecordedAt).toEqual(expect.any(String))
    await expect(
      attachImprovementSuggestionImplementationWithAudit(
        f.db,
        f.suggestion.id,
        f.implementingVersion.id,
        f.context,
      ),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('keeps deleted draft evidence unavailable when its version number is reused', async () => {
    const f = await fixture()
    await resolveImprovementSuggestionWithAudit(
      f.db,
      f.suggestion.id,
      {
        ...f.resolution,
        implementingRequirementVersionId: f.implementingVersion.id,
      },
      f.context,
    )
    await deleteDraftVersion(f.db, f.requirement.requirementId)
    const replacement = await editRequirement(
      f.db,
      f.requirement.requirementId,
      {
        baseVersionId: f.requirement.publishedVersionId,
        baseRevisionToken: f.requirement.revisionToken,
        description: 'Unrelated replacement draft',
      },
    )
    expect(replacement.versionNumber).toBe(2)
    const evidence = await getSuggestion(f.db, f.suggestion.id)
    expect(evidence.implementingRequirementVersionId).toBeNull()
    expect(evidence.implementationRecordedAt).toEqual(expect.any(String))
    expect(evidence.requirementVersionId).toBe(f.requirement.publishedVersionId)
  })

  it('reveals version status only to authorized readers and forbids reader attachment', async () => {
    const f = await fixture()
    await resolveImprovementSuggestionWithAudit(
      f.db,
      f.suggestion.id,
      {
        ...f.resolution,
        implementingRequirementVersionId: f.implementingVersion.id,
      },
      f.context,
    )
    const service = createSuggestionWorkflow({
      db: f.db,
      authorization: new AssignmentBasedAuthorizationService(f.db),
      logger: { info() {}, error() {} },
    })
    const reader = {
      ...f.context,
      actor: { ...f.context.actor, hsaId: 'SE5560000001-reader', roles: [] },
    }
    const list = () =>
      service.listSuggestions(reader, {
        requirementId: f.requirement.requirementId,
      })
    expect((await list()).suggestions[0]?.implementation?.version).toBeNull()
    await expect(
      service.manageSuggestion(reader, {
        operation: 'attach_implementation',
        suggestionId: f.suggestion.id,
        implementingRequirementVersionId: f.implementingVersion.id,
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(
      (
        await service.listSuggestions(f.context, {
          requirementId: f.requirement.requirementId,
        })
      ).suggestions[0]?.implementation?.version,
    ).toMatchObject({ id: f.implementingVersion.id, statusId: 1 })
    await transitionStatus(f.db, f.requirement.requirementId, 2)
    await transitionStatus(f.db, f.requirement.requirementId, 3)
    expect(
      (await list()).suggestions[0]?.implementation?.version,
    ).toMatchObject({ id: f.implementingVersion.id, statusId: 3 })
  })

  it('rejects cross-requirement references and evidence on dismissed suggestions', async () => {
    const f = await fixture()
    const other = await createPublishedRequirement(
      f.db,
      (await createArea(f.db, { prefix: 'OTH' })).id,
      'Other requirement',
    )
    await expect(
      resolveImprovementSuggestionWithAudit(
        f.db,
        f.suggestion.id,
        {
          ...f.resolution,
          implementingRequirementVersionId: other.publishedVersionId,
        },
        f.context,
      ),
    ).rejects.toMatchObject({ status: 404 })
    expect((await getSuggestion(f.db, f.suggestion.id)).resolution).toBeNull()
    await resolveImprovementSuggestionWithAudit(
      f.db,
      f.suggestion.id,
      { ...f.resolution, resolution: 2 },
      f.context,
    )
    await expect(
      attachImprovementSuggestionImplementationWithAudit(
        f.db,
        f.suggestion.id,
        f.implementingVersion.id,
        f.context,
      ),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('clears the implementation link through Admin Archiving retention while retaining evidence', async () => {
    const f = await fixture()
    await resolveImprovementSuggestionWithAudit(
      f.db,
      f.suggestion.id,
      {
        ...f.resolution,
        implementingRequirementVersionId: f.implementingVersion.id,
      },
      f.context,
    )
    await f.db.query(
      `UPDATE requirement_versions SET edited_at = '2020-01-01', status_updated_at = '2020-01-01' WHERE id = @0`,
      [f.implementingVersion.id],
    )
    const policies = await f.db.query<
      Array<{ id: number }>
    >(`INSERT INTO archiving_retention_policies
      (policy_key, information_set, action, age_days, status_condition, is_enabled, created_at, updated_at)
      OUTPUT INSERTED.id AS id
      VALUES (N'old_requirement_versions_delete', N'Implementation retention test', N'delete', 365, N'Old unused versions', 1, SYSUTCDATETIME(), SYSUTCDATETIME())`)
    const policyId = policies[0]?.id
    if (policyId == null) throw new Error('Missing retention policy')
    const preview = await previewArchivingRetention(f.db, { policyId })
    expect(preview.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectId: String(f.implementingVersion.id),
        }),
      ]),
    )
    await executeArchivingRetention(
      f.db,
      { policyId, previewToken: preview.previewToken },
      { displayName: 'SQL Integration Actor', hsaId: 'SE5560000001-sqltest1' },
    )
    const after = await getSuggestion(f.db, f.suggestion.id)
    expect(after.implementingRequirementVersionId).toBeNull()
    expect(after.implementationRecordedAt).toEqual(expect.any(String))
    expect(after.requirementVersionId).toBe(f.requirement.publishedVersionId)
  })

  it('rolls back evidence when its Action log write fails', async () => {
    const f = await fixture()
    await resolveImprovementSuggestionWithAudit(
      f.db,
      f.suggestion.id,
      f.resolution,
      f.context,
    )
    await f.db.query(
      `CREATE TRIGGER fail_implementation_audit ON action_audit_events AFTER INSERT AS BEGIN THROW 51020, 'Evidence audit failure', 1; END`,
    )
    try {
      await expect(
        attachImprovementSuggestionImplementationWithAudit(
          f.db,
          f.suggestion.id,
          f.implementingVersion.id,
          f.context,
        ),
      ).rejects.toThrow('Evidence audit failure')
    } finally {
      await f.db.query('DROP TRIGGER fail_implementation_audit')
    }
    expect(
      (await getSuggestion(f.db, f.suggestion.id)).implementationRecordedAt,
    ).toBeNull()
  })
})
