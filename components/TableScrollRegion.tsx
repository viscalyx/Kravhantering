'use client'

import { useTranslations } from 'next-intl'
import {
  type ComponentPropsWithoutRef,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'

interface TableScrollRegionProps extends ComponentPropsWithoutRef<'section'> {
  scrollRef?: RefObject<HTMLElement | null>
}

export default function TableScrollRegion({
  children,
  className = '',
  scrollRef,
  ...props
}: TableScrollRegionProps) {
  const common = useTranslations('common')
  const hintId = useId()
  const localRef = useRef<HTMLElement>(null)
  const regionRef = scrollRef ?? localRef
  const [overflows, setOverflows] = useState(false)

  // Observe replaced tables and measure data/column changes even when the
  // viewport itself keeps the same dimensions.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Rendered children can replace or resize the observed table.
  useEffect(() => {
    const region = regionRef.current
    if (!region) return

    const measure = () => {
      setOverflows(region.scrollWidth > region.clientWidth)
    }
    measure()
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(region)
    const table = region.querySelector('table')
    if (table) observer?.observe(table)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [children, regionRef])

  return (
    <div className="group/table-scroll relative min-w-0">
      <section
        {...props}
        aria-describedby={overflows ? hintId : undefined}
        // Keep the outline inside clipped table surfaces despite the global
        // focus rule's outward offset; retain its forced-colors palette.
        className={`overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2! focus-visible:outline-primary-700 dark:focus-visible:outline-primary-300 ${className}`}
        ref={regionRef}
        tabIndex={overflows ? 0 : -1}
      >
        {overflows && (
          <span className="sr-only" id={hintId}>
            {common('tableScrollHint')}
          </span>
        )}
        {children}
      </section>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-30 border-2 border-transparent group-has-[>section:focus-visible]/table-scroll:border-primary-700 dark:group-has-[>section:focus-visible]/table-scroll:border-primary-300"
        data-table-scroll-focus="true"
      />
    </div>
  )
}
