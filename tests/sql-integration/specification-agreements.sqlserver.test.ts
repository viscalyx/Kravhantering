import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  exportArchivingRetentionArchive,
  previewArchivingRetention,
} from '@/lib/archiving/retention'
import {
  createDeviation,
  createSpecificationLocalDeviation,
  deleteSpecificationLocalDeviation,
  getDeviation,
  getSpecificationLocalDeviation,
  recordDecision,
  requestReview,
  requestSpecificationLocalReview,
} from '@/lib/dal/deviations'
import { editRequirement, transitionStatus } from '@/lib/dal/requirements'
import {
  createSpecificationLocalRequirement,
  createSpecificationNeedsReference,
  deleteSpecification,
  deleteSpecificationLocalRequirement,
  linkRequirementsToSpecificationAtomically,
  listSpecificationTraceabilityItems,
  unlinkRequirementsFromSpecification,
  updateSpecificationItemFields,
  updateSpecificationLocalRequirement,
  updateSpecificationLocalRequirementFields,
  updateSpecificationNeedsReference,
} from '@/lib/dal/requirements-specifications'
import {
  executePrivacyErasure,
  previewPrivacyErasure,
} from '@/lib/privacy/erasure'
import {
  STATUS_PUBLISHED,
  STATUS_REVIEW,
} from '@/lib/requirements/status-constants.mjs'
import { createSpecificationAgreementWorkflow } from '@/lib/specifications/agreements'
import {
  createArea,
  createPublishedRequirement,
  createSpecificationFixture,
  makeRequestContext,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

function requireFixture<T>(value: T): Extract<T, object> {
  if (value == null || typeof value !== 'object')
    throw new Error('Expected an existing agreement test fixture')
  return value as Extract<T, object>
}

describe('specification agreement workflow', () => {
  const database = useSqlIntegrationDatabase()
  beforeAll(() => {
    vi.stubEnv('AUTH_OIDC_ISSUER_URL', 'https://identity.example.test')
    vi.stubEnv('AUTH_OIDC_CLIENT_ID', 'agreement-tests')
    vi.stubEnv('AUTH_OIDC_CLIENT_SECRET', 'agreement-test-client-secret')
    vi.stubEnv(
      'AUTH_OIDC_REDIRECT_URI',
      'https://example.test/api/auth/callback',
    )
    vi.stubEnv('AUTH_OIDC_POST_LOGOUT_REDIRECT_URI', 'https://example.test')
    vi.stubEnv(
      'AUTH_SESSION_COOKIE_PASSWORD',
      'agreement-test-cookie-password-at-least-32-characters',
    )
  })
  afterAll(() => vi.unstubAllEnvs())

  it('adopts exactly the compared version and preserves prior binding and needs context', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'ADOPTION')
    const area = await createArea(db)
    const requirement = await createPublishedRequirement(
      db,
      area.id,
      'Original text',
    )
    await linkRequirementsToSpecificationAtomically(db, specification.id, {
      requirementIds: [requirement.requirementId],
      needsReferenceText: 'Service continuity',
    })
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    const before = await workflow.read(context, specification.id)
    const original = requireFixture(before.currentItems[0])
    await updateSpecificationItemFields(
      db,
      Number(original.itemRef.split(':')[1]),
      {
        note: 'Needed for critical services',
        specificationItemStatusId: 4,
      },
    )
    const oldDecision = await createDeviation(db, {
      specificationItemId: Number(original.itemRef.split(':')[1]),
      motivation: 'Original exception',
    })
    await requestReview(db, oldDecision.id)
    await recordDecision(db, oldDecision.id, {
      decision: 1,
      decisionMotivation: 'Approved for the original version',
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE5560000001-reviewer',
    })
    await editRequirement(db, requirement.requirementId, {
      description: 'Revised text',
      baseVersionId: requirement.publishedVersionId,
      baseRevisionToken: requirement.revisionToken,
    })
    await transitionStatus(db, requirement.requirementId, STATUS_REVIEW)
    const published = await transitionStatus(
      db,
      requirement.requirementId,
      STATUS_PUBLISHED,
    )
    const comparison = await workflow.compare(
      context,
      specification.id,
      original.itemRef,
    )
    expect(comparison.pinned.description).toBe('Original text')
    expect(comparison.published.description).toBe('Revised text')
    expect(
      (await workflow.read(context, specification.id)).currentItems[0]
        ?.requirementVersionId,
    ).toBe(requirement.publishedVersionId)
    await workflow.mutate(context, specification.id, {
      operation: 'adopt',
      itemRef: original.itemRef,
      targetVersionId: published.id,
      reason: 'Use the clarified wording',
    })
    const after = await workflow.read(context, specification.id)
    expect(after.currentItems).toHaveLength(1)
    expect(after.currentItems[0]).toMatchObject({
      requirementVersionId: published.id,
      needsReference: 'Service continuity',
      note: 'Needed for critical services',
      specificationItemStatusId: 1,
      reassessmentRequired: true,
    })
    expect(
      after.historyItems.find(item => item.itemRef === original.itemRef),
    ).toMatchObject({
      requirementVersionId: requirement.publishedVersionId,
      specificationItemStatusId: 4,
      description: 'Original text',
    })
    expect(
      await listSpecificationTraceabilityItems(db, specification.id, [
        original.itemRef,
        requireFixture(after.currentItems[0]).itemRef,
      ]),
    ).toHaveLength(1)
    expect(await getDeviation(db, oldDecision.id)).toMatchObject({
      requirementVersionId: requirement.publishedVersionId,
      decision: 1,
    })
    await expect(
      updateSpecificationItemFields(
        db,
        Number(requireFixture(after.currentItems[0]).itemRef.split(':')[1]),
        { specificationItemStatusId: 5 },
      ),
    ).rejects.toMatchObject({ code: 'validation' })
  })

  it('establishes known content and prevents direct additions while preserving reads', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'AGREEMENT-LOCK')
    const area = await createArea(db)
    const requirement = await createPublishedRequirement(
      db,
      area.id,
      'Agreed text',
    )
    await linkRequirementsToSpecificationAtomically(db, specification.id, {
      requirementIds: [requirement.requirementId],
    })
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      reason: 'Supplier agreement signed',
      agreementReference: 'SUPPLIER-2026-1',
      effectiveDate: '2026-01-01',
    })

    const view = await workflow.read(context, specification.id)
    expect(view.establishmentStatus).toBe('established')
    expect(view.agreementReference).toBe('SUPPLIER-2026-1')
    expect(view.originalItems).toHaveLength(1)
    expect(view.currentItems).toHaveLength(1)
    await expect(
      createSpecificationLocalRequirement(db, specification.id, {
        description: 'Unagreed addition',
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
  })

  it('enforces agreement protection at alternative membership and deletion boundaries', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'ALTERNATE-LOCK')
    const area = await createArea(db)
    const requirement = await createPublishedRequirement(
      db,
      area.id,
      'Agreed text',
    )
    const local = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Local content' },
    )
    await linkRequirementsToSpecificationAtomically(db, specification.id, {
      requirementIds: [requirement.requirementId],
    })
    const context = await makeRequestContext()
    await createSpecificationAgreementWorkflow(db).mutate(
      context,
      specification.id,
      {
        operation: 'establish',
        reason: 'Signed',
        agreementReference: 'LOCK',
        effectiveDate: '2026-01-01',
      },
    )
    await expect(
      linkRequirementsToSpecificationAtomically(db, specification.id, {
        requirementIds: [requirement.requirementId],
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    await expect(
      db.transaction(manager =>
        unlinkRequirementsFromSpecification(manager, specification.id, [
          requirement.requirementId,
        ]),
      ),
    ).rejects.toMatchObject({ code: 'conflict' })
    await expect(
      deleteSpecificationLocalRequirement(db, specification.id, local.id),
    ).rejects.toMatchObject({ code: 'conflict' })
    await expect(
      deleteSpecification(db, specification.id),
    ).rejects.toMatchObject({ code: 'conflict' })
  })

  it('applies a grouped future amendment at Stockholm midnight and makes decision retries idempotent', async () => {
    const db = database()
    const specification = await createSpecificationFixture(
      db,
      'TIMED-AMENDMENT',
    )
    const local = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Original local text' },
    )
    const area = await createArea(db)
    const added = await createPublishedRequirement(
      db,
      area.id,
      'Added library text',
    )
    let now = new Date('2027-03-27T10:00:00Z')
    const workflow = createSpecificationAgreementWorkflow(db, {
      now: () => now,
    })
    const context = await makeRequestContext()
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      reason: 'Signed agreement',
      agreementReference: 'TIMING',
      effectiveDate: '2027-03-27',
    })
    const draft = await workflow.mutate(context, specification.id, {
      operation: 'prepare_amendment',
      reason: 'Clarification and new need',
      agreementReference: 'TIMING/T-01',
      effectiveDate: '2027-03-29',
      changes: [
        {
          kind: 'change_local',
          itemRef: `local:${local.id}`,
          description: 'Changed local text',
        },
        { kind: 'add_library', targetVersionId: added.publishedVersionId },
        { kind: 'add_local', description: 'New local obligation' },
      ],
    })
    expect(
      (await workflow.read(context, specification.id)).currentItems.map(
        item => item.description,
      ),
    ).toEqual(['Original local text'])
    await workflow.mutate(context, specification.id, {
      operation: 'decide_amendment',
      amendmentId: requireFixture(draft).amendmentId,
    })
    await workflow.mutate(context, specification.id, {
      operation: 'decide_amendment',
      amendmentId: requireFixture(draft).amendmentId,
    })
    now = new Date('2027-03-28T21:59:59Z')
    expect(
      (await workflow.read(context, specification.id)).currentItems.map(
        item => item.description,
      ),
    ).toEqual(['Original local text'])
    now = new Date('2027-03-28T22:00:00Z')
    const effective = await workflow.read(context, specification.id)
    expect(effective.currentItems.map(item => item.description).sort()).toEqual(
      ['Added library text', 'Changed local text', 'New local obligation'],
    )
    expect(effective.historyItems.map(item => item.description)).toEqual([
      'Original local text',
    ])
    expect(effective.originalItems.map(item => item.description)).toEqual([
      'Original local text',
    ])
    expect(effective.amendments).toHaveLength(1)
    expect(effective.amendments[0]?.status).toBe('effective')
  })

  it('requires explicit deviation cancellation and protects reserved requirements until amendment cancellation', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'CANCELLATIONS')
    const local = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Original local text' },
    )
    const context = await makeRequestContext()
    const deviation = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: local.id,
      motivation: 'Pending assessment',
    })
    await expect(
      deleteSpecificationLocalDeviation(db, deviation.id),
    ).rejects.toMatchObject({ code: 'conflict' })
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      reason: 'Signed',
      agreementReference: 'CANCEL',
      effectiveDate: '2026-01-01',
    })
    const draft = await workflow.mutate(context, specification.id, {
      operation: 'prepare_amendment',
      reason: 'Remove requirement',
      agreementReference: 'CANCEL/T1',
      effectiveDate: '2099-01-01',
      changes: [{ kind: 'remove', itemRef: `local:${local.id}` }],
    })
    await expect(
      workflow.mutate(context, specification.id, {
        operation: 'decide_amendment',
        amendmentId: requireFixture(draft).amendmentId,
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    await workflow.mutate(context, specification.id, {
      operation: 'cancel_deviation',
      itemRef: `local:${local.id}`,
      deviationId: deviation.id,
      reason: 'Requirement will be removed',
    })
    expect(
      await getSpecificationLocalDeviation(db, deviation.id),
    ).toMatchObject({
      decision: 3,
      decisionMotivation: 'Requirement will be removed',
      decidedByHsaId: context.actor.hsaId,
    })
    await expect(
      requestSpecificationLocalReview(db, deviation.id),
    ).rejects.toMatchObject({ code: 'conflict' })
    await workflow.mutate(context, specification.id, {
      operation: 'decide_amendment',
      amendmentId: requireFixture(draft).amendmentId,
    })
    await expect(
      createSpecificationLocalDeviation(db, {
        specificationLocalRequirementId: local.id,
        motivation: 'New active request',
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    await workflow.mutate(context, specification.id, {
      operation: 'cancel_amendment',
      amendmentId: requireFixture(draft).amendmentId,
      reason: 'Agreement correction',
    })
    const view = await workflow.read(context, specification.id)
    expect(view.amendments[0]?.status).toBe('cancelled')
    expect(view.currentItems.map(item => item.description)).toEqual([
      'Original local text',
    ])
    await expect(
      createSpecificationLocalDeviation(db, {
        specificationLocalRequirementId: local.id,
        motivation: 'Ordinary follow-up resumes',
      }),
    ).resolves.toHaveProperty('id')
  })

  it('requires explicit reassessment and prevents ending an agreement with future changes', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'REASSESSMENT')
    const local = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Original' },
    )
    const context = await makeRequestContext()
    let now = new Date('2027-01-01T12:00:00Z')
    const workflow = createSpecificationAgreementWorkflow(db, {
      now: () => now,
    })
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      reason: 'Signed',
      agreementReference: 'REASSESS',
      effectiveDate: '2026-12-01',
    })
    const draft = await workflow.mutate(context, specification.id, {
      operation: 'prepare_amendment',
      reason: 'Clarify',
      agreementReference: 'REASSESS/T1',
      effectiveDate: '2027-01-02',
      changes: [
        {
          kind: 'change_local',
          itemRef: `local:${local.id}`,
          description: 'Revised',
        },
      ],
    })
    await workflow.mutate(context, specification.id, {
      operation: 'decide_amendment',
      amendmentId: requireFixture(draft).amendmentId,
    })
    await expect(
      workflow.mutate(context, specification.id, {
        operation: 'end_agreement',
        reason: 'Ended',
        effectiveDate: '2027-01-01',
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    now = new Date('2027-01-02T12:00:00Z')
    const changed = requireFixture(
      (await workflow.read(context, specification.id)).currentItems[0],
    )
    await expect(
      updateSpecificationLocalRequirementFields(
        db,
        Number(changed.itemRef.split(':')[1]),
        { specificationItemStatusId: 4 },
      ),
    ).rejects.toMatchObject({ code: 'conflict' })
    await workflow.mutate(context, specification.id, {
      operation: 'reassess',
      itemRef: changed.itemRef,
      reason: 'Verification repeated against revised text',
      specificationItemStatusId: 4,
    })
    expect(
      (await workflow.read(context, specification.id)).currentItems[0],
    ).toMatchObject({
      reassessmentRequired: false,
      specificationItemStatusId: 4,
    })
    await workflow.mutate(context, specification.id, {
      operation: 'end_agreement',
      reason: 'Contract completed',
      effectiveDate: '2027-01-02',
    })
    expect(
      (await workflow.read(context, specification.id)).establishmentStatus,
    ).toBe('ended')
    await expect(
      createSpecificationLocalRequirement(db, specification.id, {
        description: 'Rewrite historical contract',
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
  })

  it('keeps migration assessment owner-only and links corrections without rewriting the cancelled original', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'ASSESSMENT')
    await db.query(
      "UPDATE requirements_specifications SET establishment_status = N'assessment' WHERE id = @0",
      [specification.id],
    )
    const owner = await makeRequestContext()
    const reviewer = {
      ...owner,
      actor: {
        ...owner.actor,
        hsaId: 'SE5560000001-reviewer',
        roles: ['Reviewer'],
      },
    }
    const workflow = createSpecificationAgreementWorkflow(db)
    await expect(
      workflow.mutate(reviewer, specification.id, {
        operation: 'confirm_editable',
        reason: 'Assume no agreement',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' })
    await expect(
      createSpecificationLocalRequirement(db, specification.id, {
        description: 'Unassessed addition',
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    await workflow.mutate(owner, specification.id, {
      operation: 'confirm_editable',
      reason: 'Confirmed working material',
    })
    const local = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Working content' },
    )
    await workflow.mutate(owner, specification.id, {
      operation: 'establish',
      reason: 'Signed',
      agreementReference: 'CORRECTION',
      effectiveDate: '2026-01-01',
    })
    const first = await workflow.mutate(owner, specification.id, {
      operation: 'prepare_amendment',
      reason: 'First proposal',
      agreementReference: 'CORRECTION/T1',
      effectiveDate: '2099-01-01',
      changes: [{ kind: 'remove', itemRef: `local:${local.id}` }],
    })
    await workflow.mutate(owner, specification.id, {
      operation: 'decide_amendment',
      amendmentId: requireFixture(first).amendmentId,
    })
    await workflow.mutate(owner, specification.id, {
      operation: 'cancel_amendment',
      amendmentId: requireFixture(first).amendmentId,
      reason: 'Correct the scope',
    })
    await workflow.mutate(owner, specification.id, {
      operation: 'prepare_amendment',
      reason: 'Keep and clarify',
      agreementReference: 'CORRECTION/T2',
      effectiveDate: '2099-01-02',
      replacesAmendmentId: requireFixture(first).amendmentId,
      changes: [
        {
          kind: 'change_local',
          itemRef: `local:${local.id}`,
          description: 'Corrected content',
        },
      ],
    })
    const view = await workflow.read(owner, specification.id)
    expect(view.amendments[0]).toMatchObject({
      status: 'cancelled',
      reason: 'First proposal',
      cancellationReason: 'Correct the scope',
    })
    expect(view.amendments[1]).toMatchObject({
      status: 'draft',
      replacesAmendmentId: requireFixture(first).amendmentId,
    })
  })

  it('protects active agreements from retention and exports their history after agreement end', async () => {
    const db = database()
    const specification = await createSpecificationFixture(
      db,
      'RETENTION-AGREEMENT',
    )
    const local = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Original retained text' },
    )
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      reason: 'Signed',
      agreementReference: 'RETENTION',
      effectiveDate: '2026-01-01',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'prepare_amendment',
      reason: 'Preserved proposal',
      agreementReference: 'RETENTION/T1',
      effectiveDate: '2099-01-01',
      changes: [{ kind: 'remove', itemRef: `local:${local.id}` }],
    })
    const policies = await db.query<
      Array<{ id: number }>
    >(`INSERT INTO archiving_retention_policies
      (policy_key, information_set, action, age_days, status_condition, is_enabled, created_at, updated_at)
      OUTPUT INSERTED.id AS id VALUES (N'obsolete_specifications_delete', N'Specifications', N'delete', 1, N'Obsolete', 1, SYSUTCDATETIME(), SYSUTCDATETIME())`)
    const policyId = requireFixture(policies[0]).id
    await db.query(
      "UPDATE requirements_specifications SET updated_at = '2000-01-01', specification_lifecycle_status_id = 1 WHERE id = @0",
      [specification.id],
    )
    expect(
      (await previewArchivingRetention(db, { policyId })).candidates,
    ).toHaveLength(0)
    await workflow.mutate(context, specification.id, {
      operation: 'end_agreement',
      reason: 'Completed',
      effectiveDate: '2026-01-02',
    })
    const preview = await previewArchivingRetention(db, { policyId })
    expect(preview.candidates).toHaveLength(1)
    const exported = await exportArchivingRetentionArchive(db, {
      policyId,
      previewToken: preview.previewToken,
    })
    expect(JSON.stringify(exported.archive)).toContain('Preserved proposal')
    expect(JSON.stringify(exported.archive)).toContain('Original retained text')
    expect(JSON.stringify(exported.archive)).not.toContain(context.actor.hsaId)
    await deleteSpecification(db, specification.id)
    expect(
      await db.query(
        'SELECT id FROM requirements_specifications WHERE id = @0',
        [specification.id],
      ),
    ).toHaveLength(0)
  })

  it('rolls back grouped changes on a source conflict and serializes competing decisions', async () => {
    const db = database()
    const specification = await createSpecificationFixture(
      db,
      'ATOMIC-AMENDMENT',
    )
    const first = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'First' },
    )
    const second = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Second' },
    )
    const owner = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(owner, specification.id, {
      operation: 'establish',
      reason: 'Signed',
      agreementReference: 'ATOMIC',
      effectiveDate: '2026-01-01',
    })
    const prepare = (changes: Array<{ kind: 'remove'; itemRef: string }>) =>
      workflow.mutate(owner, specification.id, {
        operation: 'prepare_amendment',
        reason: 'Agreed scope',
        agreementReference: 'ATOMIC/T',
        effectiveDate: '2099-01-01',
        changes,
      })
    const reserved = await prepare([
      { kind: 'remove', itemRef: `local:${second.id}` },
    ])
    const grouped = await prepare([
      { kind: 'remove', itemRef: `local:${first.id}` },
      { kind: 'remove', itemRef: `local:${second.id}` },
    ])
    await workflow.mutate(owner, specification.id, {
      operation: 'decide_amendment',
      amendmentId: requireFixture(reserved).amendmentId,
    })
    await expect(
      workflow.mutate(owner, specification.id, {
        operation: 'decide_amendment',
        amendmentId: requireFixture(grouped).amendmentId,
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    const candidateA = await prepare([
      { kind: 'remove', itemRef: `local:${first.id}` },
    ])
    const candidateB = await prepare([
      { kind: 'remove', itemRef: `local:${first.id}` },
    ])
    const results = await Promise.allSettled(
      [candidateA, candidateB].map(candidate =>
        workflow.mutate(owner, specification.id, {
          operation: 'decide_amendment',
          amendmentId: requireFixture(candidate).amendmentId,
        }),
      ),
    )
    expect(
      results.filter(result => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(
      1,
    )
    const view = await workflow.read(owner, specification.id)
    expect(view.currentItems.map(item => item.description)).toEqual([
      'First',
      'Second',
    ])
    expect(
      view.amendments.find(
        amendment => amendment.id === requireFixture(grouped).amendmentId,
      )?.status,
    ).toBe('draft')
  })

  it('anonymizes agreement actors by exact HSA identity without removing business history', async () => {
    const db = database()
    const specification = await createSpecificationFixture(
      db,
      'PRIVATE-AGREEMENT',
    )
    const owner = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(owner, specification.id, {
      operation: 'establish',
      reason: 'Signed supplier agreement',
      agreementReference: 'PRIVATE',
      effectiveDate: '2026-01-01',
    })
    if (!owner.actor.hsaId) throw new Error('Expected the owner HSA identity')
    const target = { hsaId: owner.actor.hsaId }
    const preview = await previewPrivacyErasure(db, { target })
    expect(
      preview.groups.find(
        group => group.key === 'requirements_specifications.established_by',
      )?.count,
    ).toBe(1)
    await executePrivacyErasure(db, {
      target,
      previewToken: preview.previewToken,
      actions: Object.fromEntries(
        preview.groups.map(group => [
          group.key,
          group.key === 'requirements_specifications.established_by'
            ? 'anonymize'
            : 'skip',
        ]),
      ),
    })
    expect(
      (await previewPrivacyErasure(db, { target })).groups.find(
        group => group.key === 'requirements_specifications.established_by',
      )?.count ?? 0,
    ).toBe(0)
    expect(
      (await workflow.read(owner, specification.id)).establishmentStatus,
    ).toBe('established')
  })
  it('preserves local text and approvals through editable changes and refuses active-deviation removal', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'LOCAL-HISTORY')
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    const local = await createSpecificationLocalRequirement(
      db,
      specification.id,
      {
        description: 'Original local text',
        verifiable: true,
        verificationMethod: 'Inspection',
      },
    )
    const deviation = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: local.id,
      motivation: 'Active exception',
    })
    await expect(
      deleteSpecificationLocalRequirement(db, specification.id, local.id),
    ).rejects.toMatchObject({ code: 'conflict' })
    await expect(
      updateSpecificationLocalRequirement(db, specification.id, local.id, {
        description: 'Changed text',
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    await workflow.mutate(context, specification.id, {
      operation: 'cancel_deviation',
      itemRef: `local:${local.id}`,
      deviationId: deviation.id,
      reason: 'Requirement clarified',
    })
    const successor = await updateSpecificationLocalRequirement(
      db,
      specification.id,
      local.id,
      { description: 'Changed text' },
      context.actor.hsaId,
    )
    expect(successor.id).not.toBe(local.id)
    const view = await workflow.read(context, specification.id)
    expect(view.currentItems[0]).toMatchObject({
      description: 'Changed text',
      reassessmentRequired: true,
      verificationMethod: 'Inspection',
    })
    expect(view.historyItems[0]).toMatchObject({
      description: 'Original local text',
    })
    expect(view.historyItems[0]?.validUntil).toEqual(
      view.currentItems[0]?.validFrom,
    )
    expect(
      await getSpecificationLocalDeviation(db, deviation.id),
    ).toMatchObject({ decision: 3, specificationLocalRequirementId: local.id })
    await expect(
      updateSpecificationLocalRequirementFields(db, successor.id, {
        specificationItemStatusId: 4,
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    await expect(
      updateSpecificationLocalRequirement(db, specification.id, local.id, {
        description: 'Stale edit',
      }),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('keeps the exact selected version when another publication precedes amendment decision', async () => {
    const db = database()
    const context = await makeRequestContext()
    const specification = await createSpecificationFixture(
      db,
      'PINNED-DECISION',
    )
    const area = await createArea(db)
    const requirement = await createPublishedRequirement(
      db,
      area.id,
      'Version one',
    )
    await linkRequirementsToSpecificationAtomically(db, specification.id, {
      requirementIds: [requirement.requirementId],
    })
    const workflow = createSpecificationAgreementWorkflow(db)
    const original = requireFixture(
      (await workflow.read(context, specification.id)).currentItems[0],
    )
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2026-01-01',
      reason: 'Existing agreement',
    })
    await editRequirement(db, requirement.requirementId, {
      description: 'Version two',
      baseVersionId: requirement.publishedVersionId,
      baseRevisionToken: requirement.revisionToken,
    })
    await transitionStatus(db, requirement.requirementId, STATUS_REVIEW)
    const second = await transitionStatus(
      db,
      requirement.requirementId,
      STATUS_PUBLISHED,
    )
    const proposal = await workflow.mutate(context, specification.id, {
      operation: 'prepare_amendment',
      agreementReference: 'T1',
      effectiveDate: new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Stockholm',
      }).format(new Date()),
      reason: 'Selected two',
      changes: [
        {
          kind: 'replace_library',
          itemRef: original.itemRef,
          targetVersionId: second.id,
        },
      ],
    })
    await editRequirement(db, requirement.requirementId, {
      description: 'Version three',
      baseVersionId: second.id,
      baseRevisionToken: second.revisionToken,
    })
    await transitionStatus(db, requirement.requirementId, STATUS_REVIEW)
    await transitionStatus(db, requirement.requirementId, STATUS_PUBLISHED)
    await workflow.mutate(context, specification.id, {
      operation: 'decide_amendment',
      amendmentId: requireFixture(proposal).amendmentId,
    })
    expect(
      (await workflow.read(context, specification.id)).currentItems[0]
        ?.requirementVersionId,
    ).toBe(second.id)
  })
  it('reserves a requirement through a future removal so a later re-add cannot create a second future decision', async () => {
    const db = database()
    const context = await makeRequestContext()
    const specification = await createSpecificationFixture(db, 'FUTURE-REMOVAL')
    const area = await createArea(db)
    const requirement = await createPublishedRequirement(
      db,
      area.id,
      'Reserved requirement',
    )
    await linkRequirementsToSpecificationAtomically(db, specification.id, {
      requirementIds: [requirement.requirementId],
    })
    const workflow = createSpecificationAgreementWorkflow(db, {
      now: () => new Date('2027-01-01T10:00:00Z'),
    })
    const original = requireFixture(
      (await workflow.read(context, specification.id)).currentItems[0],
    )
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      reason: 'Agreement',
      agreementReference: 'A',
      effectiveDate: '2027-01-01',
    })
    const removal = requireFixture(
      await workflow.mutate(context, specification.id, {
        operation: 'prepare_amendment',
        reason: 'Remove later',
        agreementReference: 'T1',
        effectiveDate: '2027-02-01',
        changes: [{ kind: 'remove', itemRef: original.itemRef }],
      }),
    )
    await workflow.mutate(context, specification.id, {
      operation: 'decide_amendment',
      amendmentId: removal.amendmentId,
    })
    const addition = requireFixture(
      await workflow.mutate(context, specification.id, {
        operation: 'prepare_amendment',
        reason: 'Add again later',
        agreementReference: 'T2',
        effectiveDate: '2027-03-01',
        changes: [
          {
            kind: 'add_library',
            targetVersionId: requirement.publishedVersionId,
          },
        ],
      }),
    )
    await expect(
      workflow.mutate(context, specification.id, {
        operation: 'decide_amendment',
        amendmentId: addition.amendmentId,
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
  })
  it.each(['library', 'local'] as const)(
    'keeps %s needs live through a future decision and cancellation while preserving retired context',
    async kind => {
      const db = database()
      const specification = await createSpecificationFixture(
        db,
        `LIVE-NEEDS-${kind}`,
      )
      const firstNeeds = await createSpecificationNeedsReference(
        db,
        specification.id,
        { text: 'Original need' },
      )
      const secondNeeds = await createSpecificationNeedsReference(
        db,
        specification.id,
        { text: 'Updated need' },
      )
      if (kind === 'local') {
        await createSpecificationLocalRequirement(db, specification.id, {
          description: 'Agreed text',
          needsReferenceId: firstNeeds.id,
        })
      } else {
        const area = await createArea(db)
        const requirement = await createPublishedRequirement(
          db,
          area.id,
          'Agreed text',
        )
        await linkRequirementsToSpecificationAtomically(db, specification.id, {
          requirementIds: [requirement.requirementId],
          needsReferenceId: firstNeeds.id,
        })
      }
      const context = await makeRequestContext()
      let now = new Date()
      const workflow = createSpecificationAgreementWorkflow(db, {
        now: () => now,
      })
      const original = requireFixture(
        (await workflow.read(context, specification.id)).currentItems[0],
      )
      const itemId = Number(original.itemRef.split(':')[1])
      const update =
        kind === 'local'
          ? updateSpecificationLocalRequirementFields
          : updateSpecificationItemFields
      await workflow.mutate(context, specification.id, {
        operation: 'establish',
        reason: 'Signed',
        agreementReference: 'LIVE',
        effectiveDate: '2026-01-01',
      })
      const decideRemoval = async () => {
        const draft = requireFixture(
          await workflow.mutate(context, specification.id, {
            operation: 'prepare_amendment',
            reason: 'Remove later',
            agreementReference: 'LIVE/T',
            effectiveDate: '2099-01-01',
            changes: [{ kind: 'remove', itemRef: original.itemRef }],
          }),
        )
        await workflow.mutate(context, specification.id, {
          operation: 'decide_amendment',
          amendmentId: draft.amendmentId,
        })
        return draft.amendmentId
      }
      const amendmentId = await decideRemoval()
      await update(db, itemId, {
        needsReferenceId: secondNeeds.id,
        note: 'Updated follow-up',
      })
      expect(
        (await workflow.read(context, specification.id)).currentItems[0],
      ).toMatchObject({
        needsReference: 'Updated need',
        note: 'Updated follow-up',
      })
      await updateSpecificationNeedsReference(
        db,
        specification.id,
        secondNeeds.id,
        { text: 'Renamed need' },
      )
      expect(
        (await workflow.read(context, specification.id)).currentItems[0]
          ?.needsReference,
      ).toBe('Renamed need')
      await workflow.mutate(context, specification.id, {
        operation: 'cancel_amendment',
        amendmentId,
        reason: 'Replan',
      })
      await update(db, itemId, { needsReferenceId: firstNeeds.id })
      expect(
        (await workflow.read(context, specification.id)).currentItems[0]
          ?.needsReference,
      ).toBe('Original need')
      await decideRemoval()
      await updateSpecificationNeedsReference(
        db,
        specification.id,
        firstNeeds.id,
        { text: 'Final need before retirement' },
      )
      // Move the persisted retirement boundary past before editing the shared register.
      const table =
        kind === 'local'
          ? 'specification_local_requirements'
          : 'requirements_specification_items'
      await db.query(
        `UPDATE ${table} SET valid_until = SYSUTCDATETIME() WHERE id = @0`,
        [itemId],
      )
      await updateSpecificationNeedsReference(
        db,
        specification.id,
        firstNeeds.id,
        { text: 'Register edit after retirement' },
      )
      now = new Date('2099-01-02T00:00:00Z')
      const history = await workflow.read(context, specification.id)
      expect(history.currentItems).toHaveLength(0)
      expect(history.historyItems[0]?.needsReference).toBe(
        'Final need before retirement',
      )
      expect(history.originalItems[0]?.needsReference).toBe('Original need')
    },
  )
})
