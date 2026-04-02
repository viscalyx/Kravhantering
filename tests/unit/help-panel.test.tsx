import { fireEvent, render, screen } from '@testing-library/react'
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
      bodyKey: 'kravkatalog.overview.body',
      headingKey: 'kravkatalog.overview.heading',
    },
  ],
  titleKey: 'kravkatalog.title',
}

const TEST_VISUAL_HELP_CONTENT: HelpContent = {
  sections: [
    {
      bodyKey: 'kravkatalog.lifecycleVisual.body',
      headingKey: 'kravkatalog.lifecycleVisual.heading',
      kind: 'visual',
      visualId: 'requirementLifecycle',
    },
  ],
  titleKey: 'kravkatalog.title',
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

describe('HelpPanel', () => {
  beforeEach(() => {
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
    vi.unstubAllGlobals()
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

  it('renders the lifecycle visual help section', () => {
    render(
      <HelpProvider>
        <HelpHarness content={TEST_VISUAL_HELP_CONTENT} />
      </HelpProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'toggle help' }))

    expect(
      screen.getByText('help.kravkatalog.lifecycleVisual.heading'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('help.kravkatalog.lifecycleVisual.body'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('help.kravkatalog.lifecycleVisual.steps.draft.title'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'help.kravkatalog.lifecycleVisual.transitions.editCreatesDraft',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'help.kravkatalog.lifecycleVisual.steps.archivingReview.title',
      ),
    ).toBeInTheDocument()
  })
})
