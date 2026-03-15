'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'

interface StatusStep {
  color: string | null
  id: number
  nameEn: string
  nameSv: string
  sortOrder?: number
}

const FALLBACK_STEPS: StatusStep[] = [
  { id: 1, color: '#3b82f6', nameEn: 'Draft', nameSv: 'Utkast' },
  { id: 2, color: '#eab308', nameEn: 'Review', nameSv: 'Granskning' },
  { id: 3, color: '#22c55e', nameEn: 'Published', nameSv: 'Publicerad' },
  { id: 4, color: '#6b7280', nameEn: 'Archived', nameSv: 'Arkiverad' },
]

/** Pixel depth of the arrow point / notch */
const ARROW = 14

const DROP_SHADOW =
  'drop-shadow(1px 0 0 var(--color-secondary-500)) drop-shadow(-1px 0 0 var(--color-secondary-500)) drop-shadow(0 1px 0 var(--color-secondary-500)) drop-shadow(0 -1px 0 var(--color-secondary-500))'

/** Clip-path for background (inactive) chevron steps. */
function stepClipPath(isFirst: boolean) {
  const a = `${ARROW}px`
  if (isFirst)
    return `polygon(0 0, calc(100% - ${a}) 0, 100% 50%, calc(100% - ${a}) 100%, 0 100%)`
  return `polygon(0 0, calc(100% - ${a}) 0, 100% 50%, calc(100% - ${a}) 100%, 0 100%, ${a} 50%)`
}

/**
 * Clip-path for the sliding highlight, normalized to 6 vertices
 * so CSS can smoothly interpolate between first (flat left) and
 * non-first (notched left) shapes.
 */
function sliderClipPath(isFirst: boolean) {
  const a = `${ARROW}px`
  if (isFirst)
    return `polygon(0 0, calc(100% - ${a}) 0, 100% 50%, calc(100% - ${a}) 100%, 0 100%, 0 50%)`
  return `polygon(0 0, calc(100% - ${a}) 0, 100% 50%, calc(100% - ${a}) 100%, 0 100%, ${a} 50%)`
}

interface StatusStepperProps {
  currentStatusId: number
  developerModeContext?: string
  statuses?: StatusStep[]
}

function getStatusStepDeveloperModeValue(step: StatusStep) {
  return step.nameEn.toLowerCase()
}

export default function StatusStepper({
  developerModeContext,
  currentStatusId,
  statuses,
}: StatusStepperProps) {
  const t = useTranslations('requirement.statusLabel')
  const steps = useMemo(() => {
    if (!statuses || statuses.length === 0) return FALLBACK_STEPS
    return [...statuses].sort(
      (a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id),
    )
  }, [statuses])
  const targetIndex = steps.findIndex(s => s.id === currentStatusId)
  const activeColor = steps[targetIndex]?.color ?? '#6b7280'
  const containerRef = useRef<HTMLDivElement>(null)
  const stepRefs = useRef<(HTMLDivElement | null)[]>([])
  const [sliderPos, setSliderPos] = useState<{
    left: number
    width: number
  } | null>(null)

  useEffect(() => {
    function measure() {
      const step = stepRefs.current[targetIndex]
      const container = containerRef.current
      if (!step || !container) return
      const cRect = container.getBoundingClientRect()
      const sRect = step.getBoundingClientRect()
      setSliderPos({
        left: sRect.left - cRect.left,
        width: sRect.width,
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [targetIndex])

  return (
    <div
      className="flex w-full relative"
      data-developer-mode-context={developerModeContext}
      data-developer-mode-name="status stepper"
      data-developer-mode-priority="330"
      ref={containerRef}
    >
      {/* Background (inactive) steps */}
      {steps.map((step, i) => (
        <div
          className="flex-1 min-w-0"
          data-developer-mode-context={developerModeContext}
          data-developer-mode-name="status step"
          data-developer-mode-priority="340"
          data-developer-mode-value={getStatusStepDeveloperModeValue(step)}
          key={step.id}
          ref={el => {
            stepRefs.current[i] = el
          }}
          style={{
            marginLeft: i === 0 ? 0 : -ARROW,
            zIndex: i,
            filter: DROP_SHADOW,
          }}
        >
          <div
            className="h-10 flex items-center justify-center bg-secondary-300 dark:bg-secondary-600 text-secondary-600 dark:text-secondary-300"
            style={{ clipPath: stepClipPath(i === 0) }}
          >
            <span
              className="text-sm select-none font-medium"
              style={{ paddingLeft: i === 0 ? 0 : ARROW / 2 }}
            >
              {t(step.nameSv)}
            </span>
          </div>
        </div>
      ))}

      {/* Sliding active highlight */}
      {sliderPos && (
        <div
          className="absolute top-0 pointer-events-none"
          style={{
            left: sliderPos.left,
            width: sliderPos.width,
            height: '100%',
            zIndex: steps.length + 1,
            filter: DROP_SHADOW,
            transition: 'left 300ms ease-out',
          }}
        >
          <div
            className="h-10 flex items-center justify-center text-white"
            style={{
              backgroundColor: activeColor,
              clipPath: sliderClipPath(targetIndex === 0),
              transition:
                'clip-path 300ms ease-out, background-color 300ms ease-out',
            }}
          >
            <span
              className="text-sm select-none font-semibold"
              style={{ paddingLeft: targetIndex === 0 ? 0 : ARROW / 2 }}
            >
              {t(steps[targetIndex].nameSv)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
