import { describe, expect, it } from 'vitest'
import { createSpecificationAgreementWorkflow } from '@/lib/specifications/agreements'
import { resetDemoSqlServerData } from '@/scripts/db-sqlserver-admin.mjs'
import { requireTestValue } from '@/tests/helpers/require-test-value'
import { seedDemoDatabase } from '@/typeorm/seed.mjs'
import {
  makeRequestContext,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

describe('agreement demo data', () => {
  const database = useSqlIntegrationDatabase()
  it('seeds complete current, draft, upcoming and cancelled agreement contexts idempotently', async () => {
    const db = database()
    await seedDemoDatabase(db)
    const workflow = createSpecificationAgreementWorkflow(db)
    const context = await makeRequestContext()
    const adaContext = {
      ...context,
      actor: {
        ...context.actor,
        hsaId: 'SE5560000001-admin1',
        displayName: 'Ada Admin',
      },
    }
    expect(await workflow.read(adaContext, 8)).toMatchObject({
      canDecide: true,
      canAuthor: true,
      agreements: [],
      selectedAgreement: null,
    })
    expect(
      (await workflow.read(context, 3)).agreements.map(
        agreement => agreement.state,
      ),
    ).toEqual(['current'])
    expect((await workflow.read(context, 3)).corrections).toEqual([
      expect.objectContaining({
        oldAgreementReference: 'AVTAL-3',
        newAgreementReference: 'AVTAL-3-A',
      }),
    ])
    const drafted = await workflow.read(context, 4)
    expect(drafted.agreements.map(agreement => agreement.state)).toEqual([
      'current',
      'draft',
    ])
    const draftId = requireTestValue(
      drafted.agreements.find(agreement => agreement.state === 'draft'),
    ).id
    expect(
      (await workflow.read(context, 4, { agreementId: draftId })).items.some(
        item => item.changeKind === 'added',
      ),
    ).toBe(true)
    const converted = requireTestValue(
      (await workflow.read(context, 4, { agreementId: draftId })).items.find(
        item => item.sourceRequirementVersionId !== null,
      ),
    )
    const conversionHistory = await workflow.history(
      context,
      4,
      draftId,
      converted.itemRef,
    )
    expect(conversionHistory.previous?.item.requirementVersionId).toBe(
      converted.sourceRequirementVersionId,
    )
    const current = await workflow.read(context, 5)
    expect(current.agreements.map(agreement => agreement.state)).toEqual([
      'previous',
      'current',
      'cancelled',
      'upcoming',
    ])
    const cancelledId = requireTestValue(
      current.agreements.find(agreement => agreement.state === 'cancelled'),
    ).id
    const cancelled = await workflow.read(context, 5, {
      agreementId: cancelledId,
    })
    expect(
      cancelled.items.every(item => item.specificationItemStatusId > 0),
    ).toBe(true)
    expect(
      cancelled.items.find(item => item.itemRef === current.items[0]?.itemRef),
    ).toMatchObject({
      specificationItemStatusId: requireTestValue(current.items[0])
        .specificationItemStatusId,
      note: requireTestValue(current.items[0]).note,
      needsReference: requireTestValue(current.items[0]).needsReference,
    })
    const shared = requireTestValue(
      cancelled.items.find(item => item.itemRef.startsWith('lib:')),
    )
    await db.query(
      'UPDATE requirements_specification_items SET specification_item_status_id = 3, note = @1 WHERE id = @0',
      [
        Number(shared.itemRef.split(':')[1]),
        'Current follow-up after cancellation',
      ],
    )
    const stillCancelled = await workflow.read(context, 5, {
      agreementId: cancelledId,
    })
    expect(
      stillCancelled.items.find(item => item.itemRef === shared.itemRef),
    ).toMatchObject({
      specificationItemStatusId: shared.specificationItemStatusId,
      note: shared.note,
    })
    const upcomingId = requireTestValue(
      current.agreements.find(agreement => agreement.state === 'upcoming'),
    ).id
    const upcoming = await workflow.read(context, 5, {
      agreementId: upcomingId,
    })
    expect(
      current.items.some(
        item =>
          item.description ===
          'Leverantören ska erbjuda dokumenterad beredskap.',
      ),
    ).toBe(true)
    expect(
      upcoming.items.some(
        item =>
          item.description === 'Beredskap ska finnas under avtalad servicetid.',
      ),
    ).toBe(true)
    expect(current.deviationEndings.some(ending => ending.endedAt)).toBe(true)
    await seedDemoDatabase(db)
    const repeated = await workflow.read(context, 5)
    expect(repeated.agreements.map(agreement => agreement.id)).toEqual(
      current.agreements.map(agreement => agreement.id),
    )
    expect(repeated.items.map(item => item.itemRef)).toEqual(
      current.items.map(item => item.itemRef),
    )
    await resetDemoSqlServerData(db)
    await seedDemoDatabase(db)
    expect((await workflow.read(context, 3)).corrections).toHaveLength(1)
    expect(
      (await workflow.read(context, 4, { agreementId: draftId })).items.find(
        item => item.itemRef === converted.itemRef,
      )?.sourceRequirementVersionId,
    ).toBe(converted.sourceRequirementVersionId)
  })
})
