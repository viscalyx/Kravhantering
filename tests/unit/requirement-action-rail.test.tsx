import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps, ReactNode } from 'react'
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

type RequirementActionRailProps = ComponentProps<typeof RequirementActionRail>

function renderRequirementActionRail(
  props: Partial<RequirementActionRailProps> = {},
) {
  const defaultProps: RequirementActionRailProps = {
    canAddToPackage: false,
    currentStatusId: 3,
    detailContext: 'requirement detail: REQ-123',
    displayVersionNumber: 3,
    hasPendingWork: false,
    hasPendingWorkAbovePublished: false,
    isArchiving: false,
    isLatestVersionArchived: false,
    isTransitioning: false,
    isViewingHistory: false,
    isViewingLatest: true,
    latestStatusForActions: 3,
    latestVersionNumber: 7,
    locale: 'sv',
    onApproveArchiving: vi.fn(async () => {}),
    onArchive: vi.fn(async () => {}),
    onCancelArchiving: vi.fn(async () => {}),
    onDeleteDraft: vi.fn(async () => {}),
    onOpenAddToPackage: vi.fn(async () => {}),
    onRestore: vi.fn(async () => {}),
    onTransition: vi.fn(async () => {}),
    onVersionSelect: vi.fn(),
    requirementId: 123,
    requirementUniqueId: 'REQ-123',
    selectedVersionNumber: 2,
    selectedVersionNumberForRestore: 2,
    transitions: [],
  }

  return render(<RequirementActionRail {...defaultProps} {...props} />)
}

describe('RequirementActionRail', () => {
  it('prefers the latest version prop for back to latest', async () => {
    const onVersionSelect = vi.fn()

    renderRequirementActionRail({
      isViewingHistory: true,
      isViewingLatest: false,
      onVersionSelect,
    })

    await userEvent.click(
      screen.getByRole('button', { name: 'requirement.backToLatest' }),
    )

    expect(onVersionSelect).toHaveBeenCalledWith(7)
    expect(onVersionSelect).not.toHaveBeenCalledWith(3)
    expect(onVersionSelect).not.toHaveBeenCalledWith(1)
  })

  it('renders the share menu with responsive dark-mode styling', async () => {
    renderRequirementActionRail()

    await userEvent.click(screen.getByRole('button', { name: 'common.share' }))

    const inlineShareOption = screen.getByRole('button', {
      name: 'requirement.shareLinkInline',
    })
    const pageShareOption = screen.getByRole('button', {
      name: 'requirement.shareLinkPage',
    })
    const shareMenu = inlineShareOption.parentElement

    expect(shareMenu).toHaveClass(
      'w-full',
      'max-w-xs',
      'border-secondary-200',
      'text-secondary-900',
      'dark:border-secondary-700',
      'dark:text-secondary-100',
    )
    expect(shareMenu).not.toHaveClass('w-52')
    for (const option of [inlineShareOption, pageShareOption]) {
      expect(option).toHaveClass(
        'text-secondary-700',
        'hover:text-secondary-900',
        'dark:text-secondary-100',
        'dark:hover:bg-secondary-700',
        'dark:hover:text-white',
      )
    }
  })
})
