import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StewardshipLazyWorkspace, {
  type StewardshipWorkspaceId,
} from '@/app/[locale]/requirements/stewardship/stewardship-lazy-workspace'

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace?: string) => (key: string, values?: Record<string, unknown>) =>
      `${namespace ? `${namespace}.` : ''}${key}${
        values ? ` ${Object.values(values).join(' ')}` : ''
      }`,
}))

function SuspendedWorkspace(): never {
  throw new Promise(() => undefined)
}

function BrokenWorkspace(): never {
  throw new Error('workspace import failed')
}

describe('StewardshipLazyWorkspace', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each<[StewardshipWorkspaceId, string]>([
    ['packages', 'Requirements packages'],
    ['questions', 'Requirement selection questions'],
    ['rfi', 'RFI questions'],
    ['norms', 'Norm library'],
  ])('renders an accessible loading state for %s', (workspaceId, label) => {
    render(
      <StewardshipLazyWorkspace
        workspaceId={workspaceId}
        workspaceLabel={label}
      >
        <SuspendedWorkspace />
      </StewardshipLazyWorkspace>,
    )

    expect(screen.getByRole('heading', { level: 1, name: label })).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent(
      `stewardshipWorkspace.loading ${label}`,
    )
    expect(screen.getByRole('status')).toHaveAttribute(
      'data-developer-mode-name',
      'workspace loading',
    )
    expect(screen.getByRole('status')).toHaveAttribute(
      'data-developer-mode-value',
      workspaceId,
    )
  })

  it('contains a workspace failure and offers an accessible reload action', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reloadPage = vi.fn()
    const user = userEvent.setup()

    render(
      <StewardshipLazyWorkspace
        reloadPage={reloadPage}
        workspaceId="questions"
        workspaceLabel="Requirement selection questions"
      >
        <BrokenWorkspace />
      </StewardshipLazyWorkspace>,
    )

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Requirement selection questions',
      }),
    ).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'stewardshipWorkspace.loadError.title Requirement selection questions',
    )
    expect(
      screen.getByRole('button', {
        name: 'stewardshipWorkspace.loadError.retry',
      }),
    ).toBeVisible()
    expect(screen.getByRole('alert').closest('section')).toHaveAttribute(
      'data-developer-mode-name',
      'workspace load error',
    )
    await user.click(
      screen.getByRole('button', {
        name: 'stewardshipWorkspace.loadError.retry',
      }),
    )
    expect(reloadPage).toHaveBeenCalledOnce()
  })

  it('uses a full-page reload as the default retry action', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reload = vi.fn()
    const originalWindow = window
    vi.stubGlobal(
      'window',
      new Proxy(originalWindow, {
        get(target, property) {
          if (property === 'location') return { reload }
          return Reflect.get(target, property, target)
        },
      }),
    )
    const user = userEvent.setup()

    render(
      <StewardshipLazyWorkspace
        workspaceId="rfi"
        workspaceLabel="RFI questions"
      >
        <BrokenWorkspace />
      </StewardshipLazyWorkspace>,
    )

    await user.click(
      screen.getByRole('button', {
        name: 'stewardshipWorkspace.loadError.retry',
      }),
    )
    expect(reload).toHaveBeenCalledOnce()
  })
})
