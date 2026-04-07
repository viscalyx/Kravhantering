'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

export type DeviationStep = 'decided' | 'draft' | 'review_requested'

const ARROW = 14

const DROP_SHADOW =
  'drop-shadow(1px 0 0 var(--color-secondary-500)) drop-shadow(-1px 0 0 var(--color-secondary-500)) drop-shadow(0 1px 0 var(--color-secondary-500)) drop-shadow(0 -1px 0 var(--color-secondary-500))'

function stepClipPath(isFirst: boolean) {
  const a = `${ARROW}px`
  if (isFirst)
    return `polygon(0 0, calc(100% - ${a}) 0, 100% 50%, calc(100% - ${a}) 100%, 0 100%)`
  return `polygon(0 0, calc(100% - ${a}) 0, 100% 50%, calc(100% - ${a}) 100%, 0 100%, ${a} 50%)`
}

function sliderClipPath(isFirst: boolean) {
  const a = `${ARROW}px`
  if (isFirst)
    return `polygon(0 0, calc(100% - ${a}) 0, 100% 50%, calc(100% - ${a}) 100%, 0 100%, 0 50%)`
  return `polygon(0 0, calc(100% - ${a}) 0, 100% 50%, calc(100% - ${a}) 100%, 0 100%, ${a} 50%)`
}

const STEPS: { color: string; key: DeviationStep; translationKey: string }[] = [
  { key: 'draft', translationKey: 'stepDraft', color: '#3b82f6' },
  {
    key: 'review_requested',
    translationKey: 'stepReviewRequested',
    color: '#eab308',
  },
  { key: 'decided', translationKey: 'stepDecided', color: '#22c55e' },
]

interface DeviationStepperProps {
  currentStep: DeviationStep
  developerModeContext?: string
}

export default function DeviationStepper({
  currentStep,
  developerModeContext,
}: DeviationStepperProps) {
  const t = useTranslations('deviation')
  const targetIndex = useMemo(
    () => STEPS.findIndex(s => s.key === currentStep),
    [currentStep],
  )
  const activeColor = STEPS[targetIndex]?.color ?? '#6b7280'
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
    const ro = new ResizeObserver(() => {
      measure()
    })
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [targetIndex])

  return (
    <div
      className="flex w-full relative"
      {...devMarker({
        context: developerModeContext,
        name: 'deviation stepper',
        priority: 330,
      })}
      ref={containerRef}
    >
      {STEPS.map((step, i) => (
        <div
          className="flex-1 min-w-0"
          key={`deviation-step-${step.key}`}
          {...devMarker({
            context: developerModeContext,
            name: 'deviation step',
            priority: 340,
            value: step.key,
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
              {t(step.translationKey)}
            </span>
          </div>
        </div>
      ))}

      {sliderPos && targetIndex >= 0 && (
        <div
          className="absolute top-0 pointer-events-none"
          style={{
            left: sliderPos.left,
            width: sliderPos.width,
            height: '100%',
            zIndex: STEPS.length + 1,
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
              {t(STEPS[targetIndex].translationKey)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
