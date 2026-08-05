import { act, fireEvent, render, screen } from '@testing-library/react'
import { useReducedMotion } from 'framer-motion'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type HelpContent,
  HelpProvider,
  useHelp,
  useHelpContent,
} from '@/components/HelpPanel'

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}))

const TEST_HELP_CONTENT: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'requirements.overview.body',
      headingKey: 'requirements.overview.heading',
    },
  ],
  titleKey: 'requirements.title',
}

const TEST_VISUAL_HELP_CONTENT: HelpContent = {
  sections: [
    {
      bodyKey: 'requirements.lifecycleVisual.body',
      headingKey: 'requirements.lifecycleVisual.heading',
      kind: 'visual',
      visualId: 'requirementLifecycle',
    },
  ],
  titleKey: 'requirements.title',
}

const TEST_SECTION_VARIANTS_HELP_CONTENT: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'requirements.details.body',
      headingKey: 'requirements.details.heading',
      subheading: true,
    },
    {
      headingKey: 'requirements.lifecycleVisual.heading',
      kind: 'visual',
      visualId: 'requirementLifecycle',
    },
  ],
  titleKey: 'requirements.title',
}

const PARENT_HELP_CONTENT: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'parent.overview.body',
      headingKey: 'parent.overview.heading',
    },
  ],
  titleKey: 'parent.title',
}

const CHILD_HELP_CONTENT: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'child.overview.body',
      headingKey: 'child.overview.heading',
    },
  ],
  titleKey: 'child.title',
}

function HelpHarness({
  content = TEST_HELP_CONTENT,
}: {
  content?: HelpContent
}) {
  const { toggle } = useHelp()
  useHelpContent(content)

  return (
    <button onClick={toggle} type="button">
      toggle help
    </button>
  )
}

function ChildHelpRegistration() {
  useHelpContent(CHILD_HELP_CONTENT)
  return null
}

function NestedHelpHarness({ showChild }: { showChild: boolean }) {
  const { toggle } = useHelp()
  useHelpContent(PARENT_HELP_CONTENT)

  return (
    <>
      {showChild ? <ChildHelpRegistration /> : null}
      <button onClick={toggle} type="button">
        toggle help
      </button>
    </>
  )
}

function NoContentHelpHarness() {
  const { toggle } = useHelp()
  useHelpContent(null)

  return (
    <button onClick={toggle} type="button">
      toggle help without content
    </button>
  )
}

