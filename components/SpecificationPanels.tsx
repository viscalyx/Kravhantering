'use client'

import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import SpecificationPanelDivider from '@/components/SpecificationPanelDivider'
import { devMarker } from '@/lib/developer-mode-markers'

type PanelLayout = 'both' | 'left' | 'right'

interface SpecificationPanelsProps {
  children: [ReactNode, ReactNode]
  initialHasItems: boolean | null
  leftLabel: string
  rightLabel: string
  specificationId: number
}

const storageKey = 'specification-panel-layout-v1'

function readLayout(specificationId: number): PanelLayout | null {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(storageKey) ?? 'null',
    )
    if (
      saved &&
      typeof saved === 'object' &&
      'specificationId' in saved &&
      Number.isSafeInteger(saved.specificationId) &&
      saved.specificationId === specificationId &&
      'layout' in saved &&
      (saved.layout === 'both' ||
        saved.layout === 'left' ||
        saved.layout === 'right')
    ) {
      return saved.layout
    }
  } catch {
    // Browser storage is optional, including when access itself is denied.
  }
  return null
}

function saveLayout(specificationId: number, layout: PanelLayout): void {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ specificationId, layout }),
    )
  } catch {
    // The current visit still supports layout changes without persistence.
  }
}

export default function SpecificationPanels({
  specificationId,
  initialHasItems,
  leftLabel,
  rightLabel,
  children,
}: SpecificationPanelsProps) {
  const workspaceRef = useRef<HTMLDivElement>(null)
  const focusCollapsedPanel = useRef<'left' | 'right' | null>(null)
  // Capture the opening snapshot: filtering, refreshes and edits cannot choose
  // a new default during this visit. The caller keys this component by identity.
  const [opening] = useState({ specificationId, initialHasItems })
  const [layout, setLayout] = useState<PanelLayout>(
    initialHasItems ? 'left' : 'both',
  )
  const collapseFromDivider = useCallback(
    (side: 'left' | 'right') => {
      const next = side === 'left' ? 'right' : 'left'
      focusCollapsedPanel.current = side
      setLayout(next)
      saveLayout(opening.specificationId, next)
    },
    [opening.specificationId],
  )

  useLayoutEffect(() => {
    const side = focusCollapsedPanel.current
    if (!side) return
    workspaceRef.current
      ?.querySelector<HTMLButtonElement>(
        `button[aria-controls="specification-${side}-panel"][aria-expanded="false"]`,
      )
      ?.focus({ preventScroll: true })
    focusCollapsedPanel.current = null
  })

  useEffect(() => {
    const restored = readLayout(opening.specificationId)
    const next = restored ?? (opening.initialHasItems ? 'left' : 'both')
    setLayout(next)
    // A failed preload is unknown, not an empty specification. Do not persist
    // the provisional layout unless the user explicitly chooses it.
    if (restored || opening.initialHasItems !== null) {
      saveLayout(opening.specificationId, next)
    } else {
      try {
        // Visiting a different specification expires the previous choice even
        // when this specification's content is not yet known.
        localStorage.removeItem(storageKey)
      } catch {
        // Storage can be unavailable for removals as well as reads and writes.
      }
    }
  }, [opening])

  const columns = {
    both: 'xl:grid-cols-[minmax(0,var(--specification-left-width,1fr))_minmax(0,1fr)]',
    left: 'xl:grid-cols-[minmax(0,1fr)_auto]',
    right: 'xl:grid-cols-[auto_minmax(0,1fr)]',
  }[layout]

  return (
    <div
      className={`relative grid min-w-0 grid-cols-1 items-start gap-6 xl:-mx-6 xl:min-h-0 xl:flex-1 xl:grid-rows-[minmax(0,1fr)] xl:items-stretch xl:gap-4 xl:overflow-hidden ${columns}`}
      data-specification-detail-split-panel="true"
      ref={workspaceRef}
      {...devMarker({
        name: 'split workspace',
        context: 'requirements specification detail',
        value: 'collapsible panels',
      })}
    >
      {(['left', 'right'] as const).map((side, index) => (
        <SpecificationPanel
          expanded={layout === 'both' || layout === side}
          key={side}
          label={side === 'left' ? leftLabel : rightLabel}
          onToggle={() => {
            const expanded = layout === 'both' || layout === side
            const next = expanded
              ? side === 'left'
                ? 'right'
                : 'left'
              : 'both'
            setLayout(next)
            saveLayout(opening.specificationId, next)
          }}
          side={side}
        >
          {children[index]}
        </SpecificationPanel>
      ))}
      <SpecificationPanelDivider
        active={layout === 'both'}
        leftLabel={leftLabel}
        onCollapse={collapseFromDivider}
        rightLabel={rightLabel}
        specificationId={opening.specificationId}
        workspaceRef={workspaceRef}
      />
    </div>
  )
}

const PanelToggleContext = createContext<ReactNode>(null)

/** Places the current panel's collapse control in its active tab header. */
export function SpecificationPanelToggle() {
  return useContext(PanelToggleContext)
}

interface SpecificationPanelProps {
  children: ReactNode
  expanded: boolean
  label: string
  onToggle: () => void
  side: 'left' | 'right'
}

function SpecificationPanel({
  children,
  expanded,
  label,
  onToggle,
  side,
}: SpecificationPanelProps) {
  const t = useTranslations('specification')
  const toggleRef = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  useLayoutEffect(() => {
    if (restoreFocus.current) {
      toggleRef.current?.focus({ preventScroll: true })
      restoreFocus.current = false
    }
  })
  const controlLabel = t(expanded ? 'collapsePanel' : 'expandPanel', {
    panel: label,
  })
  const Icon =
    side === 'left'
      ? expanded
        ? PanelLeftClose
        : PanelLeftOpen
      : expanded
        ? PanelRightClose
        : PanelRightOpen
  const toggle = (
    <button
      aria-controls={`specification-${side}-panel`}
      aria-expanded={expanded}
      aria-label={controlLabel}
      className={`flex min-h-8 min-w-8 shrink-0 items-center justify-center gap-2 rounded-lg border border-secondary-300 bg-white px-2 py-1 text-sm text-secondary-800 hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100 dark:hover:bg-secondary-800 ${expanded ? '' : 'w-full xl:h-full xl:w-10 xl:flex-col'}`}
      onClick={() => {
        restoreFocus.current = true
        onToggle()
      }}
      ref={toggleRef}
      title={controlLabel}
      type="button"
      {...devMarker({
        name: 'panel toggle',
        context: 'requirements specification detail',
        value: `${side} panel`,
      })}
    >
      <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
      {!expanded && (
        <span className="min-w-0 wrap-break-word xl:[writing-mode:vertical-rl]">
          {label}
        </span>
      )}
    </button>
  )
  return (
    <PanelToggleContext value={expanded ? toggle : null}>
      <section
        aria-label={label}
        className="flex min-w-0 flex-col xl:h-full xl:min-h-0"
      >
        {!expanded && toggle}
        <div
          className={
            expanded
              ? 'flex min-w-0 flex-col gap-3 motion-safe:animate-[fade-in_0.15s_ease-out] xl:min-h-0 xl:flex-1 xl:overflow-hidden'
              : 'hidden'
          }
          hidden={!expanded}
          id={`specification-${side}-panel`}
        >
          {children}
        </div>
      </section>
    </PanelToggleContext>
  )
}
