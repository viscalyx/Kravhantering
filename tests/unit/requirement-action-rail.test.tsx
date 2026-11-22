import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compile } from '@tailwindcss/node'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import RequirementActionRail from '@/app/[locale]/requirements/[id]/_detail/RequirementActionRail'
import { useRequirementDetailData } from '@/app/[locale]/requirements/[id]/_detail/use-requirement-detail-data'

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

function requirementActionRail(
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

  return <RequirementActionRail {...defaultProps} {...props} />
}

function renderRequirementActionRail(
  props: Partial<RequirementActionRailProps> = {},
) {
  return render(requirementActionRail(props))
}

describe('RequirementActionRail', () => {
  it('keeps only permitted Review actions when a superseded Draft catalog arrives', async () => {
    const draft = { id: 1, nameSv: 'Utkast', nameEn: 'Draft' }
    const review = { id: 2, nameSv: 'Granskning', nameEn: 'Review' }
    const published = { id: 3, nameSv: 'Publicerad', nameEn: 'Published' }
    const catalog = {
      transitions: [
        { fromStatus: draft, toStatus: review },
        { fromStatus: review, toStatus: draft },
        { fromStatus: review, toStatus: published },
      ],
    }
    const oldCatalog = Promise.withResolvers<Response>()
    const readCatalog = vi
      .fn()
      .mockReturnValueOnce(oldCatalog.promise)
      .mockResolvedValueOnce(Response.json(catalog))
    const readDetail = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          versions: [{ status: draft.id }],
          permissions: { allowedTransitionStatusIds: [2] },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          versions: [{ status: review.id }],
          permissions: { allowedTransitionStatusIds: [1] },
        }),
      )
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(url =>
        String(url) === '/api/requirement-statuses'
          ? readCatalog()
          : readDetail(),
      )

    function DetailActions() {
      const { requirement, refreshRequirement, transitions } =
        useRequirementDetailData({ requirementId: 123 })
      if (!requirement) return null
      const status = requirement.versions[0].status
      return (
        <>
          <button onClick={refreshRequirement} type="button">
            Refresh requirement
          </button>
          {requirementActionRail({
            allowedTransitionStatusIds:
              requirement.permissions.allowedTransitionStatusIds,
            currentStatusId: status,
            latestStatusForActions: status,
            transitions,
          })}
        </>
      )
    }

    try {
      render(<DetailActions />)
      await waitFor(() => expect(readCatalog).toHaveBeenCalledTimes(1))
      await userEvent.click(
        screen.getByRole('button', { name: 'Refresh requirement' }),
      )
      const returnToDraft = { name: 'requirement.transitionToUtkast' }
      expect(await screen.findByRole('button', returnToDraft)).toBeEnabled()
      await act(async () => oldCatalog.resolve(Response.json(catalog)))
      expect(screen.getByRole('button', returnToDraft)).toBeEnabled()
      expect(
        screen.queryByRole('button', {
          name: 'requirement.transitionToPublicerad',
        }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', {
          name: 'requirement.transitionToGranskning',
        }),
      ).not.toBeInTheDocument()
    } finally {
      fetch.mockRestore()
    }
  })

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
    const compiler = await compile(
      readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8'),
      { base: join(process.cwd(), 'app'), onDependency() {} },
    )
    const css = compiler.build([])

    expect(css).toContain('.btn-destructive')
    expect(css).toContain('color: var(--color-red-700)')
    expect(css).toContain('border-color: var(--color-red-200)')
    expect(css).toContain('background-color: var(--color-red-50)')
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

    await userEvent.click(
      await screen.findByRole('button', { name: 'common.share' }),
    )

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

    const shareTrigger = await screen.findByRole('button', {
      name: 'common.share',
    })
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

      const shareTrigger = await screen.findByRole('button', {
        name: 'common.share',
      })
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

  it('hides lifecycle mutation controls denied by server permissions', async () => {
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
      await screen.findByRole('button', { name: 'common.share' }),
    ).toBeInTheDocument()
  })

  it.each([
    ['Inline', '/sv/requirements?selected=REQ-123'],
    ['Page', '/sv/requirements/REQ-123/2'],
  ])(
    'offers the %s share URL and retry when clipboard access is denied',
    async (choice, path) => {
      const user = userEvent.setup()
      const writeText = vi
        .spyOn(navigator.clipboard, 'writeText')
        .mockRejectedValue(
          new DOMException('Permission denied', 'NotAllowedError'),
        )
      try {
        renderRequirementActionRail()

        const share = await screen.findByRole('button', {
          name: 'common.share',
        })
        await user.click(share)
        await user.click(
          screen.getByRole('menuitem', {
            name: `requirement.shareLink${choice}`,
          }),
        )

        const url = `${window.location.origin}${path}`
        expect(writeText).toHaveBeenCalledWith(url)
        const status = screen.getByRole('status')
        expect(status).toBeVisible()
        expect(status).toHaveAttribute('aria-live', 'polite')
        expect(status).toHaveTextContent('requirement.share.copyFailed')
        const firstAnnouncement = status.textContent
        expect(share).toHaveFocus()
        await user.tab()
        const link = screen.getByRole('textbox', {
          name: 'requirement.share.urlLabel',
        })
        expect(link).toHaveFocus()
        expect(link).toHaveValue(url)
        expect(link).toHaveAttribute('readonly')
        await user.tab()
        const retry = screen.getByRole('button', { name: 'common.retry' })
        expect(retry).toHaveFocus()
        expect(status).toHaveAttribute(
          'data-developer-mode-value',
          'copy failed',
        )
        expect(link).toHaveAttribute('data-developer-mode-value', 'share URL')
        expect(retry).toHaveAttribute('data-developer-mode-value', 'retry copy')
        await user.keyboard('{Enter}')
        expect(writeText).toHaveBeenCalledTimes(2)
        expect(writeText).toHaveBeenLastCalledWith(url)
        expect(status).toHaveTextContent('requirement.share.copyFailed')
        expect(status.textContent).not.toBe(firstAnnouncement)
        expect(link).toHaveValue(url)
        expect(retry).toHaveFocus()
      } finally {
        writeText.mockRestore()
      }
    },
  )

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

  it('runs specification and every visible lifecycle transition action', async () => {
    const onOpenAddToSpecification = vi.fn(async () => {})
    const onTransition = vi.fn<(statusId: number) => Promise<void>>(
      async () => {},
    )
    renderRequirementActionRail({
      allowedTransitionStatusIds: [1, 2, 3, 4, 5],
      canAddToSpecification: true,
      currentStatusId: 1,
      latestStatusForActions: 1,
      onOpenAddToSpecification,
      onTransition,
      transitions: [
        { iconName: 'File', id: 1, nameEn: 'Draft', nameSv: 'Utkast' },
        { iconName: 'Clock', id: 2, nameEn: 'Review', nameSv: 'Granskning' },
        { iconName: 'Check', id: 3, nameEn: 'Published', nameSv: 'Publicerad' },
        { iconName: 'Circle', id: 5, nameEn: 'Custom', nameSv: 'Anpassad' },
      ],
    })

    await userEvent.click(
      screen.getByRole('button', { name: 'specification.addToSpecification' }),
    )
    for (const name of [
      'requirement.transitionToUtkast',
      'requirement.transitionToGranskning',
      'requirement.transitionToPublicerad',
      'requirement.transitionToAnpassad',
    ]) {
      await userEvent.click(screen.getByRole('button', { name }))
    }

    expect(onOpenAddToSpecification).toHaveBeenCalledOnce()
    expect(onTransition.mock.calls.map(([statusId]) => statusId)).toEqual([
      1, 2, 3, 5,
    ])
  })

  it('runs archiving approval and cancellation controls', async () => {
    const onApproveArchiving = vi.fn(async () => {})
    const onCancelArchiving = vi.fn(async () => {})
    renderRequirementActionRail({
      isArchiving: true,
      onApproveArchiving,
      onCancelArchiving,
    })

    await userEvent.click(
      screen.getByRole('button', { name: 'requirement.approveArchiving' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'requirement.cancelArchiving' }),
    )

    expect(onApproveArchiving).toHaveBeenCalledOnce()
    expect(onCancelArchiving).toHaveBeenCalledOnce()
  })

  it('runs enabled history and archived restore controls', async () => {
    const onRestore = vi.fn(async () => {})
    const first = renderRequirementActionRail({
      isViewingHistory: true,
      isViewingLatest: false,
      onRestore,
    })

    await userEvent.click(
      screen.getByRole('button', { name: 'common.restoreVersion' }),
    )
    expect(onRestore).toHaveBeenLastCalledWith(2, expect.any(HTMLElement))
    first.unmount()

    renderRequirementActionRail({
      isLatestVersionArchived: true,
      onRestore,
    })
    await userEvent.click(
      screen.getByRole('button', { name: 'common.restoreVersion' }),
    )
    expect(onRestore).toHaveBeenCalledTimes(2)
  })

  it('shows pending-work blocks on historical published versions', () => {
    renderRequirementActionRail({
      currentStatusId: 3,
      hasPendingWorkAbovePublished: true,
      isViewingLatest: false,
      latestStatusForActions: 1,
    })

    expect(screen.getByRole('button', { name: 'common.edit' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'common.archive' }),
    ).toBeDisabled()
  })

  it('recovers from an unavailable clipboard and reports only completed writes', async () => {
    const user = userEvent.setup()
    const clipboard = navigator.clipboard
    const browser: { clipboard?: Clipboard } = navigator
    const getClipboard = vi.spyOn(browser, 'clipboard', 'get')
    const writeText = vi.spyOn(clipboard, 'writeText')
    const pendingWrite = Promise.withResolvers<void>()
    getClipboard.mockReturnValue(undefined)
    try {
      renderRequirementActionRail({ locale: 'en', selectedVersionNumber: null })
      const share = await screen.findByRole('button', { name: 'common.share' })
      await user.click(share)
      await user.click(
        screen.getByRole('menuitem', { name: 'requirement.shareLinkPage' }),
      )

      const url = `${window.location.origin}/en/requirements/REQ-123`
      const link = screen.getByRole('textbox', {
        name: 'requirement.share.urlLabel',
      })
      const retry = screen.getByRole('button', { name: 'common.retry' })
      const status = screen.getByRole('status')
      expect(link).toHaveValue(url)
      expect(status).toHaveTextContent('requirement.share.copyFailed')

      getClipboard.mockReturnValue(clipboard)
      writeText.mockReturnValueOnce(pendingWrite.promise)
      await user.click(retry)
      await user.keyboard('{Enter}')
      expect(writeText).toHaveBeenCalledExactlyOnceWith(url)
      expect(status).toHaveTextContent('requirement.share.copyFailed')
      expect(share).not.toHaveTextContent('common.copied')
      expect(link).toHaveValue(url)

      await act(async () => pendingWrite.resolve())
      expect(status).toHaveTextContent('common.copied')
      expect(share).toHaveFocus()
      expect(link).not.toBeInTheDocument()

      writeText.mockRejectedValueOnce(
        new DOMException('Permission denied', 'NotAllowedError'),
      )
      await user.click(share)
      await user.click(
        screen.getByRole('menuitem', { name: 'requirement.shareLinkInline' }),
      )
      expect(status).toHaveTextContent('requirement.share.copyFailed')
      expect(share).not.toHaveTextContent('common.copied')
      expect(
        screen.getByRole('textbox', { name: 'requirement.share.urlLabel' }),
      ).toHaveValue(
        `${window.location.origin}/en/requirements?selected=REQ-123`,
      )
    } finally {
      getClipboard.mockRestore()
      writeText.mockRestore()
    }
  })

  it('starts a fresh share action when the selected version changes', async () => {
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValue(
        new DOMException('Permission denied', 'NotAllowedError'),
      )
    try {
      const { rerender } = renderRequirementActionRail()
      const share = () => screen.findByRole('button', { name: 'common.share' })
      const copyPageLink = () =>
        user.click(
          screen.getByRole('menuitem', { name: 'requirement.shareLinkPage' }),
        )
      await user.click(await share())
      await copyPageLink()
      const fallback = screen.getByRole('textbox', {
        name: 'requirement.share.urlLabel',
      })
      expect(fallback).toHaveValue(
        `${window.location.origin}/sv/requirements/REQ-123/2`,
      )

      rerender(requirementActionRail({ selectedVersionNumber: 3 }))
      expect(fallback).not.toBeInTheDocument()
      await user.click(await share())
      await copyPageLink()
      expect(
        screen.getByRole('textbox', { name: 'requirement.share.urlLabel' }),
      ).toHaveValue(`${window.location.origin}/sv/requirements/REQ-123/3`)
    } finally {
      writeText.mockRestore()
    }
  })
})
