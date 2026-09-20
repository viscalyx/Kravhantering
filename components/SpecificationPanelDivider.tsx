'use client'

import { useTranslations } from 'next-intl'
import { type RefObject, useLayoutEffect, useRef, useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

interface SpecificationPanelDividerProps {
  active: boolean
  leftLabel: string
  onCollapse: (side: 'left' | 'right') => void
  rightLabel: string
  specificationId: number
  workspaceRef: RefObject<HTMLDivElement | null>
}

const minimumWidth = 400
const collapseOvershoot = 80
type CollapsePreview =
  | 'left-warning'
  | 'right-warning'
  | 'left-ready'
  | 'right-ready'
  | null
const widthStorageKey = 'specification-panel-width-v1'

function readRatio(specificationId: number): number {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(widthStorageKey) ?? 'null',
    )
    if (
      saved &&
      typeof saved === 'object' &&
      'specificationId' in saved &&
      saved.specificationId === specificationId &&
      'leftRatio' in saved &&
      typeof saved.leftRatio === 'number' &&
      Number.isFinite(saved.leftRatio) &&
      saved.leftRatio > 0 &&
      saved.leftRatio < 1
    )
      return saved.leftRatio
  } catch {
    // A width preference is optional when storage is invalid or unavailable.
  }
  return 0.6
}

function saveRatio(specificationId: number, leftRatio: number) {
  try {
    localStorage.setItem(
      widthStorageKey,
      JSON.stringify({ specificationId, leftRatio }),
    )
  } catch {
    // Resizing still works for this visit without browser storage.
  }
}

