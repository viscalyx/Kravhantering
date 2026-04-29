import type { RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'

interface UseVersionPillConnectorResult {
  cardRef: RefObject<HTMLDivElement | null>
  connectorHeight: number | null
  triangleLeft: number | null
  versionHistoryRef: RefObject<HTMLDivElement | null>
}

export function useVersionPillConnector(
  selectedVersionNumber: number | null,
): UseVersionPillConnectorResult {
  const [triangleLeft, setTriangleLeft] = useState<number | null>(null)
  const [connectorHeight, setConnectorHeight] = useState<number | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const versionHistoryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cardEl = cardRef.current
    const versionHistoryEl = versionHistoryRef.current

    function measure() {
      const card = cardEl
      const versionHistory = versionHistoryEl
      if (!card || !versionHistory || selectedVersionNumber === null) {
        setTriangleLeft(null)
        return
      }

      const allPills = versionHistory.querySelectorAll(
        '[data-version-number]',
      ) as NodeListOf<HTMLElement>
      for (const pill of allPills) {
        pill.style.marginLeft = ''
      }

      const selectedPill = versionHistory.querySelector(
        `[data-version-number="${selectedVersionNumber}"]`,
      ) as HTMLElement | null
      if (!selectedPill) {
        setTriangleLeft(null)
        return
      }

      const cardRect = card.getBoundingClientRect()
      const pillRect = selectedPill.getBoundingClientRect()

      const firstPill = versionHistory.querySelector(
        '[data-version-number]',
      ) as HTMLElement | null
      const wrapped =
        firstPill != null &&
        pillRect.top > firstPill.getBoundingClientRect().bottom

      const left = wrapped
        ? pillRect.left + 8 - cardRect.left
        : pillRect.left + pillRect.width / 2 - cardRect.left

      if (wrapped) {
        const firstPillTop = firstPill
          ? firstPill.getBoundingClientRect().top
          : 0
        for (const pill of allPills) {
          const pillItemRect = pill.getBoundingClientRect()
          if (Math.abs(pillItemRect.top - firstPillTop) > 4) continue
          const pillLeft = pillItemRect.left - cardRect.left
          const pillRight = pillLeft + pillItemRect.width
          if (left >= pillLeft - 2 && left <= pillRight + 2) {
            const needed = left + 5 - pillLeft
            if (needed > 0) {
              pill.style.marginLeft = `${needed}px`
            }
            break
          }
        }

        const updatedPillRect = selectedPill.getBoundingClientRect()
        const updatedCardRect = card.getBoundingClientRect()
        const updatedLeft = updatedPillRect.left + 8 - updatedCardRect.left
        setTriangleLeft(
          Math.max(16, Math.min(updatedLeft, updatedCardRect.width - 16)),
        )
        const arrowTipOffset = 12
        setConnectorHeight(
          updatedPillRect.top - updatedCardRect.bottom - arrowTipOffset,
        )
      } else {
        setTriangleLeft(Math.max(16, Math.min(left, cardRect.width - 16)))
        setConnectorHeight(null)
      }
    }

    measure()
    const handleResizeObserver: ResizeObserverCallback = () => {
      measure()
    }
    const resizeObserver = new ResizeObserver(handleResizeObserver)
    if (versionHistoryEl) {
      resizeObserver.observe(versionHistoryEl)
    }
    if (cardEl) {
      resizeObserver.observe(cardEl)
    }

    const handleMutationObserver: MutationCallback = () => {
      measure()
    }
    const mutationObserver = new MutationObserver(handleMutationObserver)
    if (versionHistoryEl) {
      mutationObserver.observe(versionHistoryEl, {
        childList: true,
        subtree: true,
      })
    }
    window.addEventListener('resize', measure)
    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      window.removeEventListener('resize', measure)
      if (versionHistoryEl) {
        const pills = versionHistoryEl.querySelectorAll(
          '[data-version-number]',
        ) as NodeListOf<HTMLElement>
        for (const pill of pills) {
          pill.style.marginLeft = ''
        }
      }
    }
  }, [selectedVersionNumber])

  return {
    cardRef,
    connectorHeight,
    triangleLeft,
    versionHistoryRef,
  }
}
