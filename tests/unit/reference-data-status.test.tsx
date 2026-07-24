import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ReferenceDataStatus, {
  ReferenceDataSaveHint,
} from '@/components/ReferenceDataStatus'
import type { ReferenceDataReadiness } from '@/hooks/useTaxonomyOptions'

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace?: string) => (key: string, values?: { catalogs?: string }) =>
      [namespace ? `${namespace}.${key}` : key, values?.catalogs]
        .filter(Boolean)
        .join(': '),
}))

function readiness(
  overrides: Partial<ReferenceDataReadiness> = {},
): ReferenceDataReadiness {
  return {
    canSave: true,
    emptyRequiredCatalogs: [],
    failedCatalogs: [],
    loadingCatalogs: [],
    refreshingCatalogs: [],
    refreshFailedCatalogs: [],
    retryFailed: async () => undefined,
    ...overrides,
  }
}

describe('ReferenceDataStatus', () => {
  it('announces initial loading politely and exposes a visible save hint', () => {
    render(
      <>
        <ReferenceDataStatus
          id="reference-data-status"
          readiness={readiness({
            canSave: false,
            loadingCatalogs: ['categories'],
          })}
        />
        <ReferenceDataSaveHint id="save-hint" />
      </>,
    )

    expect(screen.getByRole('status')).toHaveAttribute(
      'id',
      'reference-data-status',
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'referenceData.loading',
    )
    expect(screen.getByRole('status')).toHaveAttribute(
      'data-developer-mode-value',
      'reference data loading',
    )
    expect(screen.getByText('referenceData.saveBlocked')).toHaveAttribute(
      'id',
      'save-hint',
    )
  })

  it('uses an alert with translated catalog names for a load failure', () => {
    render(
      <ReferenceDataStatus
        id="reference-data-status"
        readiness={readiness({
          canSave: false,
          failedCatalogs: ['categories', 'normReferences'],
        })}
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveAttribute(
      'data-developer-mode-value',
      'reference data error',
    )
    expect(alert).toHaveTextContent('referenceData.loadFailed')
    expect(alert).toHaveTextContent('referenceData.catalogs.categories')
    expect(alert).toHaveTextContent('referenceData.catalogs.normReferences')
  })

  it('restores focus to Retry when another retry still leaves the alert', async () => {
    const retryFailed = vi.fn(async () => undefined)
    render(
      <ReferenceDataStatus
        id="reference-data-status"
        readiness={readiness({
          canSave: false,
          failedCatalogs: ['types'],
          retryFailed,
        })}
      />,
    )

    const retry = screen.getByRole('button', { name: 'common.retry' })
    expect(retry).toHaveAttribute(
      'data-developer-mode-value',
      'retry failed catalogs',
    )
    fireEvent.click(retry)

    await waitFor(() => expect(retryFailed).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(retry).toHaveFocus())
  })

  it('reports refresh failure while preserving save readiness', () => {
    render(
      <ReferenceDataStatus
        id="reference-data-status"
        readiness={readiness({
          refreshFailedCatalogs: ['priorityLevels'],
        })}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'referenceData.refreshFailed',
    )
  })
})
