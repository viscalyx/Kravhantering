import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import tailwindcss from '@tailwindcss/postcss'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import postcss from 'postcss'
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
    allowedTransitionStatusIds: [1, 2, 3, 4],
    canAddToSpecification: false,
    canArchive: true,
    canDeleteDraft: true,
    canEdit: true,
    canRestore: true,
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
    onOpenAddToSpecification: vi.fn(async () => {}),
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
  it('defines the shared destructive button variant with accessibility tokens', () => {
    const globalsCss = readFileSync(
      join(process.cwd(), 'app/globals.css'),
      'utf8',
    )

    expect(globalsCss).toContain('.btn-destructive')
    expect(globalsCss).toContain('text-red-700 dark:text-red-400')
    expect(globalsCss).toContain('hover:bg-red-50')
    expect(globalsCss).toContain('dark:hover:bg-red-950')
    expect(globalsCss).toContain('focus:ring-red-400/50')
    expect(globalsCss).toContain('min-h-11 min-w-11')
    expect(globalsCss).toContain('.btn-destructive:disabled')
  })

  it('emits the destructive button variant from Tailwind CSS', async () => {
    const result = await postcss([tailwindcss()]).process(
      readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8'),
      { from: join(process.cwd(), 'app/globals.css') },
    )

    expect(result.css).toContain('.btn-destructive')
    expect(result.css).toContain('color: var(--color-red-700)')
    expect(result.css).toContain('border-color: var(--color-red-200)')
    expect(result.css).toContain('background-color: var(--color-red-50)')
  }, 15_000)

  it('uses the shared destructive variant for archive and delete draft actions', () => {
    const { unmount } = renderRequirementActionRail()

    const archiveButton = screen.getByRole('button', {
      name: 'common.archive',
    })
    expect(archiveButton).toHaveClass(
      'btn-destructive',
      'inline-flex',
      'w-full',
      'justify-center',
    )
    expect(archiveButton).not.toHaveClass(
      'text-red-700',
      'hover:bg-red-50',
      'dark:hover:bg-red-950',
    )

    unmount()

    renderRequirementActionRail({
      currentStatusId: 1,
      latestStatusForActions: 1,
    })

    const deleteDraftButton = screen.getByRole('button', {
      name: 'common.delete',
    })
    expect(deleteDraftButton).toHaveClass(
      'btn-destructive',
      'inline-flex',
      'w-full',
      'justify-center',
    )
    expect(deleteDraftButton).not.toHaveClass(
      'text-red-700',
      'hover:bg-red-50',
      'dark:hover:bg-red-950',
    )
  })

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

    const inlineShareOption = screen.getByRole('menuitem', {
      name: 'requirement.shareLinkInline',
    })
    const pageShareOption = screen.getByRole('menuitem', {
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

  it('exposes share menu semantics and keyboard navigation', async () => {
    renderRequirementActionRail()

    const shareTrigger = screen.getByRole('button', { name: 'common.share' })
    expect(shareTrigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(shareTrigger).toHaveAttribute('aria-expanded', 'false')
    expect(shareTrigger).toHaveAttribute('aria-controls')

    const menuId = shareTrigger.getAttribute('aria-controls')
    await userEvent.click(shareTrigger)

    expect(shareTrigger).toHaveAttribute('aria-expanded', 'true')
    const shareMenu = screen.getByRole('menu', { name: 'common.share' })
    expect(shareMenu).toHaveAttribute('id', menuId)
    expect(shareMenu).toHaveAttribute('aria-labelledby', shareTrigger.id)

    const inlineShareOption = screen.getByRole('menuitem', {
      name: 'requirement.shareLinkInline',
    })
    const pageShareOption = screen.getByRole('menuitem', {
      name: 'requirement.shareLinkPage',
    })
    await waitFor(() => expect(inlineShareOption).toHaveFocus())

    await userEvent.keyboard('{ArrowDown}')
    expect(pageShareOption).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    expect(inlineShareOption).toHaveFocus()

    await userEvent.keyboard('{ArrowUp}')
    expect(pageShareOption).toHaveFocus()

    await userEvent.keyboard('{Home}')
    expect(inlineShareOption).toHaveFocus()

    await userEvent.keyboard('{End}')
    expect(pageShareOption).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(shareTrigger).toHaveAttribute('aria-expanded', 'false')
    expect(shareTrigger).toHaveFocus()
  })

  it('announces share copy success and returns focus to the trigger', async () => {
    const originalClipboard = globalThis.navigator.clipboard
    const originalHref = window.location.href
    const clipboardWriteText = vi.fn().mockResolvedValue(undefined)
    try {
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: clipboardWriteText,
        },
      })
      window.history.pushState({}, '', '/sv/requirements/REQ-123?draft=true')
      renderRequirementActionRail()

      const shareTrigger = screen.getByRole('button', { name: 'common.share' })
      await userEvent.click(shareTrigger)
      await userEvent.click(
        screen.getByRole('menuitem', {
          name: 'requirement.shareLinkInline',
        }),
      )

      await waitFor(() =>
        expect(clipboardWriteText).toHaveBeenCalledWith(
          `${window.location.origin}/sv/requirements?selected=REQ-123`,
        ),
      )
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('common.copied')
      expect(
        screen.getByRole('button', { name: 'common.copied' }),
      ).toHaveFocus()
    } finally {
      if (originalClipboard === undefined) {
        Reflect.deleteProperty(globalThis.navigator, 'clipboard')
      } else {
        Object.defineProperty(globalThis.navigator, 'clipboard', {
          configurable: true,
          value: originalClipboard,
        })
      }
      window.history.pushState({}, '', originalHref)
    }
  })

  it('hides lifecycle mutation controls denied by server permissions', () => {
    renderRequirementActionRail({
      allowedTransitionStatusIds: [],
      canArchive: false,
      canDeleteDraft: false,
      canEdit: false,
      canRestore: false,
      currentStatusId: 1,
      latestStatusForActions: 1,
      transitions: [
        {
          iconName: 'Clock',
          id: 2,
          nameEn: 'Review',
          nameSv: 'Granskning',
        },
      ],
    })

    expect(
      screen.queryByRole('button', {
        name: 'requirement.transitionToGranskning',
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'common.edit' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'common.delete' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'common.share' }),
    ).toBeInTheDocument()
  })

  it('hides restore when historical restore permission is denied', () => {
    renderRequirementActionRail({
      canRestore: false,
      isViewingHistory: true,
      isViewingLatest: false,
    })

    expect(
      screen.queryByRole('button', { name: 'common.restoreVersion' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'requirement.backToLatest' }),
    ).toBeInTheDocument()
  })
})
