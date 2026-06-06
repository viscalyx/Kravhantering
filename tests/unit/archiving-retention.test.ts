import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createArchivingRetentionException,
  executeArchivingRetention,
  exportArchivingRetentionArchive,
  previewArchivingRetention,
} from '@/lib/archiving/retention'

// cspell:ignore retentionorphan

const POLICY_ROW = {
  action: 'delete',
  ageDays: 730,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  decisionReference: 'docs/informationsmangder-kravhantering.md',
  id: 3,
  informationSet: 'Oanvänd taxonomi',
  isEnabled: 1,
  lastRunAt: null,
  latestArchivedCount: null,
  latestCandidateCount: null,
  latestCompletedAt: null,
  latestDeletedCount: null,
  latestExceptionCount: null,
  latestRunId: null,
  latestSkippedCount: null,
  policyKey: 'unused_taxonomy_delete',
  statusCondition: 'Unused taxonomy rows',
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
}

const BASE_SOURCE_CANDIDATES: Record<string, Array<Record<string, unknown>>> = {
  'norm_references.unused': [],
  'requirement_areas.unused': [
    {
      age_basis: new Date('2023-01-01T00:00:00.000Z'),
      current_display_value: 'Old area',
      reference: 'OLD Old area',
      source_key: 'requirement_areas.unused',
      subject_id: '12',
      subject_table: 'requirement_areas',
    },
  ],
  'requirement_packages.unused': [],
  'requirement_versions.archived_unused': [
    {
      age_basis: new Date('2024-01-01T00:00:00.000Z'),
      current_display_value: null,
      reference: 'SEC-2 v1',
      source_key: 'requirement_versions.archived_unused',
      subject_id: '44',
      subject_table: 'requirement_versions',
    },
  ],
  'requirement_versions.draft_stale': [],
  'requirement_versions.review_stale': [],
  'requirements_specifications.obsolete': [
    {
      age_basis: new Date('2023-01-01T00:00:00.000Z'),
      current_display_value: 'Old specification',
      reference: 'OLD-SPEC Old specification',
      source_key: 'requirements_specifications.obsolete',
      subject_id: '22',
      subject_table: 'requirements_specifications',
    },
  ],
  'requirement_selection_answers.archived': [],
  'requirement_selection_questions.archived': [],
}

function createRetentionDb(options?: {
  executeAffectedBySubjectId?: Record<string, number>
  exceptionCount?: number
  inactive?: boolean
  policy?: Partial<typeof POLICY_ROW>
  requirementVersionCandidates?: Array<Record<string, unknown>>
  sourceCandidates?: Record<string, Array<Record<string, unknown>>>
  specificationCandidates?: Array<Record<string, unknown>>
  taxonomyCandidates?: Array<Record<string, unknown>>
}) {
  const sourceCandidates = {
    ...BASE_SOURCE_CANDIDATES,
    ...options?.sourceCandidates,
  }
  if (options?.requirementVersionCandidates) {
    sourceCandidates['requirement_versions.archived_unused'] =
      options.requirementVersionCandidates
  }
  if (options?.taxonomyCandidates) {
    sourceCandidates['requirement_areas.unused'] = options.taxonomyCandidates
  }
  if (options?.specificationCandidates) {
    sourceCandidates['requirements_specifications.obsolete'] =
      options.specificationCandidates
  }
  const query = vi.fn(
    async (sql: string, parameters?: unknown[]): Promise<unknown> => {
      if (sql.includes('FROM archiving_retention_policies policy')) {
        return [
          {
            ...POLICY_ROW,
            ...options?.policy,
            isEnabled: options?.inactive
              ? 0
              : (options?.policy?.isEnabled ?? 1),
          },
        ]
      }
      if (sql.includes('COUNT(*) AS count')) {
        return [{ count: options?.exceptionCount ?? 1 }]
      }
      for (const [sourceKey, candidateRows] of Object.entries(
        sourceCandidates,
      )) {
        if (sql.includes(`N'${sourceKey}' AS source_key`)) {
          return candidateRows
        }
      }
      if (
        sql.includes('FROM requirements_specifications specification') &&
        sql.includes('WHERE specification.id = @0')
      ) {
        return [
          {
            id: 22,
            name: 'Old specification',
            responsibleDisplayName: 'no-user',
            responsibleHsaId: null,
            uniqueId: 'OLD-SPEC',
          },
        ]
      }
      if (
        sql.includes('DELETE area') ||
        sql.includes('DECLARE @requirement_id int') ||
        sql.includes('DECLARE @question_id int') ||
        sql.includes('DECLARE @answer_id int') ||
        sql.includes('DELETE FROM specification_local_requirements')
      ) {
        const subjectId = String(parameters?.[0] ?? '')
        return {
          affected: options?.executeAffectedBySubjectId?.[subjectId] ?? 1,
        }
      }
      if (
        sql.includes('FROM specification_needs_references') ||
        sql.includes('FROM specification_co_authors') ||
        sql.includes('FROM requirements_specification_items') ||
        sql.includes('FROM specification_local_requirements') ||
        sql.includes('FROM deviations deviation') ||
        sql.includes('FROM specification_local_requirement_deviations')
      ) {
        return []
      }
      if (sql.startsWith('UPDATE requirement_versions')) {
        return { affected: 1 }
      }
      if (sql.includes('INSERT INTO archiving_retention_runs')) {
        return [{ id: 9 }]
      }
      return []
    },
  )
  const typedQuery = query as unknown as <T = unknown[]>(
    sql: string,
    parameters?: unknown[],
  ) => Promise<T>
  const db = {
    query: typedQuery,
    transaction: vi.fn(async (_isolation: string, callback) => {
      await callback({ query: typedQuery })
    }),
  }
  return { db, query }
}

