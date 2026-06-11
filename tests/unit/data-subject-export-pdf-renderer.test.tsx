import { describe, expect, it } from 'vitest'
import {
  buildDataSubjectExportPdfModel,
  formatDataSubjectRelatedObjectLabel,
} from '@/components/privacy/DataSubjectExportPdfRenderer'
import type { DataSubjectExportV1 } from '@/lib/privacy/data-subject-export-types'

function exportPayload(): DataSubjectExportV1 {
  return {
    generatedAt: '2026-05-12T12:00:00.000Z',
    generatedBy: {
      displayName: 'Disa PrivacyOfficer',
      hsaId: 'SE5560000001-privacy1',
      roles: ['PrivacyOfficer'],
      source: 'oidc',
      sub: 'privacy-sub',
    },
    limitations: [
      {
        description:
          'Description and other free-text fields are not scanned because the product instructs users not to enter person-identifying data there.',
        key: 'free_text_not_scanned',
      },
      {
        description:
          'Direct transfer to another controller is not implemented in this version; downloadable JSON is the authoritative portability format.',
        key: 'direct_transfer_not_implemented',
      },
    ],
    schemaVersion: 'privacy-data-subject-export.v1',
    sources: [
      {
        fieldKey: 'session',
        items: [
          {
            fieldName: 'hsaId',
            relatedObject: {
              key: 'subject-1',
              label: 'Kalle Svensson',
              type: 'auth_session',
            },
            relationToSubject: 'current_auth_session',
            sourceKey: 'auth.session',
            table: 'auth_session',
            value: 'SE5560000001-kalle1',
          },
          {
            fieldName: 'roles',
            relatedObject: {
              key: 'subject-1',
              label: 'Kalle Svensson',
              type: 'auth_session',
            },
            relationToSubject: 'current_auth_session',
            sourceKey: 'auth.session',
            table: 'auth_session',
            value: ['Reviewer'],
          },
          {
            fieldName: 'sub',
            relatedObject: {
              key: 'subject-1',
              label: 'Kalle Svensson',
              type: 'auth_session',
            },
            relationToSubject: 'current_auth_session',
            sourceKey: 'auth.session',
            table: 'auth_session',
            value: 'subject-1',
          },
        ],
        key: 'auth.session',
        objectKey: 'authSession',
        relationToSubject: 'current_auth_session',
        table: 'auth_session',
      },
      {
        fieldKey: 'owner',
        items: [
          {
            fieldName: 'owner_hsa_id',
            relatedObject: {
              key: '1',
              label: 'SEC Säkerhet',
              type: 'requirement_area',
            },
            relationToSubject: 'live_owner_assignment',
            sourceKey: 'requirement_areas.owner',
            table: 'requirement_areas',
            timestamp: '2026-05-01T10:00:00.000Z',
            value: 'SE5560000001-kalle1',
          },
        ],
        key: 'requirement_areas.owner',
        objectKey: 'requirementAreas',
        relationToSubject: 'live_owner_assignment',
        table: 'requirement_areas',
      },
      {
        fieldKey: 'coAuthor',
        items: [
          {
            fieldName: 'hsa_id',
            relatedObject: {
              key: '2',
              label: 'Användbarhet',
              type: 'requirement_area',
            },
            relationToSubject: 'live_co_author_assignment',
            sourceKey: 'requirement_area_co_authors.hsa_id',
            table: 'requirement_area_co_authors',
            value: 'SE5560000001-kalle1',
          },
          {
            fieldName: 'can_generate_ai',
            relatedObject: {
              key: '2',
              label: 'Användbarhet',
              type: 'requirement_area',
            },
            relationToSubject: 'live_co_author_assignment',
            sourceKey: 'requirement_area_co_authors.hsa_id',
            table: 'requirement_area_co_authors',
            value: true,
          },
        ],
        key: 'requirement_area_co_authors.hsa_id',
        objectKey: 'areaCoAuthors',
        relationToSubject: 'live_co_author_assignment',
        table: 'requirement_area_co_authors',
      },
      {
        fieldKey: 'createdBy',
        items: [
          {
            fieldName: 'created_by_hsa_id',
            relatedObject: {
              key: '17',
              label: 'REQ-17 v1',
              type: 'requirement_version',
            },
            relationToSubject: 'historical_creator_snapshot',
            sourceKey: 'requirement_versions.created_by',
            table: 'requirement_versions',
            timestamp: '2026-05-03T08:00:00.000Z',
            value: 'SE5560000001-kalle1',
          },
          {
            fieldName: 'created_by',
            relatedObject: {
              key: '17',
              label: 'REQ-17 v1',
              type: 'requirement_version',
            },
            relationToSubject: 'historical_creator_snapshot',
            sourceKey: 'requirement_versions.created_by',
            table: 'requirement_versions',
            timestamp: '2026-05-03T08:00:00.000Z',
            value: 'no-user',
          },
        ],
        key: 'requirement_versions.created_by',
        objectKey: 'requirementVersions',
        relationToSubject: 'historical_creator_snapshot',
        table: 'requirement_versions',
      },
      {
        fieldKey: 'principal',
        items: [
          {
            fieldName: 'scope_type',
            relatedObject: {
              key: '42:7',
              label: 'access_review_item:42:7',
              type: 'access_review_item',
            },
            relationToSubject: 'access_review_principal',
            sourceKey: 'access_review_items.principal',
            table: 'access_review_items',
            value: 'requirement_package',
          },
        ],
        key: 'access_review_items.principal',
        objectKey: 'accessReviewItems',
        relationToSubject: 'access_review_principal',
        table: 'access_review_items',
      },
      {
        fieldKey: 'actor',
        items: [
          {
            fieldName: 'action',
            relatedObject: {
              key: '99',
              type: 'action_audit_event',
            },
            relationToSubject: 'action_audit_actor_snapshot',
            sourceKey: 'action_audit_events.actor',
            table: 'action_audit_events',
            timestamp: '2026-05-04T09:00:00.000Z',
            value: 'requirement.create',
          },
          {
            fieldName: 'target_kind',
            relatedObject: {
              key: '99',
              type: 'action_audit_event',
            },
            relationToSubject: 'action_audit_actor_snapshot',
            sourceKey: 'action_audit_events.actor',
            table: 'action_audit_events',
            timestamp: '2026-05-04T09:00:00.000Z',
            value: 'Requirement',
          },
          {
            fieldName: 'target_id',
            relatedObject: {
              key: '99',
              type: 'action_audit_event',
            },
            relationToSubject: 'action_audit_actor_snapshot',
            sourceKey: 'action_audit_events.actor',
            table: 'action_audit_events',
            timestamp: '2026-05-04T09:00:00.000Z',
            value: '42',
          },
        ],
        key: 'action_audit_events.actor',
        objectKey: 'actionAuditEvents',
        relationToSubject: 'action_audit_actor_snapshot',
        table: 'action_audit_events',
      },
    ],
    subject: {
      hsaId: 'SE5560000001-kalle1',
      targetFingerprint: '0123456789abcdef0123456789abcdef',
    },
    summary: {
      itemCount: 13,
      limitationCount: 2,
      sourceCount: 6,
    },
  }
}

