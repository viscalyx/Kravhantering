import { describe, expect, it, vi } from 'vitest'
import { resolveStatusLabel } from '@/lib/requirements/status-label'

const STATUS_DRAFT = 1
const STATUS_REVIEW = 2
const STATUS_PUBLISHED = 3
const STATUS_ARCHIVED = 4

const t = vi.fn((key: 'Arkiveringsgranskning') =>
  key === 'Arkiveringsgranskning' ? 'Arkiveringsgranskning' : key,
)

describe('resolveStatusLabel', () => {
  it('returns the archiving review label when status is Review and archiveInitiatedAt is set', () => {
    const label = resolveStatusLabel(
      {
        status: STATUS_REVIEW,
        statusNameSv: 'Granskning',
        statusNameEn: 'Review',
        archiveInitiatedAt: '2026-04-01T12:00:00.000Z',
      },
      'sv',
      t,
    )
    expect(label).toBe('Arkiveringsgranskning')
  })

  it('returns the English archiving review label via translator', () => {
    const tEn = vi.fn(() => 'Archiving Review')
    const label = resolveStatusLabel(
      {
        status: STATUS_REVIEW,
        statusNameSv: 'Granskning',
        statusNameEn: 'Review',
        archiveInitiatedAt: '2026-04-01T12:00:00.000Z',
      },
      'en',
      tEn,
    )
    expect(label).toBe('Archiving Review')
    expect(tEn).toHaveBeenCalledWith('Arkiveringsgranskning')
  })

  it('returns the standard Review label when archiveInitiatedAt is null', () => {
    expect(
      resolveStatusLabel(
        {
          status: STATUS_REVIEW,
          statusNameSv: 'Granskning',
          statusNameEn: 'Review',
          archiveInitiatedAt: null,
        },
        'sv',
        t,
      ),
    ).toBe('Granskning')
    expect(
      resolveStatusLabel(
        {
          status: STATUS_REVIEW,
          statusNameSv: 'Granskning',
          statusNameEn: 'Review',
          archiveInitiatedAt: null,
        },
        'en',
        t,
      ),
    ).toBe('Review')
  })

  it('does not override Draft, Published, or Archived even if archiveInitiatedAt is set', () => {
    for (const status of [STATUS_DRAFT, STATUS_PUBLISHED, STATUS_ARCHIVED]) {
      expect(
        resolveStatusLabel(
          {
            status,
            statusNameSv: 'X',
            statusNameEn: 'Y',
            archiveInitiatedAt: '2026-04-01T12:00:00.000Z',
          },
          'sv',
          t,
        ),
      ).toBe('X')
    }
  })

  it('falls back to "—" when status name is missing', () => {
    expect(
      resolveStatusLabel(
        {
          status: STATUS_DRAFT,
          statusNameSv: null,
          statusNameEn: null,
          archiveInitiatedAt: null,
        },
        'sv',
        t,
      ),
    ).toBe('—')
  })
})
