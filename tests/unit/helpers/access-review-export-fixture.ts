import type { AccessReviewExportV1 } from '@/lib/access-review/types'

export function accessReviewExportFixture(): AccessReviewExportV1 {
  const actor = {
    displayName: 'no-user',
    hsaId: 'SE5560000001-reviewer1',
  }
  return {
    generatedAt: '2026-08-04T12:00:00.000Z',
    generatedBy: actor,
    items: [
      ...(
        [
          'approved',
          'changed',
          'not_applicable',
          'pending',
          'revoke_required',
        ] as const
      ).map((decision, index) => ({
        comment: index === 0 ? 'Reviewed' : null,
        createdAt: '2026-08-04T12:00:00.000Z',
        decidedAt: index === 0 ? '2026-08-04T12:30:00.000Z' : null,
        decidedBy: index === 0 ? actor : null,
        decision,
        id: index + 1,
        permissionType: 'area_owner' as const,
        principal: actor,
        scope: { key: '1', label: 'Area', type: 'requirement_area' as const },
        sourceKey: 'requirement_areas.owner',
        sourceTable: 'requirement_areas',
      })),
    ],
    limitations: [
      { description: 'External roles excluded', key: 'external_roles' },
    ],
    run: {
      completedAt: '2026-08-04T13:00:00.000Z',
      completedBy: actor,
      createdAt: '2026-08-04T12:00:00.000Z',
      createdBy: actor,
      dueAt: '2026-09-04T12:00:00.000Z',
      externalEvidenceReference: null,
      id: 42,
      periodEnd: '2026-12-31',
      periodStart: '2026-01-01',
      reviewer: actor,
      status: 'completed',
      summary: {
        approvedCount: 1,
        changedCount: 1,
        itemCount: 5,
        notApplicableCount: 1,
        pendingCount: 1,
        revokeRequiredCount: 1,
      },
      updatedAt: '2026-08-04T13:00:00.000Z',
    },
    schemaVersion: 'access-review-export.v1',
  }
}
