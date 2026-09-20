import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpecDetailWorkflowContext } from './requirements-specification-detail-client.suite'

const widthKey = 'specification-panel-width-v1'
const layoutKey = 'specification-panel-layout-v1'
const panelNames = {
  left: 'specification.itemsInSpecification',
  right: 'specification.libraryPanel',
}
const toggle = (action: 'expand' | 'collapse', side: 'left' | 'right') =>
  screen.getByRole('button', {
    name: `specification.${action}Panel ${panelNames[side]}`,
  })

export function registerPanelResizeTests(context: SpecDetailWorkflowContext) {
  describe('panel resizing through the detail page', () => {
    let workspaceWidth: number
    let desktop: boolean
    let media: MediaQueryList
    let frames: Map<number, FrameRequestCallback>
    let observers: Map<Element, () => void>

    beforeEach(() => {
      localStorage.clear()
      localStorage.setItem(
        layoutKey,
        JSON.stringify({ specificationId: 8, layout: 'both' }),
      )
      localStorage.setItem(
        widthKey,
        JSON.stringify({ specificationId: 8, leftRatio: 0.5 }),
      )
      workspaceWidth = 1216
      desktop = true
      frames = new Map()
      observers = new Map()
      media = Object.assign(new EventTarget(), {
        matches: true,
        media: '(min-width: 80rem)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })
      Object.defineProperty(media, 'matches', { get: () => desktop })
      const matchMedia = window.matchMedia
      vi.spyOn(window, 'matchMedia').mockImplementation(query =>
        query === media.media ? media : matchMedia(query),
      )
      const measure = HTMLElement.prototype.getBoundingClientRect
      vi.spyOn(
        HTMLElement.prototype,
        'getBoundingClientRect',
      ).mockImplementation(function (this: HTMLElement) {
        return this.hasAttribute('data-specification-detail-split-panel')
          ? new DOMRect(0, 0, workspaceWidth, 800)
          : measure.call(this)
      })
      const computedStyle = window.getComputedStyle
      vi.spyOn(window, 'getComputedStyle').mockImplementation(
        (element, pseudo) => {
          const style = computedStyle(element, pseudo)
          if (element.hasAttribute('data-specification-detail-split-panel'))
            style.columnGap = '16px'
          return style
        },
      )
      let frameId = 0
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
        frames.set(++frameId, callback)
        return frameId
      })
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
        frames.delete(id)
      })
      vi.spyOn(globalThis, 'ResizeObserver').mockImplementation(
        class implements ResizeObserver {
          constructor(private callback: ResizeObserverCallback) {}
          observe(element: Element) {
            observers.set(element, () => this.callback([], this))
          }
          unobserve(element: Element) {
            observers.delete(element)
          }
          disconnect() {}
        },
      )
    })

    afterEach(() => {
      cleanup()
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      vi.restoreAllMocks()
    })

    const flushFrame = () => {
      act(() => {
        const pending = [...frames.values()]
        frames.clear()
        for (const callback of pending) callback(0)
      })
    }
    const savedRatio = () =>
      JSON.parse(localStorage.getItem(widthKey) ?? 'null')
    const open = async () => {
      const view = context.renderRequirementsSpecificationDetailClient()
      await context.settleInitialEditorEffects()
      const divider = screen.getByRole('separator', {
        name: 'specification.resizePanels',
      })
      const workspace = divider.parentElement as HTMLElement
      const captured = new Set<number>()
      divider.setPointerCapture = id => {
        captured.add(id)
      }
      divider.hasPointerCapture = id => captured.has(id)
      divider.releasePointerCapture = id => {
        captured.delete(id)
      }
      const pointer = (
        type: 'pointerdown' | 'pointermove' | 'pointerup',
        clientX: number,
        options: PointerEventInit = {},
      ) =>
        fireEvent(
          divider,
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            isPrimary: true,
            pointerId: 1,
            button: 0,
            clientX,
            ...options,
          }),
        )
      const width = () =>
        workspace.style.getPropertyValue('--specification-left-width')
      return { ...view, divider, workspace, pointer, width, captured }
    }

    it('resizes live, saves only on release, and restores the width on reload', async () => {
      const view = await open()
      expect(view.width()).toBe('600px')
      expect(view.divider).toHaveAttribute('aria-valuemin', '33')
      expect(view.divider).toHaveAttribute('aria-valuemax', '67')
      view.pointer('pointerdown', 600)
      expect(view.divider).toHaveFocus()
      expect(document.body.style.cursor).toBe('ew-resize')
      expect(document.body.style.userSelect).toBe('none')
      view.pointer('pointermove', 680)
      view.pointer('pointermove', 720)
      flushFrame()
      expect(view.width()).toBe('720px')
      expect(view.divider).toHaveAttribute('aria-valuenow', '60')
      expect(savedRatio().leftRatio).toBe(0.5)
      view.pointer('pointerup', 720)
      expect(savedRatio()).toEqual({ specificationId: 8, leftRatio: 0.6 })
      expect(view.captured.size).toBe(0)
      expect(document.body.style.cursor).toBe('')
      expect(document.body.style.userSelect).toBe('')
      view.unmount()
      expect((await open()).width()).toBe('720px')
    })

    it.each(['left', 'right'] as const)(
      'warns at the %s boundary, dims after overshoot, and collapses only on release',
      async side => {
        const view = await open()
        const panel = document.getElementById(`specification-${side}-panel`)
        const warningX = side === 'left' ? 400 : 800
        const collapseX = side === 'left' ? 320 : 880
        view.pointer('pointerdown', 600)
        view.pointer('pointermove', warningX)
        flushFrame()
        expect(within(view.divider).getByRole('status')).toHaveTextContent(
          'specification.continueDraggingToCollapsePanel',
        )
        expect(panel?.style.opacity).toBe('')
        view.pointer('pointermove', collapseX)
        flushFrame()
        expect(view.width()).toBe(`${warningX}px`)
        expect(panel).toHaveStyle({ opacity: '0.45' })
        expect(within(view.divider).getByRole('status')).toHaveTextContent(
          'specification.releaseToCollapsePanel',
        )
        expect(toggle('collapse', side)).toBeVisible()
        view.pointer('pointerup', collapseX)
        expect(toggle('expand', side)).toHaveFocus()
        expect(panel?.style.opacity).toBe('')
        expect(
          JSON.parse(localStorage.getItem(layoutKey) ?? 'null').layout,
        ).toBe(side === 'left' ? 'right' : 'left')
        expect(savedRatio().leftRatio).toBe(0.5)
        fireEvent.click(toggle('expand', side))
        expect(view.width()).toBe('600px')
      },
    )

    it('removes the collapse preview when the pointer reverses and commits the final position', async () => {
      const view = await open()
      view.pointer('pointerdown', 600)
      view.pointer('pointermove', 310)
      flushFrame()
      view.pointer('pointermove', 480)
      flushFrame()
      expect(within(view.divider).getByRole('status')).toBeEmptyDOMElement()
      expect(
        document.getElementById('specification-left-panel')?.style.opacity,
      ).toBe('')
      view.pointer('pointerup', 480)
      expect(view.width()).toBe('480px')
      expect(savedRatio().leftRatio).toBe(0.4)
      expect(toggle('collapse', 'left')).toBeVisible()
    })

    it.each([
      'Escape',
      'pointercancel',
      'lostpointercapture',
      'blur',
      'resize',
      'unmount',
    ])(
      'cancels a drag on %s and restores the original body styles and saved width',
      async reason => {
        const view = await open()
        const cursor = reason === 'unmount' ? '' : 'crosshair'
        const userSelect = reason === 'unmount' ? '' : 'text'
        document.body.style.cursor = cursor
        document.body.style.userSelect = userSelect
        view.pointer('pointerdown', 600)
        view.pointer('pointermove', 310)
        flushFrame()
        view.pointer('pointermove', 300)
        if (reason === 'Escape') fireEvent.keyDown(document, { key: 'Escape' })
        else if (reason === 'unmount') view.unmount()
        else
          fireEvent(
            reason === 'blur' || reason === 'resize' ? window : view.divider,
            new Event(reason),
          )
        flushFrame()
        expect(savedRatio().leftRatio).toBe(0.5)
        expect(document.body.style.cursor).toBe(cursor)
        expect(document.body.style.userSelect).toBe(userSelect)
        expect(view.captured.size).toBe(0)
        if (reason !== 'unmount') {
          expect(view.width()).toBe('600px')
          expect(within(view.divider).getByRole('status')).toBeEmptyDOMElement()
          expect(toggle('collapse', 'left')).toBeVisible()
        }
      },
    )

    it('ignores unrelated pointers and buttons while preserving the owning drag', async () => {
      const view = await open()
      view.pointer('pointerdown', 600, { button: 2 })
      view.pointer('pointerdown', 600, { isPrimary: false })
      view.pointer('pointermove', 700)
      view.pointer('pointerup', 700)
      expect(view.captured.size).toBe(0)
      view.pointer('pointerdown', 600)
      view.pointer('pointerdown', 500, { pointerId: 2 })
      view.pointer('pointermove', 310, { pointerId: 2 })
      view.pointer('pointerup', 310, { pointerId: 2 })
      fireEvent.keyDown(view.divider, { key: 'ArrowRight' })
      flushFrame()
      expect(view.width()).toBe('600px')
      view.pointer('pointerup', 640)
      expect(view.width()).toBe('640px')
      expect(toggle('collapse', 'left')).toBeVisible()
    })

    it('leaves the saved width unchanged after a click without movement', async () => {
      const view = await open()
      view.pointer('pointerdown', 600)
      view.pointer('pointerup', 600)
      expect(savedRatio().leftRatio).toBe(0.5)
      expect(view.width()).toBe('600px')
    })

    it('supports keyboard steps, clamps at minimum widths, and resets with Enter or double-click', async () => {
      const view = await open()
      fireEvent.keyDown(view.divider, { key: 'ArrowRight' })
      expect(view.width()).toBe('608px')
      fireEvent.keyDown(view.divider, { key: 'ArrowLeft', shiftKey: true })
      expect(view.width()).toBe('576px')
      for (let index = 0; index < 15; index++)
        fireEvent.keyDown(view.divider, { key: 'ArrowLeft', shiftKey: true })
      expect(view.width()).toBe('400px')
      expect(toggle('collapse', 'left')).toBeVisible()
      fireEvent.keyDown(view.divider, { key: 'Enter' })
      expect(view.width()).toBe('720px')
      fireEvent.keyDown(view.divider, { key: 'ArrowRight', shiftKey: true })
      fireEvent.doubleClick(view.divider)
      expect(view.width()).toBe('720px')
      expect(savedRatio().leftRatio).toBe(0.6)
      fireEvent.keyDown(toggle('collapse', 'left'), { key: 'ArrowRight' })
      fireEvent.keyDown(view.divider, { key: 'Home' })
      expect(view.width()).toBe('720px')
    })

    it('clamps a narrow workspace without overwriting the preferred ratio', async () => {
      const view = await open()
      view.pointer('pointerdown', 600)
      view.pointer('pointerup', 720)
      workspaceWidth = 716
      fireEvent.resize(window)
      expect(view.width()).toBe('350px')
      expect(view.divider).toHaveAttribute('aria-valuemin', '50')
      expect(view.divider).toHaveAttribute('aria-valuemax', '50')
      expect(savedRatio().leftRatio).toBe(0.6)
      workspaceWidth = 1216
      fireEvent.resize(window)
      expect(view.width()).toBe('720px')
    })

    it('preserves a drag through height-only observations and cancels when workspace width changes', async () => {
      const view = await open()
      view.pointer('pointerdown', 600)
      view.pointer('pointermove', 700)
      act(() => observers.get(view.workspace)?.())
      flushFrame()
      expect(view.width()).toBe('700px')
      expect(view.captured.size).toBe(1)
      workspaceWidth = 1016
      act(() => observers.get(view.workspace)?.())
      expect(view.captured.size).toBe(0)
      expect(view.width()).toBe('500px')
      view.pointer('pointerup', 700)
      expect(savedRatio().leftRatio).toBe(0.5)
    })

    it('rejects a release if the workspace changed before its resize notification', async () => {
      const view = await open()
      view.pointer('pointerdown', 600)
      workspaceWidth = 1016
      view.pointer('pointerup', 700)
      expect(savedRatio().leftRatio).toBe(0.5)
      expect(view.width()).toBe('500px')
    })

    it('moves focus to the panel toggle when responsive stacking hides the focused divider', async () => {
      const view = await open()
      view.pointer('pointerdown', 600)
      desktop = false
      // A browser can blur the hidden splitter before notifying matchMedia.
      act(() => view.divider.blur())
      act(() => {
        media.dispatchEvent(new Event('change'))
      })
      expect(toggle('collapse', 'left')).toHaveFocus()
      expect(view.captured.size).toBe(0)
      view.pointer('pointerdown', 600)
      fireEvent.keyDown(view.divider, { key: 'ArrowRight' })
      expect(view.captured.size).toBe(0)
      expect(savedRatio().leftRatio).toBe(0.5)
    })

    it('does not steal focus from another control when the workspace stacks', async () => {
      const view = await open()
      act(() => view.divider.focus())
      act(() => toggle('collapse', 'right').focus())
      desktop = false
      act(() => {
        media.dispatchEvent(new Event('change'))
      })
      expect(toggle('collapse', 'right')).toHaveFocus()
    })

    it('keeps resizing usable when browser storage writes are denied', async () => {
      const view = await open()
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Denied', 'SecurityError')
      })
      view.pointer('pointerdown', 600)
      view.pointer('pointerup', 720)
      expect(view.width()).toBe('720px')
      fireEvent.keyDown(view.divider, { key: 'ArrowLeft' })
      expect(view.width()).toBe('712px')
    })
  })
}
