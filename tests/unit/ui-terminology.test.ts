import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildDataSubjectExportPdfModel } from '@/lib/privacy/data-subject-export-pdf-presenter'
import type { DataSubjectExportV1 } from '@/lib/privacy/data-subject-export-types'

function readJson(path: string) {
  return JSON.parse(readFileSync(join(process.cwd(), path), 'utf8')) as Record<
    string,
    unknown
  >
}

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function dataSubjectExportPayload(): DataSubjectExportV1 {
  return {
    generatedAt: '2026-05-12T12:00:00.000Z',
    generatedBy: {
      displayName: 'Disa PrivacyOfficer',
      hsaId: 'SE5560000001-privacy1',
      roles: ['PrivacyOfficer'],
      source: 'oidc',
      sub: 'privacy-sub',
    },
    limitations: [],
    schemaVersion: 'privacy-data-subject-export.v1',
    sources: [
      {
        fieldKey: 'session',
        items: [
          {
            fieldName: 'roles',
            relationToSubject: 'current_auth_session',
            sourceKey: 'auth.session',
            table: 'auth_session',
            value: ['Reviewer'],
          },
        ],
        key: 'auth.session',
        objectKey: 'authSession',
        relationToSubject: 'current_auth_session',
        table: 'auth_session',
      },
      {
        fieldKey: 'reviewer',
        items: [
          {
            fieldName: 'reviewer_display_name',
            relatedObject: {
              key: '42',
              label: 'access_review:42',
              type: 'access_review_run',
            },
            relationToSubject: 'access_review_reviewer_assignment',
            sourceKey: 'access_review_runs.reviewer',
            table: 'access_review_runs',
            value: 'Ada Admin',
          },
        ],
        key: 'access_review_runs.reviewer',
        objectKey: 'accessReviewRuns',
        relationToSubject: 'access_review_reviewer_assignment',
        table: 'access_review_runs',
      },
    ],
    subject: {
      hsaId: 'SE5560000001-kalle1',
      targetFingerprint: '0123456789abcdef0123456789abcdef',
    },
    summary: {
      itemCount: 2,
      limitationCount: 0,
      sourceCount: 2,
    },
  }
}

describe('UI terminology', () => {
  it('uses precise Swedish terms for global and assigned reviewers', () => {
    const sv = readJson('messages/sv.json')
    const en = readJson('messages/en.json')

    expect(sv.roles).toMatchObject({ reviewer: 'Kravgranskare' })
    expect(en.roles).toMatchObject({ reviewer: 'Reviewer' })
    expect(sv.admin).toMatchObject({
      accessReview: {
        summary: { reviewer: 'Tilldelad granskningsperson' },
      },
      privacy: {
        fields: { reviewer: 'Tilldelad granskningsperson' },
      },
    })
    expect(en.admin).toMatchObject({
      accessReview: {
        summary: { reviewer: 'Assigned reviewer' },
      },
      privacy: {
        fields: { reviewer: 'Assigned reviewer' },
      },
    })
  })

  it('keeps access review export labels aligned with reviewer terminology', () => {
    const source = readSource(
      'components/access-review/AccessReviewExportPdfRenderer.tsx',
    )

    expect(source).toContain("reviewer: 'Assigned reviewer'")
    expect(source).toContain("reviewer: 'Tilldelad granskningsperson'")
    expect(source).not.toContain("reviewer: 'Reviewer'")
    expect(source).not.toContain("reviewer: 'Granskare'")
  })

  it('uses glossary terms in the Swedish data-subject export model', () => {
    const model = buildDataSubjectExportPdfModel(
      dataSubjectExportPayload(),
      'sv',
    )
    const text = JSON.stringify(model)

    expect(text).toContain('Kravgranskare')
    expect(text).toContain('Tilldelad granskningsperson i behörighetsöversyn')
    expect(text).toContain('tilldelad granskningsperson')
    expect(text).not.toContain('Granskare i behörighetsöversyn')
    expect(text).not.toContain('utsedd granskare')
  })
})
