import { describe, expect, it } from 'vitest'
import {
  exportArchivingRetentionArchive,
  previewArchivingRetention,
} from '@/lib/archiving/retention'
import {
  createDeviation,
  createDeviationForItemRef,
  createSpecificationLocalDeviation,
  getDeviation,
  getSpecificationLocalDeviation,
  recordDecision,
  recordSpecificationLocalDecision,
  requestReview,
  requestSpecificationLocalReview,
  updateSpecificationLocalDeviation,
} from '@/lib/dal/deviations'
import { editRequirement, transitionStatus } from '@/lib/dal/requirements'
import {
  createSpecificationLocalRequirement,
  createSpecificationLocalRequirementsBatch,
  createSpecificationNeedsReference,
  linkRequirementsToSpecificationAtomically,
  listSpecificationTraceabilityItems,
  updateSpecificationLocalRequirement,
  updateSpecificationLocalRequirementFields,
  updateSpecificationNeedsReference,
} from '@/lib/dal/requirements-specifications'
import { collectCompleteSpecificationOutputData } from '@/lib/reports/data/specification-output'
import { createSpecificationCsvFormatter } from '@/lib/reports/specification-csv'
import { buildSpecificationProfileReport } from '@/lib/reports/templates/specification-profile-template'
import { createRequirementApplicationMutationWorkflow } from '@/lib/requirements/requirement-application-mutations'
import { querySpecificationItemPage } from '@/lib/requirements/specification-item-page'
import {
  STATUS_PUBLISHED,
  STATUS_REVIEW,
} from '@/lib/requirements/status-constants.mjs'
import { createSpecificationAgreementWorkflow } from '@/lib/specifications/agreements'
import { requireTestValue } from '@/tests/helpers/require-test-value'
import {
  createArea,
  createPublishedRequirement,
  createSpecificationFixture,
  makeRequestContext,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

describe('whole-specification agreement contexts', () => {
  const database = useSqlIntegrationDatabase()

  it('reads net changes across successors and cancelled branches without joining separate inclusions', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'NET-HISTORY')
    await createSpecificationLocalRequirement(db, specification.id, {
      description: 'Original content',
    })
    const context = await makeRequestContext()
    let now = new Date('2030-01-01T12:00:00Z')
    const workflow = createSpecificationAgreementWorkflow(db, {
      now: () => now,
    })
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    const firstView = await workflow.read(context, specification.id)
    const first = requireTestValue(firstView.selectedAgreement)
    const original = requireTestValue(firstView.items[0])
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2030-01-01',
    })
    const b = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        value => value.state === 'draft',
      ),
    )
    const historyFromA = () =>
      workflow.history(context, specification.id, first.id, original.itemRef)
    expect((await historyFromA()).changes).toEqual([])
    await workflow.mutate(context, specification.id, {
      operation: 'save_requirement',
      agreementId: b.id,
      itemRef: original.itemRef,
      content: { description: 'Undone draft text' },
    })
    const draftItem = requireTestValue(
      (await workflow.read(context, specification.id, { agreementId: b.id }))
        .items[0],
    )
    await workflow.mutate(context, specification.id, {
      operation: 'undo_requirement',
      agreementId: b.id,
      itemRef: draftItem.itemRef,
    })
    expect((await historyFromA()).changes).toEqual([])
    await workflow.mutate(context, specification.id, {
      operation: 'save_requirement',
      agreementId: b.id,
      itemRef: original.itemRef,
      content: { description: 'Changed in B' },
    })
    await workflow.mutate(context, specification.id, {
      operation: 'confirm',
      agreementId: b.id,
    })
    const bItem = requireTestValue(
      (await workflow.read(context, specification.id)).items[0],
    )
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'C',
      effectiveDate: '2031-01-01',
    })
    const c = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        value => value.state === 'draft',
      ),
    )
    await workflow.mutate(context, specification.id, {
      operation: 'save_requirement',
      agreementId: c.id,
      itemRef: bItem.itemRef,
      content: { description: 'Cancelled change in C' },
    })
    await workflow.mutate(context, specification.id, {
      operation: 'confirm',
      agreementId: c.id,
    })
    await workflow.mutate(context, specification.id, {
      operation: 'cancel',
      agreementId: c.id,
      reason: 'Use a different agreement',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'D',
      effectiveDate: '2032-01-01',
    })
    const d = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        value => value.state === 'draft',
      ),
    )
    await workflow.mutate(context, specification.id, {
      operation: 'remove_requirement',
      agreementId: d.id,
      itemRef: bItem.itemRef,
    })
    const history = await historyFromA()
    expect(
      history.changes.map(change => [
        change.agreementReference,
        change.kind,
        change.previousAgreementReference,
      ]),
    ).toEqual([
      ['D', 'removed', 'B'],
      ['C', 'changed', 'B'],
      ['B', 'changed', 'A'],
    ])
    expect(history.previous).toBeNull()
    expect(history.ancestorAgreementIds).toEqual([first.id])
    const dHistory = await workflow.history(
      context,
      specification.id,
      d.id,
      bItem.itemRef,
    )
    expect(dHistory.changes).toEqual(history.changes)
    expect(dHistory.previous?.agreementId).toBe(b.id)
    expect(dHistory.ancestorAgreementIds).toEqual([d.id, b.id, first.id])
    await workflow.mutate(context, specification.id, {
      operation: 'confirm',
      agreementId: d.id,
    })
    now = new Date('2033-01-01T12:00:00Z')
    await workflow.read(context, specification.id)
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'E',
      effectiveDate: '2034-01-01',
    })
    const e = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        value => value.state === 'draft',
      ),
    )
    await workflow.mutate(context, specification.id, {
      operation: 'add_local',
      agreementId: e.id,
      content: { description: 'New inclusion' },
    })
    const newItem = requireTestValue(
      (await workflow.read(context, specification.id, { agreementId: e.id }))
        .items[0],
    )
    const newHistory = await workflow.history(
      context,
      specification.id,
      e.id,
      newItem.itemRef,
    )
    expect(
      newHistory.changes.map(change => [
        change.agreementReference,
        change.kind,
        change.previousAgreementReference,
      ]),
    ).toEqual([['E', 'added', 'D']])
    expect(newHistory.previous).toBeNull()
    expect((await historyFromA()).changes).toEqual(history.changes)
    const other = await createSpecificationFixture(db, 'OTHER-HISTORY')
    await expect(
      workflow.history(context, other.id, first.id, original.itemRef),
    ).rejects.toThrow('Requirement not found')
  })

  it.each(['library', 'local'])(
    'serializes competing %s requests, blocks every unresolved case, and frees cancelled content',
    async kind => {
      const db = database()
      const specification = await createSpecificationFixture(db, 'CASE-GUARD')
      if (kind === 'local') {
        await createSpecificationLocalRequirement(db, specification.id, {
          description: 'Content under review',
        })
      } else {
        const library = await createPublishedRequirement(
          db,
          (await createArea(db)).id,
          'Content under review',
        )
        await linkRequirementsToSpecificationAtomically(db, specification.id, {
          requirementIds: [library.requirementId],
        })
      }
      const context = await makeRequestContext()
      const workflow = createSpecificationAgreementWorkflow(db)
      const item = requireTestValue(
        (await workflow.read(context, specification.id)).items[0],
      )
      const create = () =>
        createDeviationForItemRef(db, {
          itemRef: item.itemRef,
          motivation: 'Concurrent request',
        })
      const outcomes = await Promise.allSettled([create(), create()])
      expect(
        outcomes.filter(outcome => outcome.status === 'fulfilled'),
      ).toHaveLength(1)
      expect(outcomes.filter(outcome => outcome.status === 'rejected')).toEqual(
        [
          expect.objectContaining({
            reason: expect.objectContaining({
              code: 'conflict',
              details: { reason: 'active_deviation_exists' },
            }),
          }),
        ],
      )
      const pending = requireTestValue(
        (await workflow.read(context, specification.id)).deviations[0],
      )
      expect(
        (await workflow.read(context, specification.id)).deviations,
      ).toHaveLength(1)
      const request =
        kind === 'local' ? requestSpecificationLocalReview : requestReview
      await request(db, pending.id)
      await expect(create()).rejects.toMatchObject({
        code: 'conflict',
        details: { reason: 'active_deviation_exists' },
      })
      expect(
        (await workflow.read(context, specification.id)).deviations[0],
      ).toMatchObject({ decision: null, isReviewRequested: 1 })
      await workflow.mutate(context, specification.id, {
        operation: 'cancel_deviation',
        itemRef: item.itemRef,
        deviationId: pending.id,
        reason: 'Request withdrawn',
      })
      await create()
      const after = await workflow.read(context, specification.id)
      expect(
        after.deviations.find(deviation => deviation.id === pending.id),
      ).toMatchObject({
        decision: 3,
        isReviewRequested: 0,
        decisionMotivation: 'Request withdrawn',
      })
      expect(
        after.deviations.filter(deviation => deviation.decision === null),
      ).toHaveLength(1)
      // Simulate an imported inconsistent timeline: a later rejected case must not hide the active one.
      const table =
        kind === 'local'
          ? 'specification_local_requirement_deviations'
          : 'deviations'
      const binding =
        kind === 'local'
          ? 'specification_local_requirement_id'
          : 'specification_item_id'
      await db.query(
        `INSERT INTO ${table} (${binding}, motivation, decision, decision_motivation, created_at, decided_at) VALUES (@0, 'Imported later rejection', 2, 'Rejected', DATEADD(second, 1, SYSUTCDATETIME()), DATEADD(second, 2, SYSUTCDATETIME()))`,
        [Number(item.itemRef.split(':')[1])],
      )
      await expect(create()).rejects.toMatchObject({
        code: 'conflict',
        details: { reason: 'active_deviation_exists' },
      })
    },
  )

  it('freezes deviation motivation and review state separately for each historical agreement', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'CASE-HISTORY')
    const local = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Shared content' },
    )
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    const created = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: local.id,
      motivation: 'Original draft motivation',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    const originalId = requireTestValue(
      (await workflow.read(context, specification.id)).selectedAgreement,
    ).id
    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm',
    }).format(new Date())
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: today,
    })
    const nextId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.state === 'draft',
      ),
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'confirm',
      agreementId: nextId,
    })
    await updateSpecificationLocalDeviation(db, created.id, {
      motivation: 'Later motivation',
    })
    await requestSpecificationLocalReview(db, created.id)
    const historical = await workflow.read(context, specification.id, {
      agreementId: originalId,
    })
    expect(historical.items[0]?.deviationStateSnapshot).toEqual([
      {
        id: created.id,
        motivation: 'Original draft motivation',
        isReviewRequested: 0,
      },
    ])
    expect(
      (await workflow.read(context, specification.id)).deviations[0],
    ).toMatchObject({ motivation: 'Later motivation', isReviewRequested: 1 })
    const history = await workflow.history(
      context,
      specification.id,
      nextId,
      `local:${local.id}`,
    )
    expect(history.previous?.item.deviationStateSnapshot).toEqual([
      {
        id: created.id,
        motivation: 'Original draft motivation',
        isReviewRequested: 0,
      },
    ])
    await workflow.mutate(context, specification.id, {
      operation: 'end',
      agreementId: nextId,
      endDate: today,
      reason: 'Term complete',
    })
    await db.query(
      "UPDATE requirements_specifications SET updated_at = '2020-01-01', specification_lifecycle_status_id = 1 WHERE id = @0",
      [specification.id],
    )
    const policies = await db.query<
      Array<{ id: number }>
    >(`INSERT INTO archiving_retention_policies
      (policy_key, information_set, action, age_days, status_condition, is_enabled, decision_reference, created_at, updated_at)
      OUTPUT INSERTED.id VALUES (N'obsolete_specifications_delete', N'Specifications', N'delete', 730, N'Obsolete', 1, N'Issue 1461', SYSUTCDATETIME(), SYSUTCDATETIME())`)
    const policyId = requireTestValue(policies[0]).id
    const preview = await previewArchivingRetention(db, { policyId })
    const archive = await exportArchivingRetentionArchive(db, {
      policyId,
      previewToken: preview.previewToken,
    })
    expect(archive.archive).toMatchObject({
      specifications: [
        expect.objectContaining({
          agreementItems: expect.arrayContaining([
            expect.objectContaining({
              specification_agreement_id: originalId,
              deviation_state_json: JSON.stringify([
                {
                  id: created.id,
                  motivation: 'Original draft motivation',
                  isReviewRequested: 0,
                },
              ]),
            }),
          ]),
        }),
      ],
    })
  })

  it('freezes needs-reference evidence before a follow-up edit activates a due successor', async () => {
    const db = database()
    const specification = await createSpecificationFixture(
      db,
      'NEEDS-ACTIVATION',
    )
    const needs = await createSpecificationNeedsReference(
      db,
      specification.id,
      { text: 'Original business need' },
    )
    await createSpecificationLocalRequirement(db, specification.id, {
      description: 'Shared requirement',
      needsReferenceId: needs.id,
    })
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    const previousId = requireTestValue(
      (await workflow.read(context, specification.id)).selectedAgreement,
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2035-01-01',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.state === 'draft',
      ),
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'confirm',
      agreementId,
    })
    await db.query(
      'UPDATE specification_agreements SET effective_at = SYSUTCDATETIME() WHERE id = @0',
      [agreementId],
    )
    await updateSpecificationNeedsReference(db, specification.id, needs.id, {
      text: 'Updated business need',
    })
    expect(
      (
        await workflow.read(context, specification.id, {
          agreementId: previousId,
        })
      ).items[0].needsReference,
    ).toBe('Original business need')
    expect(
      (await workflow.read(context, specification.id)).items[0].needsReference,
    ).toBe('Updated business need')
  })

  it('shows prior agreement content and superseded draft content with the original approved case', async () => {
    const db = database()
    const specification = await createSpecificationFixture(
      db,
      'CONTENT-HISTORY',
    )
    const local = await createSpecificationLocalRequirement(
      db,
      specification.id,
      {
        description: 'Agreement A content',
        acceptanceCriteria: 'Original criterion',
      },
    )
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2035-01-01',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.state === 'draft',
      ),
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'save_requirement',
      agreementId,
      itemRef: `local:${local.id}`,
      content: { description: 'First draft content' },
    })
    const firstDraft = (
      await workflow.read(context, specification.id, { agreementId })
    ).items[0]
    const deviation = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: Number(firstDraft.itemRef.split(':')[1]),
      motivation: 'Exception for the first draft content',
      agreementId,
    })
    await requestSpecificationLocalReview(db, deviation.id, { agreementId })
    await recordSpecificationLocalDecision(db, deviation.id, {
      decision: 1,
      decisionMotivation: 'Approved first draft',
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE5560000001-reviewer',
      agreementId,
    })
    await workflow.mutate(context, specification.id, {
      operation: 'save_requirement',
      agreementId,
      itemRef: firstDraft.itemRef,
      content: { description: 'Second draft content' },
      authorizeDeviationEndings: true,
    })
    const current = (
      await workflow.read(context, specification.id, { agreementId })
    ).items[0]
    const history = await workflow.history(
      context,
      specification.id,
      agreementId,
      current.itemRef,
    )
    expect(history.previous?.item).toMatchObject({
      description: 'Agreement A content',
      acceptanceCriteria: 'Original criterion',
      uniqueId: local.uniqueId,
    })
    expect(history.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agreementReference: 'A',
          item: expect.objectContaining({ description: 'Agreement A content' }),
        }),
        expect.objectContaining({
          agreementReference: 'B',
          item: expect.objectContaining({
            description: 'First draft content',
            itemRef: firstDraft.itemRef,
          }),
        }),
        expect.objectContaining({
          agreementReference: 'B',
          item: expect.objectContaining({
            description: 'Second draft content',
          }),
        }),
      ]),
    )
    await expect(
      workflow.history(
        context,
        specification.id,
        agreementId,
        'local:2147483647',
      ),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('keeps historical deviation signals at the frozen result when a shared case is approved later', async () => {
    const db = database()
    const specification = await createSpecificationFixture(
      db,
      'HISTORICAL-CASE-RESULT',
    )
    const local = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Unchanged shared requirement' },
    )
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    const previousId = requireTestValue(
      (await workflow.read(context, specification.id)).selectedAgreement,
    ).id
    const deviation = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: local.id,
      motivation: 'Shared case awaiting review',
    })
    await requestSpecificationLocalReview(db, deviation.id)
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2035-01-01',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.state === 'draft',
      ),
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'confirm',
      agreementId,
    })
    await db.query(
      'UPDATE specification_agreements SET effective_at = SYSUTCDATETIME() WHERE id = @0',
      [agreementId],
    )
    await workflow.read(context, specification.id)
    await recordSpecificationLocalDecision(db, deviation.id, {
      decision: 1,
      decisionMotivation: 'Approved after replacement',
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE5560000001-reviewer',
    })
    const historical = await querySpecificationItemPage(db, {
      specificationId: specification.id,
      agreementId: previousId,
    })
    expect(historical.items[0]).toMatchObject({
      hasApprovedDeviation: false,
      hasPendingDeviation: true,
    })
    const current = await querySpecificationItemPage(db, {
      specificationId: specification.id,
      agreementId,
    })
    expect(current.items[0]).toMatchObject({
      hasApprovedDeviation: true,
      hasPendingDeviation: false,
    })
    const report = await collectCompleteSpecificationOutputData(
      db,
      specification.id,
      { agreementId: previousId },
    )
    expect(report.items[0]?.deviationCounts).toMatchObject({
      approved: 0,
      pending: 1,
    })
  })

  it('keeps working local identity and approval on a no-op save and ends the approval only with an actual authorized content change', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'WORKING-EDIT')
    const local = await createSpecificationLocalRequirement(
      db,
      specification.id,
      {
        description: 'Original local content',
        acceptanceCriteria: 'Keep this criterion',
        verifiable: true,
        verificationMethod: 'Test',
      },
    )
    const context = await makeRequestContext()
    const deviation = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: local.id,
      motivation: 'Original exception',
    })
    await requestSpecificationLocalReview(db, deviation.id)
    await recordSpecificationLocalDecision(db, deviation.id, {
      decision: 1,
      decisionMotivation: 'Approved',
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE5560000001-reviewer',
    })
    const unchanged = await updateSpecificationLocalRequirement(
      db,
      specification.id,
      local.id,
      {
        description: local.description,
        acceptanceCriteria: local.acceptanceCriteria,
        verifiable: true,
        verificationMethod: 'Test',
      },
      context.actor.hsaId,
    )
    expect(unchanged.id).toBe(local.id)
    await expect(
      updateSpecificationLocalRequirement(
        db,
        specification.id,
        local.id,
        { description: 'Edited content' },
        context.actor.hsaId,
      ),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'approved_deviations' },
    })
    const changed = await updateSpecificationLocalRequirement(
      db,
      specification.id,
      local.id,
      { description: 'Edited content' },
      context.actor.hsaId,
      { authorizeDeviationEndings: true },
    )
    expect(changed).toMatchObject({
      uniqueId: local.uniqueId,
      description: 'Edited content',
      acceptanceCriteria: 'Keep this criterion',
    })
    expect(changed.id).not.toBe(local.id)
    expect(
      await getSpecificationLocalDeviation(db, deviation.id),
    ).toMatchObject({ decision: 1 })
    expect(
      (
        await createSpecificationAgreementWorkflow(db).read(
          context,
          specification.id,
        )
      ).deviationEndings,
    ).toEqual([
      expect.objectContaining({
        deviationId: deviation.id,
        endedAt: expect.any(Date),
      }),
    ])
  })

  it('requires explicit owner consent to end an approved deviation when removing working content before the first agreement', async () => {
    const db = database()
    const specification = await createSpecificationFixture(
      db,
      'WORKING-REMOVAL',
    )
    const local = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Working content' },
    )
    const context = await makeRequestContext()
    const deviation = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: local.id,
      motivation: 'Working exception',
    })
    await requestSpecificationLocalReview(db, deviation.id)
    await recordSpecificationLocalDecision(db, deviation.id, {
      decision: 1,
      decisionMotivation: 'Approved exception',
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE5560000001-reviewer',
    })
    const mutation = createRequirementApplicationMutationWorkflow({
      db,
      authorization: { assertAuthorized: async () => {} },
      logger: { info() {}, error() {} },
    })
    const input = {
      operation: 'remove' as const,
      specificationId: specification.id,
      itemRefs: [local.itemRef],
    }
    await expect(mutation.mutate(context, input)).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'approved_deviations' },
    })
    await expect(
      mutation.mutate(
        {
          ...context,
          actor: { ...context.actor, hsaId: 'SE5560000001-other' },
        },
        { ...input, authorizeDeviationEndings: true },
      ),
    ).rejects.toMatchObject({ code: 'forbidden' })
    expect(
      await mutation.mutate(context, {
        ...input,
        authorizeDeviationEndings: true,
      }),
    ).toMatchObject({ removedCount: 1 })
    expect(
      await getSpecificationLocalDeviation(db, deviation.id),
    ).toMatchObject({ decision: 1 })
    const view = await createSpecificationAgreementWorkflow(db).read(
      context,
      specification.id,
    )
    expect(view.items).toEqual([])
    expect(view.deviationEndings).toEqual([
      expect.objectContaining({
        deviationId: deviation.id,
        endedAt: expect.any(Date),
      }),
    ])
  })

  it('exports the complete selected draft with agreement identity while the current report retains the original content', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'REPORT-CONTEXT')
    const local = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Original delivery content' },
    )
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'Original agreement',
      effectiveDate: '2020-01-01',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'Extended agreement',
      effectiveDate: '2035-01-01',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.state === 'draft',
      ),
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'save_requirement',
      agreementId,
      itemRef: local.itemRef,
      content: { description: 'Extended delivery content' },
    })
    await workflow.mutate(context, specification.id, {
      operation: 'add_local',
      agreementId,
      content: { description: 'Other draft content' },
    })
    const selected = await collectCompleteSpecificationOutputData(
      db,
      specification.id,
      { agreementId },
    )
    expect(selected.agreement).toMatchObject({
      agreementReference: 'Extended agreement',
      effectiveDate: '2035-01-01',
      state: 'draft',
    })
    expect(selected.items.map(item => item.description)).toEqual([
      'Extended delivery content',
      'Other draft content',
    ])
    const csv = createSpecificationCsvFormatter('full', 'en')
    expect(csv.serializeRow(requireTestValue(selected.items[0]))).toContain(
      'Extended agreement',
    )
    expect(
      buildSpecificationProfileReport(selected, 'progress', 'en').sections,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'specification-cover',
          agreement: selected.agreement,
        }),
      ]),
    )
    const current = await collectCompleteSpecificationOutputData(
      db,
      specification.id,
    )
    expect(current.agreement?.agreementReference).toBe('Original agreement')
    expect(current.items.map(item => item.description)).toEqual([
      'Original delivery content',
    ])
  })

  it('accepts a deviation in its upcoming context but rejects a request sent from a previous agreement sharing the same content', async () => {
    const db = database()
    const specification = await createSpecificationFixture(
      db,
      'DEVIATION-CONTEXT',
    )
    const local = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Shared exact content' },
    )
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    const previousId = requireTestValue(
      (await workflow.read(context, specification.id)).selectedAgreement,
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2035-01-01',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.state === 'draft',
      ),
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'confirm',
      agreementId,
    })
    const deviation = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: local.id,
      agreementId,
      motivation: 'Upcoming case',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'cancel_deviation',
      agreementId,
      itemRef: local.itemRef,
      deviationId: deviation.id,
      reason: 'Resolved before activation',
    })
    await db.query(
      'UPDATE specification_agreements SET effective_at = DATEADD(second, -1, SYSUTCDATETIME()) WHERE id = @0',
      [agreementId],
    )
    await workflow.read(context, specification.id)
    await expect(
      createSpecificationLocalDeviation(db, {
        specificationLocalRequirementId: local.id,
        agreementId: previousId,
        motivation: 'Stale history request',
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    const currentCase = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: local.id,
      agreementId,
      motivation: 'Current request',
    })
    await requestSpecificationLocalReview(db, currentCase.id)
    const decision = {
      agreementId: previousId,
      decision: 1,
      decisionMotivation: 'Approve exact content',
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE5560000001-reviewer',
    }
    await expect(
      recordSpecificationLocalDecision(db, currentCase.id, decision),
    ).rejects.toMatchObject({ code: 'conflict' })
    await recordSpecificationLocalDecision(db, currentCase.id, {
      ...decision,
      agreementId,
    })
    expect(
      await getSpecificationLocalDeviation(db, currentCase.id),
    ).toMatchObject({ decision: 1 })
  })

  it('removes a mixed selection only from the selected draft and rolls back every removal when one requirement has a pending deviation', async () => {
    const db = database()
    const specification = await createSpecificationFixture(
      db,
      'MIXED-DRAFT-REMOVE',
    )
    const library = await createPublishedRequirement(
      db,
      (await createArea(db)).id,
      'Library member',
    )
    await linkRequirementsToSpecificationAtomically(db, specification.id, {
      requirementIds: [library.requirementId],
    })
    const local = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Local member' },
    )
    const context = await makeRequestContext()
    const agreements = createSpecificationAgreementWorkflow(db)
    await agreements.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    await agreements.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2035-01-01',
    })
    const agreementId = requireTestValue(
      (await agreements.read(context, specification.id)).agreements.find(
        agreement => agreement.state === 'draft',
      ),
    ).id
    const original = await agreements.read(context, specification.id, {
      agreementId,
    })
    const mutation = createRequirementApplicationMutationWorkflow({
      db,
      authorization: { assertAuthorized: async () => {} },
      logger: { info() {}, error() {} },
    })
    const input = {
      operation: 'remove' as const,
      specificationId: specification.id,
      agreementId,
      itemRefs: original.items.map(item => item.itemRef),
    }
    const deviation = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: local.id,
      motivation: 'Must cancel first',
    })
    await expect(mutation.mutate(context, input)).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'active_deviations' },
    })
    expect(
      (
        await agreements.read(context, specification.id, { agreementId })
      ).items.every(item => !item.isRemoved),
    ).toBe(true)
    await agreements.mutate(context, specification.id, {
      operation: 'cancel_deviation',
      agreementId,
      itemRef: local.itemRef,
      deviationId: deviation.id,
      reason: 'Change the content',
    })
    expect(await mutation.mutate(context, input)).toMatchObject({
      removedCount: 2,
      removedLibraryCount: 1,
      removedSpecificationLocalCount: 1,
    })
    expect(
      (
        await agreements.read(context, specification.id, { agreementId })
      ).items.every(item => item.isRemoved),
    ).toBe(true)
    expect(
      (await agreements.read(context, specification.id)).items.every(
        item => !item.isRemoved,
      ),
    ).toBe(true)
    await expect(mutation.mutate(context, input)).rejects.toMatchObject({
      code: 'conflict',
    })
  })

  it('rechecks deviations raised after a draft edit before confirming its replacement', async () => {
    const db = database()
    const specification = await createSpecificationFixture(
      db,
      'CONFIRM-CASE-RACE',
    )
    const original = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Current content' },
    )
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2035-01-01',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.state === 'draft',
      ),
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'save_requirement',
      agreementId,
      itemRef: original.itemRef,
      content: { description: 'Replacement content' },
    })
    const deviation = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: original.id,
      motivation: 'Requested after the draft edit',
    })
    await expect(
      workflow.mutate(context, specification.id, {
        operation: 'confirm',
        agreementId,
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'active_deviations' },
    })
    await requestSpecificationLocalReview(db, deviation.id)
    await recordSpecificationLocalDecision(db, deviation.id, {
      decision: 1,
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE5560000001-reviewer',
      decisionMotivation: 'Approved current content',
    })
    await expect(
      workflow.mutate(context, specification.id, {
        operation: 'confirm',
        agreementId,
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'approved_deviations' },
    })
    await workflow.mutate(context, specification.id, {
      operation: 'confirm',
      agreementId,
      authorizeDeviationEndings: true,
    })
    const upcoming = await workflow.read(context, specification.id, {
      agreementId,
    })
    expect(upcoming.selectedAgreement?.state).toBe('upcoming')
    expect(upcoming.deviationEndings).toEqual([
      expect.objectContaining({
        deviationId: deviation.id,
        itemRef: original.itemRef,
        endedAt: null,
        cancelledAt: null,
      }),
    ])
    expect(
      await getSpecificationLocalDeviation(db, deviation.id),
    ).toMatchObject({ decision: 1 })
  })

  it('creates an imported local requirement batch only in the selected agreement draft', async () => {
    const db = database()
    const specification = await createSpecificationFixture(
      db,
      'LOCAL-BATCH-DRAFT',
    )
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2035-01-01',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.state === 'draft',
      ),
    ).id
    const created = await createSpecificationLocalRequirementsBatch(
      db,
      specification.id,
      [
        { description: 'Imported first', acceptanceCriteria: 'First criteria' },
        {
          description: 'Imported second',
          verifiable: true,
          verificationMethod: 'Second method',
        },
      ],
      { agreementId, actorHsaId: context.actor.hsaId, maxGroupSize: 1 },
    )
    expect(created).toHaveLength(2)
    expect(created[0]).toMatchObject({
      description: 'Imported first',
      acceptanceCriteria: 'First criteria',
    })
    expect(created[1]).toMatchObject({
      description: 'Imported second',
      verificationMethod: 'Second method',
    })
    expect((await workflow.read(context, specification.id)).items).toHaveLength(
      0,
    )
    const draft = await workflow.read(context, specification.id, {
      agreementId,
    })
    expect(draft.items.map(item => item.changeKind)).toEqual(['added', 'added'])
    await workflow.mutate(context, specification.id, {
      operation: 'discard',
      agreementId,
    })
    expect((await workflow.read(context, specification.id)).items).toHaveLength(
      0,
    )
  })

  it('adds a library selection and its needs reference atomically to the selected draft through the ordinary linking interface', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'BULK-DRAFT')
    const area = await createArea(db)
    const first = await createPublishedRequirement(
      db,
      area.id,
      'First selected library requirement',
    )
    const second = await createPublishedRequirement(
      db,
      area.id,
      'Second selected library requirement',
    )
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2035-01-01',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.state === 'draft',
      ),
    ).id
    const count = await linkRequirementsToSpecificationAtomically(
      db,
      specification.id,
      {
        agreementId,
        requirementIds: [first.requirementId, second.requirementId],
        needsReferenceText: 'Shared proposed need',
      },
    )
    expect(count).toBe(2)
    const draft = await workflow.read(context, specification.id, {
      agreementId,
    })
    expect(draft.items).toHaveLength(2)
    expect(draft.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requirementVersionId: first.publishedVersionId,
          needsReference: 'Shared proposed need',
          changeKind: 'added',
        }),
        expect.objectContaining({
          requirementVersionId: second.publishedVersionId,
          needsReference: 'Shared proposed need',
          changeKind: 'added',
        }),
      ]),
    )
    expect((await workflow.read(context, specification.id)).items).toHaveLength(
      0,
    )
    await workflow.mutate(context, specification.id, {
      operation: 'confirm',
      agreementId,
    })
    await expect(
      linkRequirementsToSpecificationAtomically(db, specification.id, {
        agreementId,
        requirementIds: [first.requirementId],
        needsReferenceText: 'Must not be created',
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
  })

  it('ends an approved working-set deviation only with owner consent when adopting a newer library version before the first agreement', async () => {
    const db = database()
    const specification = await createSpecificationFixture(
      db,
      'WORKING-ADOPTION',
    )
    const library = await createPublishedRequirement(
      db,
      (await createArea(db)).id,
      'Original working content',
    )
    await linkRequirementsToSpecificationAtomically(db, specification.id, {
      requirementIds: [library.requirementId],
    })
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    const original = requireTestValue(
      (await workflow.read(context, specification.id)).items[0],
    )
    const metadata = await workflow.read(context, specification.id, {
      itemRefs: [],
    })
    expect(metadata.items).toEqual([])
    expect(metadata.deviations).toEqual([])
    expect(metadata.selectedAgreement).toBeNull()
    const deviation = await createDeviation(db, {
      specificationItemId: Number(original.itemRef.split(':')[1]),
      motivation: 'Original exception',
    })
    await requestReview(db, deviation.id)
    await recordDecision(db, deviation.id, {
      decision: 1,
      decisionMotivation: 'Approved original content',
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE5560000001-reviewer',
    })
    await editRequirement(db, library.requirementId, {
      description: 'New published content',
      baseVersionId: library.publishedVersionId,
      baseRevisionToken: library.revisionToken,
    })
    await transitionStatus(db, library.requirementId, STATUS_REVIEW)
    const published = await transitionStatus(
      db,
      library.requirementId,
      STATUS_PUBLISHED,
    )
    const input = {
      operation: 'adopt' as const,
      itemRef: original.itemRef,
      targetVersionId: published.id,
    }
    await expect(
      workflow.mutate(context, specification.id, input),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'approved_deviations' },
    })
    const result = await workflow.mutate(context, specification.id, {
      ...input,
      authorizeDeviationEndings: true,
    })
    const view = await workflow.read(context, specification.id)
    expect(result).toMatchObject({
      itemRef: requireTestValue(view.items[0]).itemRef,
    })
    expect(view.items[0]).toMatchObject({
      uniqueId: original.uniqueId,
      description: 'New published content',
      specificationItemStatusId: 1,
    })
    expect(view.deviationEndings).toEqual([
      expect.objectContaining({
        agreementId: null,
        deviationId: deviation.id,
        endedAt: expect.any(Date),
      }),
    ])
    expect(await getDeviation(db, deviation.id)).toMatchObject({ decision: 1 })
  })

  it('rejects follow-up submitted from a previous agreement even when the same content continues in the current agreement', async () => {
    const db = database()
    const specification = await createSpecificationFixture(
      db,
      'FOLLOWUP-CONTEXT',
    )
    const local = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Unchanged shared content' },
    )
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm',
    }).format(new Date())
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    const originalId = requireTestValue(
      (await workflow.read(context, specification.id)).selectedAgreement,
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: today,
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.state === 'draft',
      ),
    ).id
    await expect(
      updateSpecificationLocalRequirementFields(
        db,
        local.id,
        { note: 'Draft cannot change current follow-up' },
        { agreementId },
      ),
    ).rejects.toMatchObject({ code: 'conflict' })
    await workflow.mutate(context, specification.id, {
      operation: 'confirm',
      agreementId,
    })
    await expect(
      updateSpecificationLocalRequirementFields(
        db,
        local.id,
        { note: 'Stale history editor' },
        { agreementId: originalId },
      ),
    ).rejects.toMatchObject({ code: 'conflict' })
    await updateSpecificationLocalRequirementFields(
      db,
      local.id,
      { note: 'Current follow-up', specificationItemStatusId: 4 },
      { agreementId },
    )
    expect(
      (await workflow.read(context, specification.id)).items[0],
    ).toMatchObject({ note: 'Current follow-up', specificationItemStatusId: 4 })
    expect(
      (
        await workflow.read(context, specification.id, {
          agreementId: originalId,
        })
      ).items[0],
    ).toMatchObject({ note: null, specificationItemStatusId: 1 })
  })

  it('retains exact agreement corrections and registration information without truncating long references or descriptions', async () => {
    const db = database()
    const specification = await createSpecificationFixture(
      db,
      'CORRECTION-HISTORY',
    )
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    const reference = 'Original '.padEnd(400, 'A')
    const description = 'Original description '.repeat(250)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: reference,
      effectiveDate: '2020-01-01',
      description,
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).selectedAgreement,
    ).id
    const correctedReference = 'Corrected '.padEnd(400, 'B')
    const correctedDescription = 'Corrected description '.repeat(250).trim()
    await workflow.mutate(context, specification.id, {
      operation: 'correct',
      agreementId,
      agreementReference: correctedReference,
      effectiveDate: '2020-01-01',
      description: correctedDescription,
    })
    const view = await workflow.read(context, specification.id)
    expect(view.selectedAgreement).toMatchObject({
      description: correctedDescription,
      createdAt: expect.any(Date),
      createdBy: context.actor.displayName,
      confirmedBy: context.actor.displayName,
    })
    expect(view.corrections).toEqual([
      expect.objectContaining({
        agreementId,
        oldAgreementReference: reference,
        newAgreementReference: correctedReference,
        oldEffectiveDate: '2020-01-01',
        newEffectiveDate: '2020-01-01',
        oldDescription: description.trim(),
        newDescription: correctedDescription,
        correctedAt: expect.any(Date),
        correctedBy: context.actor.displayName,
      }),
    ])
    await workflow.mutate(context, specification.id, {
      operation: 'correct',
      agreementId,
      agreementReference: correctedReference,
      effectiveDate: '2020-01-01',
      description: correctedDescription,
    })
    expect(
      (await workflow.read(context, specification.id)).corrections,
    ).toHaveLength(1)
  })

  it('requires pending cancellation and owner consent before undoing draft-only approved content', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'UNDO-CASE')
    const original = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Original' },
    )
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2035-01-01',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.state === 'draft',
      ),
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'save_requirement',
      agreementId,
      itemRef: original.itemRef,
      content: { description: 'Draft content' },
    })
    const item = requireTestValue(
      (await workflow.read(context, specification.id, { agreementId }))
        .items[0],
    )
    const deviation = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: Number(item.itemRef.split(':')[1]),
      motivation: 'Review draft content',
    })
    await expect(
      workflow.mutate(context, specification.id, {
        operation: 'undo_requirement',
        agreementId,
        itemRef: item.itemRef,
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'active_deviations' },
    })
    await requestSpecificationLocalReview(db, deviation.id)
    await recordSpecificationLocalDecision(db, deviation.id, {
      decision: 1,
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE5560000001-reviewer',
      decisionMotivation: 'Approved for the draft content',
    })
    await expect(
      workflow.mutate(context, specification.id, {
        operation: 'undo_requirement',
        agreementId,
        itemRef: item.itemRef,
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'approved_deviations' },
    })
    await workflow.mutate(context, specification.id, {
      operation: 'undo_requirement',
      agreementId,
      itemRef: item.itemRef,
      authorizeDeviationEndings: true,
    })
    const restored = await workflow.read(context, specification.id, {
      agreementId,
    })
    expect(restored.items[0]).toMatchObject({
      itemRef: original.itemRef,
      description: 'Original',
    })
    expect(restored.deviationEndings).toEqual([
      expect.objectContaining({
        deviationId: deviation.id,
        endedAt: expect.any(Date),
        cancelledAt: null,
      }),
    ])
    expect(
      await getSpecificationLocalDeviation(db, deviation.id),
    ).toMatchObject({ decision: 1, requirementDescription: 'Draft content' })
  })

  it('reserves replaced content only while a confirmed upcoming agreement exists', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'RESERVATION')
    const original = await createSpecificationLocalRequirement(
      db,
      specification.id,
      {
        description: 'Current content',
      },
    )
    const unchanged = await createSpecificationLocalRequirement(
      db,
      specification.id,
      {
        description: 'Shared content',
      },
    )
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2035-01-01',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.state === 'draft',
      ),
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'save_requirement',
      agreementId,
      itemRef: original.itemRef,
      content: { description: 'Upcoming content' },
    })
    const replacement = requireTestValue(
      (
        await workflow.read(context, specification.id, { agreementId })
      ).items.find(item => item.description === 'Upcoming content'),
    )
    await workflow.mutate(context, specification.id, {
      operation: 'confirm',
      agreementId,
    })
    await expect(
      createSpecificationLocalDeviation(db, {
        specificationLocalRequirementId: original.id,
        motivation: 'Old content',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'binding_reserved' },
    })
    await expect(
      createSpecificationLocalDeviation(db, {
        specificationLocalRequirementId: Number(
          replacement.itemRef.split(':')[1],
        ),
        motivation: 'Upcoming content',
      }),
    ).resolves.toMatchObject({ id: expect.any(Number) })
    await expect(
      createSpecificationLocalDeviation(db, {
        specificationLocalRequirementId: unchanged.id,
        motivation: 'Unchanged content',
      }),
    ).resolves.toMatchObject({ id: expect.any(Number) })
    await workflow.mutate(context, specification.id, {
      operation: 'cancel',
      agreementId,
      reason: 'Replacement abandoned',
    })
    await expect(
      createSpecificationLocalDeviation(db, {
        specificationLocalRequirementId: original.id,
        motivation: 'Current content is available again',
      }),
    ).resolves.toMatchObject({ id: expect.any(Number) })
  })

  it('pages and filters the explicitly selected agreement content and freezes historical follow-up in the ordinary list', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'SELECTED-LIST')
    const local = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Original list content' },
    )
    await updateSpecificationLocalRequirementFields(db, local.id, {
      specificationItemStatusId: 4,
    })
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm',
    }).format(new Date())
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    const originalId = requireTestValue(
      (await workflow.read(context, specification.id)).selectedAgreement,
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: today,
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.state === 'draft',
      ),
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'save_requirement',
      agreementId,
      itemRef: local.itemRef,
      content: { description: 'Changed list content' },
    })
    const draft = await querySpecificationItemPage(db, {
      specificationId: specification.id,
      agreementId,
      limit: 1,
    })
    expect(draft.items.map(item => item.version?.description)).toEqual([
      'Changed list content',
    ])
    expect(draft.items[0]).toMatchObject({
      changeDate: today,
      changeKind: 'changed',
    })
    expect(draft.pagination.hasMore).toBe(false)
    expect(
      (
        await querySpecificationItemPage(db, {
          specificationId: specification.id,
        })
      ).items.map(item => item.version?.description),
    ).toEqual(['Original list content'])
    await workflow.mutate(context, specification.id, {
      operation: 'confirm',
      agreementId,
    })
    const previous = await querySpecificationItemPage(db, {
      specificationId: specification.id,
      agreementId: originalId,
      filters: { specificationItemStatusIds: [4] },
    })
    expect(previous.items.map(item => item.version?.description)).toEqual([
      'Original list content',
    ])
    expect(previous.items[0]?.specificationItemStatusId).toBe(4)
    expect(
      (
        await querySpecificationItemPage(db, {
          specificationId: specification.id,
          filters: { specificationItemStatusIds: [1] },
        })
      ).items.map(item => item.version?.description),
    ).toEqual(['Changed list content'])
    const other = await createSpecificationFixture(db, 'OTHER-LIST')
    await expect(
      querySpecificationItemPage(db, {
        specificationId: other.id,
        agreementId,
      }),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('compares and adopts a newer published library version in a draft while preserving the current pinned identity', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'DRAFT-ADOPTION')
    const library = await createPublishedRequirement(
      db,
      (await createArea(db)).id,
      'Original published content',
    )
    await linkRequirementsToSpecificationAtomically(db, specification.id, {
      requirementIds: [library.requirementId],
    })
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    const original = requireTestValue(
      (await workflow.read(context, specification.id)).items[0],
    )
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2035-01-01',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.state === 'draft',
      ),
    ).id
    await editRequirement(db, library.requirementId, {
      description: 'New published content',
      acceptanceCriteria: 'Complete new criteria',
      baseVersionId: library.publishedVersionId,
      baseRevisionToken: library.revisionToken,
    })
    await transitionStatus(db, library.requirementId, STATUS_REVIEW)
    const published = await transitionStatus(
      db,
      library.requirementId,
      STATUS_PUBLISHED,
    )
    const comparison = await workflow.compare(
      context,
      specification.id,
      original.itemRef,
      { agreementId },
    )
    expect(comparison.pinned.description).toBe('Original published content')
    expect(comparison.published).toMatchObject({
      id: published.id,
      description: 'New published content',
      acceptanceCriteria: 'Complete new criteria',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'adopt',
      agreementId,
      itemRef: original.itemRef,
      targetVersionId: published.id,
    })
    const draft = await workflow.read(context, specification.id, {
      agreementId,
    })
    expect(draft.items[0]).toMatchObject({
      uniqueId: original.uniqueId,
      requirementId: library.requirementId,
      requirementVersionId: published.id,
      description: 'New published content',
      changeDate: '2035-01-01',
      specificationItemStatusId: 1,
      newerPublishedVersionId: null,
    })
    expect(
      (await workflow.read(context, specification.id)).items[0],
    ).toMatchObject({
      requirementVersionId: library.publishedVersionId,
      description: 'Original published content',
    })
  })

  it.each([false, true])(
    'ends a current agreement and extends without reviving approvals, undo removal: %s',
    async undoRemoval => {
      const db = database()
      const specification = await createSpecificationFixture(
        db,
        `END-EXTEND-${undoRemoval ? 'UNDO' : 'DIRECT'}`,
      )
      const local = await createSpecificationLocalRequirement(
        db,
        specification.id,
        { description: 'Previously deviated content' },
      )
      const verified = await createSpecificationLocalRequirement(
        db,
        specification.id,
        { description: 'Previously verified content' },
      )
      await updateSpecificationLocalRequirementFields(db, verified.id, {
        specificationItemStatusId: 4,
        note: 'Verification evidence',
      })
      const deviation = await createSpecificationLocalDeviation(db, {
        specificationLocalRequirementId: local.id,
        motivation: 'Original exception',
      })
      await requestSpecificationLocalReview(db, deviation.id)
      await recordSpecificationLocalDecision(db, deviation.id, {
        decision: 1,
        decisionMotivation: 'Original approval',
        decidedBy: 'Reviewer',
        decidedByHsaId: 'SE5560000001-reviewer',
      })
      await updateSpecificationLocalRequirementFields(db, local.id, {
        specificationItemStatusId: 5,
      })
      const context = await makeRequestContext()
      const workflow = createSpecificationAgreementWorkflow(db)
      const today = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Stockholm',
      }).format(new Date())
      await workflow.mutate(context, specification.id, {
        operation: 'establish',
        agreementReference: 'A',
        effectiveDate: '2020-01-01',
      })
      const agreementId = requireTestValue(
        (await workflow.read(context, specification.id)).selectedAgreement,
      ).id
      await workflow.mutate(context, specification.id, {
        operation: 'create_draft',
        agreementReference: 'Unwanted draft',
        effectiveDate: '2035-01-01',
      })
      const pendingId = requireTestValue(
        (await workflow.read(context, specification.id)).agreements.find(
          agreement => agreement.state === 'draft',
        ),
      ).id
      await expect(
        workflow.mutate(context, specification.id, {
          operation: 'end',
          agreementId,
          endDate: today,
          reason: 'Term complete',
        }),
      ).rejects.toMatchObject({
        code: 'conflict',
        details: { reason: 'pending_agreement' },
      })
      await workflow.mutate(context, specification.id, {
        operation: 'discard',
        agreementId: pendingId,
      })
      await workflow.mutate(context, specification.id, {
        operation: 'end',
        agreementId,
        endDate: today,
        reason: 'Term complete',
      })
      const ended = await workflow.read(context, specification.id)
      expect(ended.selectedAgreement?.state).toBe('ended')
      expect(ended.canFollowUp).toBe(false)
      expect(ended.deviationEndings[0]).toMatchObject({
        deviationId: deviation.id,
        endedAt: expect.any(Date),
      })
      await expect(
        createSpecificationLocalDeviation(db, {
          specificationLocalRequirementId: local.id,
          motivation: 'Late request',
        }),
      ).rejects.toMatchObject({ code: 'conflict' })
      await workflow.mutate(context, specification.id, {
        operation: 'create_draft',
        agreementReference: 'Short extension',
        effectiveDate: today,
      })
      const extensionId = requireTestValue(
        (await workflow.read(context, specification.id)).selectedAgreement,
      ).id
      const extension = await workflow.read(context, specification.id, {
        agreementId: extensionId,
      })
      const newLocal = requireTestValue(
        extension.items.find(item => item.uniqueId === local.uniqueId),
      )
      if (undoRemoval) {
        await workflow.mutate(context, specification.id, {
          operation: 'remove_requirement',
          agreementId: extensionId,
          itemRef: newLocal.itemRef,
        })
        await workflow.mutate(context, specification.id, {
          operation: 'undo_requirement',
          agreementId: extensionId,
          itemRef: newLocal.itemRef,
        })
        const restored = requireTestValue(
          (
            await workflow.read(context, specification.id, {
              agreementId: extensionId,
            })
          ).items.find(item => item.uniqueId === local.uniqueId),
        )
        expect(restored.itemRef).not.toBe(`local:${local.id}`)
        expect(restored.specificationItemStatusId).toBe(1)
      }
      await workflow.mutate(context, specification.id, {
        operation: 'confirm',
        agreementId: extensionId,
      })
      const current = await workflow.read(context, specification.id)
      expect(
        current.items.find(item => item.uniqueId === local.uniqueId)
          ?.specificationItemStatusId,
      ).toBe(1)
      expect(
        current.items.find(item => item.uniqueId === verified.uniqueId),
      ).toMatchObject({
        specificationItemStatusId: 4,
        note: 'Verification evidence',
      })
      await expect(
        updateSpecificationLocalRequirementFields(
          db,
          Number(
            requireTestValue(
              current.items.find(item => item.uniqueId === local.uniqueId),
            ).itemRef.split(':')[1],
          ),
          { specificationItemStatusId: 5 },
        ),
      ).rejects.toMatchObject({ code: 'validation' })
      expect(
        (
          await workflow.read(context, specification.id, { agreementId })
        ).items.find(item => item.uniqueId === local.uniqueId)
          ?.specificationItemStatusId,
      ).toBe(5)
    },
  )

  it('cancels the first upcoming agreement into frozen history and restores an independent working set', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'CANCEL-FIRST')
    const local = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Confirmed future content' },
    )
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2035-01-01',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).selectedAgreement,
    ).id
    const deviation = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: local.id,
      motivation: 'Future exception request',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'cancel',
      agreementId,
      reason: 'The terms need revision',
    })
    const working = await workflow.read(context, specification.id)
    expect(working.selectedAgreement).toBeNull()
    expect(working.canEditContent).toBe(true)
    expect(working.items[0]).toMatchObject({
      uniqueId: local.uniqueId,
      description: 'Confirmed future content',
    })
    await updateSpecificationLocalRequirement(
      db,
      specification.id,
      Number(requireTestValue(working.items[0]).itemRef.split(':')[1]),
      { description: 'Revised working content' },
    )
    const cancelled = await workflow.read(context, specification.id, {
      agreementId,
    })
    expect(cancelled.selectedAgreement?.state).toBe('cancelled')
    expect(cancelled.items[0]?.description).toBe('Confirmed future content')
    expect(cancelled.canEditContent).toBe(false)
    expect(
      await getSpecificationLocalDeviation(db, deviation.id),
    ).toMatchObject({
      decision: 3,
      decisionMotivation: 'The terms need revision',
    })
    await expect(
      workflow.mutate(context, specification.id, {
        operation: 'establish',
        agreementReference: 'A',
        effectiveDate: '2035-01-01',
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'Replacement',
      effectiveDate: '2035-01-01',
    })
    expect(
      (await workflow.read(context, specification.id)).items[0]?.description,
    ).toBe('Revised working content')
  })

  it('leaves identity, content and deviations unchanged when the full editor saves no content change', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'NO-OP')
    const library = await createPublishedRequirement(
      db,
      (await createArea(db)).id,
      'Unchanged library content',
    )
    await linkRequirementsToSpecificationAtomically(db, specification.id, {
      requirementIds: [library.requirementId],
    })
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    const original = requireTestValue(
      (await workflow.read(context, specification.id)).items[0],
    )
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2035-01-01',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.agreementReference === 'B',
      ),
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'save_requirement',
      agreementId,
      itemRef: original.itemRef,
      content: { description: original.description },
    })
    const view = await workflow.read(context, specification.id, { agreementId })
    expect(view.items[0]).toMatchObject({
      itemRef: original.itemRef,
      uniqueId: original.uniqueId,
      requirementVersionId: original.requirementVersionId,
      changeDate: null,
    })
    expect(view.deviationEndings).toEqual([])
  })

  it('cancels planned endings on undo and discard while retaining the current approval and cancellation evidence', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'UNDO-ENDING')
    const original = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Still approved' },
    )
    const deviation = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: original.id,
      motivation: 'An exception',
    })
    await requestSpecificationLocalReview(db, deviation.id)
    await recordSpecificationLocalDecision(db, deviation.id, {
      decision: 1,
      decisionMotivation: 'Approved',
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE5560000001-reviewer',
    })
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2035-01-01',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.agreementReference === 'B',
      ),
    ).id
    await expect(
      workflow.mutate(context, specification.id, {
        operation: 'remove_requirement',
        agreementId,
        itemRef: original.itemRef,
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'approved_deviations' },
    })
    await workflow.mutate(context, specification.id, {
      operation: 'remove_requirement',
      agreementId,
      itemRef: original.itemRef,
      authorizeDeviationEndings: true,
    })
    await workflow.mutate(context, specification.id, {
      operation: 'undo_requirement',
      agreementId,
      itemRef: original.itemRef,
    })
    const undone = await workflow.read(context, specification.id, {
      agreementId,
    })
    expect(undone.items[0]).toMatchObject({
      itemRef: original.itemRef,
      isRemoved: false,
      changeDate: null,
    })
    expect(undone.deviationEndings).toEqual([
      expect.objectContaining({ cancelledAt: expect.any(Date), endedAt: null }),
    ])
    await workflow.mutate(context, specification.id, {
      operation: 'save_requirement',
      agreementId,
      itemRef: original.itemRef,
      content: { description: 'Another proposed change' },
      authorizeDeviationEndings: true,
    })
    await workflow.mutate(context, specification.id, {
      operation: 'discard',
      agreementId,
    })
    const discarded = await workflow.read(context, specification.id)
    expect(discarded.deviationEndings).toHaveLength(2)
    expect(
      discarded.deviationEndings.every(
        ending => ending.cancelledAt && !ending.endedAt,
      ),
    ).toBe(true)
    expect(discarded.items[0]?.description).toBe('Still approved')
    expect(
      await getSpecificationLocalDeviation(db, deviation.id),
    ).toMatchObject({ decision: 1 })
  })

  it('plans an inherited approved deviation ending with explicit owner consent and ends it only at replacement effect', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'APPROVED-END')
    const original = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Approved exception content' },
    )
    const deviation = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: original.id,
      motivation: 'An agreed exception',
    })
    await requestSpecificationLocalReview(db, deviation.id)
    await recordSpecificationLocalDecision(db, deviation.id, {
      decision: 1,
      decisionMotivation: 'Approved for this content',
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE5560000001-reviewer',
    })
    const context = await makeRequestContext()
    let now = new Date('2030-09-14T10:00:00Z')
    const workflow = createSpecificationAgreementWorkflow(db, {
      now: () => now,
    })
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2030-09-01',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2030-09-15',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.agreementReference === 'B',
      ),
    ).id
    await expect(
      workflow.mutate(context, specification.id, {
        operation: 'save_requirement',
        agreementId,
        itemRef: original.itemRef,
        content: { description: 'Replacement content' },
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'approved_deviations' },
    })
    await workflow.mutate(context, specification.id, {
      operation: 'save_requirement',
      agreementId,
      itemRef: original.itemRef,
      content: { description: 'Replacement content' },
      authorizeDeviationEndings: true,
    })
    const planned = await workflow.read(context, specification.id, {
      agreementId,
    })
    expect(planned.deviationEndings).toEqual([
      expect.objectContaining({
        itemRef: original.itemRef,
        deviationId: deviation.id,
        agreementId,
        endedAt: null,
        cancelledAt: null,
      }),
    ])
    expect(
      await getSpecificationLocalDeviation(db, deviation.id),
    ).toMatchObject({
      decision: 1,
      decisionMotivation: 'Approved for this content',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'confirm',
      agreementId,
    })
    now = new Date('2030-09-14T22:00:00Z')
    expect(
      (await workflow.read(context, specification.id)).deviationEndings[0]
        ?.endedAt,
    ).toEqual(now)
    expect(
      await getSpecificationLocalDeviation(db, deviation.id),
    ).toMatchObject({
      decision: 1,
      decisionMotivation: 'Approved for this content',
    })
  })

  it('discards the entire draft and its own deviation history while preserving shared current cases', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'DISCARD')
    const original = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Shared current content' },
    )
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2035-01-01',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.agreementReference === 'B',
      ),
    ).id
    const shared = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: original.id,
      motivation: 'Shared request from draft context',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'add_local',
      agreementId,
      content: { description: 'Draft-only content' },
    })
    const draftItem = requireTestValue(
      (
        await workflow.read(context, specification.id, { agreementId })
      ).items.find(item => item.description === 'Draft-only content'),
    )
    const own = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: Number(draftItem.itemRef.split(':')[1]),
      motivation: 'Draft-only request',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'cancel_deviation',
      agreementId,
      itemRef: draftItem.itemRef,
      deviationId: own.id,
      reason: 'Rework before discarding',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'save_requirement',
      agreementId,
      itemRef: draftItem.itemRef,
      content: { description: 'Revised draft-only content' },
    })
    await workflow.mutate(context, specification.id, {
      operation: 'discard',
      agreementId,
    })
    const view = await workflow.read(context, specification.id)
    expect(
      view.agreements.map(agreement => agreement.agreementReference),
    ).toEqual(['A'])
    expect(view.items.map(item => item.description)).toEqual([
      'Shared current content',
    ])
    expect(await getSpecificationLocalDeviation(db, shared.id)).toMatchObject({
      decision: null,
      motivation: 'Shared request from draft context',
    })
    await expect(
      getSpecificationLocalDeviation(db, own.id),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('corrects agreement metadata with unique references and dates and requires confirmation for immediate activation', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'CORRECTIONS')
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db, {
      now: () => new Date('2030-09-14T10:00:00Z'),
    })
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2030-09-01',
    })
    const originalId = requireTestValue(
      (await workflow.read(context, specification.id)).selectedAgreement,
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2030-09-15',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.agreementReference === 'B',
      ),
    ).id
    await expect(
      workflow.mutate(context, specification.id, {
        operation: 'correct',
        agreementId,
        agreementReference: 'A',
        effectiveDate: '2030-09-15',
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    await expect(
      workflow.mutate(context, specification.id, {
        operation: 'correct',
        agreementId: originalId,
        agreementReference: 'Original A',
        effectiveDate: '2030-09-02',
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    await workflow.mutate(context, specification.id, {
      operation: 'correct',
      agreementId,
      agreementReference: 'Extension',
      effectiveDate: '2030-09-16',
      description: 'Agreed extension',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'confirm',
      agreementId,
    })
    await expect(
      workflow.mutate(context, specification.id, {
        operation: 'correct',
        agreementId,
        agreementReference: 'Extension',
        effectiveDate: '2030-09-14',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'activation_confirmation_required' },
    })
    expect(
      (await workflow.read(context, specification.id)).selectedAgreement?.id,
    ).toBe(originalId)
    await workflow.mutate(context, specification.id, {
      operation: 'correct',
      agreementId,
      agreementReference: 'Extension',
      effectiveDate: '2030-09-14',
      confirmImmediateActivation: true,
    })
    expect(
      (await workflow.read(context, specification.id)).selectedAgreement,
    ).toMatchObject({
      id: agreementId,
      agreementReference: 'Extension',
      effectiveDate: '2030-09-14',
      state: 'current',
    })
  })

  it('confirms a future first agreement containing the entire working set and locks content immediately', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'WHOLE-SET')
    const area = await createArea(db)
    const library = await createPublishedRequirement(
      db,
      area.id,
      'Library content',
    )
    await linkRequirementsToSpecificationAtomically(db, specification.id, {
      requirementIds: [library.requirementId],
    })
    await createSpecificationLocalRequirement(db, specification.id, {
      description: 'Local content',
    })
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db, {
      now: () => new Date('2030-09-14T10:00:00Z'),
    })

    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'Agreement A',
      effectiveDate: '2030-10-01',
    })

    const view = await workflow.read(context, specification.id)
    expect(view.selectedAgreement).toMatchObject({
      agreementReference: 'Agreement A',
      effectiveDate: '2030-10-01',
      state: 'upcoming',
    })
    expect(view.items.map(item => item.description).sort()).toEqual([
      'Library content',
      'Local content',
    ])
    expect(view.canEditContent).toBe(false)
    expect(view.canFollowUp).toBe(false)
    await expect(
      createSpecificationLocalRequirement(db, specification.id, {
        description: 'Unconfirmed addition',
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
  })

  it('prepares one complete successor draft while keeping the current agreement as the normal selection', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'SUCCESSOR')
    await createSpecificationLocalRequirement(db, specification.id, {
      description: 'Continued content',
    })
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db, {
      now: () => new Date('2030-09-14T10:00:00Z'),
    })
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'Agreement A',
      effectiveDate: '2030-09-01',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'Agreement B',
      effectiveDate: '2030-09-15',
    })
    const current = await workflow.read(context, specification.id)
    expect(current.selectedAgreement?.agreementReference).toBe('Agreement A')
    const draftId = current.agreements.find(
      agreement => agreement.agreementReference === 'Agreement B',
    )?.id
    expect(draftId).toBeDefined()
    const draft = await workflow.read(context, specification.id, {
      agreementId: draftId,
    })
    expect(draft.selectedAgreement).toMatchObject({
      agreementReference: 'Agreement B',
      state: 'draft',
    })
    expect(draft.items.map(item => item.description)).toEqual([
      'Continued content',
    ])
    expect(draft.canEditContent).toBe(true)
    expect(draft.canFollowUp).toBe(false)
    await expect(
      workflow.mutate(context, specification.id, {
        operation: 'create_draft',
        agreementReference: 'Agreement C',
        effectiveDate: '2030-09-16',
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(
      (await workflow.read(context, specification.id)).agreements,
    ).toHaveLength(2)
  })

  it('activates at Stockholm midnight and preserves both the latest inherited follow-up and the previous agreement result', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'MIDNIGHT')
    const local = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Shared content' },
    )
    const context = await makeRequestContext()
    let now = new Date('2030-09-14T10:00:00Z')
    const workflow = createSpecificationAgreementWorkflow(db, {
      now: () => now,
    })
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2030-09-01',
    })
    const originalId = (await workflow.read(context, specification.id))
      .selectedAgreement?.id
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2030-09-15',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.agreementReference === 'B',
      ),
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'confirm',
      agreementId,
    })
    await updateSpecificationLocalRequirementFields(db, local.id, {
      specificationItemStatusId: 4,
      note: 'Verified after confirmation',
    })
    now = new Date('2030-09-14T21:59:59Z')
    expect(
      (await workflow.read(context, specification.id)).selectedAgreement
        ?.agreementReference,
    ).toBe('A')
    now = new Date('2030-09-14T22:00:00Z')
    const activated = await workflow.read(context, specification.id)
    expect(activated.selectedAgreement).toMatchObject({
      agreementReference: 'B',
      state: 'current',
    })
    expect(activated.items[0]).toMatchObject({
      specificationItemStatusId: 4,
      note: 'Verified after confirmation',
    })
    await updateSpecificationLocalRequirementFields(db, local.id, {
      specificationItemStatusId: 3,
      note: 'Follow-up on B',
    })
    const original = await workflow.read(context, specification.id, {
      agreementId: originalId,
    })
    expect(original.selectedAgreement?.state).toBe('previous')
    expect(original.items[0]).toMatchObject({
      specificationItemStatusId: 4,
      note: 'Verified after confirmation',
    })
    expect(original.canFollowUp).toBe(false)
  })

  it('saves a library edit as a new local identity only in the draft, with complete content and source provenance', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'CONVERSION')
    const library = await createPublishedRequirement(
      db,
      (await createArea(db)).id,
      'Library original',
    )
    await linkRequirementsToSpecificationAtomically(db, specification.id, {
      requirementIds: [library.requirementId],
    })
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db, {
      now: () => new Date('2030-09-14T10:00:00Z'),
    })
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2030-09-01',
    })
    const original = requireTestValue(
      (await workflow.read(context, specification.id)).items[0],
    )
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2030-09-15',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.agreementReference === 'B',
      ),
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'save_requirement',
      agreementId,
      itemRef: original.itemRef,
      content: {
        description: 'Locally negotiated text',
        acceptanceCriteria: 'Response within 2 seconds',
        verifiable: true,
        verificationMethod: 'Timed acceptance test',
      },
    })
    const draft = await workflow.read(context, specification.id, {
      agreementId,
    })
    expect(draft.items[0]).toMatchObject({
      description: 'Locally negotiated text',
      acceptanceCriteria: 'Response within 2 seconds',
      verifiable: true,
      verificationMethod: 'Timed acceptance test',
      requirementId: null,
      requirementVersionId: null,
      sourceRequirementVersionId: library.publishedVersionId,
      sourceUniqueId: original.uniqueId,
      sourceVersionNumber: 1,
      normReferenceIds: [],
      needsReferenceId: null,
      changeDate: '2030-09-15',
    })
    expect(draft.items[0]?.uniqueId).not.toBe(original.uniqueId)
    expect(draft.items[0]?.itemRef).toMatch(/^local:/)
    expect(
      (await workflow.read(context, specification.id)).items[0],
    ).toMatchObject({
      description: 'Library original',
      requirementVersionId: library.publishedVersionId,
    })
  })

  it('activates changed local content as included and retains its identity and change date in a successor', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'LOCAL-VERSIONS')
    const local = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Original local text' },
    )
    await updateSpecificationLocalRequirementFields(db, local.id, {
      specificationItemStatusId: 4,
    })
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm',
    }).format(new Date())
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: today,
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.agreementReference === 'B',
      ),
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'save_requirement',
      agreementId,
      itemRef: local.itemRef,
      content: { description: 'Changed local text' },
    })
    await workflow.mutate(context, specification.id, {
      operation: 'confirm',
      agreementId,
    })
    const current = await workflow.read(context, specification.id)
    expect(current.items[0]).toMatchObject({
      uniqueId: local.uniqueId,
      description: 'Changed local text',
      specificationItemStatusId: 1,
      changeDate: today,
    })
    const applicable = await listSpecificationTraceabilityItems(
      db,
      specification.id,
      [local.itemRef, requireTestValue(current.items[0]).itemRef],
    )
    expect(applicable.map(item => item.itemRef)).toEqual([
      requireTestValue(current.items[0]).itemRef,
    ])
    await updateSpecificationLocalRequirementFields(
      db,
      Number(requireTestValue(current.items[0]).itemRef.split(':')[1]),
      { specificationItemStatusId: 4 },
    )
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'C',
      effectiveDate: '2035-01-01',
    })
    const nextId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.agreementReference === 'C',
      ),
    ).id
    const next = await workflow.read(context, specification.id, {
      agreementId: nextId,
    })
    expect(next.items[0]).toMatchObject({
      uniqueId: local.uniqueId,
      changeDate: today,
      specificationItemStatusId: 4,
    })
  })

  it('keeps independent local conversions of one library requirement in separate histories', async () => {
    const db = database()
    const specification = await createSpecificationFixture(
      db,
      'SEPARATE-HISTORY',
    )
    const library = await createPublishedRequirement(
      db,
      (await createArea(db)).id,
      'Shared library source',
    )
    await linkRequirementsToSpecificationAtomically(db, specification.id, {
      requirementIds: [library.requirementId],
    })
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    const original = requireTestValue(
      (await workflow.read(context, specification.id)).items[0],
    )
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2035-01-01',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.state === 'draft',
      ),
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'save_requirement',
      agreementId,
      itemRef: original.itemRef,
      content: { description: 'First independent local' },
    })
    const first = requireTestValue(
      (await workflow.read(context, specification.id, { agreementId }))
        .items[0],
    )
    await workflow.mutate(context, specification.id, {
      operation: 'add_library',
      agreementId,
      targetVersionId: library.publishedVersionId,
    })
    const added = requireTestValue(
      (
        await workflow.read(context, specification.id, { agreementId })
      ).items.find(item => item.itemRef.startsWith('lib:')),
    )
    await workflow.mutate(context, specification.id, {
      operation: 'save_requirement',
      agreementId,
      itemRef: added.itemRef,
      content: { description: 'Second independent local' },
    })
    const second = requireTestValue(
      (
        await workflow.read(context, specification.id, { agreementId })
      ).items.find(item => item.description === 'Second independent local'),
    )
    expect(second.uniqueId).not.toBe(first.uniqueId)
    const firstHistory = await workflow.history(
      context,
      specification.id,
      agreementId,
      first.itemRef,
    )
    expect(firstHistory.entries.map(entry => entry.item.description)).toEqual([
      'First independent local',
      'Shared library source',
    ])
    const secondHistory = await workflow.history(
      context,
      specification.id,
      agreementId,
      second.itemRef,
    )
    expect(
      secondHistory.entries.map(entry => entry.item.itemRef).sort(),
    ).toEqual([second.itemRef, added.itemRef].sort())
    await workflow.mutate(context, specification.id, {
      operation: 'undo_requirement',
      agreementId,
      itemRef: first.itemRef,
    })
    const restored = await workflow.history(
      context,
      specification.id,
      agreementId,
      original.itemRef,
    )
    expect(restored.entries.map(entry => entry.item.itemRef)).toEqual([
      original.itemRef,
      original.itemRef,
      first.itemRef,
    ])
    await workflow.mutate(context, specification.id, {
      operation: 'undo_requirement',
      agreementId,
      itemRef: second.itemRef,
    })
    expect(
      (
        await workflow.read(context, specification.id, { agreementId })
      ).items.map(item => item.itemRef),
    ).toEqual([original.itemRef])
    await workflow.mutate(context, specification.id, {
      operation: 'discard',
      agreementId,
    })
  })

  it('undoes conversion back to the original library binding and makes draft removal reversible', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'UNDO')
    const library = await createPublishedRequirement(
      db,
      (await createArea(db)).id,
      'Original binding',
    )
    await linkRequirementsToSpecificationAtomically(db, specification.id, {
      requirementIds: [library.requirementId],
    })
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    const original = requireTestValue(
      (await workflow.read(context, specification.id)).items[0],
    )
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2035-01-01',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.agreementReference === 'B',
      ),
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'save_requirement',
      agreementId,
      itemRef: original.itemRef,
      content: { description: 'Temporary conversion' },
    })
    const changed = requireTestValue(
      (await workflow.read(context, specification.id, { agreementId }))
        .items[0],
    )
    const deviation = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: Number(changed.itemRef.split(':')[1]),
      agreementId,
      motivation: 'Converted draft case',
    })
    await requestSpecificationLocalReview(db, deviation.id, { agreementId })
    await recordSpecificationLocalDecision(db, deviation.id, {
      agreementId,
      decision: 1,
      decisionMotivation: 'Original converted approval',
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE5560000001-reviewer',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'undo_requirement',
      agreementId,
      itemRef: changed.itemRef,
      authorizeDeviationEndings: true,
    })
    const history = await workflow.history(
      context,
      specification.id,
      agreementId,
      original.itemRef,
    )
    expect(history.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          item: expect.objectContaining({
            itemRef: changed.itemRef,
            description: 'Temporary conversion',
          }),
        }),
      ]),
    )
    expect(
      (await getSpecificationLocalDeviation(db, deviation.id))
        ?.decisionMotivation,
    ).toBe('Original converted approval')
    expect(
      (await workflow.read(context, specification.id, { agreementId }))
        .items[0],
    ).toMatchObject({
      itemRef: original.itemRef,
      uniqueId: original.uniqueId,
      requirementVersionId: library.publishedVersionId,
      changeDate: null,
    })
    await workflow.mutate(context, specification.id, {
      operation: 'remove_requirement',
      agreementId,
      itemRef: original.itemRef,
    })
    expect(
      (await workflow.read(context, specification.id, { agreementId }))
        .items[0],
    ).toMatchObject({ itemRef: original.itemRef, isRemoved: true })
    await workflow.mutate(context, specification.id, {
      operation: 'undo_requirement',
      agreementId,
      itemRef: original.itemRef,
    })
    expect(
      (await workflow.read(context, specification.id, { agreementId }))
        .items[0],
    ).toMatchObject({
      itemRef: original.itemRef,
      isRemoved: false,
      changeDate: null,
    })
  })

  it('adds library and local requirements to the draft and activates the complete replacement membership atomically', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'MEMBERSHIP')
    const removed = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Retained in A' },
    )
    const library = await createPublishedRequirement(
      db,
      (await createArea(db)).id,
      'New library requirement',
    )
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm',
    }).format(new Date())
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    const originalId = requireTestValue(
      (await workflow.read(context, specification.id)).selectedAgreement,
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: today,
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.agreementReference === 'B',
      ),
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'add_library',
      agreementId,
      targetVersionId: library.publishedVersionId,
    })
    await workflow.mutate(context, specification.id, {
      operation: 'add_local',
      agreementId,
      content: { description: 'New local requirement' },
    })
    await workflow.mutate(context, specification.id, {
      operation: 'remove_requirement',
      agreementId,
      itemRef: removed.itemRef,
    })
    const draft = await workflow.read(context, specification.id, {
      agreementId,
    })
    expect(draft.items).toHaveLength(3)
    expect(
      draft.items.filter(item => !item.isRemoved).map(item => item.changeKind),
    ).toEqual(['added', 'added'])
    await workflow.mutate(context, specification.id, {
      operation: 'confirm',
      agreementId,
    })
    const current = await workflow.read(context, specification.id)
    expect(current.items.map(item => item.description).sort()).toEqual([
      'New library requirement',
      'New local requirement',
    ])
    expect(
      (
        await workflow.read(context, specification.id, {
          agreementId: originalId,
        })
      ).items.map(item => item.description),
    ).toEqual(['Retained in A'])
  })

  it('allows requests against draft content and requires explicit cancellation before editing that exact content', async () => {
    const db = database()
    const specification = await createSpecificationFixture(
      db,
      'DRAFT-DEVIATION',
    )
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2035-01-01',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        agreement => agreement.agreementReference === 'B',
      ),
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'add_local',
      agreementId,
      content: { description: 'Proposed content for review' },
    })
    const item = requireTestValue(
      (await workflow.read(context, specification.id, { agreementId }))
        .items[0],
    )
    const deviation = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: Number(item.itemRef.split(':')[1]),
      motivation: 'Review the proposed exception',
    })
    await expect(
      workflow.mutate(context, specification.id, {
        operation: 'save_requirement',
        agreementId,
        itemRef: item.itemRef,
        content: { description: 'Different proposed content' },
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'active_deviations' },
    })
    expect(
      (await workflow.read(context, specification.id, { agreementId })).items[0]
        ?.description,
    ).toBe('Proposed content for review')
    await workflow.mutate(context, specification.id, {
      operation: 'cancel_deviation',
      agreementId,
      itemRef: item.itemRef,
      deviationId: deviation.id,
      reason: 'The proposed content needs revision',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'save_requirement',
      agreementId,
      itemRef: item.itemRef,
      content: { description: 'Different proposed content' },
    })
    expect(
      await getSpecificationLocalDeviation(db, deviation.id),
    ).toMatchObject({
      decision: 3,
      requirementDescription: 'Proposed content for review',
    })
    expect(
      (await workflow.read(context, specification.id, { agreementId })).items[0]
        ?.description,
    ).toBe('Different proposed content')
  })
})
