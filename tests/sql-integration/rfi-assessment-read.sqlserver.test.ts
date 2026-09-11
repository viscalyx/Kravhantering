import { describe, expect, it, vi } from 'vitest'
import {
  createRfiQuestion,
  getSpecificationRfiList,
  lockSpecificationRfiList,
  updateSpecificationRfiQuestionItem,
} from '@/lib/dal/rfi-questions'
import {
  createArea,
  createSpecificationFixture,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

describe('RFI assessment read consistency', () => {
  const database = useSqlIntegrationDatabase()

  it('returns matching current outcome and evidence when another author saves during a read', async () => {
    const db = database()
    const actor = { displayName: 'RFI author', hsaId: 'SE5560000001-rfi' }
    const area = await createArea(db)
    const specification = await createSpecificationFixture(db, 'SQL-RFI-READ')
    const question = await createRfiQuestion(
      db,
      { areaId: area.id, questionText: 'Hosting?' },
      actor,
    )
    if (question.versionId == null) throw new Error('Missing fixture version')
    const locked = await lockSpecificationRfiList(db, specification.id, actor)
    const context = {
      assessedVersionId: question.versionId,
      expectedLockRevision: locked.lockRevision,
    }
    await updateSpecificationRfiQuestionItem(
      db,
      specification.id,
      question.id,
      { ...context, relevance: 'relevant', reason: 'Original evidence' },
      actor,
    )

    const createQueryRunner = db.createQueryRunner.bind(db)
    let intercepted = false
    let save: ReturnType<typeof updateSpecificationRfiQuestionItem> | undefined
    const spy = vi
      .spyOn(db, 'createQueryRunner')
      .mockImplementation((...args) => {
        const runner = createQueryRunner(...args)
        const query = runner.query.bind(runner)
        vi.spyOn(runner, 'query').mockImplementation(async (...queryArgs) => {
          const result = await query(...queryArgs)
          if (
            !intercepted &&
            queryArgs[0].includes('item.relevance AS relevance')
          ) {
            intercepted = true
            save = updateSpecificationRfiQuestionItem(
              db,
              specification.id,
              question.id,
              { ...context, relevance: 'not_relevant', reason: 'New evidence' },
              actor,
            )
            // Let an unprotected writer finish between the item and history reads.
            // A protected writer waits for this read transaction to complete.
            await Promise.race([
              save,
              new Promise(resolve => setTimeout(resolve, 500)),
            ])
          }
          return result
        })
        return runner
      })
    try {
      const duringSave = await getSpecificationRfiList(db, specification.id)
      await save
      expect(intercepted).toBe(true)
      expect(duringSave.items[0]).toMatchObject({
        relevance: 'relevant',
        assessment: { relevance: 'relevant', reason: 'Original evidence' },
      })
      expect(
        (await getSpecificationRfiList(db, specification.id)).items[0],
      ).toMatchObject({
        relevance: 'not_relevant',
        assessment: { relevance: 'not_relevant', reason: 'New evidence' },
      })
    } finally {
      spy.mockRestore()
    }
  })
})