describe('HelpPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useReducedMotion).mockReturnValue(false)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
  })

  afterEach(() => {
    document.body.style.overflow = ''
    document.body.style.overscrollBehavior = ''
    document.documentElement.style.overflow = ''
    document.documentElement.style.overscrollBehavior = ''
    document
      .querySelectorAll('[data-help-panel-test-sibling]')
      .forEach(element => {
        element.remove()
      })
    vi.unstubAllGlobals()
  })

  it('does not open a drawer when the current view has no help content', () => {
    render(
      <HelpProvider>
        <NoContentHelpHarness />
      </HelpProvider>,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'toggle help without content' }),
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('locks viewport scrolling while the help drawer is open and restores it when closed', () => {
    document.body.style.overflow = 'clip'
    document.body.style.overscrollBehavior = 'auto'
    document.documentElement.style.overflow = 'scroll'
    document.documentElement.style.overscrollBehavior = 'auto'

    render(
      <HelpProvider>
        <HelpHarness />
      </HelpProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'toggle help' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.body.style.overscrollBehavior).toBe('contain')
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(document.documentElement.style.overscrollBehavior).toBe('contain')

    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('clip')
    expect(document.body.style.overscrollBehavior).toBe('auto')
    expect(document.documentElement.style.overflow).toBe('scroll')
    expect(document.documentElement.style.overscrollBehavior).toBe('auto')
  })

  it('opens and closes when reduced motion is requested', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true)

    render(
      <HelpProvider>
        <HelpHarness />
      </HelpProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'toggle help' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a scroll cue when more help content exists below the fold and hides it at the bottom', () => {
    render(
      <HelpProvider>
        <HelpHarness />
      </HelpProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'toggle help' }))

    const dialog = screen.getByRole('dialog')
    const scrollRegion = dialog.querySelector(
      '.help-panel-scroll-region',
    ) as HTMLDivElement | null

    expect(scrollRegion).toBeTruthy()
    if (!scrollRegion) {
      throw new Error('Expected help panel scroll region to be present')
    }

    Object.defineProperty(scrollRegion, 'clientHeight', {
      configurable: true,
      value: 120,
    })
    Object.defineProperty(scrollRegion, 'scrollHeight', {
      configurable: true,
      value: 320,
    })
    Object.defineProperty(scrollRegion, 'scrollTop', {
      configurable: true,
      value: 0,
      writable: true,
    })

    fireEvent(window, new Event('resize'))

    expect(dialog.querySelector('.help-panel-scroll-indicator')).toBeTruthy()

    scrollRegion.scrollTop = 220
    fireEvent.scroll(scrollRegion)

    expect(dialog.querySelector('.help-panel-scroll-indicator')).toBeNull()
  })

  it('updates the scroll cue when the drawer content is resized', () => {
    let notifyResize: ResizeObserverCallback | undefined

    class TestResizeObserver implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = callback
      }

      disconnect() {}
      observe() {}
      unobserve() {}
    }

    vi.stubGlobal('ResizeObserver', TestResizeObserver)

    render(
      <HelpProvider>
        <HelpHarness />
      </HelpProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'toggle help' }))

    const dialog = screen.getByRole('dialog')
    const scrollRegion = dialog.querySelector(
      '.help-panel-scroll-region',
    ) as HTMLDivElement | null

    expect(scrollRegion).toBeTruthy()
    if (!scrollRegion) {
      throw new Error('Expected help panel scroll region to be present')
    }

    Object.defineProperty(scrollRegion, 'clientHeight', {
      configurable: true,
      value: 120,
    })
    Object.defineProperty(scrollRegion, 'scrollHeight', {
      configurable: true,
      value: 320,
    })

    act(() => notifyResize?.([], {} as ResizeObserver))

    expect(dialog.querySelector('.help-panel-scroll-indicator')).toBeTruthy()
  })

  it('traps focus in the drawer, hides background siblings, and restores focus on Escape', () => {
    const { container } = render(
      <HelpProvider>
        <HelpHarness />
      </HelpProvider>,
    )

    const toggleButton = screen.getByRole('button', { name: 'toggle help' })
    toggleButton.focus()

    fireEvent.click(toggleButton)

    const dialog = screen.getByRole('dialog')
    const closeButton = screen.getByRole('button', { name: 'common.close' })

    expect(dialog).toHaveFocus()
    expect(container).toHaveAttribute('aria-hidden', 'true')
    expect(container).toHaveAttribute('inert')

    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(dialog).toHaveFocus()

    closeButton.setAttribute('hidden', '')
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dialog).toHaveFocus()

    closeButton.removeAttribute('hidden')
    closeButton.setAttribute('aria-hidden', 'true')
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dialog).toHaveFocus()

    closeButton.removeAttribute('aria-hidden')
    closeButton.tabIndex = -1
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dialog).toHaveFocus()

    closeButton.tabIndex = 0
    toggleButton.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(closeButton).toHaveFocus()

    toggleButton.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(closeButton).toHaveFocus()

    dialog.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(closeButton).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(closeButton).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Tab' })
    expect(closeButton).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(toggleButton).toHaveFocus()
    expect(container).not.toHaveAttribute('aria-hidden')
    expect(container).not.toHaveAttribute('inert')
  })

  it('restores background accessibility attributes to their prior values', () => {
    const existingSibling = document.createElement('aside')
    existingSibling.dataset.helpPanelTestSibling = 'true'
    existingSibling.setAttribute('aria-hidden', 'false')
    existingSibling.setAttribute('inert', '')
    document.body.append(existingSibling)

    render(
      <HelpProvider>
        <HelpHarness />
      </HelpProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'toggle help' }))

    expect(existingSibling).toHaveAttribute('aria-hidden', 'true')
    expect(existingSibling).toHaveAttribute('inert')

    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))

    expect(existingSibling).toHaveAttribute('aria-hidden', 'false')
    expect(existingSibling).toHaveAttribute('inert')
  })

  it('restores the parent help content when a child registration unmounts', () => {
    const { rerender } = render(
      <HelpProvider>
        <NestedHelpHarness showChild={false} />
      </HelpProvider>,
    )

    rerender(
      <HelpProvider>
        <NestedHelpHarness showChild={true} />
      </HelpProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'toggle help' }))

    expect(screen.getByRole('dialog', { name: 'help.child.title' })).toBe(
      screen.getByRole('dialog'),
    )

    rerender(
      <HelpProvider>
        <NestedHelpHarness showChild={false} />
      </HelpProvider>,
    )

    expect(screen.getByRole('dialog', { name: 'help.parent.title' })).toBe(
      screen.getByRole('dialog'),
    )
  })

  it('renders the lifecycle visual help section', () => {
    render(
      <HelpProvider>
        <HelpHarness content={TEST_VISUAL_HELP_CONTENT} />
      </HelpProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'toggle help' }))

    expect(
      screen.getByText('help.requirements.lifecycleVisual.heading'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('help.requirements.lifecycleVisual.body'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('help.requirements.lifecycleVisual.steps.draft.title'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'help.requirements.lifecycleVisual.transitions.editCreatesDraft',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'help.requirements.lifecycleVisual.steps.archivingReview.title',
      ),
    ).toBeInTheDocument()
  })

  it('renders indented text and a visual without optional introductory copy', () => {
    render(
      <HelpProvider>
        <HelpHarness content={TEST_SECTION_VARIANTS_HELP_CONTENT} />
      </HelpProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'toggle help' }))

    expect(
      screen.getByRole('heading', {
        name: 'help.requirements.details.heading',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('help.requirements.details.body'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: 'help.requirements.lifecycleVisual.heading',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('help.requirements.lifecycleVisual.steps.draft.title'),
    ).toBeInTheDocument()
  })
})