export default function SpecificationPanelDivider({
  active,
  leftLabel,
  rightLabel,
  onCollapse,
  specificationId,
  workspaceRef,
}: SpecificationPanelDividerProps) {
  const t = useTranslations('specification')
  const dividerRef = useRef<HTMLDivElement>(null)
  const preferredRatio = useRef(0.6)
  const [collapsePreview, setCollapsePreview] = useState<CollapsePreview>(null)

  useLayoutEffect(() => {
    preferredRatio.current = readRatio(specificationId)
    // Opening a different specification expires its predecessor's ratio,
    // including when the current specification initially has a collapsed panel.
    saveRatio(specificationId, preferredRatio.current)
  }, [specificationId])

  useLayoutEffect(() => {
    const workspace = workspaceRef.current
    const divider = dividerRef.current
    if (!workspace || !divider || !active) return
    const desktop = window.matchMedia('(min-width: 80rem)')
    let dividerFocused = document.activeElement === divider
    let currentPreview: CollapsePreview = null
    let frame: number | null = null
    let drag: {
      pointerId: number
      startX: number
      startWidth: number
      availableWidth: number
      clientX: number
      cursor: string
      userSelect: string
    } | null = null

    const availableWidth = () =>
      workspace.getBoundingClientRect().width -
      Number.parseFloat(getComputedStyle(workspace).columnGap)
    const clampWidth = (width: number) => {
      const total = availableWidth()
      const minimum = Math.min(minimumWidth, total / 2)
      return Math.min(total - minimum, Math.max(minimum, width))
    }
    const paint = (width: number) => {
      const total = availableWidth()
      if (!Number.isFinite(total) || total <= 0) return
      const left = clampWidth(width)
      workspace.style.setProperty('--specification-left-width', `${left}px`)
      const percent = Math.round((left / total) * 100)
      divider.setAttribute('aria-valuenow', String(percent))
      divider.setAttribute(
        'aria-valuemin',
        String(Math.round((Math.min(minimumWidth, total / 2) / total) * 100)),
      )
      divider.setAttribute(
        'aria-valuemax',
        String(
          Math.round((1 - Math.min(minimumWidth, total / 2) / total) * 100),
        ),
      )
      divider.setAttribute(
        'aria-valuetext',
        t('panelWidthValue', { left: percent, right: 100 - percent }),
      )
    }
    const restore = () => paint(availableWidth() * preferredRatio.current)
    const showPreview = (next: CollapsePreview) => {
      if (next === currentPreview) return
      currentPreview = next
      // Only the boundary transitions render React content; pointer movement
      // itself updates widths once per animation frame.
      setCollapsePreview(next)
      for (const side of ['left', 'right']) {
        const panel = workspace.querySelector<HTMLElement>(
          `#specification-${side}-panel`,
        )
        if (panel) panel.style.opacity = next === `${side}-ready` ? '0.45' : ''
      }
    }
    const previewFor = (width: number): CollapsePreview => {
      const left = Math.round(width)
      const right = Math.round(availableWidth() - width)
      if (left <= minimumWidth - collapseOvershoot) return 'left-ready'
      if (right <= minimumWidth - collapseOvershoot) return 'right-ready'
      if (left <= minimumWidth) return 'left-warning'
      if (right <= minimumWidth) return 'right-warning'
      return null
    }
    const preview = () => {
      frame = null
      if (drag) {
        const width = drag.startWidth + drag.clientX - drag.startX
        paint(width)
        showPreview(previewFor(width))
      }
    }
    const finish = (commit: boolean) => {
      if (!drag) return
      const current = drag
      drag = null
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      const width = current.startWidth + current.clientX - current.startX
      const canCommit =
        commit &&
        desktop.matches &&
        Math.abs(availableWidth() - current.availableWidth) < 0.5
      const preview = canCommit ? previewFor(width) : null
      const collapse =
        preview === 'left-ready'
          ? 'left'
          : preview === 'right-ready'
            ? 'right'
            : null
      if (canCommit && !collapse && current.clientX !== current.startX) {
        preferredRatio.current = clampWidth(width) / availableWidth()
        saveRatio(specificationId, preferredRatio.current)
      }
      document.body.style.cursor = current.cursor
      document.body.style.userSelect = current.userSelect
      divider.removeAttribute('data-dragging')
      if (divider.hasPointerCapture(current.pointerId))
        divider.releasePointerCapture(current.pointerId)
      showPreview(null)
      restore()
      if (collapse) onCollapse(collapse)
    }
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary || !desktop.matches || drag)
        return
      event.preventDefault()
      divider.focus({ preventScroll: true })
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        clientX: event.clientX,
        startWidth: clampWidth(availableWidth() * preferredRatio.current),
        availableWidth: availableWidth(),
        cursor: document.body.style.cursor,
        userSelect: document.body.style.userSelect,
      }
      divider.setPointerCapture(event.pointerId)
      divider.setAttribute('data-dragging', 'true')
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
    }
    const move = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) return
      drag.clientX = event.clientX
      if (frame === null) frame = requestAnimationFrame(preview)
    }
    const up = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) return
      drag.clientX = event.clientX
      finish(true)
    }
    const cancel = () => finish(false)
    const reset = () => {
      cancel()
      preferredRatio.current = 0.6
      saveRatio(specificationId, preferredRatio.current)
      restore()
    }
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && drag) {
        event.preventDefault()
        event.stopPropagation()
        cancel()
        return
      }
      if (event.target !== divider || !desktop.matches || drag) return
      if (event.key === 'Enter') {
        event.preventDefault()
        reset()
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const step =
          (event.shiftKey ? 32 : 8) * (event.key === 'ArrowLeft' ? -1 : 1)
        preferredRatio.current =
          clampWidth(
            clampWidth(availableWidth() * preferredRatio.current) + step,
          ) / availableWidth()
        saveRatio(specificationId, preferredRatio.current)
        restore()
      }
    }
    const focus = () => {
      dividerFocused = true
    }
    const blur = () => {
      // Hiding the divider can blur it before the media/resize callback runs.
      // Preserve ownership in that case so responsive focus transfer is reliable.
      if (desktop.matches) dividerFocused = false
    }
    const resize = () => {
      const restoreFocus = dividerFocused || document.activeElement === divider
      cancel()
      if (desktop.matches) restore()
      else if (restoreFocus) {
        dividerFocused = false
        workspace
          .querySelector<HTMLButtonElement>(
            'button[aria-controls="specification-left-panel"][aria-expanded="true"]',
          )
          ?.focus({ preventScroll: true })
      }
    }
    const observer = new ResizeObserver(() => {
      // An initial notification or changing content height must not cancel
      // a drag. Only a change to the available horizontal space does that.
      if (
        drag &&
        desktop.matches &&
        Math.abs(availableWidth() - drag.availableWidth) < 0.5
      )
        return
      resize()
    })
    observer.observe(workspace)
    desktop.addEventListener('change', resize)
    divider.addEventListener('pointerdown', down)
    divider.addEventListener('focus', focus)
    divider.addEventListener('blur', blur)
    divider.addEventListener('pointermove', move)
    divider.addEventListener('pointerup', up)
    divider.addEventListener('pointercancel', cancel)
    divider.addEventListener('lostpointercapture', cancel)
    divider.addEventListener('dblclick', reset)
    window.addEventListener('blur', cancel)
    window.addEventListener('resize', resize)
    document.addEventListener('keydown', keyDown, true)
    restore()
    return () => {
      cancel()
      observer.disconnect()
      desktop.removeEventListener('change', resize)
      divider.removeEventListener('pointerdown', down)
      divider.removeEventListener('focus', focus)
      divider.removeEventListener('blur', blur)
      divider.removeEventListener('pointermove', move)
      divider.removeEventListener('pointerup', up)
      divider.removeEventListener('pointercancel', cancel)
      divider.removeEventListener('lostpointercapture', cancel)
      divider.removeEventListener('dblclick', reset)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('resize', resize)
      document.removeEventListener('keydown', keyDown, true)
    }
  }, [active, onCollapse, specificationId, t, workspaceRef])

  return (
    // Deliberate accessibility deviation approved for this surface: 16px grab
    // width, without an equivalent pointer control. This is NOT a WCAG
    // exception. See docs/governance/requirements-ui-behaviour.md.
    // biome-ignore lint/a11y/useSemanticElements: This focusable window splitter is an adjustable widget, not a document thematic break.
    <div
      aria-controls="specification-left-panel specification-right-panel"
      aria-label={t('resizePanels')}
      aria-orientation="vertical"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={60}
      className={
        active
          ? 'group absolute inset-y-0 z-20 hidden w-4 touch-none cursor-ew-resize items-stretch justify-center outline-none xl:flex'
          : 'hidden'
      }
      hidden={!active}
      ref={dividerRef}
      role="separator"
      style={{
        left: 'var(--specification-left-width, calc((100% - 1rem) * 0.6))',
      }}
      tabIndex={0}
      {...devMarker({
        name: 'resize handle',
        context: 'requirements specification detail',
        value: 'panel widths',
      })}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none w-px bg-secondary-300 group-hover:bg-primary-500 group-focus-visible:w-0.5 group-focus-visible:bg-primary-500 group-data-[dragging=true]:bg-primary-500 dark:bg-secondary-700 dark:group-hover:bg-primary-400 dark:group-focus-visible:bg-primary-400 dark:group-data-[dragging=true]:bg-primary-400"
      />
      <span
        className="pointer-events-none absolute top-12 left-1/2 w-56 -translate-x-1/2 text-center text-sm font-medium text-secondary-900 dark:text-secondary-100"
        role="status"
        {...devMarker({
          name: 'resize hint',
          context: 'requirements specification detail',
          value: 'drag to collapse',
        })}
      >
        {collapsePreview && (
          <span className="block rounded-lg border border-secondary-300 bg-white p-2 shadow-lg dark:border-secondary-700 dark:bg-secondary-900">
            {t(
              collapsePreview.endsWith('-ready')
                ? 'releaseToCollapsePanel'
                : 'continueDraggingToCollapsePanel',
              {
                panel: collapsePreview.startsWith('left')
                  ? leftLabel
                  : rightLabel,
              },
            )}
          </span>
        )}
      </span>
    </div>
  )
}
