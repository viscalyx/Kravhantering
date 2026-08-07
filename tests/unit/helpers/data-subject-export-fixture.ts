import type { DataSubjectExportV1 } from '@/lib/privacy/data-subject-export-types'

export function dataSubjectExportFixture(): DataSubjectExportV1 {
  return {
    generatedAt: '2026-08-04T12:00:00.000Z',
    generatedBy: {
      displayName: 'Privacy Officer',
      hsaId: 'SE5560000001-privacy1',
      roles: ['PrivacyOfficer'],
      source: 'oidc',
      sub: 'privacy-sub',
    },
    limitations: [
      { description: 'Free text is excluded.', key: 'free_text_not_scanned' },
    ],
    schemaVersion: 'privacy-data-subject-export.v1',
    sources: [
      {
        fieldKey: 'owner',
        items: [
          {
            fieldName: 'owner_hsa_id',
            relatedObject: {
              key: '1',
              label: 'Area',
              type: 'requirement_area',
            },
            relationToSubject: 'live_owner_assignment',
            sourceKey: 'requirement_areas.owner',
            table: 'requirement_areas',
            value: 'SE5560000001-subject1',
          },
        ],
        key: 'requirement_areas.owner',
        objectKey: 'requirementAreas',
        relationToSubject: 'live_owner_assignment',
        table: 'requirement_areas',
      },
    ],
    subject: {
      hsaId: 'SE5560000001-subject1',
      targetFingerprint: '0123456789abcdef0123456789abcdef',
    },
    summary: { itemCount: 1, limitationCount: 1, sourceCount: 1 },
  }
}
