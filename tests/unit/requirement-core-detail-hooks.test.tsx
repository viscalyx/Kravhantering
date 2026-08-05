import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import { type MutableRefObject, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLocalizedName } from '@/app/[locale]/requirements/[id]/_detail/localized-name'
import { useRequirementDetailData } from '@/app/[locale]/requirements/[id]/_detail/use-requirement-detail-data'
import { useVersionPillConnector } from '@/app/[locale]/requirements/[id]/_detail/use-version-pill-connector'
import { useDetailActionMenu } from '@/app/[locale]/requirements/[id]/_detail/useDetailActionMenu'

function jsonResponse(
  body: unknown,
  options: { ok?: boolean; status?: number; statusText?: string } = {},
) {
  return {
    json: async () => structuredClone(body),
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? 'OK',
  } as Response
}

function ActionMenuHarness({
  initiallyOpen = true,
}: {
  initiallyOpen?: boolean
}) {
  const [isOpen, setIsOpen] = useState(initiallyOpen)
  const menu = useDetailActionMenu({ idPrefix: 'actions', isOpen, setIsOpen })
  return (
    <div ref={menu.rootRef}>
      <button
        id={menu.triggerId}
        onClick={() => setIsOpen(true)}
        ref={menu.triggerRef}
        type="button"
      >
        Open
      </button>
      {isOpen ? (
        <div
          id={menu.menuId}
          onKeyDown={menu.handleMenuKeyDown}
          ref={menu.menuRef}
          role="menu"
        >
          <button role="menuitem" type="button">
            First
          </button>
          <button aria-disabled="true" role="menuitem" type="button">
            Disabled
          </button>
          <button role="menuitem" type="button">
            Last
          </button>
        </div>
      ) : null}
      <button
        onClick={() => menu.closeMenu({ restoreFocus: true })}
        type="button"
      >
        Close
      </button>
    </div>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('requirement detail core hooks', () => {
  it('falls back between Swedish and English localized names', () => {
    expect(
      getLocalizedName('sv', { nameEn: 'English', nameSv: 'Svenska' }),
    ).toBe('Svenska')
    expect(getLocalizedName('sv', { nameEn: 'English', nameSv: null })).toBe(
      'English',
    )
    expect(
      getLocalizedName('en', { nameEn: 'English', nameSv: 'Svenska' }),
    ).toBe('English')
    expect(getLocalizedName('en', { nameEn: null, nameSv: 'Svenska' })).toBe(
      'Svenska',
    )
    expect(getLocalizedName('en', null)).toBeNull()
  })

  it('loads requirement data and the transitions for its latest status', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/requirements/42') {
        return jsonResponse({
          id: 42,
          uniqueId: 'REQ-42',
          versions: [{ id: 7, status: 3, versionNumber: 1 }],
        })
      }
      if (url === '/api/requirements/43') {
        return jsonResponse({ id: 43, uniqueId: 'REQ-43', versions: [] })
      }
      if (url === '/api/requirement-statuses') {
        return jsonResponse({
          statuses: [{ id: 3, nameEn: 'Published', nameSv: 'Publicerad' }],
          transitions: [
            { fromStatus: { id: 3 }, toStatus: { id: 4, nameEn: 'Archived' } },
            { fromStatus: { id: 2 }, toStatus: { id: 3, nameEn: 'Published' } },
          ],
        })
      }
      throw new Error(`Unhandled fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(
      ({ requirementId }: { requirementId: number }) =>
        useRequirementDetailData({ requirementId }),
      { initialProps: { requirementId: 42 } },
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    await waitFor(() => expect(result.current.transitions).toHaveLength(1))
    expect(result.current.requirement?.uniqueId).toBe('REQ-42')
    expect(result.current.statuses).toHaveLength(1)

    await act(async () => result.current.refreshRequirement())
    expect(fetchMock).toHaveBeenCalledWith('/api/requirements/42')

    rerender({ requirementId: 43 })
    await waitFor(() => expect(result.current.requirement?.id).toBe(43))
    await waitFor(() => expect(result.current.transitions).toEqual([]))
  })

  it('clears detail and transition state on response and transport failures', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({}, { ok: false, status: 503, statusText: '' }),
      )
      .mockRejectedValueOnce(new Error('detail transport failed'))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 43,
          uniqueId: 'REQ-43',
          versions: [{ id: 8, status: 2, versionNumber: 1 }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({}, { ok: false, status: 502, statusText: 'Bad Gateway' }),
      )
      .mockRejectedValueOnce(new Error('status transport failed'))
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(
      ({ requirementId }: { requirementId: number }) =>
        useRequirementDetailData({ requirementId }),
      { initialProps: { requirementId: 41 } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.requirement).toBeNull()

    rerender({ requirementId: 42 })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.requirement).toBeNull())

    rerender({ requirementId: 43 })
    await waitFor(() => expect(result.current.requirement?.id).toBe(43))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
    expect(result.current.statuses).toEqual([])
    expect(result.current.transitions).toEqual([])

    await act(async () => result.current.refreshRequirement())
    expect(consoleError).toHaveBeenCalled()
  })

  it('handles requirement details without versions or status catalogs', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({ id: 44, uniqueId: 'REQ-44', versions: [] }),
        ),
    )

    const { result } = renderHook(() =>
      useRequirementDetailData({ requirementId: 44 }),
    )

    await waitFor(() => expect(result.current.requirement?.id).toBe(44))
    expect(result.current.transitions).toEqual([])
    expect(result.current.statuses).toEqual([])
  })

  it('accepts transition payloads that omit the optional status catalog', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            id: 45,
            uniqueId: 'REQ-45',
            versions: [{ id: 9, status: 2, versionNumber: 1 }],
          }),
        )
        .mockResolvedValueOnce(jsonResponse({ transitions: [] })),
    )

    const { result } = renderHook(() =>
      useRequirementDetailData({ requirementId: 45 }),
    )

    await waitFor(() => expect(result.current.requirement?.id).toBe(45))
    await waitFor(() => expect(result.current.transitions).toEqual([]))
    expect(result.current.statuses).toEqual([])
  })

  it('supports keyboard, focus restoration, tab, and outside-click menu behavior', async () => {
    render(
      <>
        <ActionMenuHarness />
        <button type="button">Outside</button>
      </>,
    )
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus(),
    )
    const menu = screen.getByRole('menu')

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Last' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(screen.getByRole('menuitem', { name: 'Last' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'Home' })
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'End' })
    expect(screen.getByRole('menuitem', { name: 'Last' })).toHaveFocus()
    ;(document.activeElement as HTMLElement).blur()
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'UnmappedKey' })
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Tab' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes explicitly with restored trigger focus', () => {
    render(<ActionMenuHarness initiallyOpen={false} />)
    const open = screen.getByRole('button', { name: 'Open' })
    open.focus()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(open).toHaveFocus()
  })

  it('ignores keyboard navigation when an open menu has no enabled items', () => {
    function EmptyMenu() {
      const [isOpen, setIsOpen] = useState(true)
      const menu = useDetailActionMenu({ idPrefix: 'empty', isOpen, setIsOpen })
      return (
        <div ref={menu.rootRef}>
          <button ref={menu.triggerRef} type="button">
            Trigger
          </button>
          <div
            onKeyDown={menu.handleMenuKeyDown}
            ref={menu.menuRef}
            role="menu"
          >
            <button aria-disabled="true" role="menuitem" type="button">
              Unavailable
            </button>
          </div>
        </div>
      )
    }
    render(<EmptyMenu />)

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem')).not.toHaveFocus()
  })

  it('measures an unwrapped version pill and responds to browser observers', async () => {
    let resizeCallback: ResizeObserverCallback | undefined
    let mutationCallback: MutationCallback | undefined
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback
        }
        disconnect() {}
        observe() {}
        unobserve() {}
      },
    )
    vi.stubGlobal(
      'MutationObserver',
      class MutationObserver {
        constructor(callback: MutationCallback) {
          mutationCallback = callback
        }
        disconnect() {}
        observe() {}
        takeRecords(): MutationRecord[] {
          return []
        }
      },
    )
    const { result, rerender } = renderHook(
      ({ selected }: { selected: number | null }) =>
        useVersionPillConnector(selected),
      { initialProps: { selected: null as number | null } },
    )
    const card = document.createElement('div')
    const history = document.createElement('div')
    const pill = document.createElement('button')
    pill.dataset.versionNumber = '1'
    history.append(pill)
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
      bottom: 100,
      height: 100,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    vi.spyOn(pill, 'getBoundingClientRect').mockReturnValue({
      bottom: 70,
      height: 20,
      left: 20,
      right: 60,
      top: 50,
      width: 40,
      x: 20,
      y: 50,
      toJSON: () => ({}),
    } as DOMRect)
    ;(
      result.current.cardRef as MutableRefObject<HTMLDivElement | null>
    ).current = card
    ;(
      result.current
        .versionHistoryRef as MutableRefObject<HTMLDivElement | null>
    ).current = history

    rerender({ selected: 1 })
    await waitFor(() => expect(result.current.triangleLeft).toBe(40))
    expect(result.current.connectorHeight).toBeNull()

    act(() => resizeCallback?.([], {} as ResizeObserver))
    expect(mutationCallback).toBeDefined()
    act(() =>
      (mutationCallback as MutationCallback)([], {} as MutationObserver),
    )
    expect(result.current.triangleLeft).toBe(40)
  })

  it('remeasures version pills after a real DOM mutation', async () => {
    const { result, rerender } = renderHook(
      ({ selected }: { selected: number | null }) =>
        useVersionPillConnector(selected),
      { initialProps: { selected: null as number | null } },
    )
    const card = document.createElement('div')
    const history = document.createElement('div')
    const pill = document.createElement('button')
    pill.dataset.versionNumber = '1'
    history.append(pill)
    let pillLeft = 20
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
      bottom: 100,
      height: 100,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    vi.spyOn(pill, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          bottom: 70,
          height: 20,
          left: pillLeft,
          right: pillLeft + 40,
          top: 50,
          width: 40,
          x: pillLeft,
          y: 50,
          toJSON: () => ({}),
        }) as DOMRect,
    )
    ;(
      result.current.cardRef as MutableRefObject<HTMLDivElement | null>
    ).current = card
    ;(
      result.current
        .versionHistoryRef as MutableRefObject<HTMLDivElement | null>
    ).current = history

    rerender({ selected: 1 })
    await waitFor(() => expect(result.current.triangleLeft).toBe(40))
    pillLeft = 80
    const mutation = document.createElement('span')
    history.append(mutation)

    await waitFor(() => expect(result.current.triangleLeft).toBe(100))
  })
})
