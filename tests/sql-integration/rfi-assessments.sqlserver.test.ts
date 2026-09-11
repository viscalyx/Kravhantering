import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  executeArchivingRetention,
  exportArchivingRetentionArchive,
  previewArchivingRetention,
} from '@/lib/archiving/retention'
import {
  createRfiQuestion,
  getRfiQuestion,
  getSpecificationRfiList,
  lockSpecificationRfiList,
  setRfiQuestionArchived,
  unlockSpecificationRfiList,
  updateRfiQuestion,
  updateSpecificationRfiQuestionItem,
} from '@/lib/dal/rfi-questions'
import type { SqlServerDatabase } from '@/lib/db'
import {
  executePrivacyErasure,
  previewPrivacyErasure,
} from '@/lib/privacy/erasure'
import {
  createArea,
  createSpecificationFixture,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

const actor = {
  displayName: 'Assessment author',
  hsaId: 'SE5560000001-rfiauthor',
}

async function createFixture(db: SqlServerDatabase, questionText: string) {
  const area = await createArea(db)
  const specification = await createSpecificationFixture(db, 'SQL-RFI-1326')
  const question = await createRfiQuestion(
    db,
    { areaId: area.id, questionText },
    actor,
  )
  if (question.versionId == null)
    throw new Error('Fixture question has no version')
  return {
    specification,
    question: { ...question, versionId: question.versionId },
  }
}

async function ensureRfiRetentionPolicy(
  db: SqlServerDatabase,
): Promise<number> {
  const policies = await db.query<Array<{ id: number }>>(`
    IF NOT EXISTS (
      SELECT 1 FROM archiving_retention_policies WHERE policy_key = N'rfi_questions_retention_delete'
    )
      INSERT INTO archiving_retention_policies
        (policy_key, information_set, action, age_days, status_condition, is_enabled, decision_reference, created_at, updated_at)
      VALUES (N'rfi_questions_retention_delete', N'RFI history', N'delete', 730, N'Unreferenced', 1, N'Issue 1326', SYSUTCDATETIME(), SYSUTCDATETIME());
    SELECT id FROM archiving_retention_policies WHERE policy_key = N'rfi_questions_retention_delete'`)
  return policies[0].id
}

describe('RFI assessment persistence', () => {
  const database = useSqlIntegrationDatabase()
  beforeAll(() => {
    for (const [key, value] of Object.entries({
      AUTH_OIDC_ISSUER_URL: 'https://idp.example.test',
      AUTH_OIDC_CLIENT_ID: 'sql-test',
      AUTH_OIDC_CLIENT_SECRET: 'sql-test',
      AUTH_OIDC_REDIRECT_URI: 'https://app.example.test/callback',
      AUTH_OIDC_POST_LOGOUT_REDIRECT_URI: 'https://app.example.test',
      AUTH_SESSION_COOKIE_PASSWORD: 'sql-integration-cookie-password-1326',
    }))
      vi.stubEnv(key, value)
  })
  afterAll(() => vi.unstubAllEnvs())

  it('rejects a confirmation from an earlier lock without saving any assessment', async () => {
    const db = database()
    const { specification, question } = await createFixture(db, 'Hosting?')
    const locked = await lockSpecificationRfiList(db, specification.id, actor)
    await unlockSpecificationRfiList(db, specification.id)
    await lockSpecificationRfiList(db, specification.id, actor)

    await expect(
      updateSpecificationRfiQuestionItem(
        db,
        specification.id,
        question.id,
        {
          relevance: 'relevant',
          assessedVersionId: question.versionId,
          expectedLockRevision: locked.lockRevision,
        },
        actor,
      ),
    ).rejects.toMatchObject({
      status: 409,
      details: { reason: 'rfi_assessment_context_changed' },
    })
    expect(
      (await getSpecificationRfiList(db, specification.id)).assessmentHistory,
    ).toEqual([])
  })

  it('saves and reloads a version-bound assessment with optional evidence', async () => {
    const db = database()
    const { specification, question } = await createFixture(
      db,
      'Who provides hosting?',
    )
    const locked = await lockSpecificationRfiList(db, specification.id, actor)
    await updateSpecificationRfiQuestionItem(
      db,
      specification.id,
      question.id,
      {
        relevance: 'not_relevant',
        assessedVersionId: question.versionId,
        expectedLockRevision: locked.lockRevision,
        reason: 'Hosting is covered by an existing agreement.',
        documentReference: 'Agreement 2026-14, section 3',
        documentUrl: 'https://example.org/agreement',
      },
      actor,
    )

    const reloaded = await getSpecificationRfiList(db, specification.id)
    expect(reloaded.items[0].assessment).toMatchObject({
      relevance: 'not_relevant',
      versionId: question.versionId,
      reason: 'Hosting is covered by an existing agreement.',
      documentReference: 'Agreement 2026-14, section 3',
      documentUrl: 'https://example.org/agreement',
      createdByHsaId: actor.hsaId,
    })
    expect(reloaded.assessmentHistory).toHaveLength(1)
  })

  it('keeps a locked assessment until adoption, then requires confirmation and preserves history after removal', async () => {
    const db = database()
    const { specification, question } = await createFixture(db, 'Hosting?')
    let list = await lockSpecificationRfiList(db, specification.id, actor)
    const evidence = {
      relevance: 'not_relevant' as const,
      reason: 'Existing agreement',
      documentReference: 'Agreement 14',
    }
    list = await updateSpecificationRfiQuestionItem(
      db,
      specification.id,
      question.id,
      {
        ...evidence,
        assessedVersionId: question.versionId,
        expectedLockRevision: list.lockRevision,
      },
      actor,
    )
    const original = list.assessmentHistory[0]
    await updateRfiQuestion(
      db,
      question.id,
      { questionText: 'Who operates hosting?' },
      actor,
    )
    expect(
      (await getSpecificationRfiList(db, specification.id)).items[0].assessment,
    ).toEqual(original)
    await unlockSpecificationRfiList(db, specification.id)
    list = await lockSpecificationRfiList(db, specification.id, actor)
    expect(list.items[0]).toMatchObject({
      relevance: null,
      assessment: null,
      previousAssessment: original,
    })
    await expect(
      updateSpecificationRfiQuestionItem(
        db,
        specification.id,
        question.id,
        {
          ...evidence,
          assessedVersionId: question.versionId,
          expectedLockRevision: list.lockRevision,
        },
        actor,
      ),
    ).rejects.toMatchObject({ status: 409 })
    list = await updateSpecificationRfiQuestionItem(
      db,
      specification.id,
      question.id,
      {
        ...evidence,
        assessedVersionId: list.items[0].versionId,
        expectedLockRevision: list.lockRevision,
      },
      { ...actor, displayName: 'Co-author', hsaId: 'SE5560000001-coauthor' },
    )
    expect(list.items[0].assessment).toMatchObject({
      ...evidence,
      versionNumber: 2,
      createdByDisplayName: 'Co-author',
    })
    expect(list.assessmentHistory[1]).toEqual(original)
    await unlockSpecificationRfiList(db, specification.id)
    const sameVersion = await lockSpecificationRfiList(
      db,
      specification.id,
      actor,
    )
    expect(sameVersion.items[0].assessment).toEqual(list.items[0].assessment)
    await setRfiQuestionArchived(db, question.id, true)
    await unlockSpecificationRfiList(db, specification.id)
    const removed = await lockSpecificationRfiList(db, specification.id, actor)
    expect(removed.items).toEqual([])
    expect(removed.assessmentHistory).toEqual(list.assessmentHistory)
  })

  it.each(['relevant', 'not_relevant'] as const)(
    'allows %s with empty evidence and retains every later edit',
    async relevance => {
      const db = database()
      const { specification, question } = await createFixture(db, 'Hosting?')
      let list = await lockSpecificationRfiList(db, specification.id, actor)
      const context = {
        assessedVersionId: question.versionId,
        expectedLockRevision: list.lockRevision,
      }
      list = await updateSpecificationRfiQuestionItem(
        db,
        specification.id,
        question.id,
        { ...context, relevance },
        actor,
      )
      expect(list.items[0].assessment).toMatchObject({
        relevance,
        reason: null,
        documentReference: null,
        documentUrl: null,
      })
      list = await updateSpecificationRfiQuestionItem(
        db,
        specification.id,
        question.id,
        { ...context, relevance, documentUrl: 'https://example.org/evidence' },
        actor,
      )
      expect(list.assessmentHistory).toHaveLength(2)
      expect(list.assessmentHistory[1].documentUrl).toBeNull()
    },
  )

  it('rolls back the assessment if updating the current list fails', async () => {
    const db = database()
    const { specification, question } = await createFixture(db, 'Hosting?')
    const list = await lockSpecificationRfiList(db, specification.id, actor)
    await db.query(
      `CREATE TRIGGER fail_rfi_item ON specification_rfi_question_items AFTER UPDATE AS THROW 51000, 'Injected item failure', 1;`,
    )
    try {
      await expect(
        updateSpecificationRfiQuestionItem(
          db,
          specification.id,
          question.id,
          {
            relevance: 'relevant',
            assessedVersionId: question.versionId,
            expectedLockRevision: list.lockRevision,
          },
          actor,
        ),
      ).rejects.toThrow('Injected item failure')
    } finally {
      await db.query('DROP TRIGGER fail_rfi_item')
    }
    const after = await getSpecificationRfiList(db, specification.id)
    expect(after.assessmentHistory).toEqual([])
    expect(after.items[0].relevance).toBeNull()
  })

  it('preserves historical questions and versions during retention while deleting unreferenced controls', async () => {
    const db = database()
    const { specification, question } = await createFixture(db, 'Hosting?')
    let list = await lockSpecificationRfiList(db, specification.id, actor)
    await updateSpecificationRfiQuestionItem(
      db,
      specification.id,
      question.id,
      {
        relevance: 'relevant',
        assessedVersionId: question.versionId,
        expectedLockRevision: list.lockRevision,
      },
      actor,
    )
    await updateRfiQuestion(
      db,
      question.id,
      { questionText: 'Updated hosting?' },
      actor,
    )
    await setRfiQuestionArchived(db, question.id, true)
    await unlockSpecificationRfiList(db, specification.id)
    list = await lockSpecificationRfiList(db, specification.id, actor)
    expect(list.items).toEqual([])
    await db.query(
      `UPDATE rfi_questions SET archived_at = '2020-01-01' WHERE id = @0`,
      [question.id],
    )
    await db.query(
      `UPDATE rfi_question_versions SET updated_at = '2020-01-01' WHERE rfi_question_id = @0`,
      [question.id],
    )
    const archivedControl = await createRfiQuestion(
      db,
      {
        areaId: question.areaId,
        questionText: 'Unreferenced archived question?',
      },
      actor,
    )
    await setRfiQuestionArchived(db, archivedControl.id, true)
    await db.query(
      `UPDATE rfi_questions SET archived_at = '2020-01-01' WHERE id = @0`,
      [archivedControl.id],
    )
    const versionControl = await createRfiQuestion(
      db,
      { areaId: question.areaId, questionText: 'Unreferenced old version?' },
      actor,
    )
    await updateRfiQuestion(
      db,
      versionControl.id,
      { questionText: 'Current control version?' },
      actor,
    )
    await db.query(
      `UPDATE rfi_question_versions SET updated_at = '2020-01-01' WHERE id = @0`,
      [versionControl.versionId],
    )
    const policyId = await ensureRfiRetentionPolicy(db)
    const preview = await previewArchivingRetention(db, {
      policyId,
    })
    expect(preview.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectTable: 'rfi_questions',
          subjectId: String(archivedControl.id),
        }),
        expect.objectContaining({
          subjectTable: 'rfi_question_versions',
          subjectId: String(versionControl.versionId),
        }),
      ]),
    )
    expect(preview.candidates).toHaveLength(2)
    const result = await executeArchivingRetention(
      db,
      { policyId, previewToken: preview.previewToken },
      actor,
    )
    expect(result.summary.deleteCount).toBe(2)
    expect(await getRfiQuestion(db, archivedControl.id)).toBeNull()
    expect(await getRfiQuestion(db, versionControl.id)).toMatchObject({
      questionText: 'Current control version?',
      versionNumber: 2,
    })
    expect(await getRfiQuestion(db, question.id)).toMatchObject({
      isArchived: true,
      questionText: 'Updated hosting?',
    })
    expect(
      (await getSpecificationRfiList(db, specification.id)).assessmentHistory,
    ).toEqual(list.assessmentHistory)
    expect(
      (await previewArchivingRetention(db, { policyId })).candidates,
    ).toEqual([])
  })

  it('rejects retention execution when a historical assessment is saved after preview', async () => {
    const db = database()
    const { specification, question } = await createFixture(db, 'Hosting?')
    const control = await createRfiQuestion(
      db,
      { areaId: question.areaId, questionText: 'Unreferenced control?' },
      actor,
    )
    for (const questionId of [question.id, control.id]) {
      await setRfiQuestionArchived(db, questionId, true)
      await db.query(
        `UPDATE rfi_questions SET archived_at = '2020-01-01' WHERE id = @0`,
        [questionId],
      )
    }
    const policyId = await ensureRfiRetentionPolicy(db)
    const preview = await previewArchivingRetention(db, { policyId })
    expect(preview.candidates).toHaveLength(2)

    await setRfiQuestionArchived(db, question.id, false)
    let list = await lockSpecificationRfiList(db, specification.id, actor)
    await updateSpecificationRfiQuestionItem(
      db,
      specification.id,
      question.id,
      {
        relevance: 'relevant',
        reason: 'Assessment saved after retention preview',
        assessedVersionId: question.versionId,
        expectedLockRevision: list.lockRevision,
      },
      actor,
    )
    await setRfiQuestionArchived(db, question.id, true)
    await unlockSpecificationRfiList(db, specification.id)
    list = await lockSpecificationRfiList(db, specification.id, actor)
    expect(list.items).toEqual([])
    await db.query(
      `UPDATE rfi_questions SET archived_at = '2020-01-01' WHERE id = @0`,
      [question.id],
    )

    await expect(
      executeArchivingRetention(
        db,
        { policyId, previewToken: preview.previewToken },
        actor,
      ),
    ).rejects.toMatchObject({
      status: 409,
      details: { reason: 'stale_archiving_retention_preview' },
    })
    expect(await getRfiQuestion(db, control.id)).toMatchObject({
      id: control.id,
    })
    const refreshed = await previewArchivingRetention(db, { policyId })
    expect(refreshed.candidates).toEqual([
      expect.objectContaining({
        subjectTable: 'rfi_questions',
        subjectId: String(control.id),
      }),
    ])
    await executeArchivingRetention(
      db,
      { policyId, previewToken: refreshed.previewToken },
      actor,
    )
    expect(await getRfiQuestion(db, control.id)).toBeNull()
    expect(await getRfiQuestion(db, question.id)).toMatchObject({
      id: question.id,
    })
    expect(
      (await getSpecificationRfiList(db, specification.id)).assessmentHistory,
    ).toEqual(list.assessmentHistory)
  })

  it('anonymizes assessment authors by exact HSA-id without changing evidence or a duplicate name', async () => {
    const db = database()
    const { specification, question } = await createFixture(db, 'Hosting?')
    const list = await lockSpecificationRfiList(db, specification.id, actor)
    const data = {
      relevance: 'relevant' as const,
      reason: 'Preserved evidence',
      assessedVersionId: question.versionId,
      expectedLockRevision: list.lockRevision,
    }
    await updateSpecificationRfiQuestionItem(
      db,
      specification.id,
      question.id,
      data,
      actor,
    )
    await updateSpecificationRfiQuestionItem(
      db,
      specification.id,
      question.id,
      data,
      { ...actor, hsaId: 'SE5560000001-other' },
    )
    const target = { hsaId: actor.hsaId }
    const preview = await previewPrivacyErasure(db, { target })
    expect(
      preview.groups.find(
        group => group.key === 'specification_rfi_assessments.created_by',
      )?.count,
    ).toBe(1)
    await executePrivacyErasure(db, {
      target,
      previewToken: preview.previewToken,
    })
    const history = (await getSpecificationRfiList(db, specification.id))
      .assessmentHistory
    expect(history[0]).toMatchObject({
      createdByHsaId: 'SE5560000001-other',
      createdByDisplayName: actor.displayName,
      reason: 'Preserved evidence',
    })
    expect(history[1]).toMatchObject({
      createdByHsaId: null,
      createdByDisplayName: 'no-user',
      reason: 'Preserved evidence',
    })
  })

  it('archives RFI evidence before specification retention and deletes all owned history', async () => {
    const db = database()
    const { specification, question } = await createFixture(db, 'Hosting?')
    const list = await lockSpecificationRfiList(db, specification.id, actor)
    await updateSpecificationRfiQuestionItem(
      db,
      specification.id,
      question.id,
      {
        relevance: 'not_relevant',
        reason: 'Existing agreement',
        documentReference: 'Agreement 14',
        assessedVersionId: question.versionId,
        expectedLockRevision: list.lockRevision,
      },
      actor,
    )
    await db.query(
      `UPDATE requirements_specifications SET updated_at = '2020-01-01', specification_lifecycle_status_id = 1 WHERE id = @0`,
      [specification.id],
    )
    const policies = await db.query<
      Array<{ id: number }>
    >(`INSERT INTO archiving_retention_policies
      (policy_key, information_set, action, age_days, status_condition, is_enabled, decision_reference, created_at, updated_at)
      OUTPUT INSERTED.id VALUES (N'obsolete_specifications_delete', N'Specifications', N'delete', 730, N'Obsolete', 1, N'Issue 1326', SYSUTCDATETIME(), SYSUTCDATETIME())`)
    const policyId = policies[0].id
    const preview = await previewArchivingRetention(db, { policyId })
    await expect(
      executeArchivingRetention(
        db,
        { policyId, previewToken: preview.previewToken },
        actor,
      ),
    ).rejects.toMatchObject({ status: 409 })
    const archive = await exportArchivingRetentionArchive(db, {
      policyId,
      previewToken: preview.previewToken,
    })
    expect(archive.archive).toMatchObject({
      specifications: [
        expect.objectContaining({
          rfiList: expect.objectContaining({ isLocked: true }),
          rfiItems: [
            expect.objectContaining({
              versionId: question.versionId,
              questionText: 'Hosting?',
            }),
          ],
          rfiAssessmentHistory: [
            expect.objectContaining({
              reason: 'Existing agreement',
              documentReference: 'Agreement 14',
              createdByHsaId: null,
              createdByDisplayName: null,
            }),
          ],
        }),
      ],
    })
    await executeArchivingRetention(
      db,
      {
        policyId,
        previewToken: preview.previewToken,
        exportToken: archive.exportToken,
      },
      actor,
    )
    expect(
      (await getSpecificationRfiList(db, specification.id)).assessmentHistory,
    ).toEqual([])
  })

  it('serializes competing confirmations and keeps each completed assessment', async () => {
    const db = database()
    const { specification, question } = await createFixture(db, 'Hosting?')
    const list = await lockSpecificationRfiList(db, specification.id, actor)
    const context = {
      assessedVersionId: question.versionId,
      expectedLockRevision: list.lockRevision,
    }
    await Promise.all([
      updateSpecificationRfiQuestionItem(
        db,
        specification.id,
        question.id,
        { ...context, relevance: 'relevant', reason: 'First author' },
        actor,
      ),
      updateSpecificationRfiQuestionItem(
        db,
        specification.id,
        question.id,
        { ...context, relevance: 'not_relevant', reason: 'Second author' },
        actor,
      ),
    ])
    const reloaded = await getSpecificationRfiList(db, specification.id)
    expect(
      reloaded.assessmentHistory.map(entry => entry.reason).sort(),
    ).toEqual(['First author', 'Second author'])
    expect(reloaded.items[0].assessment?.id).toBe(
      reloaded.assessmentHistory[0].id,
    )
  })
})
