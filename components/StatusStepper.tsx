'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { pickReadableTextOn } from '@/lib/color-contrast'
import { devMarker } from '@/lib/developer-mode-markers'

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
  /**
   * When true, the Review step (id = 2) renders with the
   * "Arkiveringsgranskning" / "Archiving Review" label so it can
   * be distinguished from publication review. Mirrors the badge
   * override in `lib/requirements/status-label.ts`.
   */
  isArchiving?: boolean
  statuses?: StatusStep[]
}

function getStatusStepDeveloperModeValue(step: StatusStep) {
  return step.nameEn.toLowerCase()
}

export default function StatusStepper({
  developerModeContext,
  currentStatusId,
  isArchiving = false,
  statuses,
}: StatusStepperProps) {
  const t = useTranslations('requirement.statusLabel')
  const tStepper = useTranslations('requirement')
  const steps = useMemo(() => {
    if (!statuses || statuses.length === 0) return FALLBACK_STEPS
    return statuses
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
    const handleResizeObserver: ResizeObserverCallback = (
      _entries,
      _observer,
    ) => {
      measure()
    }
    const ro = new ResizeObserver(handleResizeObserver)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [targetIndex])

  const stepLabel = (step: StatusStep) =>
    isArchiving && step.id === 2 ? t('Arkiveringsgranskning') : t(step.nameSv)

  const sliderTextColor = pickReadableTextOn(activeColor)

  return (
    // biome-ignore lint/a11y/useSemanticElements: <fieldset> is for form controls; this is a workflow progress indicator
    <div
      aria-label={tStepper('statusStepperAriaLabel')}
      className="flex w-full relative"
      role="group"
      {...devMarker({
        context: developerModeContext,
        name: 'status stepper',
        priority: 330,
      })}
      ref={containerRef}
    >
      {/* Background (inactive) steps */}
      {steps.map((step, i) => (
        <div
          aria-current={i === targetIndex ? 'step' : undefined}
          className="flex-1 min-w-0"
          key={`status-step-${step.id}`}
          {...devMarker({
            context: developerModeContext,
            name: 'status step',
            priority: 340,
            value: getStatusStepDeveloperModeValue(step),
          })}
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
              {stepLabel(step)}
            </span>
          </div>
        </div>
      ))}

      {/* Sliding active highlight */}
      {sliderPos && targetIndex >= 0 && (
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
            className="h-10 flex items-center justify-center"
            style={{
              backgroundColor: activeColor,
              color: sliderTextColor,
              clipPath: sliderClipPath(targetIndex === 0),
              transition:
                'clip-path 300ms ease-out, background-color 300ms ease-out, color 300ms ease-out',
            }}
          >
            <span
              className="text-sm select-none font-semibold"
              style={{ paddingLeft: targetIndex === 0 ? 0 : ARROW / 2 }}
            >
              {stepLabel(steps[targetIndex])}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
