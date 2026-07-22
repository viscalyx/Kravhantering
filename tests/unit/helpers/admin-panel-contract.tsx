import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { expect } from 'vitest'
import { ConfirmModalProvider } from '@/components/ConfirmModal'

export function expectAdminPanelContract({
  markerName = 'tab panel',
  markerValue,
  tabId,
}: {
  markerName?: string
  markerValue: string
  tabId: string
}) {
  const panel = screen.getByRole('tabpanel')
  expect(panel).toHaveAttribute('id', `${tabId}-panel`)
  expect(panel).toHaveAttribute('aria-labelledby', `${tabId}-tab`)
  expect(panel).toHaveAttribute('data-developer-mode-name', markerName)
  expect(panel).toHaveAttribute('data-developer-mode-value', markerValue)
}

export function renderAdminPanel(
  panel: ReactElement,
  { confirmModal = false }: { confirmModal?: boolean } = {},
) {
  return render(
    confirmModal ? <ConfirmModalProvider>{panel}</ConfirmModalProvider> : panel,
  )
}

export function pendingFetch(): Promise<Response> {
  return new Promise(() => undefined)
}
