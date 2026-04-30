import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import RequirementActionRail from '@/app/[locale]/requirements/[id]/_detail/RequirementActionRail'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode
    href: string
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('RequirementActionRail', () => {
  it('prefers the latest version prop for back to latest', async () => {
    const onVersionSelect = vi.fn()

    render(
      <RequirementActionRail
        canAddToPackage={false}
        currentStatusId={3}
        detailContext="requirement detail: REQ-123"
        displayVersionNumber={3}
        hasPendingWork={false}
        hasPendingWorkAbovePublished={false}
        isArchiving={false}
        isLatestVersionArchived={false}
        isTransitioning={false}
        isViewingHistory
        isViewingLatest={false}
        latestStatusForActions={3}
        latestVersionNumber={7}
        locale="sv"
        onApproveArchiving={vi.fn(async () => {})}
        onArchive={vi.fn(async () => {})}
        onCancelArchiving={vi.fn(async () => {})}
        onDeleteDraft={vi.fn(async () => {})}
        onOpenAddToPackage={vi.fn(async () => {})}
        onRestore={vi.fn(async () => {})}
        onTransition={vi.fn(async () => {})}
        onVersionSelect={onVersionSelect}
        requirementId={123}
        requirementUniqueId="REQ-123"
        selectedVersionNumber={2}
        selectedVersionNumberForRestore={2}
        transitions={[]}
      />,
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'requirement.backToLatest' }),
    )

    expect(onVersionSelect).toHaveBeenCalledWith(7)
    expect(onVersionSelect).not.toHaveBeenCalledWith(3)
    expect(onVersionSelect).not.toHaveBeenCalledWith(1)
  })
})