describe('archiving retention service', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-14T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('previews retention candidates from active policies without exposing raw SQL choices', async () => {
    const { db, query } = createRetentionDb()

    const preview = await previewArchivingRetention(db as never, {
      now: new Date('2026-05-14T00:00:00.000Z'),
      policyId: 3,
    })

    expect(preview.policy.policyKey).toBe('unused_taxonomy_delete')
    expect(preview.summary).toMatchObject({
      archiveCount: 0,
      candidateCount: 1,
      deleteCount: 1,
      exceptionCount: 1,
    })
    expect(preview.candidates).toEqual([
      expect.objectContaining({
        action: 'delete',
        currentDisplayValue: 'Old area',
        key: 'requirement_areas.unused:12',
        reference: 'OLD Old area',
      }),
    ])
    expect(query.mock.calls[1]?.[1]).toEqual(['2024-05-14T00:00:00.000Z', 3])
  })

  it('rejects inactive policies before collecting candidates', async () => {
    const { db, query } = createRetentionDb({ inactive: true })

    await expect(
      previewArchivingRetention(db as never, { policyId: 3 }),
    ).rejects.toMatchObject({
      details: { reason: 'inactive_retention_policy' },
      status: 400,
    })
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("N'requirement_areas.unused'"),
      ),
    ).toBe(false)
  })

  it('executes only after a fresh preview token', async () => {
    const { db, query } = createRetentionDb()
    const preview = await previewArchivingRetention(db as never, {
      now: new Date('2026-05-14T00:00:00.000Z'),
      policyId: 3,
    })

    const result = await executeArchivingRetention(
      db as never,
      {
        policyId: 3,
        previewToken: preview.previewToken,
      },
      { displayName: 'Disa PrivacyOfficer', hsaId: 'SE5560000001-privacy1' },
    )

    expect(result.runId).toBe(9)
    expect(result.summary.deleteCount).toBe(1)
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('DELETE area')),
    ).toBe(true)
  })

  it('records run counts from candidates that actually changed', async () => {
    const { db, query } = createRetentionDb({
      executeAffectedBySubjectId: {
        '12': 1,
        '13': 0,
      },
      taxonomyCandidates: [
        {
          age_basis: new Date('2023-01-01T00:00:00.000Z'),
          current_display_value: 'Old area',
          reference: 'OLD Old area',
          source_key: 'requirement_areas.unused',
          subject_id: '12',
          subject_table: 'requirement_areas',
        },
        {
          age_basis: new Date('2023-01-01T00:00:00.000Z'),
          current_display_value: 'Already removed area',
          reference: 'REM Removed area',
          source_key: 'requirement_areas.unused',
          subject_id: '13',
          subject_table: 'requirement_areas',
        },
      ],
    })
    const preview = await previewArchivingRetention(db as never, {
      now: new Date('2026-05-14T00:00:00.000Z'),
      policyId: 3,
    })

    const result = await executeArchivingRetention(
      db as never,
      {
        policyId: 3,
        previewToken: preview.previewToken,
      },
      { displayName: 'Disa PrivacyOfficer', hsaId: 'SE5560000001-privacy1' },
    )

    expect(result.summary).toMatchObject({
      archiveCount: 0,
      candidateCount: 2,
      deleteCount: 1,
      skippedCount: 1,
    })
    const insertRunCall = query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO archiving_retention_runs'),
    )
    expect(insertRunCall?.[1]?.slice(5, 9)).toEqual([2, 0, 1, 1])
  })

  it('rejects stale execution tokens before modifying rows', async () => {
    const { db, query } = createRetentionDb()

    await expect(
      executeArchivingRetention(
        db as never,
        { policyId: 3, previewToken: 'stale' },
        { displayName: 'Disa PrivacyOfficer', hsaId: 'SE5560000001-privacy1' },
      ),
    ).rejects.toMatchObject({
      details: { reason: 'stale_archiving_retention_preview' },
      status: 409,
    })
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).startsWith('UPDATE requirement_versions'),
      ),
    ).toBe(false)
  })

  it('previews and executes unused taxonomy deletion without archive export', async () => {
    const { db, query } = createRetentionDb({
      policy: {
        action: 'delete',
        ageDays: 730,
        id: 3,
        policyKey: 'unused_taxonomy_delete',
      },
    })
    const preview = await previewArchivingRetention(db as never, {
      now: new Date('2026-05-14T00:00:00.000Z'),
      policyId: 3,
    })

    expect(preview.summary).toMatchObject({
      archiveCount: 0,
      candidateCount: 1,
      deleteCount: 1,
    })
    expect(preview.candidates[0]).toEqual(
      expect.objectContaining({
        action: 'delete',
        key: 'requirement_areas.unused:12',
        requiresExport: false,
      }),
    )

    await executeArchivingRetention(
      db as never,
      { policyId: 3, previewToken: preview.previewToken },
      { displayName: 'Disa PrivacyOfficer', hsaId: 'SE5560000001-privacy1' },
    )
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('DELETE area')),
    ).toBe(true)
  })

  it('previews every active retention source group with expected export requirements', async () => {
    const sourceCandidates = {
      'norm_references.unused': [
        {
          age_basis: new Date('2023-01-15T09:00:00.000Z'),
          current_display_value: 'RETENTION-SEED oanvänd normreferens',
          reference: 'RETENTION-SEED-NORM-UNUSED',
          source_key: 'norm_references.unused',
          subject_id: '910030',
          subject_table: 'norm_references',
        },
      ],
      'requirement_areas.unused': [
        {
          age_basis: new Date('2023-01-15T09:00:00.000Z'),
          current_display_value: 'RETENTION-SEED oanvänt kravområde',
          reference: 'RSU RETENTION-SEED oanvänt kravområde',
          source_key: 'requirement_areas.unused',
          subject_id: '910010',
          subject_table: 'requirement_areas',
        },
      ],
      'requirement_packages.unused': [
        {
          age_basis: new Date('2023-01-15T09:00:00.000Z'),
          current_display_value: 'RETENTION-SEED oanvänt kravpaket',
          reference: 'RETENTION-SEED oanvänt kravpaket',
          source_key: 'requirement_packages.unused',
          subject_id: '910020',
          subject_table: 'requirement_packages',
        },
      ],
      'requirement_versions.archived_unused': [
        {
          age_basis: new Date('2024-01-15T09:00:00.000Z'),
          current_display_value: null,
          reference: 'RETENTION-SEED-ARCHIVED v1',
          source_key: 'requirement_versions.archived_unused',
          subject_id: '910101',
          subject_table: 'requirement_versions',
        },
      ],
      'requirement_versions.draft_stale': [
        {
          age_basis: new Date('2024-01-15T09:00:00.000Z'),
          current_display_value: null,
          reference: 'RETENTION-SEED-DRAFT v1',
          source_key: 'requirement_versions.draft_stale',
          subject_id: '910103',
          subject_table: 'requirement_versions',
        },
      ],
      'requirement_versions.review_stale': [
        {
          age_basis: new Date('2024-01-15T09:00:00.000Z'),
          current_display_value: null,
          reference: 'RETENTION-SEED-REVIEW v1',
          source_key: 'requirement_versions.review_stale',
          subject_id: '910102',
          subject_table: 'requirement_versions',
        },
      ],
      'requirements_specifications.obsolete': [
        {
          age_basis: new Date('2023-01-15T09:00:00.000Z'),
          current_display_value:
            'RETENTION-SEED kravunderlag utanför förvaltning',
          reference:
            'RETENTION-SEED-OBSOLETE-SPEC RETENTION-SEED kravunderlag utanför förvaltning',
          source_key: 'requirements_specifications.obsolete',
          subject_id: '910300',
          subject_table: 'requirements_specifications',
        },
      ],
      'requirement_selection_questions.archived': [
        {
          age_basis: new Date('2024-01-15T09:00:00.000Z'),
          current_display_value:
            'RETENTION-SEED arkiverad kravurvalsfråga utan historik',
          reference:
            'RSK-KUF901 RETENTION-SEED arkiverad kravurvalsfråga utan historik',
          source_key: 'requirement_selection_questions.archived',
          subject_id: '910401',
          subject_table: 'requirement_selection_questions',
        },
      ],
      'requirement_selection_answers.archived': [
        {
          age_basis: new Date('2024-01-15T09:00:00.000Z'),
          current_display_value:
            'RETENTION-SEED arkiverat kravurvalssvar utan historik',
          reference:
            'RSK-KUF904 / RETENTION-SEED arkiverat kravurvalssvar utan historik',
          source_key: 'requirement_selection_answers.archived',
          subject_id: '910414',
          subject_table: 'requirement_selection_answers',
        },
      ],
    }

    const taxonomyPreview = await previewArchivingRetention(
      createRetentionDb({
        exceptionCount: 0,
        policy: {
          ageDays: 730,
          id: 3,
          policyKey: 'unused_taxonomy_delete',
        },
        sourceCandidates,
      }).db as never,
      { now: new Date('2026-05-14T00:00:00.000Z'), policyId: 3 },
    )
    expect(taxonomyPreview.summary).toMatchObject({
      archiveCount: 0,
      candidateCount: 3,
      deleteCount: 3,
    })
    expect(
      taxonomyPreview.candidates.map(candidate => candidate.sourceKey),
    ).toEqual([
      'requirement_areas.unused',
      'requirement_packages.unused',
      'norm_references.unused',
    ])

    const versionPreview = await previewArchivingRetention(
      createRetentionDb({
        exceptionCount: 0,
        policy: {
          ageDays: 365,
          id: 4,
          policyKey: 'old_requirement_versions_delete',
        },
        sourceCandidates,
      }).db as never,
      { now: new Date('2026-05-14T00:00:00.000Z'), policyId: 4 },
    )
    expect(versionPreview.summary).toMatchObject({
      archiveCount: 0,
      candidateCount: 3,
      deleteCount: 3,
    })
    expect(
      versionPreview.candidates.map(candidate => candidate.sourceKey),
    ).toEqual([
      'requirement_versions.archived_unused',
      'requirement_versions.review_stale',
      'requirement_versions.draft_stale',
    ])

    const specificationPreview = await previewArchivingRetention(
      createRetentionDb({
        exceptionCount: 0,
        policy: {
          ageDays: 730,
          id: 5,
          policyKey: 'obsolete_specifications_delete',
        },
        sourceCandidates,
      }).db as never,
      { now: new Date('2026-05-14T00:00:00.000Z'), policyId: 5 },
    )
    expect(specificationPreview.summary).toMatchObject({
      archiveCount: 1,
      candidateCount: 1,
      deleteCount: 1,
    })
    expect(specificationPreview.candidates[0]).toEqual(
      expect.objectContaining({
        requiresExport: true,
        sourceKey: 'requirements_specifications.obsolete',
      }),
    )

    const selectionPreview = await previewArchivingRetention(
      createRetentionDb({
        exceptionCount: 0,
        policy: {
          ageDays: 365,
          id: 6,
          policyKey: 'archived_requirement_selection_delete',
        },
        sourceCandidates,
      }).db as never,
      { now: new Date('2026-05-14T00:00:00.000Z'), policyId: 6 },
    )
    expect(selectionPreview.summary).toMatchObject({
      archiveCount: 0,
      candidateCount: 2,
      deleteCount: 2,
    })
    expect(
      selectionPreview.candidates.map(candidate => candidate.sourceKey),
    ).toEqual([
      'requirement_selection_questions.archived',
      'requirement_selection_answers.archived',
    ])
    expect(
      [
        ...taxonomyPreview.candidates,
        ...versionPreview.candidates,
        ...selectionPreview.candidates,
      ].every(candidate => !candidate.requiresExport),
    ).toBe(true)
  })

  it('deletes old requirement versions through the guarded multi-step SQL', async () => {
    const { db, query } = createRetentionDb({
      policy: {
        action: 'delete',
        ageDays: 365,
        id: 4,
        policyKey: 'old_requirement_versions_delete',
      },
    })
    const preview = await previewArchivingRetention(db as never, {
      now: new Date('2026-05-14T00:00:00.000Z'),
      policyId: 4,
    })

    expect(preview.candidates[0]).toEqual(
      expect.objectContaining({
        key: 'requirement_versions.archived_unused:44',
        objectKey: 'requirementVersions',
        requiresExport: false,
      }),
    )

    await executeArchivingRetention(
      db as never,
      { policyId: 4, previewToken: preview.previewToken },
      { displayName: 'Disa PrivacyOfficer', hsaId: 'SE5560000001-privacy1' },
    )
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('DELETE FROM requirement_versions WHERE id = @0'),
      ),
    ).toBe(true)
  })

  it('previews and deletes archived requirement-selection rows only when history is absent', async () => {
    const sourceCandidates = {
      'requirement_selection_questions.archived': [
        {
          age_basis: new Date('2024-01-15T09:00:00.000Z'),
          current_display_value: 'Archived question',
          reference: 'RSK-KUF901 Archived question',
          source_key: 'requirement_selection_questions.archived',
          subject_id: '910401',
          subject_table: 'requirement_selection_questions',
        },
      ],
      'requirement_selection_answers.archived': [
        {
          age_basis: new Date('2024-01-15T09:00:00.000Z'),
          current_display_value: 'Archived answer',
          reference: 'RSK-KUF904 / Archived answer',
          source_key: 'requirement_selection_answers.archived',
          subject_id: '910414',
          subject_table: 'requirement_selection_answers',
        },
      ],
    }
    const { db, query } = createRetentionDb({
      policy: {
        action: 'delete',
        ageDays: 365,
        id: 6,
        policyKey: 'archived_requirement_selection_delete',
      },
      sourceCandidates,
    })

    const preview = await previewArchivingRetention(db as never, {
      now: new Date('2026-05-14T00:00:00.000Z'),
      policyId: 6,
    })

    expect(preview.candidates).toEqual([
      expect.objectContaining({
        key: 'requirement_selection_questions.archived:910401',
        objectKey: 'requirementSelectionQuestions',
        requiresExport: false,
      }),
      expect.objectContaining({
        key: 'requirement_selection_answers.archived:910414',
        objectKey: 'requirementSelectionAnswers',
        requiresExport: false,
      }),
    ])
    const previewSql = query.mock.calls.map(([sql]) => String(sql)).join('\n')
    expect(previewSql).toContain('question.archived_at <= @0')
    expect(previewSql).toContain('saved.question_id = question.id')
    expect(previewSql).toContain('active_answer.question_id = question.id')
    expect(previewSql).toContain('active_answer.is_archived = 0')
    expect(previewSql).toContain('answer.archived_at <= @0')
    expect(previewSql).toContain('saved.answer_id = answer.id')
    expect(previewSql).toContain('saved_question.question_id = question.id')

    await executeArchivingRetention(
      db as never,
      { policyId: 6, previewToken: preview.previewToken },
      { displayName: 'Disa PrivacyOfficer', hsaId: 'SE5560000001-privacy1' },
    )
    const executeSql = query.mock.calls.map(([sql]) => String(sql)).join('\n')
    expect(executeSql).toContain('DECLARE @question_id int')
    expect(executeSql).toContain('DECLARE @answer_id int')
    expect(executeSql).toContain('active_answer.question_id = question.id')
    expect(executeSql).toContain('active_answer.is_archived = 0')
    expect(executeSql).toContain(
      'DELETE FROM requirement_selection_questions WHERE id = @question_id',
    )
    expect(executeSql).toContain(
      'DELETE FROM requirement_selection_answers WHERE id = @answer_id',
    )
  })

  it('requires and creates archive export before obsolete specification deletion', async () => {
    const { db } = createRetentionDb({
      policy: {
        action: 'delete',
        ageDays: 730,
        id: 5,
        policyKey: 'obsolete_specifications_delete',
      },
    })
    const preview = await previewArchivingRetention(db as never, {
      now: new Date('2026-05-14T00:00:00.000Z'),
      policyId: 5,
    })

    await expect(
      executeArchivingRetention(
        db as never,
        { policyId: 5, previewToken: preview.previewToken },
        { displayName: 'Disa PrivacyOfficer', hsaId: 'SE5560000001-privacy1' },
      ),
    ).rejects.toMatchObject({
      details: { reason: 'missing_archiving_export_confirmation' },
      status: 409,
    })

    const archive = await exportArchivingRetentionArchive(db as never, {
      policyId: 5,
      previewToken: preview.previewToken,
    })

    expect(archive.exportToken).toHaveLength(64)
    expect(archive.archive).toMatchObject({
      schemaVersion: 'archiving-retention-export.v3',
      specifications: [
        {
          specification: expect.objectContaining({
            responsibleDisplayName: null,
            responsibleHsaId: null,
          }),
        },
      ],
    })
    expect(JSON.stringify(archive.archive)).not.toContain('no-user')

    const result = await executeArchivingRetention(
      db as never,
      {
        exportToken: archive.exportToken,
        policyId: 5,
        previewToken: preview.previewToken,
      },
      { displayName: 'Disa PrivacyOfficer', hsaId: 'SE5560000001-privacy1' },
    )
    expect(result.runId).toBe(9)

    await expect(
      executeArchivingRetention(
        db as never,
        {
          exportToken: archive.exportToken,
          policyId: 5,
          previewToken: preview.previewToken,
        },
        { displayName: 'Disa PrivacyOfficer', hsaId: 'SE5560000001-privacy1' },
      ),
    ).rejects.toMatchObject({
      details: { reason: 'missing_archiving_export_confirmation' },
      status: 409,
    })
  })

  it('refreshes expired retention exceptions in place', async () => {
    const query = vi.fn(async (sql: string, parameters?: unknown[]) => {
      if (sql.includes('FROM archiving_retention_policies policy')) {
        return [POLICY_ROW]
      }
      if (sql.includes('FROM archiving_retention_exceptions')) {
        return [
          {
            createdAt: new Date('2024-01-01T00:00:00.000Z'),
            createdByDisplayName: 'Disa PrivacyOfficer',
            expiresAt: new Date('2024-02-01T00:00:00.000Z'),
            id: 7,
            policyId: 3,
            reason: 'Old legal hold',
            sourceKey: 'requirement_areas.unused',
            subjectId: '12',
            subjectTable: 'requirement_areas',
          },
        ]
      }
      if (sql.includes('UPDATE archiving_retention_exceptions')) {
        return [
          {
            createdAt: parameters?.[4],
            createdByDisplayName: parameters?.[3],
            expiresAt: parameters?.[5],
            id: parameters?.[0],
            policyId: 3,
            reason: parameters?.[1],
            sourceKey: 'requirement_areas.unused',
            subjectId: '12',
            subjectTable: 'requirement_areas',
          },
        ]
      }
      return []
    })

    const exception = await createArchivingRetentionException(
      { query } as never,
      {
        expiresAt: new Date('2026-12-31T00:00:00.000Z'),
        policyId: 3,
        reason: 'Renewed legal hold',
        sourceKey: 'requirement_areas.unused',
        subjectId: '12',
        subjectTable: 'requirement_areas',
      },
      { displayName: 'Ada Admin', hsaId: 'SE5560000001-admin1' },
    )

    expect(exception).toMatchObject({
      id: 7,
      reason: 'Renewed legal hold',
    })
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE archiving_retention_exceptions'),
      ),
    ).toBe(true)
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO archiving_retention_exceptions'),
      ),
    ).toBe(false)
  })
})
