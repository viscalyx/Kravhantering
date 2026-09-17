import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  exportArchivingRetentionArchive,
  previewArchivingRetention,
} from '@/lib/archiving/retention'
import { resetAuthConfigForTests } from '@/lib/auth/config'
import {
  createDeviation,
  createSpecificationLocalDeviation,
  getSpecificationLocalDeviation,
  recordDecision,
  recordSpecificationLocalDecision,
  requestReview,
  requestSpecificationLocalReview,
} from '@/lib/dal/deviations'
import {
  createSpecificationLocalRequirement,
  linkRequirementsToSpecificationAtomically,
  type SqlExecutor,
  updateSpecificationItemFields,
  updateSpecificationLocalRequirementFields,
} from '@/lib/dal/requirements-specifications'
import { collectDataSubjectExport } from '@/lib/privacy/data-subject-export'
import {
  executePrivacyErasure,
  previewPrivacyErasure,
} from '@/lib/privacy/erasure'
import { collectCompleteSpecificationOutputData } from '@/lib/reports/data/specification-output'
import { createSpecificationCsvFormatter } from '@/lib/reports/specification-csv'
import { querySpecificationItemPage } from '@/lib/requirements/specification-item-page'
import { applicableDeviationSql } from '@/lib/specifications/agreement-deviation-state'
import { createSpecificationAgreementWorkflow } from '@/lib/specifications/agreements'
import { requireTestValue } from '@/tests/helpers/require-test-value'
import { DeviationValidity1789516800000 } from '@/typeorm/migrations/0070_deviation_validity.mjs'
import {
  createArea,
  createPublishedRequirement,
  createSpecificationFixture,
  makeRequestContext,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

describe('deviation approval terms', () => {
  const database = useSqlIntegrationDatabase()
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    resetAuthConfigForTests()
  })

  async function approvedItem(
    kind: 'library' | 'local',
    specificationId: number,
    prefix = 'APR',
  ) {
    const db = database()
    let itemId: number
    if (kind === 'local') {
      itemId = (
        await createSpecificationLocalRequirement(db, specificationId, {
          description: 'Service access',
        })
      ).id
    } else {
      const area = await createArea(db, { prefix })
      const requirement = await createPublishedRequirement(
        db,
        area.id,
        'Service access',
      )
      await linkRequirementsToSpecificationAtomically(db, specificationId, {
        requirementIds: [requirement.requirementId],
      })
      const rows = await db.query<Array<{ id: number }>>(
        'SELECT id FROM requirements_specification_items WHERE requirements_specification_id = @0 AND requirement_id = @1',
        [specificationId, requirement.requirementId],
      )
      itemId = requireTestValue(rows[0]).id
    }
    const deviation =
      kind === 'local'
        ? await createSpecificationLocalDeviation(db, {
            specificationLocalRequirementId: itemId,
            motivation: 'Temporary permission',
          })
        : await createDeviation(db, {
            specificationItemId: itemId,
            motivation: 'Temporary permission',
          })
    await (kind === 'local' ? requestSpecificationLocalReview : requestReview)(
      db,
      deviation.id,
    )
    await (kind === 'local'
      ? recordSpecificationLocalDecision
      : recordDecision)(db, deviation.id, {
      decision: 1,
      decisionMotivation: 'Accepted',
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE-REVIEWER',
    })
    return {
      deviationId: deviation.id,
      itemRef: `${kind === 'local' ? 'local' : 'lib'}:${itemId}`,
    }
  }

  it.each(['library', 'local'] as const)(
    'makes a %s approval applicable at its exact recorded millisecond',
    async kind => {
      const db = database()
      const specification = await createSpecificationFixture(
        db,
        `PRECISE-APPROVAL-${kind}`,
      )
      const decidedAt = new Date('2026-01-01T12:00:00.002Z')
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(decidedAt)
      const approved = await approvedItem(kind, specification.id)
      vi.useRealTimers()

      const cases =
        kind === 'local'
          ? 'specification_local_requirement_deviations'
          : 'deviations'
      const rows = await db.query<
        Array<{ decidedAt: Date; applicable: number }>
      >(
        `SELECT decided_at AS decidedAt,
          CASE WHEN ${applicableDeviationSql(kind, 'CAST(@1 AS datetime2(3))')}
            THEN 1 ELSE 0 END AS applicable
         FROM ${cases} deviation WHERE deviation.id = @0`,
        [approved.deviationId, decidedAt.toISOString()],
      )
      expect(rows).toEqual([{ decidedAt, applicable: 1 }])
    },
  )

  it.each(['library', 'local'] as const)(
    'ends only applicable %s approvals and preserves expired historical linkage',
    async kind => {
      const db = database()
      const specification = await createSpecificationFixture(
        db,
        `END-VALIDITY-${kind}`,
      )
      const expired = await approvedItem(kind, specification.id, 'EXP')
      const applicable = await approvedItem(kind, specification.id)
      const cases =
        kind === 'local'
          ? 'specification_local_requirement_deviations'
          : 'deviations'
      await db.query(
        `UPDATE ${cases} SET valid_through = '2020-01-01' WHERE id = @0`,
        [expired.deviationId],
      )
      const context = await makeRequestContext()
      const workflow = createSpecificationAgreementWorkflow(db)
      await workflow.mutate(context, specification.id, {
        operation: 'establish',
        agreementReference: 'A',
        effectiveDate: '2020-01-01',
      })
      const agreementId = requireTestValue(
        (await workflow.read(context, specification.id)).selectedAgreement,
      ).id
      const preview = await workflow.endPreview(
        context,
        specification.id,
        agreementId,
      )
      expect(preview.map(row => row.id)).toEqual([applicable.deviationId])
      await workflow.mutate(context, specification.id, {
        operation: 'end',
        agreementId,
        endDate: '2020-01-01',
        reason: 'Term complete',
      })
      const ended = await workflow.read(context, specification.id)
      expect(ended.deviationEndings).toEqual([
        expect.objectContaining({
          deviationId: applicable.deviationId,
          endingKind: 'agreement_ended',
        }),
      ])
      const snapshots = await db.query<Array<{ snapshot: string }>>(
        'SELECT deviation_state_json AS snapshot FROM specification_agreement_items WHERE specification_agreement_id = @0',
        [agreementId],
      )
      expect(snapshots.flatMap(row => JSON.parse(row.snapshot))).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: expired.deviationId }),
          expect.objectContaining({ id: applicable.deviationId }),
        ]),
      )
    },
  )

  it.each([
    ['library', 'expired'],
    ['local', 'expired'],
    ['library', 'content_replaced'],
    ['local', 'content_replaced'],
  ] as const)(
    'rejects closure of a %s approval that is %s',
    async (kind, state) => {
      const db = database()
      const specification = await createSpecificationFixture(
        db,
        `INAPPLICABLE-${kind}`,
      )
      const approval = await approvedItem(kind, specification.id)
      const cases =
        kind === 'local'
          ? 'specification_local_requirement_deviations'
          : 'deviations'
      const endingCase =
        kind === 'local' ? 'local_deviation_id' : 'deviation_id'
      if (state === 'expired') {
        await db.query(
          `UPDATE ${cases} SET valid_through = '2020-01-01' WHERE id = @0`,
          [approval.deviationId],
        )
      } else {
        await db.query(
          `INSERT INTO specification_deviation_endings (specification_id, ${endingCase}, planned_effective_date, recorded_at, ended_at) VALUES (@0, @1, '2020-01-01', SYSUTCDATETIME(), SYSUTCDATETIME())`,
          [specification.id, approval.deviationId],
        )
      }
      const context = await makeRequestContext()
      const workflow = createSpecificationAgreementWorkflow(db)
      await expect(
        workflow.mutate(context, specification.id, {
          operation: 'close_deviation',
          ...approval,
          reason: 'Cannot close ended permission',
        }),
      ).rejects.toMatchObject({
        status: 409,
        details: { reason: 'deviation_not_applicable' },
      })
      const closures = await db.query<Array<{ id: number }>>(
        `SELECT id FROM specification_deviation_endings WHERE ${endingCase} = @0 AND ending_kind = 'closed'`,
        [approval.deviationId],
      )
      expect(closures).toEqual([])
    },
  )

  it('preserves the reviewer conditions and inclusive calendar end date', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'VALIDITY')
    const item = await createSpecificationLocalRequirement(
      db,
      specification.id,
      {
        description: 'Protect the service',
      },
    )
    const deviation = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: item.id,
      motivation: 'Temporary departure while replacing the service',
    })
    await requestSpecificationLocalReview(db, deviation.id)
    await expect(
      recordSpecificationLocalDecision(db, deviation.id, {
        decision: 1,
        decisionMotivation: 'Past date is invalid',
        decidedBy: 'Reviewer',
        decidedByHsaId: 'SE-REVIEWER',
        validThrough: '2020-01-01',
      }),
    ).rejects.toMatchObject({
      status: 400,
      details: { reason: 'deviation_date_invalid' },
    })
    expect(
      await getSpecificationLocalDeviation(db, deviation.id),
    ).toMatchObject({ decision: null, conditions: null, validThrough: null })
    await recordSpecificationLocalDecision(db, deviation.id, {
      decision: 1,
      decisionMotivation: 'Approved with compensating controls',
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE-REVIEWER',
      conditions: 'Review access every week',
      validThrough: '2099-09-30',
    })
    expect(
      await getSpecificationLocalDeviation(db, deviation.id),
    ).toMatchObject({
      decision: 1,
      conditions: 'Review access every week',
      validThrough: '2099-09-30',
    })
  })
  it('expires after Stockholm midnight without changing the approval or usage status', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'MIDNIGHT')
    const item = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Service access' },
    )
    const deviation = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: item.id,
      motivation: 'Replace access control',
    })
    await requestSpecificationLocalReview(db, deviation.id)
    await recordSpecificationLocalDecision(db, deviation.id, {
      decision: 1,
      decisionMotivation: 'Temporary permission',
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE-REVIEWER',
      validThrough: '2099-09-30',
    })
    let now = new Date('2099-09-30T21:59:59.999Z')
    const workflow = createSpecificationAgreementWorkflow(db, {
      now: () => now,
    })
    const context = await makeRequestContext()
    expect(
      (await workflow.read(context, specification.id)).deviations[0],
    ).toMatchObject({ applicability: 'applicable' })
    now = new Date('2099-09-30T22:00:00.000Z')
    const expired = await workflow.read(context, specification.id)
    expect(expired.deviations[0]).toMatchObject({
      decision: 1,
      applicability: 'expired',
      validThrough: '2099-09-30',
    })
    expect(expired.items[0]).toMatchObject({ specificationItemStatusId: 1 })
  })

  it('renews a shared approval without reviving it when its replacement expires', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'RENEWAL')
    const item = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Service access' },
    )
    const first = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: item.id,
      motivation: 'Initial permission',
    })
    const terms = {
      decision: 1,
      decisionMotivation: 'Accepted',
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE-REVIEWER',
    }
    await requestSpecificationLocalReview(db, first.id)
    await recordSpecificationLocalDecision(db, first.id, {
      ...terms,
      conditions: 'Original controls',
    })
    const renewal = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: item.id,
      motivation: 'Continue permission',
      renewsDeviationId: first.id,
    })
    const context = await makeRequestContext()
    let now = new Date()
    const workflow = createSpecificationAgreementWorkflow(db, {
      now: () => now,
    })
    expect(
      (await workflow.read(context, specification.id)).deviations.find(
        value => value.id === first.id,
      )?.applicability,
    ).toBe('applicable')
    await requestSpecificationLocalReview(db, renewal.id)
    await recordSpecificationLocalDecision(db, renewal.id, {
      ...terms,
      validThrough: '2099-09-30',
      conditions: 'New controls',
    })
    now = new Date('2099-10-01T12:00:00Z')
    const view = await workflow.read(context, specification.id)
    expect(view.deviations.find(value => value.id === first.id)).toMatchObject({
      decision: 1,
      conditions: 'Original controls',
      validThrough: null,
      applicability: 'superseded',
    })
    expect(
      view.deviations.find(value => value.id === renewal.id),
    ).toMatchObject({ renewsDeviationId: first.id, applicability: 'expired' })
  })

  it('allows only the assigned responsible person to close and requires pending renewal cancellation', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'CLOSE')
    const item = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Service access' },
    )
    const first = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: item.id,
      motivation: 'Initial permission',
    })
    await requestSpecificationLocalReview(db, first.id)
    await recordSpecificationLocalDecision(db, first.id, {
      decision: 1,
      decisionMotivation: 'Accepted',
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE-REVIEWER',
    })
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    const input = {
      operation: 'close_deviation' as const,
      itemRef: `local:${item.id}`,
      deviationId: first.id,
      reason: 'Departure no longer needed',
    }
    await expect(
      workflow.mutate(
        {
          ...context,
          actor: { ...context.actor, hsaId: 'OTHER-ADMIN', roles: ['Admin'] },
        },
        specification.id,
        input,
      ),
    ).rejects.toMatchObject({ status: 403 })
    const renewal = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: item.id,
      motivation: 'Continue permission',
      renewsDeviationId: first.id,
    })
    await expect(
      workflow.mutate(context, specification.id, input),
    ).rejects.toMatchObject({ status: 409 })
    await workflow.mutate(context, specification.id, {
      operation: 'cancel_deviation',
      itemRef: input.itemRef,
      deviationId: renewal.id,
      reason: 'No longer needed',
    })
    await workflow.mutate(context, specification.id, input)
    await workflow.mutate(context, specification.id, input)
    const closed = await workflow.read(context, specification.id)
    expect(
      closed.deviations.find(value => value.id === first.id),
    ).toMatchObject({
      decision: 1,
      decisionMotivation: 'Accepted',
      applicability: 'closed',
    })
    expect(closed.deviationEndings).toHaveLength(1)
    expect(closed.deviationEndings[0]).toMatchObject({
      reason: input.reason,
      endingKind: 'closed',
    })
  })

  it.each(['library', 'local'] as const)(
    'rejects renewal of a closed %s approval and accepts a fresh independently reviewed request',
    async kind => {
      const db = database()
      const specification = await createSpecificationFixture(
        db,
        `CLOSED-${kind}`,
      )
      const context = await makeRequestContext()
      const workflow = createSpecificationAgreementWorkflow(db)
      let itemId: number
      if (kind === 'local') {
        itemId = (
          await createSpecificationLocalRequirement(db, specification.id, {
            description: 'Service access',
          })
        ).id
      } else {
        const area = await createArea(db)
        const requirement = await createPublishedRequirement(
          db,
          area.id,
          'Service access',
        )
        await linkRequirementsToSpecificationAtomically(db, specification.id, {
          requirementIds: [requirement.requirementId],
        })
        const view = await workflow.read(context, specification.id)
        itemId = Number(view.items[0]?.itemRef.split(':')[1])
      }
      const create = (renewsDeviationId?: number) =>
        kind === 'local'
          ? createSpecificationLocalDeviation(db, {
              specificationLocalRequirementId: itemId,
              motivation: 'Permission needed',
              renewsDeviationId,
            })
          : createDeviation(db, {
              specificationItemId: itemId,
              motivation: 'Permission needed',
              renewsDeviationId,
            })
      const request =
        kind === 'local' ? requestSpecificationLocalReview : requestReview
      const decide =
        kind === 'local' ? recordSpecificationLocalDecision : recordDecision
      const terms = {
        decision: 1,
        decisionMotivation: 'Accepted after review',
        decidedBy: 'Reviewer',
        decidedByHsaId: 'SE-REVIEWER',
      }
      const first = await create()
      await request(db, first.id)
      await decide(db, first.id, terms)
      await expect(create()).rejects.toMatchObject({
        status: 409,
        details: { reason: 'deviation_renewal_target' },
      })
      await workflow.mutate(context, specification.id, {
        operation: 'close_deviation',
        itemRef: `${kind === 'local' ? 'local' : 'lib'}:${itemId}`,
        deviationId: first.id,
        reason: 'Permission no longer needed',
      })
      await expect(create(first.id)).rejects.toMatchObject({
        status: 409,
        details: { reason: 'deviation_approval_closed' },
      })
      expect(
        (await workflow.read(context, specification.id)).deviations,
      ).toHaveLength(1)
      const fresh = await create()
      const pending = await workflow.read(context, specification.id)
      expect(
        pending.deviations.find(value => value.id === fresh.id),
      ).toMatchObject({
        renewsDeviationId: null,
        applicability: 'pending',
      })
      expect(
        pending.deviations.find(value => value.id === first.id),
      ).toMatchObject({
        applicability: 'closed',
      })
      await request(db, fresh.id)
      await decide(db, fresh.id, terms)
      const approved = await workflow.read(context, specification.id)
      expect(
        approved.deviations.find(value => value.id === fresh.id),
      ).toMatchObject({
        renewsDeviationId: null,
        applicability: 'applicable',
      })
      expect(approved.deviationEndings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            deviationId: first.id,
            endingKind: 'closed',
          }),
        ]),
      )
    },
  )

  it.each([
    ['2030-03-31', '2030-03-31T21:59:59.999Z', '2030-03-31T22:00:00Z'],
    ['2030-10-27', '2030-10-27T22:59:59.999Z', '2030-10-27T23:00:00Z'],
  ])(
    'respects Stockholm daylight-saving boundaries on %s',
    async (validThrough, before, after) => {
      const db = database()
      const specification = await createSpecificationFixture(db, 'DST')
      const item = await createSpecificationLocalRequirement(
        db,
        specification.id,
        { description: 'Service access' },
      )
      const deviation = await createSpecificationLocalDeviation(db, {
        specificationLocalRequirementId: item.id,
        motivation: 'Temporary permission',
      })
      await requestSpecificationLocalReview(db, deviation.id)
      await recordSpecificationLocalDecision(db, deviation.id, {
        decision: 1,
        decisionMotivation: 'Accepted',
        decidedBy: 'Reviewer',
        decidedByHsaId: 'SE-REVIEWER',
        validThrough,
      })
      const context = await makeRequestContext()
      const beforeView = await createSpecificationAgreementWorkflow(db, {
        now: () => new Date(before),
      }).read(context, specification.id)
      const afterView = await createSpecificationAgreementWorkflow(db, {
        now: () => new Date(after),
      }).read(context, specification.id)
      expect(beforeView.deviations[0]?.applicability).toBe('applicable')
      expect(afterView.deviations[0]?.applicability).toBe('expired')
    },
  )

  it.each(['library', 'local'] as const)(
    'preserves recorded use after %s approval expiry and restores follow-up after leaving Verified',
    async kind => {
      const db = database()
      const specification = await createSpecificationFixture(
        db,
        `FOLLOWUP-${kind}`,
      )
      let itemId: number
      if (kind === 'local')
        itemId = (
          await createSpecificationLocalRequirement(db, specification.id, {
            description: 'Local access control',
          })
        ).id
      else {
        const area = await createArea(db)
        const requirement = await createPublishedRequirement(
          db,
          area.id,
          'Library access control',
        )
        await linkRequirementsToSpecificationAtomically(db, specification.id, {
          requirementIds: [requirement.requirementId],
        })
        const view = await createSpecificationAgreementWorkflow(db).read(
          await makeRequestContext(),
          specification.id,
        )
        itemId = Number(view.items[0]?.itemRef.split(':')[1])
      }
      const first =
        kind === 'local'
          ? await createSpecificationLocalDeviation(db, {
              specificationLocalRequirementId: itemId,
              motivation: 'Temporary permission',
            })
          : await createDeviation(db, {
              specificationItemId: itemId,
              motivation: 'Temporary permission',
            })
      const request =
        kind === 'local' ? requestSpecificationLocalReview : requestReview
      const decide =
        kind === 'local' ? recordSpecificationLocalDecision : recordDecision
      const update =
        kind === 'local'
          ? updateSpecificationLocalRequirementFields
          : updateSpecificationItemFields
      await request(db, first.id)
      await expect(
        decide(db, first.id, {
          decision: 1,
          decisionMotivation: 'Invalid',
          decidedBy: 'Reviewer',
          decidedByHsaId: 'SE-REVIEWER',
          validThrough: '2020-01-01',
        }),
      ).rejects.toMatchObject({ status: 400 })
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2025-09-01T12:00:00Z'))
      await decide(db, first.id, {
        decision: 1,
        decisionMotivation: 'Accepted',
        decidedBy: 'Reviewer',
        decidedByHsaId: 'SE-REVIEWER',
        validThrough: '2025-09-30',
      })
      vi.useRealTimers()
      // Fixture setup represents use recorded before the calendar deadline.
      await db.query(
        `UPDATE ${kind === 'local' ? 'specification_local_requirements' : 'requirements_specification_items'} SET specification_item_status_id = 5 WHERE id = @0`,
        [itemId],
      )
      const page = () =>
        querySpecificationItemPage(db, { specificationId: specification.id })
      expect((await page()).items[0]).toMatchObject({
        hasApprovedDeviation: false,
        deviationFollowup: true,
        specificationItemStatusId: 5,
      })
      await update(db, itemId, { note: 'Still following up' })
      await update(db, itemId, { specificationItemStatusId: 4 })
      expect((await page()).items[0]).toMatchObject({
        deviationFollowup: false,
      })
      await update(db, itemId, { specificationItemStatusId: 3 })
      expect((await page()).items[0]).toMatchObject({ deviationFollowup: true })
      await expect(
        update(db, itemId, { specificationItemStatusId: 5 }),
      ).rejects.toMatchObject({ status: 400 })
      const output = await collectCompleteSpecificationOutputData(
        db,
        specification.id,
      )
      expect(output.items[0]?.deviationCounts).toMatchObject({
        approved: 1,
        applicable: 0,
      })
      const csv = createSpecificationCsvFormatter('full', 'en')
      expect(csv.serializeRow(output.items[0])).toContain('Action required')
    },
  )

  it('keeps shared renewal after draft discard and preserves approval at a later historical cutoff', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'SHARED')
    const item = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Shared exact content' },
    )
    const context = await makeRequestContext()
    let now = new Date()
    const workflow = createSpecificationAgreementWorkflow(db, {
      now: () => now,
    })
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    const a = (await workflow.read(context, specification.id)).selectedAgreement
      ?.id as number
    const first = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: item.id,
      motivation: 'First approval',
    })
    const terms = {
      decision: 1,
      decisionMotivation: 'Approved',
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE-REVIEWER',
    }
    await requestSpecificationLocalReview(db, first.id)
    await recordSpecificationLocalDecision(db, first.id, terms)
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2099-01-01',
    })
    const b = (await workflow.read(context, specification.id)).agreements.find(
      value => value.state === 'draft',
    )?.id as number
    const renewal = await createSpecificationLocalDeviation(db, {
      agreementId: b,
      specificationLocalRequirementId: item.id,
      motivation: 'Shared renewal',
      renewsDeviationId: first.id,
    })
    await requestSpecificationLocalReview(db, renewal.id, { agreementId: b })
    await recordSpecificationLocalDecision(db, renewal.id, {
      ...terms,
      agreementId: b,
      conditions: 'Shared replacement controls',
    })
    now = new Date(Math.ceil(Date.now() / 1000) * 1000)
    expect(
      (
        await workflow.read(context, specification.id, { agreementId: a })
      ).deviations.find(value => value.id === renewal.id),
    ).toMatchObject({
      applicability: 'applicable',
      agreementReferences: 'A, B',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'discard',
      agreementId: b,
    })
    expect(
      (await workflow.read(context, specification.id)).deviations.find(
        value => value.id === renewal.id,
      )?.applicability,
    ).toBe('applicable')
    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm',
    }).format(now)
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'C',
      effectiveDate: today,
    })
    const c = (await workflow.read(context, specification.id)).agreements.find(
      value => value.state === 'draft',
    )?.id as number
    now = new Date(now.getTime() + 1000)
    await workflow.mutate(context, specification.id, {
      operation: 'confirm',
      agreementId: c,
    })
    now = new Date(now.getTime() + 1000)
    await workflow.mutate(context, specification.id, {
      operation: 'close_deviation',
      agreementId: c,
      itemRef: `local:${item.id}`,
      deviationId: renewal.id,
      reason: 'No longer required',
    })
    const current = await workflow.read(context, specification.id)
    const historical = await workflow.read(context, specification.id, {
      agreementId: a,
    })
    expect(
      current.deviations.find(value => value.id === renewal.id)?.applicability,
    ).toBe('closed')
    expect(
      historical.deviations.find(value => value.id === renewal.id)
        ?.applicability,
    ).toBe('applicable')
    expect(
      historical.deviationEndings.find(value => value.endingKind === 'closed')
        ?.reason,
    ).toBe('No longer required')
  })

  it('rolls back the approval if replacement evidence cannot be saved', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'ROLLBACK')
    const item = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Atomic permission' },
    )
    const deviation = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: item.id,
      motivation: 'Temporary permission',
    })
    await requestSpecificationLocalReview(db, deviation.id)
    const failingDb = {
      transaction: (callback: (manager: SqlExecutor) => Promise<unknown>) =>
        db.transaction(manager =>
          callback({
            query: async (sql: string, parameters?: unknown[]) => {
              if (sql.includes('INSERT INTO specification_deviation_endings'))
                throw new Error('Simulated evidence storage failure')
              return manager.query(sql, parameters)
            },
          } as typeof manager),
        ),
    } as unknown as typeof db
    await expect(
      recordSpecificationLocalDecision(failingDb, deviation.id, {
        decision: 1,
        decisionMotivation: 'Approved',
        decidedBy: 'Reviewer',
        decidedByHsaId: 'SE-REVIEWER',
        conditions: 'Controls',
      }),
    ).rejects.toThrow('Simulated evidence storage failure')
    expect(
      await getSpecificationLocalDeviation(db, deviation.id),
    ).toMatchObject({ decision: null, conditions: null, decidedAt: null })
  })
  it('inherits planned content endings when renewal and closure race', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'PLAN-RENEWAL')
    const item = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Original service' },
    )
    const context = await makeRequestContext()
    let now = new Date()
    const workflow = createSpecificationAgreementWorkflow(db, {
      now: () => now,
    })
    const terms = {
      decision: 1,
      decisionMotivation: 'Permission',
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE-REVIEWER',
    }
    const first = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: item.id,
      motivation: 'First permission',
    })
    await requestSpecificationLocalReview(db, first.id)
    await recordSpecificationLocalDecision(db, first.id, terms)
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'create_draft',
      agreementReference: 'B',
      effectiveDate: '2099-01-01',
    })
    const b = requireTestValue(
      (await workflow.read(context, specification.id)).agreements.find(
        value => value.state === 'draft',
      ),
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'save_requirement',
      agreementId: b,
      itemRef: `local:${item.id}`,
      content: { description: 'Changed service' },
      authorizeDeviationEndings: true,
    })
    const renewal = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: item.id,
      motivation: 'Renew current service',
      renewsDeviationId: first.id,
    })
    await requestSpecificationLocalReview(db, renewal.id)
    const outcomes = await Promise.allSettled([
      recordSpecificationLocalDecision(db, renewal.id, terms),
      workflow.mutate(context, specification.id, {
        operation: 'close_deviation',
        itemRef: `local:${item.id}`,
        deviationId: first.id,
        reason: 'Concurrent close',
      }),
    ])
    expect(outcomes[0].status).toBe('fulfilled')
    expect(outcomes[1]).toMatchObject({
      status: 'rejected',
      reason: { status: 409 },
    })
    now = new Date(Math.ceil(Date.now() / 1000) * 1000)
    const shared = await workflow.read(context, specification.id)
    expect(
      shared.deviations.find(value => value.id === renewal.id)?.applicability,
    ).toBe('applicable')
    expect(shared.deviationEndings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          deviationId: renewal.id,
          agreementId: b,
          endedAt: null,
          cancelledAt: null,
        }),
      ]),
    )
    await workflow.mutate(context, specification.id, {
      operation: 'confirm',
      agreementId: b,
      authorizeDeviationEndings: true,
    })
    now = new Date('2099-01-01T00:00:00Z')
    const activated = await workflow.read(context, specification.id)
    expect(
      activated.deviations.find(value => value.id === first.id)?.applicability,
    ).toBe('superseded')
    expect(
      activated.deviations.find(value => value.id === renewal.id)
        ?.applicability,
    ).toBe('content_replaced')
    expect(activated.items[0].description).toBe('Changed service')
    expect(
      activated.deviationEndings.some(
        value => value.deviationId === renewal.id && value.endedAt,
      ),
    ).toBe(true)
  })

  it('preserves closure evidence in archive and anonymizes only the exact actor identity', async () => {
    for (const [key, value] of Object.entries({
      AUTH_OIDC_ISSUER_URL: 'https://issuer.example.test',
      AUTH_OIDC_CLIENT_ID: 'test-client',
      AUTH_OIDC_CLIENT_SECRET: 'test-secret',
      AUTH_OIDC_REDIRECT_URI: 'https://example.test/callback',
      AUTH_OIDC_POST_LOGOUT_REDIRECT_URI: 'https://example.test',
      AUTH_SESSION_COOKIE_PASSWORD:
        '1325-test-cookie-password-at-least-32-characters',
    }))
      vi.stubEnv(key, value)
    resetAuthConfigForTests()
    const db = database()
    const specification = await createSpecificationFixture(
      db,
      'CLOSURE-PRIVACY',
    )
    const item = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Protected service' },
    )
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    const terms = {
      decision: 1,
      decisionMotivation: 'Permission',
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE-REVIEWER',
      conditions: 'Weekly access review',
      validThrough: '2099-09-30',
    }
    const first = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: item.id,
      motivation: 'Original permission',
    })
    await requestSpecificationLocalReview(db, first.id)
    await recordSpecificationLocalDecision(db, first.id, terms)
    const renewal = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: item.id,
      motivation: 'Continued permission',
      renewsDeviationId: first.id,
    })
    await requestSpecificationLocalReview(db, renewal.id)
    await recordSpecificationLocalDecision(db, renewal.id, terms)
    await workflow.mutate(context, specification.id, {
      operation: 'close_deviation',
      itemRef: `local:${item.id}`,
      deviationId: renewal.id,
      reason: 'Service restored',
    })
    const otherHsaId = 'SE5560000001-other1'
    await db.query(
      `INSERT INTO specification_deviation_endings (specification_id, local_deviation_id, planned_effective_date, recorded_at, ended_at, ending_kind, reason, recorded_by_hsa_id, recorded_by_display_name)
      SELECT specification_id, local_deviation_id, planned_effective_date, recorded_at, ended_at, ending_kind, N'Other actor evidence', @1, recorded_by_display_name
      FROM specification_deviation_endings WHERE local_deviation_id = @0 AND ending_kind = 'closed'`,
      [renewal.id, otherHsaId],
    )
    const dataExport = await collectDataSubjectExport(
      db,
      {
        target: { hsaId: requireTestValue(context.actor.hsaId) },
        generatedBy: {
          displayName: 'Privacy officer',
          hsaId: 'SE5560000001-privacy1',
          source: 'oidc',
        },
      },
      {
        maxItems: 1000,
        signal: new AbortController().signal,
        createItemLimitError: () => new Error('Too many records'),
      },
    )
    expect(dataExport.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'specification_deviation_endings.recorded_by',
        }),
      ]),
    )
    const preview = await previewPrivacyErasure(db, {
      target: { hsaId: requireTestValue(context.actor.hsaId) },
    })
    expect(
      preview.groups.find(
        value => value.key === 'specification_deviation_endings.recorded_by',
      ),
    ).toMatchObject({ count: 1, allowedActions: ['anonymize', 'skip'] })
    const actions = Object.fromEntries(
      preview.groups.map(value => [
        value.key,
        value.key === 'specification_deviation_endings.recorded_by'
          ? 'anonymize'
          : 'skip',
      ]),
    ) as Record<string, 'anonymize' | 'skip'>
    await executePrivacyErasure(db, {
      target: { hsaId: requireTestValue(context.actor.hsaId) },
      previewToken: preview.previewToken,
      actions,
    })
    const evidence = await db.query<
      Array<{ actor: string | null; name: string; reason: string }>
    >(
      `SELECT recorded_by_hsa_id AS actor, recorded_by_display_name AS name, reason FROM specification_deviation_endings WHERE local_deviation_id = @0 AND ending_kind = 'closed' ORDER BY id`,
      [renewal.id],
    )
    expect(evidence).toEqual([
      { actor: null, name: 'no-user', reason: 'Service restored' },
      {
        actor: otherHsaId,
        name: context.actor.displayName,
        reason: 'Other actor evidence',
      },
    ])
    await db.query(
      "UPDATE requirements_specifications SET updated_at = '2020-01-01', specification_lifecycle_status_id = 1 WHERE id = @0",
      [specification.id],
    )
    const policies = await db.query<
      Array<{ id: number }>
    >(`INSERT INTO archiving_retention_policies (policy_key, information_set, action, age_days, status_condition, is_enabled, decision_reference, created_at, updated_at)
      OUTPUT INSERTED.id VALUES (N'obsolete_specifications_delete', N'Specifications', N'delete', 730, N'Obsolete', 1, N'Issue 1325', SYSUTCDATETIME(), SYSUTCDATETIME())`)
    const policyId = policies[0].id
    const archivePreview = await previewArchivingRetention(db, { policyId })
    const archive = await exportArchivingRetentionArchive(db, {
      policyId,
      previewToken: archivePreview.previewToken,
    })
    expect(archive.archive).toMatchObject({
      specifications: [
        expect.objectContaining({
          localDeviations: expect.arrayContaining([
            expect.objectContaining({
              id: renewal.id,
              conditions: terms.conditions,
              validThrough: terms.validThrough,
              renewsDeviationId: first.id,
              decision: 1,
            }),
          ]),
          deviationEndings: expect.arrayContaining([
            expect.objectContaining({
              localDeviationId: renewal.id,
              endingKind: 'closed',
              reason: 'Service restored',
              recordedBy: null,
              endedAt: expect.any(Date),
            }),
          ]),
        }),
      ],
    })
  })

  it('repeats migration safely and classifies preserved legacy agreement-end evidence', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'LEGACY-END')
    const item = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Legacy service' },
    )
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    const deviation = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: item.id,
      motivation: 'Legacy approval',
    })
    await requestSpecificationLocalReview(db, deviation.id)
    await recordSpecificationLocalDecision(db, deviation.id, {
      decision: 1,
      decisionMotivation: 'Legacy decision',
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE-REVIEWER',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'establish',
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
    })
    const agreementId = requireTestValue(
      (await workflow.read(context, specification.id)).selectedAgreement,
    ).id
    await workflow.mutate(context, specification.id, {
      operation: 'end',
      agreementId,
      endDate: new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Stockholm',
      }).format(new Date()),
      reason: 'Term complete',
    })
    await db.query(
      'UPDATE specification_deviation_endings SET ending_kind = NULL WHERE local_deviation_id = @0',
      [deviation.id],
    )
    const before = await db.query(
      'SELECT decided_at, decision_motivation, conditions, valid_through FROM specification_local_requirement_deviations WHERE id = @0',
      [deviation.id],
    )
    const migration = new DeviationValidity1789516800000()
    await migration.up(db)
    await migration.up(db)
    expect(
      await db.query(
        'SELECT decided_at, decision_motivation, conditions, valid_through FROM specification_local_requirement_deviations WHERE id = @0',
        [deviation.id],
      ),
    ).toEqual(before)
    expect(
      await getSpecificationLocalDeviation(db, deviation.id),
    ).toMatchObject({
      applicability: 'agreement_ended',
      conditions: null,
      validThrough: null,
    })
  })

  it('keeps TS and SQL applicability aligned for legacy approval timestamps', async () => {
    const db = database()
    const specification = await createSpecificationFixture(db, 'LEGACY-TIE')
    const item = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Legacy service' },
    )
    const context = await makeRequestContext()
    const workflow = createSpecificationAgreementWorkflow(db)
    const first = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: item.id,
      motivation: 'Legacy first',
    })
    await requestSpecificationLocalReview(db, first.id)
    await recordSpecificationLocalDecision(db, first.id, {
      decision: 1,
      decisionMotivation: 'Legacy decision',
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE-REVIEWER',
    })
    await workflow.mutate(context, specification.id, {
      operation: 'close_deviation',
      itemRef: `local:${item.id}`,
      deviationId: first.id,
      reason: 'Closed earlier',
    })
    const next = await createSpecificationLocalDeviation(db, {
      specificationLocalRequirementId: item.id,
      motivation: 'Legacy second',
    })
    await requestSpecificationLocalReview(db, next.id)
    await recordSpecificationLocalDecision(db, next.id, {
      decision: 1,
      decisionMotivation: 'Legacy replacement',
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE-REVIEWER',
    })
    await db.query(
      'UPDATE specification_local_requirement_deviations SET decided_at = NULL WHERE specification_local_requirement_id = @0',
      [item.id],
    )
    const read = await workflow.read(context, specification.id)
    for (const [id, applicability] of [
      [first.id, 'superseded'],
      [next.id, 'applicable'],
    ] as const) {
      expect(await getSpecificationLocalDeviation(db, id)).toMatchObject({
        applicability,
      })
      expect(read.deviations.find(value => value.id === id)).toMatchObject({
        applicability,
      })
    }
  })
})