function modelText(locale: string): string {
  return JSON.stringify(buildDataSubjectExportPdfModel(exportPayload(), locale))
}

describe('DataSubjectExportPdfRenderer', () => {
  it('formats access review related objects with localized labels', () => {
    expect(
      formatDataSubjectRelatedObjectLabel(
        {
          key: '42',
          label: 'access_review:42',
          type: 'access_review_run',
        },
        'sv',
      ),
    ).toBe('Behörighetsöversyn')
    expect(
      formatDataSubjectRelatedObjectLabel(
        {
          key: '42:7',
          label: 'access_review_item:42:7',
          type: 'access_review_item',
        },
        'en',
      ),
    ).toBe('Access review row')
  })

  it('keeps existing human labels for other related object types', () => {
    expect(
      formatDataSubjectRelatedObjectLabel(
        { key: '7', label: 'Kalle Svensson', type: 'owner' },
        'sv',
      ),
    ).toBe('Kalle Svensson')
  })

  it('uses neutral labels for unknown related object types', () => {
    expect(
      formatDataSubjectRelatedObjectLabel(
        { key: '7', type: 'unknown_table' },
        'sv',
      ),
    ).toBe('Post i systemet')
  })

  it('builds a readable Swedish PDF model without raw export internals', () => {
    const text = modelText('sv')

    expect(text).toContain('Export av personuppgifter')
    expect(text).toContain('Aktiva uppdrag')
    expect(text).toContain('Kravpaket')
    expect(text).toContain('Kravområde')
    expect(text).toContain('Skapad av')
    expect(text).toContain('Ja')
    expect(text).toContain('Anonym')
    expect(text).toContain('Krav skapades')
    expect(text).toContain('Fritextfält söks inte igenom')

    expect(text).not.toContain('owners.identity')
    expect(text).not.toContain('created_by_hsa_id')
    expect(text).not.toContain('relationToSubject')
    expect(text).not.toContain('auth.session')
    expect(text).not.toContain('schemaVersion')
    expect(text).not.toContain('targetFingerprint')
    expect(text).not.toContain('0123456789abcdef')
    expect(text).not.toContain('action_audit_events')
    expect(text).not.toContain('target_id')
    expect(text).not.toContain('subject-1')
  })

  it('builds a readable English PDF model without raw export internals', () => {
    const text = modelText('en')

    expect(text).toContain('Personal data export')
    expect(text).toContain('Active assignments')
    expect(text).toContain('Requirements package')
    expect(text).toContain('Requirement area')
    expect(text).toContain('Created by')
    expect(text).toContain('Yes')
    expect(text).toContain('Anonymous')
    expect(text).toContain('Requirement created')

    expect(text).not.toContain('requirement_areas.owner')
    expect(text).not.toContain('created_by_hsa_id')
    expect(text).not.toContain('historical_creator_snapshot')
    expect(text).not.toContain('privacy-data-subject-export.v1')
    expect(text).not.toContain('targetFingerprint')
    expect(text).not.toContain('subject-1')
  })
})
