'use client'

import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { forwardRef, useEffect, useRef, useState } from 'react'
import StatusBadge from '@/components/StatusBadge'

interface Version {
  archivedAt: string | null
  createdAt: string
  description: string | null
  editedAt: string | null
  id: number
  publishedAt: string | null
  status: number
  statusColor: string | null
  statusNameEn: string | null
  statusNameSv: string | null
  versionNumber: number
}

interface VersionHistoryProps {
  archivedStatusId?: number
  developerModeContext?: string
  onVersionSelect: (versionNumber: number) => void
  selectedVersionNumber: number
  versions: Version[]
}

/** Max total versions before collapse logic kicks in */
const MAX_VISIBLE_WITHOUT_COLLAPSE = 8

function getVersionHistoryToggleDeveloperModeValue(
  side: 'before' | 'after',
  expanded: boolean,
) {
  if (side === 'before') {
    return expanded ? 'hide newer versions' : 'show newer versions'
  }

  return expanded ? 'hide older versions' : 'show older versions'
}

function getVersionPillDeveloperModeValue(versionNumber: number) {
  return `v${versionNumber}`
}

const VersionHistory = forwardRef<HTMLDivElement, VersionHistoryProps>(
  function VersionHistory(
    {
      developerModeContext,
      archivedStatusId = 4,
      versions,
      selectedVersionNumber,
      onVersionSelect,
    },
    ref,
  ) {
    const t = useTranslations('requirement')
    const locale = useLocale()
    const [expandedBefore, setExpandedBefore] = useState(false)
    const [expandedAfter, setExpandedAfter] = useState(false)

    // Sort descending by version number
    const sorted = [...versions].sort(
      (a, b) => b.versionNumber - a.versionNumber,
    )

    const skipCollapse = sorted.length <= MAX_VISIBLE_WITHOUT_COLLAPSE

    // Find trailing consecutive archived versions (from lowest end)
    let trailingArchivedCount = 0
    if (!skipCollapse) {
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (sorted[i].status === archivedStatusId) {
          trailingArchivedCount++
        } else {
          break
        }
      }
    }

    // Keep at least one trailing archived visible
    const collapsibleCount =
      trailingArchivedCount > 1 ? trailingArchivedCount - 1 : 0
    const alwaysVisible = sorted.slice(0, sorted.length - collapsibleCount)
    const collapsibleRange = sorted.slice(sorted.length - collapsibleCount)
    const selectedInCollapsible = collapsibleRange.some(
      v => v.versionNumber === selectedVersionNumber,
    )

    // Reset expand states when switching between initial ↔ windowed mode
    const prevInCollapsible = useRef(selectedInCollapsible)
    useEffect(() => {
      if (prevInCollapsible.current !== selectedInCollapsible) {
        setExpandedBefore(false)
        setExpandedAfter(false)
        prevInCollapsible.current = selectedInCollapsible
      }
    }, [selectedInCollapsible])

    // Build render list
    type PillItem = { kind: 'pill'; version: Version }
    type ToggleItem = {
      kind: 'toggle'
      id: string
      side: 'before' | 'after'
      count: number
      expanded: boolean
      onToggle: () => void
    }
    const items: (PillItem | ToggleItem)[] = []

    if (skipCollapse || collapsibleCount === 0) {
      for (const v of sorted) items.push({ kind: 'pill', version: v })
    } else if (!selectedInCollapsible) {
      // Initial mode: always-visible + single trailing toggle
      for (const v of alwaysVisible) items.push({ kind: 'pill', version: v })
      if (expandedAfter) {
        items.push({
          kind: 'toggle',
          id: 'collapse',
          side: 'after',
          count: collapsibleRange.length,
          expanded: true,
          onToggle: () => setExpandedAfter(false),
        })
        for (const v of collapsibleRange)
          items.push({ kind: 'pill', version: v })
      } else {
        items.push({
          kind: 'toggle',
          id: 'expand',
          side: 'after',
          count: collapsibleRange.length,
          expanded: false,
          onToggle: () => setExpandedAfter(true),
        })
      }
    } else {
      // Windowed mode: selected ±1 neighbor with independent left/right toggles
      const selectedIdx = sorted.findIndex(
        v => v.versionNumber === selectedVersionNumber,
      )
      const windowStart = Math.max(0, selectedIdx - 1)
      const windowEnd = Math.min(sorted.length - 1, selectedIdx + 1)
      const leftHidden = sorted.slice(0, windowStart)
      const windowSlice = sorted.slice(windowStart, windowEnd + 1)
      const rightHidden = sorted.slice(windowEnd + 1)

      // Left side (newer versions)
      if (leftHidden.length > 0) {
        if (expandedBefore) {
          for (const v of leftHidden) items.push({ kind: 'pill', version: v })
          items.push({
            kind: 'toggle',
            id: 'before-collapse',
            side: 'before',
            count: leftHidden.length,
            expanded: true,
            onToggle: () => setExpandedBefore(false),
          })
        } else {
          items.push({
            kind: 'toggle',
            id: 'before-expand',
            side: 'before',
            count: leftHidden.length,
            expanded: false,
            onToggle: () => setExpandedBefore(true),
          })
        }
      }

      // Visible window (selected ±1)
      for (const v of windowSlice) items.push({ kind: 'pill', version: v })

      // Right side (older versions)
      if (rightHidden.length > 0) {
        if (expandedAfter) {
          items.push({
            kind: 'toggle',
            id: 'after-collapse',
            side: 'after',
            count: rightHidden.length,
            expanded: true,
            onToggle: () => setExpandedAfter(false),
          })
          for (const v of rightHidden) items.push({ kind: 'pill', version: v })
        } else {
          items.push({
            kind: 'toggle',
            id: 'after-expand',
            side: 'after',
            count: rightHidden.length,
            expanded: false,
            onToggle: () => setExpandedAfter(true),
          })
        }
      }
    }

    const toggleClasses =
      'inline-flex items-center gap-0.5 text-xs px-2 py-1 rounded-full border border-dashed border-secondary-300 dark:border-secondary-600 text-secondary-500 dark:text-secondary-400 hover:border-secondary-400 dark:hover:border-secondary-500 hover:text-secondary-700 dark:hover:text-secondary-300 transition-colors cursor-pointer'

    return (
      <div
        data-developer-mode-context={developerModeContext}
        data-developer-mode-name="version history"
        data-developer-mode-priority="330"
        ref={ref}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Clock
            aria-hidden="true"
            className="h-4 w-4 text-primary-700 dark:text-primary-300 shrink-0"
          />
          {items.map(item => {
            if (item.kind === 'toggle') {
              const titleKey =
                item.side === 'before'
                  ? item.expanded
                    ? 'hideNewerVersions'
                    : 'showNewerVersions'
                  : item.expanded
                    ? 'hideOlderVersions'
                    : 'showOlderVersions'
              return (
                <button
                  className={toggleClasses}
                  data-developer-mode-context={developerModeContext}
                  data-developer-mode-name="version history toggle"
                  data-developer-mode-priority="340"
                  data-developer-mode-value={getVersionHistoryToggleDeveloperModeValue(
                    item.side,
                    item.expanded,
                  )}
                  key={item.id}
                  onClick={item.onToggle}
                  title={t(titleKey)}
                  type="button"
                >
                  {item.side === 'before' ? (
                    item.expanded ? (
                      <ChevronRight className="h-3 w-3" />
                    ) : (
                      <>
                        <span>+{item.count}</span>
                        <ChevronLeft className="h-3 w-3" />
                      </>
                    )
                  ) : item.expanded ? (
                    <ChevronLeft className="h-3 w-3" />
                  ) : (
                    <>
                      <ChevronRight className="h-3 w-3" />
                      <span>+{item.count}</span>
                    </>
                  )}
                </button>
              )
            }
            const v = item.version
            const isSelected = v.versionNumber === selectedVersionNumber
            const color = v.statusColor ?? undefined
            return (
              <button
                className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium transition-all duration-150 cursor-pointer ${
                  color
                    ? 'shadow-sm'
                    : 'border-secondary-200 dark:border-secondary-700 hover:border-secondary-300 dark:hover:border-secondary-600'
                } ${isSelected ? 'ring-1' : ''}`}
                data-developer-mode-context={developerModeContext}
                data-developer-mode-name="version pill"
                data-developer-mode-priority="350"
                data-developer-mode-value={getVersionPillDeveloperModeValue(
                  v.versionNumber,
                )}
                data-version-number={v.versionNumber}
                key={v.id}
                onClick={() => onVersionSelect(v.versionNumber)}
                style={
                  color
                    ? {
                        borderColor: color,
                        ...(isSelected
                          ? ({
                              '--tw-ring-color': color,
                            } as React.CSSProperties)
                          : {}),
                      }
                    : isSelected
                      ? ({
                          '--tw-ring-color': 'var(--color-secondary-400)',
                        } as React.CSSProperties)
                      : {}
                }
                type="button"
              >
                <span>v{v.versionNumber}</span>
                <StatusBadge
                  color={v.statusColor}
                  label={
                    (locale === 'sv' ? v.statusNameSv : v.statusNameEn) ?? ''
                  }
                  size="sm"
                />
                {v.status === 1 && v.editedAt && (
                  <span className="text-[10px] text-secondary-500 dark:text-secondary-400">
                    {new Date(v.editedAt).toLocaleDateString('sv-SE')}
                  </span>
                )}
                {v.publishedAt && !v.archivedAt && v.status !== 1 && (
                  <span className="text-[10px] text-secondary-500 dark:text-secondary-400">
                    {new Date(v.publishedAt).toLocaleDateString('sv-SE')}
                  </span>
                )}
                {v.archivedAt && (
                  <span className="text-[10px] text-secondary-500 dark:text-secondary-400">
                    {new Date(v.archivedAt).toLocaleDateString('sv-SE')}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  },
)

VersionHistory.displayName = 'VersionHistory'

export default VersionHistory
