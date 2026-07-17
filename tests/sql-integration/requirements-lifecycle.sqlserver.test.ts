import { describe, expect, it } from 'vitest'
import {
  approveArchiving,
  cancelArchiving,
  editRequirement,
  getVersionHistory,
  initiateArchiving,
} from '@/lib/dal/requirements'
import {
  STATUS_ARCHIVED,
  STATUS_DRAFT,
  STATUS_PUBLISHED,
  STATUS_REVIEW,
} from '@/lib/requirements/status-constants.mjs'
import {
  createArea,
  createPublishedRequirement,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

describe('requirement lifecycle concurrency and constraints', () => {
  const appDb = useSqlIntegrationDatabase()

  it('allows exactly one concurrent archiving initiation', async () => {
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Concurrent initiate baseline',
    )

    const results = await Promise.allSettled([
      initiateArchiving(appDb(), published.requirementId),
      initiateArchiving(appDb(), published.requirementId),
    ])

    const fulfilled = results.filter(result => result.status === 'fulfilled')
    const rejected = results.filter(result => result.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: 'conflict',
    })

    const history = await getVersionHistory(appDb(), published.requirementId)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      status: STATUS_REVIEW,
      versionNumber: 1,
    })
    expect(history[0]?.archiveInitiatedAt).not.toBeNull()
  })

  it('allows exactly one concurrent archiving approval', async () => {
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Concurrent approve baseline',
    )
    await initiateArchiving(appDb(), published.requirementId)

    const results = await Promise.allSettled([
      approveArchiving(appDb(), published.requirementId),
      approveArchiving(appDb(), published.requirementId),
    ])

    const fulfilled = results.filter(result => result.status === 'fulfilled')
    const rejected = results.filter(result => result.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: 'conflict',
    })

    const history = await getVersionHistory(appDb(), published.requirementId)
    expect(history[0]).toMatchObject({
      status: STATUS_ARCHIVED,
      versionNumber: 1,
    })
    expect(history[0]?.archivedAt).not.toBeNull()
    const flagRows = (await appDb().query(
      `SELECT is_archived AS isArchived FROM requirements WHERE id = @0`,
      [published.requirementId],
    )) as Array<{ isArchived: number | boolean }>
    expect(Number(flagRows[0]?.isArchived)).toBe(1)
  })

  it('allows only one concurrent archiving approval or cancellation', async () => {
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Concurrent approve-vs-cancel baseline',
    )
    await initiateArchiving(appDb(), published.requirementId)

    const results = await Promise.allSettled([
      approveArchiving(appDb(), published.requirementId),
      cancelArchiving(appDb(), published.requirementId),
    ])

    const fulfilled = results.filter(result => result.status === 'fulfilled')
    const rejected = results.filter(result => result.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: 'conflict',
    })

    const history = await getVersionHistory(appDb(), published.requirementId)
    const firstVersion = history.find(version => version.versionNumber === 1)
    expect(firstVersion).toBeDefined()
    expect([STATUS_ARCHIVED, STATUS_PUBLISHED]).toContain(firstVersion?.status)
    expect(firstVersion?.archiveInitiatedAt).toBeNull()

    const flagRows = (await appDb().query(
      `SELECT is_archived AS isArchived FROM requirements WHERE id = @0`,
      [published.requirementId],
    )) as Array<{ isArchived: number | boolean }>
    expect(Number(flagRows[0]?.isArchived) === 1).toBe(
      firstVersion?.status === STATUS_ARCHIVED,
    )
  })

  it('targets the initiated predecessor when a newer draft exists', async () => {
    const area = await createArea(appDb())
    const approved = await createPublishedRequirement(
      appDb(),
      area.id,
      'Strict-target approval baseline',
    )
    const approvedDraft = await editRequirement(
      appDb(),
      approved.requirementId,
      {
        baseRevisionToken: approved.revisionToken,
        baseVersionId: approved.publishedVersionId,
        description: 'Approval successor draft',
      },
    )
    await appDb().query(
      `UPDATE requirement_versions
        SET requirement_status_id = @0,
            archive_initiated_at = @1,
            revision_token = NEWID()
        WHERE id = @2`,
      [STATUS_REVIEW, new Date(), approved.publishedVersionId],
    )

    await approveArchiving(appDb(), approved.requirementId)

    const approvedHistory = await getVersionHistory(
      appDb(),
      approved.requirementId,
    )
    expect(
      approvedHistory.find(version => version.versionNumber === 1),
    ).toMatchObject({
      status: STATUS_ARCHIVED,
    })
    expect(
      approvedHistory.find(version => version.versionNumber === 2),
    ).toMatchObject({
      id: approvedDraft.id,
      revisionToken: approvedDraft.revisionToken,
      status: STATUS_DRAFT,
    })

    const cancelled = await createPublishedRequirement(
      appDb(),
      area.id,
      'Strict-target cancellation baseline',
    )
    const cancelledDraft = await editRequirement(
      appDb(),
      cancelled.requirementId,
      {
        baseRevisionToken: cancelled.revisionToken,
        baseVersionId: cancelled.publishedVersionId,
        description: 'Cancellation successor draft',
      },
    )
    await appDb().query(
      `UPDATE requirement_versions
        SET requirement_status_id = @0,
            archive_initiated_at = @1,
            revision_token = NEWID()
        WHERE id = @2`,
      [STATUS_REVIEW, new Date(), cancelled.publishedVersionId],
    )

    await cancelArchiving(appDb(), cancelled.requirementId)

    const cancelledHistory = await getVersionHistory(
      appDb(),
      cancelled.requirementId,
    )
    expect(
      cancelledHistory.find(version => version.versionNumber === 1),
    ).toMatchObject({
      archiveInitiatedAt: null,
      status: STATUS_PUBLISHED,
    })
    expect(
      cancelledHistory.find(version => version.versionNumber === 2),
    ).toMatchObject({
      id: cancelledDraft.id,
      revisionToken: cancelledDraft.revisionToken,
      status: STATUS_DRAFT,
    })
  })

  it('rejects more than one archiving-in-progress version per requirement', async () => {
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Duplicate archive target baseline',
    )
    const draft = await editRequirement(appDb(), published.requirementId, {
      baseRevisionToken: published.revisionToken,
      baseVersionId: published.publishedVersionId,
      description: 'Successor draft with duplicate archive flag attempt',
    })
    await appDb().query(
      `UPDATE requirement_versions
        SET requirement_status_id = @0,
            archive_initiated_at = @1,
            revision_token = NEWID()
        WHERE id = @2`,
      [STATUS_REVIEW, new Date(), published.publishedVersionId],
    )

    await expect(
      appDb().query(
        `UPDATE requirement_versions
          SET archive_initiated_at = @0,
              revision_token = NEWID()
          WHERE id = @1`,
        [new Date(), draft.id],
      ),
    ).rejects.toThrow(
      'uq_requirement_versions_archive_initiated_requirement_id',
    )

    const history = await getVersionHistory(appDb(), published.requirementId)
    expect(
      history.find(version => version.versionNumber === 1)?.archiveInitiatedAt,
    ).not.toBeNull()
    expect(
      history.find(version => version.versionNumber === 2)?.archiveInitiatedAt,
    ).toBeNull()
  })

  it('rejects more than one published version per requirement', async () => {
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Duplicate published baseline',
    )
    const draft = await editRequirement(appDb(), published.requirementId, {
      baseRevisionToken: published.revisionToken,
      baseVersionId: published.publishedVersionId,
      description: 'Successor draft with duplicate published attempt',
    })

    await expect(
      appDb().query(
        `UPDATE requirement_versions
          SET requirement_status_id = @0,
              published_at = @1,
              revision_token = NEWID()
          WHERE id = @2`,
        [STATUS_PUBLISHED, new Date(), draft.id],
      ),
    ).rejects.toThrow('uq_requirement_versions_published_requirement_id')

    const history = await getVersionHistory(appDb(), published.requirementId)
    expect(history.find(version => version.versionNumber === 1)?.status).toBe(
      STATUS_PUBLISHED,
    )
    expect(history.find(version => version.versionNumber === 2)?.status).toBe(
      STATUS_DRAFT,
    )
  })
})
