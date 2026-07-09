'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Popover from '@radix-ui/react-popover'
import {
  DropdownMenu as ThemesDropdownMenu,
  Popover as ThemesPopover,
} from '@radix-ui/themes'
import {
  AlertCircle,
  AlignLeft,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Columns3,
  DiamondPlus,
  Filter,
  Search,
  SearchCheck,
  WrapText,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import SpecificationItemStatusSelect from '@/components/_requirements-table/SpecificationItemStatusSelect'
import {
  POPOVER_VIEWPORT_MARGIN,
  type ResizeHandleSegmentKey,
  type ResizeHandleSegmentNode,
  useClientLayoutEffect,
} from '@/components/_requirements-table/shared'
import { useColumnState } from '@/components/_requirements-table/useColumnState'
import { useFloatingRailPosition } from '@/components/_requirements-table/useFloatingRailPosition'
import { useResizeHandles } from '@/components/_requirements-table/useResizeHandles'
import RequirementPackagePurposeTooltip from '@/components/RequirementPackagePurposeTooltip'
import StatusBadge from '@/components/StatusBadge'
import StatusIcon from '@/components/StatusIcon'
import { Link, useRouter } from '@/i18n/routing'
import {
  devMarker,
  getRequirementColumnDeveloperModeLabel,
} from '@/lib/developer-mode-markers'
import {
  type AreaOption,
  clearRequirementFiltersForHiddenColumns,
  DEFAULT_REQUIREMENT_SORT,
  type FilterOption,
  type FilterValues,
  getDefaultVisibleRequirementColumns,
  getOrderedRequirementListColumns,
  getRequirementColumnWidth,
  normalizeRequirementListColumnDefaults,
  orderRequirementVisibleColumns,
  type PriorityLevelOption,
  type QualityCharacteristicOption,
  type RequirementColumnId,
  type RequirementColumnWidths,
  type RequirementListColumnDefault,
  type RequirementPackageOption,
  type RequirementRow,
  type RequirementSortField,
  type RequirementSortState,
  type SpecificationItemStatusOption,
  type StatusOption,
} from '@/lib/requirements/list-view'
import { resolveStatusLabel } from '@/lib/requirements/status-label'

export interface RequirementsTableProps {
  areas?: AreaOption[]
  categories?: FilterOption[]
  columnDefaults?: RequirementListColumnDefault[]
  columnPickerPlacement?: 'betweenActions' | 'end'
  columnWidths?: RequirementColumnWidths
  defaultVisibleColumns?: RequirementColumnId[]
  excludeColumns?: RequirementColumnId[]
  expandedId?: number | null
  filterValues?: FilterValues
  floatingActionRailPlacement?: 'fixed-right' | 'inline-top'
  floatingActions?: FloatingActionItem[]
  getName?: (opt: FilterOption) => string
  getStatusName?: (opt: StatusOption) => string
  hasMore?: boolean
  loading?: boolean
  loadingMore?: boolean
  locale: string
  needsReferenceOptions?: {
    description?: string | null
    id: number
    text: string
  }[]
  normReferences?: { id: number; normReferenceId: string; name: string }[]
  onColumnWidthsChange?: (value: RequirementColumnWidths) => void
  onFilterChange?: (values: FilterValues) => void
  onLoadMore?: () => void
  onNeedsReferenceChange?: (
    itemRef: string,
    needsReferenceId: number | null,
  ) => void
  onRowClick?: (id: number) => void
  onSelectionChange?: (ids: Set<number>) => void
  onSortChange?: (value: RequirementSortState) => void
  onSpecificationItemStatusChange?: (itemRef: string, statusId: number) => void
  onVisibleColumnsChange?: (value: RequirementColumnId[]) => void
  pinnedIds?: Set<number>
  priorityLevels?: PriorityLevelOption[]
  qualityCharacteristics?: QualityCharacteristicOption[]
  renderExpanded?: (id: number) => ReactNode
  requirementPackages?: RequirementPackageOption[]
  rows: RequirementRow[]
  selectable?: boolean
  selectedIds?: Set<number>
  sortState?: RequirementSortState
  specificationItemStatuses?: SpecificationItemStatusOption[]
  statusOptions?: StatusOption[]
  stickyTitle?: ReactNode
  stickyTitleActions?: ReactNode
  stickyTopOffsetClassName?: string
  types?: FilterOption[]
  visibleColumns?: RequirementColumnId[]
  visualMode?: RequirementsTableVisualMode
  wrapDescription?: boolean
}

export type RequirementsTableVisualMode = 'local' | 'radix-themes'
export type FloatingActionPillVariant = 'default' | 'primary' | 'warning'

interface FloatingActionMenuItemBase {
  badge?: string | number
  description?: string
  developerModeContext?: string
  developerModeValue?: string
  disabled?: boolean
  icon?: ReactNode
  id: string
  label: string
  tooltip?: string
}

interface FloatingActionMenuSeparatorItem {
  id: string
  kind: 'separator'
}

type FloatingActionMenuActionItem =
  | (FloatingActionMenuItemBase & {
      href: string
      onClick?: never
    })
  | (FloatingActionMenuItemBase & {
      href?: never
      onClick: () => void
    })

export type FloatingActionMenuItem =
  | FloatingActionMenuActionItem
  | FloatingActionMenuSeparatorItem

function isFloatingActionMenuSeparator(
  item: FloatingActionMenuItem,
): item is FloatingActionMenuSeparatorItem {
  return 'kind' in item && item.kind === 'separator'
}

function isFloatingActionMenuLink(
  item: FloatingActionMenuItem,
): item is FloatingActionMenuActionItem & { href: string } {
  return typeof (item as { href?: unknown }).href === 'string'
}

function FloatingActionMenuItemContent({
  item,
  visualMode = 'local',
}: {
  item: FloatingActionMenuActionItem
  visualMode?: RequirementsTableVisualMode
}) {
  const isThemesMode = visualMode === 'radix-themes'

  return (
    <>
      {item.icon ? (
        <span
          aria-hidden="true"
          className={`flex h-5 w-5 shrink-0 items-center justify-center ${
            isThemesMode
              ? 'text-(--gray-11)'
              : 'text-secondary-500 dark:text-secondary-300'
          }`}
        >
          {item.icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div
          className={`flex items-center gap-2 text-sm font-medium ${
            isThemesMode
              ? 'text-(--gray-12)'
              : 'text-secondary-900 dark:text-secondary-100'
          }`}
        >
          {item.label}
          {item.badge != null ? (
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                isThemesMode
                  ? 'bg-(--accent-9) text-(--accent-contrast)'
                  : 'bg-primary-600 text-white'
              }`}
              data-floating-action-menu-item-badge="true"
            >
              {item.badge}
            </span>
          ) : null}
        </div>
        {item.description ? (
          <div
            className={`mt-0.5 text-xs ${
              isThemesMode
                ? 'text-(--gray-11)'
                : 'text-secondary-600 dark:text-secondary-400'
            }`}
          >
            {item.description}
          </div>
        ) : null}
      </div>
    </>
  )
}

export interface FloatingActionItem {
  ariaLabel: string
  badge?: string | number
  customStyle?: React.CSSProperties
  developerModeContext?: string
  developerModeValue?: string
  disabled?: boolean
  hidden?: boolean
  href?: string
  icon: ReactNode
  id: string
  menuItems?: FloatingActionMenuItem[]
  onClick?: () => void
  position?: 'beforeColumns' | 'afterColumns'
  tooltip?: string
  variant?: FloatingActionPillVariant
}

const floatingPillBaseClassName =
  'inline-flex h-11 w-11 items-center justify-center rounded-md border shadow-[0_12px_28px_-22px_rgba(0,0,0,0.65)] backdrop-blur-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white hover:-translate-y-px dark:focus-visible:ring-violet-400/60 dark:focus-visible:ring-offset-[#111113]'

const floatingActionMenuItemBaseClassName =
  'flex w-full min-h-11 min-w-11 items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-violet-400/60 dark:focus-visible:ring-offset-[#111113]'

const floatingActionMenuItemEnabledClassName = `${floatingActionMenuItemBaseClassName} hover:bg-secondary-100/80 dark:hover:bg-secondary-800/70`

const floatingActionMenuItemDisabledClassName = `${floatingActionMenuItemBaseClassName} cursor-not-allowed opacity-50`

const floatingPillVariantClassNames: Record<FloatingActionPillVariant, string> =
  {
    default:
      'border-secondary-950/10 bg-white/95 text-secondary-600 hover:border-violet-500/40 hover:text-secondary-950 hover:shadow-[0_16px_34px_-24px_rgba(0,0,0,0.7)] dark:border-white/10 dark:bg-[#1c1c20]/95 dark:text-secondary-300 dark:hover:border-violet-400/40 dark:hover:text-white',
    primary:
      'border-secondary-950 bg-secondary-950 text-white hover:border-violet-500 hover:bg-[#1f1f22] hover:shadow-[0_16px_34px_-24px_rgba(0,0,0,0.75)] dark:border-white dark:bg-white dark:text-[#111113] dark:hover:border-violet-300 dark:hover:bg-secondary-100',
    warning:
      'border-amber-400/80 bg-amber-50 text-amber-800 hover:border-amber-500 hover:bg-amber-100 dark:border-amber-400/50 dark:bg-amber-400/10 dark:text-amber-300 dark:hover:border-amber-300 dark:hover:bg-amber-300/20 dark:hover:text-amber-200',
  }

const floatingPillThemesVariantClassNames: Record<
  FloatingActionPillVariant,
  string
> = {
  default:
    'border-(--gray-a6) bg-(--color-panel) text-(--gray-12) hover:border-(--accent-a7) hover:bg-(--accent-a3) hover:text-(--accent-12)',
  primary:
    'border-(--accent-9) bg-(--accent-9) text-(--accent-contrast) hover:border-(--accent-10) hover:bg-(--accent-10)',
  warning:
    'border-(--amber-a7) bg-(--amber-a3) text-(--amber-12) hover:border-(--amber-a8) hover:bg-(--amber-a4)',
}

function getFloatingPillClassName(
  variant: FloatingActionPillVariant = 'default',
  visualMode: RequirementsTableVisualMode = 'local',
) {
  if (visualMode === 'radix-themes') {
    return `${floatingPillBaseClassName} ${floatingPillThemesVariantClassNames[variant]}`
  }

  return `${floatingPillBaseClassName} ${floatingPillVariantClassNames[variant]}`
}

export function FloatingActionPill({
  action,
  visualMode = 'local',
}: {
  action: FloatingActionItem
  visualMode?: RequirementsTableVisualMode
}) {
  const variant = action.variant ?? 'default'
  const hasMenu = (action.menuItems?.length ?? 0) > 0
  const isThemesMode = visualMode === 'radix-themes'
  const developerModeContext = action.developerModeContext
  const developerModeValue = action.developerModeValue
  const titleText = action.tooltip ?? action.ariaLabel
  const disabledClass = action.disabled ? ' opacity-60 cursor-not-allowed' : ''
  const [open, setOpen] = useState(false)
  const menuId = `floating-action-menu-${action.id}`
  const triggerId = `floating-action-trigger-${action.id}`
  const menuDeveloperModeContext = developerModeValue
    ? `${developerModeContext ?? 'requirements table'} > floating pill: ${developerModeValue}`
    : developerModeContext
  const menuItemDeveloperModeProps = (item: FloatingActionMenuActionItem) =>
    item.developerModeValue
      ? devMarker({
          context: item.developerModeContext ?? menuDeveloperModeContext,
          name: 'table action',
          priority: 345,
          value: item.developerModeValue,
        })
      : {}

  if (action.hidden) return null

  const triggerButton = (
    <button
      aria-label={action.ariaLabel}
      className={`${getFloatingPillClassName(variant, visualMode)}${disabledClass}`}
      {...devMarker({
        context: developerModeContext,
        name: 'floating pill',
        priority: 360,
        value: developerModeValue,
      })}
      data-floating-action-id={action.id}
      data-floating-action-item="true"
      data-floating-action-menu-trigger={hasMenu ? action.id : undefined}
      data-floating-action-variant={variant}
      data-radix-themes-action={isThemesMode ? 'true' : undefined}
      disabled={action.disabled}
      id={hasMenu ? triggerId : undefined}
      onClick={action.disabled || hasMenu ? undefined : action.onClick}
      style={action.customStyle}
      title={titleText}
      type="button"
    >
      <span aria-hidden="true" className="flex items-center justify-center">
        {action.icon}
      </span>
      <span className="sr-only">{action.ariaLabel}</span>
      {action.badge != null && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-bold text-white">
          {action.badge}
        </span>
      )}
    </button>
  )

  if (hasMenu) {
    if (isThemesMode) {
      return (
        <ThemesDropdownMenu.Root
          modal={false}
          onOpenChange={setOpen}
          open={open}
        >
          <ThemesDropdownMenu.Trigger>
            {triggerButton}
          </ThemesDropdownMenu.Trigger>
          <ThemesDropdownMenu.Content
            align="end"
            aria-labelledby={triggerId}
            color="iris"
            data-floating-action-menu={action.id}
            data-radix-themes-menu="true"
            id={menuId}
            sideOffset={8}
            size="2"
            variant="soft"
          >
            {action.menuItems?.map(item => {
              if (isFloatingActionMenuSeparator(item)) {
                return <ThemesDropdownMenu.Separator key={item.id} />
              }

              if (item.disabled) {
                return (
                  <ThemesDropdownMenu.Item
                    disabled
                    key={item.id}
                    {...menuItemDeveloperModeProps(item)}
                    title={item.tooltip}
                  >
                    <FloatingActionMenuItemContent
                      item={item}
                      visualMode={visualMode}
                    />
                  </ThemesDropdownMenu.Item>
                )
              }

              if (isFloatingActionMenuLink(item)) {
                return (
                  <ThemesDropdownMenu.Item
                    asChild
                    key={item.id}
                    {...menuItemDeveloperModeProps(item)}
                    title={item.tooltip}
                  >
                    <Link href={item.href}>
                      <FloatingActionMenuItemContent
                        item={item}
                        visualMode={visualMode}
                      />
                    </Link>
                  </ThemesDropdownMenu.Item>
                )
              }

              return (
                <ThemesDropdownMenu.Item
                  key={item.id}
                  onSelect={() => item.onClick()}
                  {...menuItemDeveloperModeProps(item)}
                  title={item.tooltip}
                >
                  <FloatingActionMenuItemContent
                    item={item}
                    visualMode={visualMode}
                  />
                </ThemesDropdownMenu.Item>
              )
            })}
          </ThemesDropdownMenu.Content>
        </ThemesDropdownMenu.Root>
      )
    }

    return (
      <DropdownMenu.Root modal={false} onOpenChange={setOpen} open={open}>
        <DropdownMenu.Trigger asChild>{triggerButton}</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            aria-labelledby={triggerId}
            className="z-50 max-h-[min(calc(100vh-2rem),32rem)] w-72 overflow-y-auto rounded-lg border border-secondary-950/10 bg-white/95 p-2 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.55)] backdrop-blur-md dark:border-white/10 dark:bg-[#1c1c20]/95"
            {...devMarker({
              context: menuDeveloperModeContext,
              name: 'floating pill menu',
              priority: 350,
              value: developerModeValue,
            })}
            data-floating-action-menu={action.id}
            id={menuId}
            sideOffset={8}
          >
            {action.menuItems?.map(item => {
              if (isFloatingActionMenuSeparator(item)) {
                return (
                  <DropdownMenu.Separator
                    className="my-1 h-px bg-secondary-200/80 dark:bg-secondary-700/80"
                    key={item.id}
                  />
                )
              }

              if (item.disabled) {
                return (
                  <DropdownMenu.Item
                    className={floatingActionMenuItemDisabledClassName}
                    disabled
                    key={item.id}
                    {...menuItemDeveloperModeProps(item)}
                    title={item.tooltip}
                  >
                    <FloatingActionMenuItemContent item={item} />
                  </DropdownMenu.Item>
                )
              }

              if (isFloatingActionMenuLink(item)) {
                return (
                  <DropdownMenu.Item
                    asChild
                    className={floatingActionMenuItemEnabledClassName}
                    key={item.id}
                    {...menuItemDeveloperModeProps(item)}
                    title={item.tooltip}
                  >
                    <Link href={item.href}>
                      <FloatingActionMenuItemContent item={item} />
                    </Link>
                  </DropdownMenu.Item>
                )
              }

              return (
                <DropdownMenu.Item
                  className={floatingActionMenuItemEnabledClassName}
                  key={item.id}
                  onSelect={() => item.onClick()}
                  {...menuItemDeveloperModeProps(item)}
                  title={item.tooltip}
                >
                  <FloatingActionMenuItemContent item={item} />
                </DropdownMenu.Item>
              )
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    )
  }

  if (action.href) {
    if (action.disabled) {
      return (
        <span
          aria-disabled="true"
          className={`${getFloatingPillClassName(variant, visualMode)}${disabledClass}`}
          {...devMarker({
            context: developerModeContext,
            name: 'floating pill',
            priority: 360,
            value: developerModeValue,
          })}
          data-floating-action-id={action.id}
          data-floating-action-item="true"
          data-floating-action-variant={variant}
          tabIndex={-1}
          title={titleText}
        >
          <span aria-hidden="true" className="flex items-center justify-center">
            {action.icon}
          </span>
          <span className="sr-only">{action.ariaLabel}</span>
        </span>
      )
    }

    return (
      <Link
        aria-label={action.ariaLabel}
        className={getFloatingPillClassName(variant, visualMode)}
        {...devMarker({
          context: developerModeContext,
          name: 'floating pill',
          priority: 360,
          value: developerModeValue,
        })}
        data-floating-action-id={action.id}
        data-floating-action-item="true"
        data-floating-action-variant={variant}
        href={action.href}
        onClick={action.onClick}
        title={action.ariaLabel}
      >
        <span className="contents">
          <span aria-hidden="true" className="flex items-center justify-center">
            {action.icon}
          </span>
          <span className="sr-only">{action.ariaLabel}</span>
        </span>
      </Link>
    )
  }

  return triggerButton
}

const MAX_EXPANDED_DETAIL_RESIZE_GRIP_HEIGHT = 48
const ROW_CLICK_INTERACTIVE_SELECTOR =
  'button, a, input, select, textarea, [contenteditable]:not([contenteditable="false"])'
const filterPopoverContentClassName =
  'z-50 max-h-(--radix-popover-content-available-height) overflow-y-auto rounded-lg border border-secondary-950/10 bg-white p-2 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.55)] outline-none dark:border-white/10 dark:bg-secondary-800'
const filterOptionListPopoverContentClassName =
  'z-50 max-h-(--radix-popover-content-available-height) overflow-y-auto rounded-lg border border-secondary-950/10 bg-white py-1 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.55)] outline-none dark:border-white/10 dark:bg-secondary-800'
const columnPickerPopoverContentClassName =
  'z-50 max-h-(--radix-popover-content-available-height) min-w-56 overflow-y-auto rounded-lg border border-secondary-950/10 bg-white p-2 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.55)] outline-none dark:border-white/10 dark:bg-[#1c1c20]'

/* ── Filter popover for text search columns (uniqueId, description) ── */

function SearchFilterPopover({
  activeValue,
  developerModeValue,
  label,
  onChange,
  visualMode = 'local',
}: {
  activeValue: string
  developerModeValue: string
  label: string
  onChange: (v: string | undefined) => void
  visualMode?: RequirementsTableVisualMode
}) {
  const tc = useTranslations('common')
  const tt = useTranslations('requirementsTable')
  const [open, setOpen] = useState(false)
  const [local, setLocal] = useState(activeValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const isActive = !!activeValue
  const isThemesMode = visualMode === 'radix-themes'
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const filterLabel = tc('filterBy', { label })

  const clearPendingCommit = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  useEffect(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    setLocal(activeValue)
  }, [activeValue])

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
    },
    [],
  )

  const commit = (v: string) => {
    clearPendingCommit()
    timer.current = setTimeout(() => {
      timer.current = null
      onChange(v || undefined)
    }, 400)
  }

  const trigger = (
    <button
      aria-label={filterLabel}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded p-2 transition-colors ${
        isActive
          ? isThemesMode
            ? 'text-(--accent-11)'
            : 'text-primary-500'
          : isThemesMode
            ? 'text-(--gray-11) hover:text-(--accent-11)'
            : 'text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300'
      }`}
      {...devMarker({
        name: 'filter button',
        priority: 300,
        value: developerModeValue,
      })}
      data-radix-themes-filter-trigger={isThemesMode ? 'true' : undefined}
      onClick={event => {
        event.stopPropagation()
      }}
      title={filterLabel}
      type="button"
    >
      <Filter aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  )

  const content = (
    <div className="relative">
      <Search
        aria-hidden="true"
        className={`absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${
          isThemesMode ? 'text-(--gray-10)' : 'text-secondary-400'
        }`}
      />
      <input
        aria-label={label}
        className={`w-full rounded-lg border py-1.5 pl-7 pr-7 text-xs transition-all placeholder:text-secondary-400 focus:outline-none ${
          isThemesMode
            ? 'border-(--gray-a7) bg-(--color-panel) text-(--gray-12) focus:border-(--accent-8) focus:ring-1 focus:ring-(--accent-a6)'
            : 'border-secondary-200 bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-800/50'
        }`}
        onChange={e => {
          setLocal(e.target.value)
          commit(e.target.value)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            clearPendingCommit()
            onChange(local || undefined)
            setOpen(false)
          }
        }}
        placeholder={`${label}...`}
        ref={inputRef}
        type="text"
        value={local}
      />
      {local && (
        <button
          aria-label={tt('clear')}
          className={`absolute right-2 top-1/2 -translate-y-1/2 ${
            isThemesMode
              ? 'text-(--gray-10) hover:text-(--gray-12)'
              : 'text-secondary-400 hover:text-secondary-600'
          }`}
          onClick={() => {
            setLocal('')
            clearPendingCommit()
            onChange(undefined)
          }}
          type="button"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )

  if (isThemesMode) {
    return (
      <ThemesPopover.Root onOpenChange={setOpen} open={open}>
        <ThemesPopover.Trigger>{trigger}</ThemesPopover.Trigger>
        <ThemesPopover.Content
          align="start"
          data-filter-popover={developerModeValue}
          data-radix-themes-popover="true"
          maxHeight="var(--radix-popover-content-available-height)"
          minWidth="12rem"
          onOpenAutoFocus={event => {
            event.preventDefault()
            inputRef.current?.focus()
          }}
          sideOffset={4}
          size="2"
        >
          {content}
        </ThemesPopover.Content>
      </ThemesPopover.Root>
    )
  }

  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          className={`${filterPopoverContentClassName} min-w-48`}
          collisionPadding={POPOVER_VIEWPORT_MARGIN}
          data-filter-popover={developerModeValue}
          onOpenAutoFocus={event => {
            event.preventDefault()
            inputRef.current?.focus()
          }}
          sideOffset={4}
        >
          {content}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/* ── Filter popover for multi-select columns ── */

function MultiSelectFilterPopover({
  activeCount,
  developerModeValue,
  getLabel,
  label,
  onChange,
  options,
  value,
  visualMode = 'local',
}: {
  activeCount: number
  developerModeValue: string
  getLabel: (opt: { id: number }) => string
  label: string
  onChange: (ids: number[]) => void
  options: { id: number }[]
  value: number[]
  visualMode?: RequirementsTableVisualMode
}) {
  const tc = useTranslations('common')
  const tt = useTranslations('requirementsTable')
  const [open, setOpen] = useState(false)
  const isThemesMode = visualMode === 'radix-themes'
  const filterLabel = tc('filterBy', { label })

  const toggle = (id: number) => {
    const next = value.includes(id)
      ? value.filter(v => v !== id)
      : [...value, id]
    onChange(next)
  }

  const trigger = (
    <button
      aria-label={filterLabel}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded p-2 transition-colors ${
        activeCount > 0
          ? isThemesMode
            ? 'text-(--accent-11)'
            : 'text-primary-500'
          : isThemesMode
            ? 'text-(--gray-11) hover:text-(--accent-11)'
            : 'text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300'
      }`}
      {...devMarker({
        name: 'filter button',
        priority: 300,
        value: developerModeValue,
      })}
      data-radix-themes-filter-trigger={isThemesMode ? 'true' : undefined}
      onClick={event => {
        event.stopPropagation()
      }}
      title={filterLabel}
      type="button"
    >
      <span
        className="relative inline-flex h-3.5 w-3.5 items-center justify-center"
        data-filter-icon-anchor="true"
      >
        <Filter aria-hidden="true" className="h-3.5 w-3.5" />
        {activeCount > 0 && (
          <span
            className={`pointer-events-none absolute -right-1.5 -top-1.5 flex h-3 w-3 items-center justify-center rounded-full text-[8px] font-bold leading-none ${
              isThemesMode
                ? 'bg-(--accent-9) text-(--accent-contrast)'
                : 'bg-primary-500 text-white'
            }`}
            data-filter-count-badge="true"
          >
            {activeCount}
          </span>
        )}
      </span>
    </button>
  )

  const content = (
    <>
      {value.length > 0 && (
        <button
          className={`min-h-11 w-full border-b px-2.5 pb-1.5 pt-1.5 text-left text-xs ${
            isThemesMode
              ? 'border-(--gray-a5) text-(--gray-11) hover:text-(--red-11)'
              : 'text-secondary-500 hover:text-red-600 dark:hover:text-red-400'
          }`}
          onClick={() => onChange([])}
          type="button"
        >
          <X aria-hidden="true" className="mr-1 inline h-3 w-3" />
          {tt('clear')}
        </button>
      )}
      {options.map(opt => (
        <label
          className={`flex min-h-11 cursor-pointer items-center gap-2 px-2.5 py-1.5 text-xs ${
            isThemesMode
              ? 'text-(--gray-12) hover:bg-(--accent-a3)'
              : 'hover:bg-secondary-50 dark:hover:bg-secondary-700/50'
          }`}
          key={opt.id}
        >
          <input
            checked={value.includes(opt.id)}
            className="rounded border-secondary-300"
            onChange={() => toggle(opt.id)}
            type="checkbox"
          />
          <span className="truncate">{getLabel(opt)}</span>
        </label>
      ))}
    </>
  )

  if (isThemesMode) {
    return (
      <ThemesPopover.Root onOpenChange={setOpen} open={open}>
        <ThemesPopover.Trigger>{trigger}</ThemesPopover.Trigger>
        <ThemesPopover.Content
          align="start"
          data-filter-popover={developerModeValue}
          data-radix-themes-popover="true"
          maxHeight="var(--radix-popover-content-available-height)"
          minWidth="10rem"
          sideOffset={4}
          size="2"
        >
          {content}
        </ThemesPopover.Content>
      </ThemesPopover.Root>
    )
  }

  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          className={`${filterOptionListPopoverContentClassName} min-w-40`}
          collisionPadding={POPOVER_VIEWPORT_MARGIN}
          data-filter-popover={developerModeValue}
          sideOffset={4}
        >
          {content}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/* ── Grouped multi-select popover (for typeCategory with parent grouping) ── */

function GroupedMultiSelectFilterPopover({
  activeCount,
  developerModeValue,
  getLabel,
  label,
  onChange,
  options,
  value,
  visualMode = 'local',
}: {
  activeCount: number
  developerModeValue: string
  getLabel: (opt: QualityCharacteristicOption) => string
  label: string
  onChange: (ids: number[]) => void
  options: QualityCharacteristicOption[]
  value: number[]
  visualMode?: RequirementsTableVisualMode
}) {
  const tc = useTranslations('common')
  const tt = useTranslations('requirementsTable')
  const [open, setOpen] = useState(false)
  const isThemesMode = visualMode === 'radix-themes'
  const filterLabel = tc('filterBy', { label })

  const toggle = (id: number) => {
    const next = value.includes(id)
      ? value.filter(v => v !== id)
      : [...value, id]
    onChange(next)
  }

  const parents = options.filter(o => o.parentId === null)
  const childrenOf = (parentId: number) =>
    options.filter(o => o.parentId === parentId)

  const trigger = (
    <button
      aria-label={filterLabel}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded p-2 transition-colors ${
        activeCount > 0
          ? isThemesMode
            ? 'text-(--accent-11)'
            : 'text-primary-500'
          : isThemesMode
            ? 'text-(--gray-11) hover:text-(--accent-11)'
            : 'text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300'
      }`}
      {...devMarker({
        name: 'filter button',
        priority: 300,
        value: developerModeValue,
      })}
      data-radix-themes-filter-trigger={isThemesMode ? 'true' : undefined}
      onClick={event => {
        event.stopPropagation()
      }}
      title={filterLabel}
      type="button"
    >
      <span
        className="relative inline-flex h-3.5 w-3.5 items-center justify-center"
        data-filter-icon-anchor="true"
      >
        <Filter aria-hidden="true" className="h-3.5 w-3.5" />
        {activeCount > 0 && (
          <span
            className={`pointer-events-none absolute -right-1.5 -top-1.5 flex h-3 w-3 items-center justify-center rounded-full text-[8px] font-bold leading-none ${
              isThemesMode
                ? 'bg-(--accent-9) text-(--accent-contrast)'
                : 'bg-primary-500 text-white'
            }`}
            data-filter-count-badge="true"
          >
            {activeCount}
          </span>
        )}
      </span>
    </button>
  )

  const content = (
    <>
      {value.length > 0 && (
        <button
          className={`min-h-11 w-full border-b px-2.5 pb-1.5 pt-1.5 text-left text-xs ${
            isThemesMode
              ? 'border-(--gray-a5) text-(--gray-11) hover:text-(--red-11)'
              : 'text-secondary-500 hover:text-red-600 dark:hover:text-red-400'
          }`}
          onClick={() => onChange([])}
          type="button"
        >
          <X aria-hidden="true" className="mr-1 inline h-3 w-3" />
          {tt('clear')}
        </button>
      )}
      {parents.map(parent => {
        const children = childrenOf(parent.id)
        return (
          <div key={parent.id}>
            <div
              className={`px-2.5 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide ${
                isThemesMode
                  ? 'text-(--gray-10)'
                  : 'text-secondary-400 dark:text-secondary-500'
              }`}
            >
              {getLabel(parent)}
            </div>
            {children.map(child => (
              <label
                className={`flex min-h-11 cursor-pointer items-center gap-2 py-1.5 pl-5 pr-2.5 text-xs ${
                  isThemesMode
                    ? 'text-(--gray-12) hover:bg-(--accent-a3)'
                    : 'hover:bg-secondary-50 dark:hover:bg-secondary-700/50'
                }`}
                key={child.id}
              >
                <input
                  checked={value.includes(child.id)}
                  className="rounded border-secondary-300"
                  onChange={() => toggle(child.id)}
                  type="checkbox"
                />
                <span className="truncate">{getLabel(child)}</span>
              </label>
            ))}
          </div>
        )
      })}
    </>
  )

  if (isThemesMode) {
    return (
      <ThemesPopover.Root onOpenChange={setOpen} open={open}>
        <ThemesPopover.Trigger>{trigger}</ThemesPopover.Trigger>
        <ThemesPopover.Content
          align="start"
          data-filter-popover={developerModeValue}
          data-radix-themes-popover="true"
          maxHeight="var(--radix-popover-content-available-height)"
          minWidth="12rem"
          sideOffset={4}
          size="2"
        >
          {content}
        </ThemesPopover.Content>
      </ThemesPopover.Root>
    )
  }

  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          className={`${filterOptionListPopoverContentClassName} min-w-48`}
          collisionPadding={POPOVER_VIEWPORT_MARGIN}
          data-filter-popover={developerModeValue}
          sideOffset={4}
        >
          {content}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function ColumnsPopover({
  badgeLabel = null,
  columns,
  onReset,
  onToggle,
  visualMode = 'local',
  visibleColumns,
}: {
  badgeLabel?: string | null
  columns: {
    canHide: boolean
    id: RequirementColumnId
    label: string
  }[]
  onReset: () => void
  onToggle: (id: RequirementColumnId) => void
  visualMode?: RequirementsTableVisualMode
  visibleColumns: RequirementColumnId[]
}) {
  const tc = useTranslations('common')
  const tt = useTranslations('requirementsTable')
  const instanceId = useId()
  const [open, setOpen] = useState(false)
  const isThemesMode = visualMode === 'radix-themes'

  const trigger = (
    <button
      aria-label={tc('columns')}
      className={getFloatingPillClassName('default', visualMode)}
      data-column-picker-shell="true"
      data-column-picker-trigger="true"
      data-radix-themes-action={isThemesMode ? 'true' : undefined}
      {...devMarker({
        context: 'requirements table',
        name: 'floating pill',
        priority: 360,
        value: 'columns',
      })}
      data-floating-action-id="columns"
      data-floating-action-item="true"
      data-floating-action-variant="default"
      title={tc('columns')}
      type="button"
    >
      <span className="sr-only">{tc('columns')}</span>
      <Columns3
        aria-hidden="true"
        className="h-4 w-4"
        data-column-picker-icon="true"
      />
      {badgeLabel ? (
        <span
          aria-hidden="true"
          className={`absolute -right-1 -top-2 flex h-4 min-w-8 items-center justify-center rounded-full px-1.5 text-[9px] font-semibold leading-none shadow-sm ${
            isThemesMode
              ? 'bg-(--accent-9) text-(--accent-contrast)'
              : 'bg-primary-600 text-white'
          }`}
          data-column-picker-badge="true"
        >
          {badgeLabel}
        </span>
      ) : null}
    </button>
  )

  const content = (
    <>
      <div className="mb-1 border-b border-(--gray-a5) pb-1">
        <button
          className={`min-h-11 min-w-11 w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors ${
            isThemesMode
              ? 'text-(--gray-11) hover:bg-(--accent-a3) hover:text-(--gray-12)'
              : 'text-secondary-500 hover:bg-secondary-50 hover:text-secondary-700 dark:hover:bg-secondary-700/50 dark:hover:text-secondary-200'
          }`}
          onClick={() => {
            onReset()
            setOpen(false)
          }}
          type="button"
        >
          {tc('resetToDefault')}
        </button>
      </div>
      <div className="space-y-0.5">
        {columns.map(column => {
          const lockedDescription = !column.canHide
            ? tt('lockedColumn')
            : undefined
          const lockedDescriptionId = lockedDescription
            ? `${instanceId}-column-picker-option-description-${column.id}`
            : undefined

          return (
            <div key={column.id}>
              <label
                aria-disabled={!column.canHide}
                className={`flex min-h-11 min-w-11 w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                  isThemesMode
                    ? 'text-(--gray-12) hover:bg-(--accent-a3)'
                    : 'hover:bg-secondary-50 dark:hover:bg-secondary-700/50'
                } ${!column.canHide ? 'cursor-not-allowed opacity-60' : ''}`}
                data-column-picker-option={column.id}
                {...devMarker({
                  context: 'requirements table > column picker: columns',
                  name: 'column picker option',
                  priority: 360,
                  value: getRequirementColumnDeveloperModeLabel(column.id),
                })}
                title={lockedDescription}
              >
                <input
                  aria-describedby={lockedDescriptionId}
                  checked={visibleColumns.includes(column.id)}
                  disabled={!column.canHide}
                  onChange={() => onToggle(column.id)}
                  title={lockedDescription}
                  type="checkbox"
                />
                <span>{column.label}</span>
              </label>
              {lockedDescriptionId ? (
                <span className="sr-only" id={lockedDescriptionId}>
                  {lockedDescription}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
    </>
  )

  if (isThemesMode) {
    return (
      <ThemesPopover.Root onOpenChange={setOpen} open={open}>
        <ThemesPopover.Trigger>{trigger}</ThemesPopover.Trigger>
        <ThemesPopover.Content
          align="end"
          data-column-picker-popover="true"
          data-radix-themes-popover="true"
          maxHeight="var(--radix-popover-content-available-height)"
          minWidth="14rem"
          {...devMarker({
            context: 'requirements table',
            name: 'column picker',
            priority: 350,
            value: 'columns',
          })}
          sideOffset={8}
          size="2"
        >
          {content}
        </ThemesPopover.Content>
      </ThemesPopover.Root>
    )
  }

  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          className={columnPickerPopoverContentClassName}
          collisionPadding={POPOVER_VIEWPORT_MARGIN}
          data-column-picker-popover="true"
          {...devMarker({
            context: 'requirements table',
            name: 'column picker',
            priority: 350,
            value: 'columns',
          })}
          sideOffset={8}
        >
          {content}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/* ── Small chip for showing active search text under column ── */

function SearchChip({
  developerModeContext,
  label,
  onRemove,
}: {
  developerModeContext: string
  label: string
  onRemove: () => void
}) {
  const tt = useTranslations('requirementsTable')

  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] leading-tight rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 max-w-full"
      {...devMarker({
        context: developerModeContext,
        name: 'header chip',
        priority: 370,
        value: label,
      })}
    >
      <span className="truncate">{label}</span>
      <button
        aria-label={tt('removeItem', { label })}
        className="shrink-0 hover:text-red-600 dark:hover:text-red-400"
        onClick={e => {
          e.stopPropagation()
          onRemove()
        }}
        type="button"
      >
        <X aria-hidden="true" className="h-2.5 w-2.5" />
      </button>
    </span>
  )
}

/* ── Small chip for multi-select values under column ── */

function FilterChips({
  developerModeContext,
  getLabel,
  onRemove,
  values,
}: {
  developerModeContext: string
  getLabel: (id: number) => string
  onRemove: (id: number) => void
  values: number[]
}) {
  const tt = useTranslations('requirementsTable')
  const uniqueValues = Array.from(new Set(values))

  if (uniqueValues.length === 0) return null
  return (
    <div className="flex flex-wrap gap-0.5 mt-1">
      {uniqueValues.map(id => {
        const label = getLabel(id)

        return (
          <span
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] leading-tight rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 max-w-full"
            key={`filter-chip-${developerModeContext}-${id}`}
            {...devMarker({
              context: developerModeContext,
              name: 'header chip',
              priority: 370,
              value: label,
            })}
          >
            <span className="truncate">{label}</span>
            <button
              aria-label={tt('removeItem', { label })}
              className="shrink-0 hover:text-red-600 dark:hover:text-red-400"
              onClick={e => {
                e.stopPropagation()
                onRemove(id)
              }}
              type="button"
            >
              <X aria-hidden="true" className="h-2.5 w-2.5" />
            </button>
          </span>
        )
      })}
    </div>
  )
}

export default function RequirementsTable({
  areas = [],
  categories = [],
  columnDefaults,
  columnPickerPlacement = 'betweenActions',
  columnWidths = {},
  defaultVisibleColumns,
  excludeColumns,
  expandedId,
  filterValues,
  floatingActions = [],
  floatingActionRailPlacement = 'fixed-right',
  getName = () => '',
  getStatusName = () => '',
  hasMore = false,
  loading = false,
  loadingMore = false,
  locale,
  needsReferenceOptions = [],
  normReferences = [],
  onFilterChange,
  onLoadMore,
  onNeedsReferenceChange,
  onSpecificationItemStatusChange,
  onRowClick,
  onColumnWidthsChange,
  onSelectionChange,
  onSortChange,
  onVisibleColumnsChange,
  pinnedIds,
  specificationItemStatuses = [],
  renderExpanded,
  priorityLevels = [],
  rows,
  selectable = false,
  selectedIds,
  sortState = DEFAULT_REQUIREMENT_SORT,
  stickyTopOffsetClassName = 'top-0',
  stickyTitle,
  stickyTitleActions,
  statusOptions = [],
  qualityCharacteristics = [],
  types = [],
  requirementPackages = [],
  visualMode = 'local',
  visibleColumns = defaultVisibleColumns ??
    getDefaultVisibleRequirementColumns(columnDefaults),
  wrapDescription = false,
}: RequirementsTableProps) {
  const t = useTranslations('requirement')
  const tStatusLabel = useTranslations('requirement.statusLabel')
  const tc = useTranslations('common')
  const tfb = useTranslations('improvementSuggestion')
  const router = useRouter()
  const isThemesMode = visualMode === 'radix-themes'
  const normalizedColumnDefaults =
    normalizeRequirementListColumnDefaults(columnDefaults)
  const effectiveExcludeColumns: RequirementColumnId[] = (
    excludeColumns ?? []
  ).filter(columnId => columnId !== 'uniqueId' && columnId !== 'description')
  const allColumns = getOrderedRequirementListColumns(
    normalizedColumnDefaults,
  ).filter(col => !effectiveExcludeColumns.includes(col.id))
  const normalizedVisibleColumns = useMemo(
    () =>
      orderRequirementVisibleColumns(
        allColumns
          .filter(
            column =>
              visibleColumns.includes(column.id) ||
              column.id === 'uniqueId' ||
              column.id === 'description',
          )
          .map(column => column.id),
        {
          columnDefaults: normalizedColumnDefaults,
        },
      ),
    [allColumns, normalizedColumnDefaults, visibleColumns],
  )

  const fv = filterValues ?? {}
  const latestFilterValuesRef = useRef(fv)
  const visibleColumnsRef = useRef(normalizedVisibleColumns)
  const hasFilters = !!onFilterChange
  const visibleColumnSet = new Set(normalizedVisibleColumns)
  latestFilterValuesRef.current = fv
  visibleColumnsRef.current = normalizedVisibleColumns
  const columnPickerBadgeLabel =
    visibleColumnSet.size > 0
      ? `${visibleColumnSet.size}/${allColumns.length}`
      : null
  const columnDefinitions = allColumns.filter(column =>
    visibleColumnSet.has(column.id),
  )
  const configuredColumnWidths = Object.fromEntries(
    columnDefinitions.map(column => [
      column.id,
      getRequirementColumnWidth(column.id, columnWidths),
    ]),
  ) as Record<RequirementColumnId, number>
  const tableRootRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const stickyHeaderContentRef = useRef<HTMLDivElement>(null)
  const tableContentRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const expandedDetailCellRef = useRef<HTMLTableCellElement>(null)
  const colRefs = useRef<
    Partial<Record<RequirementColumnId, HTMLTableColElement | null>>
  >({})
  const stickyHeaderColRefs = useRef<
    Partial<Record<RequirementColumnId, HTMLTableColElement | null>>
  >({})
  const headerCellRefs = useRef<
    Partial<Record<RequirementColumnId, HTMLTableCellElement | null>>
  >({})
  const renderedColumnWidthsRef = useRef<Record<RequirementColumnId, number>>(
    {} as Record<RequirementColumnId, number>,
  )
  const columnState = useColumnState({
    allColumns,
    columnDefinitions,
    columnWidths,
    filterValues: fv,
    headerCellRefs,
    normalizedColumnDefaults,
    normalizedVisibleColumns,
    onColumnWidthsChange,
    onFilterChange,
    onSortChange,
    renderedColumnWidthsRef,
    sortState,
  })
  const { resetColumnWidth } = columnState
  const {
    cancelResizePreviewFrame,
    pendingResizePreviewVisibleWidthsRef,
    resizePreviewVisibleWidthsRef,
  } = columnState
  const canResizeColumns = !!onColumnWidthsChange
  const expandedDetailRowId =
    expandedId !== null &&
    expandedId !== undefined &&
    renderExpanded &&
    rows.some(row => row.id === expandedId)
      ? expandedId
      : null
  const checkboxColumnWidth = selectable ? 36 : 0
  const resize = useResizeHandles({
    canResizeColumns,
    checkboxColumnWidth,
    columnDefinitions,
    columnState,
    expandedDetailRowId,
    refs: {
      colRefs,
      expandedDetailCellRef,
      headerCellRefs,
      scrollContainerRef,
      stickyHeaderColRefs,
      stickyHeaderContentRef,
      tableContentRef,
      tableRef,
    },
    renderedColumnWidthsRef,
  })
  const {
    expandedDetailBounds,
    handleResizeKeyDown,
    handleResizePointerDown,
    resizeHandleOffsets,
    resizeHandleRefs,
    scrollContainerWidth,
    scrollFadeState,
    setResizeHoverCursor,
  } = resize
  const hasManualColumnWidths = columnDefinitions.some(
    column => typeof columnWidths[column.id] === 'number',
  )
  const renderedColumnWidths = {
    ...configuredColumnWidths,
  } as Record<RequirementColumnId, number>
  if (!hasManualColumnWidths) {
    const growColumnIds = columnDefinitions
      .filter(column => column.grows)
      .map(column => column.id)
    const configuredTableWidth = columnDefinitions.reduce(
      (total, column) => total + configuredColumnWidths[column.id],
      0,
    )
    const availableExtraWidth =
      growColumnIds.length > 0
        ? Math.max(
            0,
            scrollContainerWidth - configuredTableWidth - checkboxColumnWidth,
          )
        : 0

    if (availableExtraWidth > 0) {
      const evenShare = Math.floor(availableExtraWidth / growColumnIds.length)
      const remainder = availableExtraWidth - evenShare * growColumnIds.length

      for (const [index, columnId] of growColumnIds.entries()) {
        renderedColumnWidths[columnId] +=
          evenShare + (index === 0 ? remainder : 0)
      }
    }
  }
  renderedColumnWidthsRef.current = renderedColumnWidths

  const tableWidth =
    columnDefinitions.reduce(
      (total, column) => total + renderedColumnWidths[column.id],
      0,
    ) + checkboxColumnWidth
  const scrollLayoutSignature = columnDefinitions
    .map(column => `${column.id}:${renderedColumnWidths[column.id]}`)
    .concat(String(scrollContainerWidth))
    .join('|')
  const hasExpandedDetailRow = expandedDetailRowId !== null
  const clippedResizeHandleBounds = hasExpandedDetailRow
    ? expandedDetailBounds
    : null
  const shouldRenderResizeHandles =
    canResizeColumns && (!hasExpandedDetailRow || clippedResizeHandleBounds)
  const actionsBeforeColumns = floatingActions.filter(
    action => action.position === 'beforeColumns',
  )
  const actionsAfterColumns = floatingActions.filter(
    action => action.position !== 'beforeColumns',
  )
  const shouldRenderInlineRail = floatingActionRailPlacement === 'inline-top'
  const { floatingRailPosition, showScrollTopAction } = useFloatingRailPosition(
    {
      scrollContainerRef,
      scrollLayoutSignature,
      shouldRenderInlineRail,
      tableRef,
      tableRootRef,
    },
  )

  const scrollTableToTop = useCallback(() => {
    if (!tableRootRef.current) {
      return
    }

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ??
        false)

    tableRootRef.current.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    })
  }, [])

  const updateFilter = (patch: Partial<FilterValues>) => {
    if (!onFilterChange) {
      return
    }

    const nextFilterValues = {
      ...latestFilterValuesRef.current,
      ...patch,
    }
    latestFilterValuesRef.current = nextFilterValues
    onFilterChange(nextFilterValues)
  }

  const areaLabel = (id: number) =>
    areas.find(a => a.id === id)?.name ?? String(id)
  const needsRefLabel = (id: number) =>
    needsReferenceOptions.find(o => o.id === id)?.text ?? String(id)
  const catLabel = (id: number) => {
    const c = categories.find(c => c.id === id)
    return c ? getName(c) : String(id)
  }
  const typeLabel = (id: number) => {
    const t = types.find(t => t.id === id)
    return t ? getName(t) : String(id)
  }
  const typeCatLabel = (id: number) => {
    const tc = qualityCharacteristics.find(tc => tc.id === id)
    return tc ? getName(tc) : String(id)
  }
  const statusLabel = (id: number) => {
    const s = statusOptions.find(s => s.id === id)
    return s ? getStatusName(s) : String(id)
  }
  const formatPriorityLevelOptionLabel = (rl: PriorityLevelOption) =>
    [rl.code, locale === 'sv' ? rl.nameSv : rl.nameEn]
      .filter(Boolean)
      .join(' - ')
  const formatPriorityLevelLabel = (id: number) => {
    const rl = priorityLevels.find(rl => rl.id === id)
    return rl ? formatPriorityLevelOptionLabel(rl) : String(id)
  }
  const requirementPackageName = (
    requirementPackage: RequirementPackageOption,
  ) => requirementPackage.name.trim() || String(requirementPackage.id)
  const requirementPackagePurposeAndScope = (
    requirementPackage: RequirementPackageOption,
  ) => requirementPackage.purposeAndScope?.trim() || undefined
  const rowRequirementPackages = (row: RequirementRow) =>
    row.requirementPackages && row.requirementPackages.length > 0
      ? row.requirementPackages
      : (row.requirementPackageIds ?? []).map(
          id =>
            requirementPackages.find(
              requirementPackage => requirementPackage.id === id,
            ) ?? {
              id,
              name: String(id),
            },
        )
  const specificationItemStatusLabel = (id: number) => {
    const s = specificationItemStatuses.find(s => s.id === id)
    return s ? getName(s) : String(id)
  }
  const specificationItemStatusDescription = (id: number) => {
    const s = specificationItemStatuses.find(s => s.id === id)
    if (!s) return undefined
    const desc = locale === 'sv' ? s.descriptionSv : s.descriptionEn
    return desc || undefined
  }
  const verifiableOptions = [
    { id: 1, label: tc('yes') },
    { id: 0, label: tc('no') },
  ]
  const verifiableValue = (fv.verifiable ?? []).map(v => (v === 'true' ? 1 : 0))
  const setVerifiable = (ids: number[]) => {
    const values = ids.map(id => (id === 1 ? 'true' : 'false'))
    updateFilter({ verifiable: values.length > 0 ? values : undefined })
  }
  const handleRowAction = useCallback(
    (id: number) => {
      if (onRowClick) {
        onRowClick(id)
        return
      }

      const row = rows.find(r => r.id === id)
      router.push(`/requirements/${row?.uniqueId ?? id}`)
    },
    [onRowClick, router, rows],
  )
  const handleBodyRowClick = useCallback(
    (event: ReactMouseEvent<HTMLTableRowElement>, id: number) => {
      if (event.defaultPrevented) {
        return
      }

      if (
        event.target instanceof Element &&
        event.target.closest(ROW_CLICK_INTERACTIVE_SELECTOR)
      ) {
        return
      }

      handleRowAction(id)
    },
    [handleRowAction],
  )

  const getColumnLabel = (columnId: RequirementColumnId) => {
    const column = allColumns.find(item => item.id === columnId)
    if (!column) {
      return columnId
    }

    return column.labelNamespace === 'common'
      ? tc(column.labelKey)
      : column.labelNamespace === 'improvementSuggestion'
        ? tfb(column.labelKey)
        : t(column.labelKey)
  }

  const getColumnDeveloperModeContext = (columnId: RequirementColumnId) =>
    `requirements table > column header: ${getRequirementColumnDeveloperModeLabel(columnId)}`

  const getSortIcon = (columnId: RequirementSortField) => {
    if (sortState.by !== columnId) {
      return (
        <ArrowUpDown
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 text-secondary-400 transition-colors group-hover:text-secondary-600 dark:group-hover:text-secondary-300"
        />
      )
    }

    return sortState.direction === 'asc' ? (
      <ArrowUp
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0 text-primary-600 dark:text-primary-400"
      />
    ) : (
      <ArrowDown
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0 text-primary-600 dark:text-primary-400"
      />
    )
  }

  const getSortTooltip = (label: string, isActiveSort: boolean) => {
    if (!isActiveSort) {
      return tc('sortBy', { label })
    }

    const currentOrderKey =
      sortState.direction === 'asc' ? 'ascending' : 'descending'
    const nextOrderKey =
      sortState.direction === 'asc' ? 'descending' : 'ascending'

    return tc('sortDirectionTooltip', {
      current: tc(currentOrderKey),
      label,
      next: tc(nextOrderKey),
    })
  }

  const handleSortToggle = (columnId: RequirementSortField) => {
    if (!onSortChange) {
      return
    }

    if (sortState.by === columnId) {
      onSortChange({
        by: columnId,
        direction: sortState.direction === 'asc' ? 'desc' : 'asc',
      })
      return
    }

    onSortChange({ by: columnId, direction: 'asc' })
  }

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        rows.length > 0 &&
        rows.some(r => selectedIds?.has(r.id)) &&
        !rows.every(r => selectedIds?.has(r.id))
    }
  }, [rows, selectedIds])

  // Sync sticky header horizontal position with the scroll container.
  // Uses ScrollTimeline (compositor-thread, zero JS lag) when available,
  // falling back to a passive scroll listener.
  useClientLayoutEffect(() => {
    const container = scrollContainerRef.current
    const header = stickyHeaderContentRef.current
    if (!container || !header) return

    const maxScrollLeft = container.scrollWidth - container.clientWidth

    if (maxScrollLeft <= 0) {
      header.style.transform = 'translateX(0px)'
      return
    }

    if (typeof ScrollTimeline !== 'undefined') {
      const timeline = new ScrollTimeline({ axis: 'inline', source: container })
      const animation = header.animate(
        [
          { transform: 'translateX(0px)' },
          { transform: `translateX(-${maxScrollLeft}px)` },
        ],
        { fill: 'both', timeline } as KeyframeAnimationOptions,
      )
      return () => animation.cancel()
    }

    // Fallback for browsers without ScrollTimeline
    const sync = () => {
      header.style.transform = `translateX(-${container.scrollLeft}px)`
    }
    sync()
    container.addEventListener('scroll', sync, { passive: true })
    return () => container.removeEventListener('scroll', sync)
  }, [scrollLayoutSignature])

  const applyVisibleColumns = (nextVisibleColumns: RequirementColumnId[]) => {
    if (!onVisibleColumnsChange) {
      return
    }

    const normalizedColumns = allColumns
      .filter(
        column =>
          nextVisibleColumns.includes(column.id) ||
          column.id === 'uniqueId' ||
          column.id === 'description',
      )
      .map(column => column.id)
    const orderedColumns = orderRequirementVisibleColumns(normalizedColumns, {
      columnDefaults: normalizedColumnDefaults,
    })
    const nextFilterValues = clearRequirementFiltersForHiddenColumns(
      fv,
      orderedColumns,
      { columnDefaults: normalizedColumnDefaults },
    )

    onVisibleColumnsChange(orderedColumns)

    if (nextFilterValues !== fv && onFilterChange) {
      onFilterChange(nextFilterValues)
    }
    if (
      !orderedColumns.includes(sortState.by as RequirementColumnId) &&
      onSortChange &&
      sortState.by !== DEFAULT_REQUIREMENT_SORT.by
    ) {
      onSortChange(DEFAULT_REQUIREMENT_SORT)
    }
  }

  const toggleColumn = (columnId: RequirementColumnId) => {
    const column = allColumns.find(item => item.id === columnId)
    const currentVisibleColumns = visibleColumnsRef.current
    const currentVisibleColumnSet = new Set([
      ...currentVisibleColumns,
      'uniqueId',
      'description',
    ])

    if (!column?.canHide) {
      return
    }

    if (currentVisibleColumnSet.has(columnId)) {
      applyVisibleColumns(
        currentVisibleColumns.filter(value => value !== columnId),
      )
      return
    }

    applyVisibleColumns([...currentVisibleColumns, columnId])
  }

  const renderFilterControl = (columnId: RequirementColumnId) => {
    if (!hasFilters) {
      return null
    }

    const developerModeValue = getRequirementColumnDeveloperModeLabel(columnId)

    switch (columnId) {
      case 'uniqueId':
        return (
          <SearchFilterPopover
            activeValue={fv.uniqueIdSearch ?? ''}
            developerModeValue={developerModeValue}
            label={t('uniqueId')}
            onChange={value => updateFilter({ uniqueIdSearch: value })}
            visualMode={visualMode}
          />
        )
      case 'description':
        return (
          <SearchFilterPopover
            activeValue={fv.descriptionSearch ?? ''}
            developerModeValue={developerModeValue}
            label={t('description')}
            onChange={value => updateFilter({ descriptionSearch: value })}
            visualMode={visualMode}
          />
        )
      case 'area':
        return (
          <MultiSelectFilterPopover
            activeCount={(fv.areaIds ?? []).length}
            developerModeValue={developerModeValue}
            getLabel={option => areaLabel(option.id)}
            label={t('area')}
            onChange={ids =>
              updateFilter({ areaIds: ids.length > 0 ? ids : undefined })
            }
            options={areas}
            value={fv.areaIds ?? []}
            visualMode={visualMode}
          />
        )
      case 'category':
        return (
          <MultiSelectFilterPopover
            activeCount={(fv.categoryIds ?? []).length}
            developerModeValue={developerModeValue}
            getLabel={option => catLabel(option.id)}
            label={t('category')}
            onChange={ids =>
              updateFilter({ categoryIds: ids.length > 0 ? ids : undefined })
            }
            options={categories}
            value={fv.categoryIds ?? []}
            visualMode={visualMode}
          />
        )
      case 'type':
        return (
          <MultiSelectFilterPopover
            activeCount={(fv.typeIds ?? []).length}
            developerModeValue={developerModeValue}
            getLabel={option => typeLabel(option.id)}
            label={t('type')}
            onChange={ids =>
              updateFilter({ typeIds: ids.length > 0 ? ids : undefined })
            }
            options={types}
            value={fv.typeIds ?? []}
            visualMode={visualMode}
          />
        )
      case 'qualityCharacteristic':
        return (
          <GroupedMultiSelectFilterPopover
            activeCount={(fv.qualityCharacteristicIds ?? []).length}
            developerModeValue={developerModeValue}
            getLabel={option => typeCatLabel(option.id)}
            label={t('qualityCharacteristic')}
            onChange={ids =>
              updateFilter({
                qualityCharacteristicIds: ids.length > 0 ? ids : undefined,
              })
            }
            options={qualityCharacteristics}
            value={fv.qualityCharacteristicIds ?? []}
            visualMode={visualMode}
          />
        )
      case 'priorityLevel':
        return (
          <MultiSelectFilterPopover
            activeCount={(fv.priorityLevelIds ?? []).length}
            developerModeValue={developerModeValue}
            getLabel={option => formatPriorityLevelLabel(option.id)}
            label={t('priorityLevel')}
            onChange={ids =>
              updateFilter({
                priorityLevelIds: ids.length > 0 ? ids : undefined,
              })
            }
            options={priorityLevels}
            value={fv.priorityLevelIds ?? []}
            visualMode={visualMode}
          />
        )
      case 'status':
        return (
          <MultiSelectFilterPopover
            activeCount={(fv.statuses ?? []).length}
            developerModeValue={developerModeValue}
            getLabel={option => statusLabel(option.id)}
            label={t('status')}
            onChange={ids =>
              updateFilter({ statuses: ids.length > 0 ? ids : undefined })
            }
            options={statusOptions}
            value={fv.statuses ?? []}
            visualMode={visualMode}
          />
        )
      case 'verifiable':
        return (
          <MultiSelectFilterPopover
            activeCount={verifiableValue.length}
            developerModeValue={developerModeValue}
            getLabel={option =>
              verifiableOptions.find(item => item.id === option.id)?.label ?? ''
            }
            label={t('verifiable')}
            onChange={setVerifiable}
            options={verifiableOptions}
            value={verifiableValue}
            visualMode={visualMode}
          />
        )
      case 'needsReference':
        if (needsReferenceOptions.length === 0) return null
        return (
          <MultiSelectFilterPopover
            activeCount={(fv.needsReferenceIds ?? []).length}
            developerModeValue={developerModeValue}
            getLabel={option => needsRefLabel(option.id)}
            label={t('needsReference')}
            onChange={ids =>
              updateFilter({
                needsReferenceIds: ids.length > 0 ? ids : undefined,
              })
            }
            options={needsReferenceOptions}
            value={fv.needsReferenceIds ?? []}
            visualMode={visualMode}
          />
        )
      case 'specificationItemStatus':
        if (specificationItemStatuses.length === 0) return null
        return (
          <MultiSelectFilterPopover
            activeCount={(fv.specificationItemStatusIds ?? []).length}
            developerModeValue={developerModeValue}
            getLabel={option => specificationItemStatusLabel(option.id)}
            label={t('specificationItemStatus')}
            onChange={ids =>
              updateFilter({
                specificationItemStatusIds: ids.length > 0 ? ids : undefined,
              })
            }
            options={specificationItemStatuses}
            value={fv.specificationItemStatusIds ?? []}
            visualMode={visualMode}
          />
        )
      case 'requirementPackage':
      case 'normReferences':
      case 'version':
      case 'suggestionCount':
        return null
    }
  }

  const renderFilterChips = (columnId: RequirementColumnId) => {
    const developerModeContext = getColumnDeveloperModeContext(columnId)

    switch (columnId) {
      case 'uniqueId':
        return fv.uniqueIdSearch ? (
          <SearchChip
            developerModeContext={developerModeContext}
            label={fv.uniqueIdSearch}
            onRemove={() => updateFilter({ uniqueIdSearch: undefined })}
          />
        ) : null
      case 'description':
        return fv.descriptionSearch ? (
          <SearchChip
            developerModeContext={developerModeContext}
            label={fv.descriptionSearch}
            onRemove={() => updateFilter({ descriptionSearch: undefined })}
          />
        ) : null
      case 'area':
        return (
          <FilterChips
            developerModeContext={developerModeContext}
            getLabel={areaLabel}
            onRemove={id =>
              updateFilter({
                areaIds: (fv.areaIds ?? []).filter(value => value !== id),
              })
            }
            values={fv.areaIds ?? []}
          />
        )
      case 'category':
        return (
          <FilterChips
            developerModeContext={developerModeContext}
            getLabel={catLabel}
            onRemove={id =>
              updateFilter({
                categoryIds: (fv.categoryIds ?? []).filter(
                  value => value !== id,
                ),
              })
            }
            values={fv.categoryIds ?? []}
          />
        )
      case 'type':
        return (
          <FilterChips
            developerModeContext={developerModeContext}
            getLabel={typeLabel}
            onRemove={id =>
              updateFilter({
                typeIds: (fv.typeIds ?? []).filter(value => value !== id),
              })
            }
            values={fv.typeIds ?? []}
          />
        )
      case 'qualityCharacteristic':
        return (
          <FilterChips
            developerModeContext={developerModeContext}
            getLabel={typeCatLabel}
            onRemove={id =>
              updateFilter({
                qualityCharacteristicIds: (
                  fv.qualityCharacteristicIds ?? []
                ).filter(value => value !== id),
              })
            }
            values={fv.qualityCharacteristicIds ?? []}
          />
        )
      case 'priorityLevel':
        return (
          <FilterChips
            developerModeContext={developerModeContext}
            getLabel={formatPriorityLevelLabel}
            onRemove={id =>
              updateFilter({
                priorityLevelIds: (fv.priorityLevelIds ?? []).filter(
                  value => value !== id,
                ),
              })
            }
            values={fv.priorityLevelIds ?? []}
          />
        )
      case 'status':
        return (
          <FilterChips
            developerModeContext={developerModeContext}
            getLabel={statusLabel}
            onRemove={id =>
              updateFilter({
                statuses: (fv.statuses ?? []).filter(value => value !== id),
              })
            }
            values={fv.statuses ?? []}
          />
        )
      case 'verifiable':
        return (
          <FilterChips
            developerModeContext={developerModeContext}
            getLabel={id =>
              verifiableOptions.find(option => option.id === id)?.label ?? ''
            }
            onRemove={id =>
              setVerifiable(verifiableValue.filter(value => value !== id))
            }
            values={verifiableValue}
          />
        )
      case 'needsReference':
        if (needsReferenceOptions.length === 0) return null
        return (
          <FilterChips
            developerModeContext={developerModeContext}
            getLabel={needsRefLabel}
            onRemove={id =>
              updateFilter({
                needsReferenceIds: (fv.needsReferenceIds ?? []).filter(
                  v => v !== id,
                ),
              })
            }
            values={fv.needsReferenceIds ?? []}
          />
        )
      case 'specificationItemStatus':
        if (specificationItemStatuses.length === 0) return null
        return (
          <FilterChips
            developerModeContext={developerModeContext}
            getLabel={specificationItemStatusLabel}
            onRemove={id =>
              updateFilter({
                specificationItemStatusIds: (
                  fv.specificationItemStatusIds ?? []
                ).filter(v => v !== id),
              })
            }
            values={fv.specificationItemStatusIds ?? []}
          />
        )
      case 'requirementPackage':
      case 'normReferences':
      case 'version':
      case 'suggestionCount':
        return null
    }
  }

  const renderCell = (
    row: RequirementRow,
    columnId: RequirementColumnId,
    isLastColumn: boolean,
  ) => {
    const archivedContentClass = row.isArchived ? 'opacity-50' : ''
    const dividerClass = isLastColumn
      ? ''
      : 'border-r border-secondary-200/5 dark:border-secondary-700/5'
    const isExpanded = row.id === expandedId
    const expandedDetailCellId = `requirement-row-detail-${row.id}`

    switch (columnId) {
      case 'uniqueId':
        return (
          <td
            className={`font-mono font-medium text-primary-700 dark:text-primary-300 whitespace-nowrap ${archivedContentClass} ${dividerClass}`}
          >
            <button
              aria-controls={renderExpanded ? expandedDetailCellId : undefined}
              aria-expanded={renderExpanded ? isExpanded : undefined}
              className="inline-flex min-h-11 min-w-11 w-full items-center gap-1.5 rounded border-0 bg-transparent px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-secondary-950"
              onClick={event => {
                event.stopPropagation()
                handleRowAction(row.id)
              }}
              type="button"
            >
              {renderExpanded ? (
                isExpanded ? (
                  <ChevronDown
                    aria-hidden="true"
                    className="h-3.5 w-3.5 text-secondary-500"
                  />
                ) : (
                  <ChevronRight
                    aria-hidden="true"
                    className="h-3.5 w-3.5 text-secondary-400"
                  />
                )
              ) : null}
              <span>{row.uniqueId}</span>
              {row.isSpecificationLocal ? (
                <span
                  className="inline-flex items-center text-amber-700 dark:text-amber-300"
                  data-specification-local-marker="true"
                  title={t('specificationLocalTooltip')}
                >
                  <DiamondPlus aria-hidden="true" className="h-3.5 w-3.5" />
                  <span className="sr-only">
                    {t('specificationLocalBadge')}
                  </span>
                </span>
              ) : null}
            </button>
          </td>
        )
      case 'description':
        return (
          <td
            className={`py-2 px-2 ${descriptionWrapped ? 'whitespace-normal wrap-break-word' : 'truncate'} ${archivedContentClass} ${dividerClass}`}
            title={
              !descriptionWrapped
                ? (row.version?.description ?? undefined)
                : undefined
            }
          >
            {row.version?.description ?? '—'}
          </td>
        )
      case 'area':
        return (
          <td
            className={`py-2 px-2 truncate ${archivedContentClass} ${dividerClass}`}
          >
            {row.isSpecificationLocal ? '-' : (row.area?.name ?? '—')}
          </td>
        )
      case 'category':
        return (
          <td
            className={`py-2 px-2 truncate ${archivedContentClass} ${dividerClass}`}
          >
            {(locale === 'sv'
              ? row.version?.categoryNameSv
              : row.version?.categoryNameEn) ?? '—'}
          </td>
        )
      case 'type':
        return (
          <td
            className={`py-2 px-2 truncate ${archivedContentClass} ${dividerClass}`}
          >
            {(locale === 'sv'
              ? row.version?.typeNameSv
              : row.version?.typeNameEn) ?? '—'}
          </td>
        )
      case 'qualityCharacteristic':
        return (
          <td
            className={`py-2 px-2 truncate ${archivedContentClass} ${dividerClass}`}
          >
            {(locale === 'sv'
              ? row.version?.qualityCharacteristicNameSv
              : row.version?.qualityCharacteristicNameEn) ?? '—'}
          </td>
        )
      case 'priorityLevel': {
        const fallbackPriorityLevelLabel =
          (locale === 'sv'
            ? row.version?.priorityLevelNameSv
            : row.version?.priorityLevelNameEn) ?? null
        const priorityLevelOption =
          row.version?.priorityLevelId == null
            ? null
            : priorityLevels.find(
                priorityLevel =>
                  priorityLevel.id === row.version?.priorityLevelId,
              )
        const priorityLevelLabel =
          priorityLevelOption != null
            ? formatPriorityLevelOptionLabel(priorityLevelOption)
            : fallbackPriorityLevelLabel
        return (
          <td
            className={`py-2 px-2 truncate ${archivedContentClass} ${dividerClass}`}
          >
            {priorityLevelLabel ? (
              <StatusBadge
                color={row.version?.priorityLevelColor ?? null}
                iconName={row.version?.priorityLevelIconName}
                label={priorityLevelLabel}
                size="sm"
              />
            ) : (
              '—'
            )}
          </td>
        )
      }
      case 'status':
        return (
          <td className={`py-2 px-2 ${dividerClass}`}>
            <span className="inline-flex items-center gap-1">
              {row.version ? (
                <span className={archivedContentClass}>
                  <StatusBadge
                    color={row.version.statusColor}
                    iconName={row.version.statusIconName}
                    label={resolveStatusLabel(
                      {
                        status: row.version.status,
                        statusNameSv: row.version.statusNameSv,
                        statusNameEn: row.version.statusNameEn,
                        archiveInitiatedAt: row.version.archiveInitiatedAt,
                      },
                      locale === 'sv' ? 'sv' : 'en',
                      tStatusLabel,
                    )}
                  />
                </span>
              ) : (
                '—'
              )}
              {row.hasPendingVersion && (
                <span
                  aria-label={t(
                    row.pendingVersionStatusId === 1
                      ? 'hasPendingVersionDraft'
                      : 'hasPendingVersionReview',
                  )}
                  role="img"
                  style={{
                    color: row.pendingVersionStatusColor ?? undefined,
                  }}
                  title={t(
                    row.pendingVersionStatusId === 1
                      ? 'hasPendingVersionDraft'
                      : 'hasPendingVersionReview',
                  )}
                >
                  {row.pendingVersionStatusIconName ? (
                    <StatusIcon
                      className="h-3.5 w-3.5"
                      name={row.pendingVersionStatusIconName}
                      style={{
                        color: row.pendingVersionStatusColor ?? undefined,
                      }}
                    />
                  ) : (
                    <AlertCircle
                      aria-hidden="true"
                      className="h-3.5 w-3.5"
                      style={{
                        color: row.pendingVersionStatusColor ?? undefined,
                      }}
                    />
                  )}
                </span>
              )}
            </span>
          </td>
        )
      case 'verifiable':
        return (
          <td
            className={`py-2 px-2 text-center ${archivedContentClass} ${dividerClass}`}
          >
            {row.version?.verifiable && (
              <SearchCheck
                aria-label={t('verifiable')}
                className="inline h-4 w-4 text-primary-700 dark:text-primary-300"
              />
            )}
          </td>
        )
      case 'version':
        return (
          <td
            className={`py-2 px-2 text-center text-secondary-600 dark:text-secondary-400 ${archivedContentClass} ${dividerClass}`}
          >
            v{row.version?.versionNumber ?? 1}
          </td>
        )
      case 'needsReference':
        return (
          <td
            className={`py-2 px-2 truncate text-secondary-600 dark:text-secondary-400 ${archivedContentClass} ${dividerClass}`}
          >
            {onNeedsReferenceChange && row.itemRef ? (
              <select
                aria-label={t('needsReference')}
                className="min-h-11 w-full min-w-36 rounded-lg border border-secondary-200 bg-white px-2 py-1.5 text-sm text-secondary-700 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200"
                onChange={event => {
                  const value = event.target.value
                  onNeedsReferenceChange(
                    row.itemRef ?? '',
                    value ? Number(value) : null,
                  )
                }}
                onClick={event => event.stopPropagation()}
                value={row.needsReferenceId ? String(row.needsReferenceId) : ''}
              >
                <option value="">{t('noNeedsRef')}</option>
                {needsReferenceOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.text}
                  </option>
                ))}
              </select>
            ) : (
              (row.needsReference ?? '—')
            )}
          </td>
        )
      case 'specificationItemStatus': {
        const statusId = row.specificationItemStatusId
        const statusColor = row.specificationItemStatusColor
        const statusLabel =
          (locale === 'sv'
            ? row.specificationItemStatusNameSv
            : row.specificationItemStatusNameEn) ?? null
        const statusDescription =
          (locale === 'sv'
            ? row.specificationItemStatusDescriptionSv
            : row.specificationItemStatusDescriptionEn) ?? undefined

        if (onSpecificationItemStatusChange && row.itemRef) {
          const selectTooltip = statusId
            ? specificationItemStatusDescription(statusId)
            : undefined
          return (
            <td
              className={`py-1 px-1 ${archivedContentClass} ${dividerClass}`}
              title={selectTooltip}
            >
              <SpecificationItemStatusSelect
                ariaLabel={t('specificationItemStatus')}
                hasApprovedDeviation={Boolean(row.hasApprovedDeviation)}
                itemRef={row.itemRef}
                locale={locale}
                onChange={onSpecificationItemStatusChange}
                statuses={specificationItemStatuses}
                statusId={statusId ?? undefined}
                tooltip={selectTooltip}
              />
            </td>
          )
        }

        return (
          <td
            className={`py-2 px-2 truncate ${archivedContentClass} ${dividerClass}`}
            title={statusDescription}
          >
            {statusLabel ? (
              <StatusBadge
                color={statusColor ?? null}
                iconName={row.specificationItemStatusIconName ?? null}
                label={statusLabel}
                size="sm"
              />
            ) : (
              '—'
            )}
          </td>
        )
      }
      case 'normReferences':
        return (
          <td
            className={`py-2 px-2 truncate text-secondary-600 dark:text-secondary-400 ${archivedContentClass} ${dividerClass}`}
          >
            {row.normReferenceIds && row.normReferenceIds.length > 0
              ? row.normReferenceIds.join(', ')
              : '—'}
          </td>
        )
      case 'requirementPackage': {
        const rowPackages = rowRequirementPackages(row)

        return (
          <td
            className={`py-2 px-2 text-secondary-600 dark:text-secondary-400 ${archivedContentClass} ${dividerClass}`}
          >
            {rowPackages.length > 0 ? (
              <span className="flex min-w-0 flex-wrap gap-x-1 gap-y-0.5">
                {rowPackages.map((requirementPackage, index) => (
                  <RequirementPackagePurposeTooltip
                    key={requirementPackage.id}
                    maxWidth={280}
                    purposeAndScope={requirementPackagePurposeAndScope(
                      requirementPackage,
                    )}
                  >
                    <span className="truncate">
                      {requirementPackageName(requirementPackage)}
                      {index < rowPackages.length - 1 ? ',' : ''}
                    </span>
                  </RequirementPackagePurposeTooltip>
                ))}
              </span>
            ) : (
              '—'
            )}
          </td>
        )
      }
      case 'suggestionCount':
        return (
          <td
            className={`py-2 px-2 text-center ${archivedContentClass} ${dividerClass}`}
          >
            {row.suggestionCount != null && row.suggestionCount > 0 ? (
              <span className="inline-flex items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-medium min-w-6 h-6 px-1.5">
                {row.suggestionCount}
              </span>
            ) : (
              <span className="text-secondary-400 dark:text-secondary-500">
                —
              </span>
            )}
          </td>
        )
    }
  }

  const [descriptionWrapped, setDescriptionWrapped] = useState(wrapDescription)
  const [showSpinner, setShowSpinner] = useState(false)
  useEffect(() => {
    setDescriptionWrapped(wrapDescription)
  }, [wrapDescription])
  useEffect(() => {
    if (!loading) {
      setShowSpinner(false)
      return
    }
    const timer = setTimeout(() => setShowSpinner(true), 1000)
    return () => clearTimeout(timer)
  }, [loading])
  const shouldShowEmptyState = rows.length === 0 && !loading

  // Infinite-scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null)
  const stableLoadMore = useCallback(() => {
    onLoadMore?.()
  }, [onLoadMore])

  useEffect(() => {
    if (!hasMore || !onLoadMore) return
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) stableLoadMore()
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, onLoadMore, stableLoadMore])

  const thBase = isThemesMode
    ? 'relative px-3 font-semibold text-(--gray-12) align-top'
    : 'relative px-2 font-semibold text-secondary-800 dark:text-secondary-200 align-top'
  const headerCellSurfaceClassName = isThemesMode
    ? 'bg-(--gray-3) shadow-[inset_0_-1px_0_var(--gray-a6)]'
    : 'bg-[#f6f5f8] shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)] dark:bg-[#18181b] dark:shadow-[inset_0_-1px_0_rgba(255,255,255,0.1)]'
  const stickyTableChromeClassName = `sticky ${stickyTopOffsetClassName} z-20 overflow-hidden ${
    isThemesMode ? 'rounded-t-2xl' : 'rounded-t-lg'
  }`
  const stickyTopBarClassName = isThemesMode
    ? 'flex flex-wrap items-center justify-between gap-3 border-b border-(--gray-a6) bg-(--color-panel) px-5 py-4 shadow-[0_18px_42px_-34px_var(--gray-a12)] sm:flex-nowrap'
    : 'flex flex-wrap items-center justify-between gap-3 border-b border-secondary-950/10 bg-[#fbfbfd]/95 px-4 py-3 backdrop-blur-sm sm:flex-nowrap dark:border-white/10 dark:bg-[#111113]/95'
  const resizeHandleBaseClassName =
    'group pointer-events-auto absolute left-0 z-20 m-0 min-w-11 -translate-x-1/2 cursor-ew-resize touch-none border-0 bg-transparent p-0 before:absolute before:bottom-0 before:left-1/2 before:top-0 before:w-px before:-translate-x-1/2 before:rounded-full before:bg-secondary-300/18 before:transition-colors dark:before:bg-secondary-600/25'
  const interactiveResizeHandleClassName = `${resizeHandleBaseClassName} focus-visible:outline-none hover:before:bg-primary-400 focus-visible:before:bg-primary-400 dark:hover:before:bg-primary-400 dark:focus-visible:before:bg-primary-400`
  const fullResizeHandleClassName = `${interactiveResizeHandleClassName} min-h-11`
  const pointerResizeSegmentClassName = `${resizeHandleBaseClassName} min-h-0 hover:before:bg-primary-400 dark:hover:before:bg-primary-400`
  const resetColumnsView = () => {
    cancelResizePreviewFrame()
    pendingResizePreviewVisibleWidthsRef.current = null
    resizePreviewVisibleWidthsRef.current = null
    applyVisibleColumns(
      defaultVisibleColumns ??
        getDefaultVisibleRequirementColumns(normalizedColumnDefaults),
    )
    onColumnWidthsChange?.({})
  }
  const columnsPopover = (
    <ColumnsPopover
      badgeLabel={columnPickerBadgeLabel}
      columns={allColumns.map(column => ({
        canHide: column.canHide,
        id: column.id,
        label: getColumnLabel(column.id),
      }))}
      onReset={resetColumnsView}
      onToggle={toggleColumn}
      visibleColumns={columnDefinitions.map(column => column.id)}
      visualMode={visualMode}
    />
  )
  const floatingRailItems = (
    <>
      {actionsBeforeColumns.map(action => (
        <FloatingActionPill
          action={action}
          key={action.id}
          visualMode={visualMode}
        />
      ))}
      {columnPickerPlacement === 'betweenActions' ? columnsPopover : null}
      {actionsAfterColumns.map(action => (
        <FloatingActionPill
          action={action}
          key={action.id}
          visualMode={visualMode}
        />
      ))}
      {columnPickerPlacement === 'end' ? columnsPopover : null}
    </>
  )
  const scrollTopRailGroup =
    !shouldRenderInlineRail && showScrollTopAction ? (
      <div
        className="mt-2 flex flex-col gap-3"
        data-floating-action-group="scroll-top"
      >
        <button
          aria-label={tc('backToTop')}
          className={getFloatingPillClassName('default', visualMode)}
          {...devMarker({
            context: 'requirements table',
            name: 'table action',
            priority: 360,
            value: 'scroll to top',
          })}
          data-floating-action-id="scroll-top"
          data-floating-action-item="true"
          data-floating-action-variant="default"
          data-scroll-top-trigger="true"
          onClick={scrollTableToTop}
          title={tc('backToTop')}
          type="button"
        >
          <span aria-hidden="true" className="flex items-center justify-center">
            <ArrowUp className="h-4 w-4" />
          </span>
          <span className="sr-only">{tc('backToTop')}</span>
        </button>
      </div>
    ) : null
  const inlineFloatingRail = shouldRenderInlineRail ? (
    <div
      className={`min-w-0 flex flex-wrap items-center gap-2 sm:flex-nowrap ${
        isThemesMode
          ? 'rounded-2xl border border-(--gray-a5) bg-(--gray-a2) p-1.5'
          : ''
      }`}
      {...devMarker({
        context: 'requirements table',
        name: 'floating action rail',
        priority: 340,
      })}
      data-floating-action-rail="true"
      data-floating-action-rail-placement="inline-top"
      data-radix-themes-rail={isThemesMode ? 'true' : undefined}
    >
      {floatingRailItems}
    </div>
  ) : null
  const floatingRail =
    !shouldRenderInlineRail &&
    floatingRailPosition.visible &&
    typeof document !== 'undefined'
      ? createPortal(
          <div
            className="pointer-events-none fixed z-30 motion-safe:transition-[top,left] motion-safe:duration-100 motion-safe:ease-linear motion-reduce:transition-none"
            style={{
              left: floatingRailPosition.left,
              top: floatingRailPosition.top,
              willChange: 'top, left',
            }}
          >
            <div
              className="pointer-events-auto flex flex-col gap-3"
              {...devMarker({
                context: 'requirements table',
                name: 'floating action rail',
                priority: 340,
              })}
              data-floating-action-rail="true"
              data-floating-action-rail-placement="fixed-right"
            >
              <div
                className="flex flex-col gap-3"
                data-floating-action-group="primary"
              >
                {floatingRailItems}
              </div>
              {scrollTopRailGroup}
            </div>
          </div>,
          document.body,
        )
      : null

  const renderTableHeader = (mode: 'interactive' | 'semantic') => (
    <thead className={mode === 'semantic' ? 'h-0 overflow-hidden' : undefined}>
      <tr className={mode === 'semantic' ? 'h-0 text-left' : 'text-left'}>
        {selectable && (
          <th
            aria-label={mode === 'semantic' ? tc('selectAll') : undefined}
            className={
              mode === 'semantic'
                ? 'h-0 w-9 overflow-hidden p-0 text-center'
                : `${thBase} ${headerCellSurfaceClassName} w-9 py-2 text-center`
            }
            scope="col"
          >
            {mode === 'interactive' ? (
              <div className="flex min-h-11 items-center justify-center">
                <input
                  aria-label={tc('selectAll')}
                  checked={
                    rows.length > 0 && rows.every(r => selectedIds?.has(r.id))
                  }
                  className="h-4 w-4 rounded border-secondary-300 accent-primary-600 cursor-pointer"
                  {...devMarker({
                    context: 'requirements table',
                    name: 'row checkbox',
                    priority: 300,
                    value: 'select all',
                  })}
                  onChange={e => {
                    if (!onSelectionChange) return
                    if (e.target.checked) {
                      onSelectionChange(new Set(rows.map(r => r.id)))
                    } else {
                      onSelectionChange(new Set())
                    }
                  }}
                  ref={selectAllRef}
                  type="checkbox"
                />
              </div>
            ) : null}
          </th>
        )}
        {columnDefinitions.map((column, columnIndex) => {
          const label = getColumnLabel(column.id)
          const isSortable = column.canSort
          const isActiveSort = isSortable && sortState.by === column.id
          const sortTooltip = getSortTooltip(label, isActiveSort)
          const headerAlignClass =
            column.align === 'center' ? 'text-center' : ''
          const headerControlClass =
            column.align === 'center' ? 'justify-center' : 'justify-start'
          const isLastColumn = columnIndex === columnDefinitions.length - 1
          const dividerClass = isLastColumn
            ? ''
            : 'border-r border-secondary-200/5 dark:border-secondary-700/5'

          return (
            <th
              aria-label={mode === 'semantic' ? label : undefined}
              aria-sort={
                isSortable
                  ? isActiveSort
                    ? sortState.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                  : undefined
              }
              className={
                mode === 'semantic'
                  ? `h-0 overflow-hidden p-0 ${headerAlignClass}`
                  : `${thBase} ${headerCellSurfaceClassName} py-2 ${headerAlignClass} ${dividerClass}`
              }
              data-requirement-semantic-header-label={
                mode === 'semantic' ? column.id : undefined
              }
              key={`column-header-${column.id}`}
              scope="col"
              {...(mode === 'interactive'
                ? devMarker({
                    context: 'requirements table',
                    name: 'column header',
                    priority: 350,
                    value: getRequirementColumnDeveloperModeLabel(column.id),
                  })
                : {})}
              ref={
                mode === 'interactive'
                  ? node => {
                      headerCellRefs.current[column.id] = node
                    }
                  : undefined
              }
            >
              {mode === 'interactive' ? (
                <>
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex min-w-0 flex-1 items-center gap-1 ${headerControlClass}`}
                      data-requirement-header-control={column.id}
                    >
                      {isSortable ? (
                        <button
                          aria-label={tc('sortBy', { label })}
                          className="group inline-flex min-h-11 min-w-11 max-w-full flex-1 items-center gap-1 text-left"
                          {...devMarker({
                            name: 'sort button',
                            priority: 300,
                            value: getRequirementColumnDeveloperModeLabel(
                              column.id,
                            ),
                          })}
                          onClick={() =>
                            handleSortToggle(column.id as RequirementSortField)
                          }
                          title={sortTooltip}
                          type="button"
                        >
                          <span
                            className="min-w-0 flex-1 truncate"
                            data-requirement-header-label={column.id}
                          >
                            {label}
                          </span>
                          {getSortIcon(column.id as RequirementSortField)}
                        </button>
                      ) : (
                        <span
                          className="inline-flex min-h-11 min-w-0 flex-1 items-center truncate"
                          data-requirement-header-label={column.id}
                        >
                          {label}
                        </span>
                      )}
                      {renderFilterControl(column.id)}
                      {column.id === 'description' && (
                        <button
                          aria-label={
                            descriptionWrapped
                              ? tc('showShortText')
                              : tc('showFullText')
                          }
                          aria-pressed={descriptionWrapped}
                          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-secondary-400 hover:text-secondary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-secondary-50 dark:focus-visible:ring-offset-secondary-900"
                          onClick={() => setDescriptionWrapped(v => !v)}
                          title={
                            descriptionWrapped
                              ? tc('showShortText')
                              : tc('showFullText')
                          }
                          type="button"
                        >
                          {descriptionWrapped ? (
                            <WrapText
                              aria-hidden="true"
                              focusable={false}
                              size={16}
                            />
                          ) : (
                            <AlignLeft
                              aria-hidden="true"
                              focusable={false}
                              size={16}
                            />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  {renderFilterChips(column.id)}
                </>
              ) : null}
            </th>
          )
        })}
      </tr>
    </thead>
  )

  const renderResizeHandle = (
    columnId: RequirementColumnId,
    left: number,
    label: string,
  ) => {
    const developerModeValue = getRequirementColumnDeveloperModeLabel(columnId)
    const assignResizeHandleRef = (
      segment: ResizeHandleSegmentKey,
      node: ResizeHandleSegmentNode | null,
    ) => {
      const nextRefs = resizeHandleRefs.current[columnId] ?? {}
      nextRefs[segment] = node
      resizeHandleRefs.current[columnId] = nextRefs
    }
    const interactiveProps = {
      'aria-label': tc('resizeColumn', { label }),
      className: interactiveResizeHandleClassName,
      'data-column-resize-handle': columnId,
      onBlur: () => setResizeHoverCursor(false),
      onDoubleClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
        event.preventDefault()
        event.stopPropagation()
        resetColumnWidth(columnId)
      },
      onFocus: () => setResizeHoverCursor(true),
      onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) =>
        handleResizeKeyDown(columnId, event),
      onMouseEnter: () => setResizeHoverCursor(true),
      onMouseLeave: () => setResizeHoverCursor(false),
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) =>
        handleResizePointerDown(columnId, event),
      title: tc('resizeColumn', { label }),
      ...devMarker({
        name: 'resize handle',
        priority: 300,
        value: developerModeValue,
      }),
    }

    if (!clippedResizeHandleBounds) {
      return (
        <button
          key={`resize-handle-${columnId}`}
          {...interactiveProps}
          className={fullResizeHandleClassName}
          data-column-resize-column={columnId}
          data-column-resize-segment="full"
          ref={node => {
            assignResizeHandleRef('full', node)
          }}
          style={{ bottom: 0, left, top: 0 }}
          type="button"
        />
      )
    }

    const segmentNodes: ReactNode[] = []

    if (clippedResizeHandleBounds.top > 0) {
      segmentNodes.push(
        <button
          key={`resize-handle-${columnId}-top`}
          {...interactiveProps}
          data-column-resize-column={columnId}
          data-column-resize-segment="top"
          ref={node => {
            assignResizeHandleRef('top', node)
          }}
          style={{
            height: clippedResizeHandleBounds.top,
            left,
            top: 0,
          }}
          type="button"
        />,
      )
    }

    if (
      clippedResizeHandleBounds.bottom < clippedResizeHandleBounds.contentHeight
    ) {
      const bottomSegmentHeight = Math.min(
        MAX_EXPANDED_DETAIL_RESIZE_GRIP_HEIGHT,
        clippedResizeHandleBounds.contentHeight -
          clippedResizeHandleBounds.bottom,
      )

      if (bottomSegmentHeight <= 0) {
        return (
          <Fragment key={`resize-handle-${columnId}`}>{segmentNodes}</Fragment>
        )
      }

      segmentNodes.push(
        <div
          aria-hidden="true"
          className={pointerResizeSegmentClassName}
          data-column-resize-column={columnId}
          data-column-resize-role="pointer"
          data-column-resize-segment="bottom"
          key={`resize-handle-${columnId}-bottom`}
          onDoubleClick={event => {
            event.preventDefault()
            event.stopPropagation()
            resetColumnWidth(columnId)
          }}
          onMouseEnter={() => setResizeHoverCursor(true)}
          onMouseLeave={() => setResizeHoverCursor(false)}
          onPointerDown={event => handleResizePointerDown(columnId, event)}
          ref={node => {
            assignResizeHandleRef('bottom', node)
          }}
          style={{
            height: bottomSegmentHeight,
            left,
            top: clippedResizeHandleBounds.bottom,
          }}
        />,
      )
    }

    return <Fragment key={`resize-handle-${columnId}`}>{segmentNodes}</Fragment>
  }

  return (
    <div
      className={`relative scroll-mt-20 ${
        isThemesMode ? 'rounded-2xl bg-(--color-panel)' : ''
      }`}
      data-requirements-table-visual-mode={visualMode}
      ref={tableRootRef}
    >
      {showSpinner && (
        <output
          aria-live="polite"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-white/70 backdrop-blur-[2px] dark:bg-[#111113]/70"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600 dark:border-primary-700 dark:border-t-primary-400" />
          <p className="text-secondary-600 dark:text-secondary-400">
            {tc('loadingRequirements')}
          </p>
        </output>
      )}
      {floatingRail}
      <div
        className={stickyTableChromeClassName}
        data-sticky-table-chrome="true"
      >
        {(stickyTitle || stickyTitleActions || inlineFloatingRail) && (
          <div
            className={stickyTopBarClassName}
            data-requirements-sticky-top-bar="true"
          >
            <div className="min-w-0 flex-1">{stickyTitle}</div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap sm:shrink-0">
              {stickyTitleActions}
              {inlineFloatingRail}
            </div>
          </div>
        )}
        {requirementPackages.length > 0 && hasFilters && (
          <div
            className={`flex items-center gap-2 border-b px-4 py-2 text-sm ${
              isThemesMode
                ? 'border-(--gray-a5) bg-(--gray-2)'
                : 'border-secondary-950/10 bg-white/95 backdrop-blur-sm dark:border-white/10 dark:bg-[#151518]/95'
            }`}
          >
            <span
              className={`shrink-0 text-xs font-semibold ${
                isThemesMode
                  ? 'text-(--gray-12)'
                  : 'text-secondary-700 dark:text-secondary-300'
              }`}
            >
              {t('requirementPackage')}:
            </span>
            <div className="flex min-w-0 flex-1 flex-nowrap gap-1 overflow-x-auto overflow-y-hidden py-0.5">
              {requirementPackages.map(s => {
                const active = (fv.requirementPackageIds ?? []).includes(s.id)
                const purposeAndScope = requirementPackagePurposeAndScope(s)
                return (
                  <RequirementPackagePurposeTooltip
                    key={s.id}
                    maxWidth={280}
                    purposeAndScope={purposeAndScope}
                    wrapperClassName="inline-flex shrink-0"
                  >
                    <button
                      aria-label={requirementPackageName(s)}
                      aria-pressed={active}
                      className={`inline-flex min-h-11 min-w-11 max-w-48 shrink-0 items-center rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                        active
                          ? isThemesMode
                            ? 'bg-(--accent-9) text-(--accent-contrast)'
                            : 'bg-secondary-950 text-white dark:bg-white dark:text-[#111113]'
                          : isThemesMode
                            ? 'bg-(--gray-a3) text-(--gray-12) hover:bg-(--accent-a3) hover:text-(--accent-12)'
                            : 'bg-[#f6f5f8] text-secondary-700 hover:bg-violet-50 hover:text-violet-800 dark:bg-[#1c1c20] dark:text-secondary-300 dark:hover:bg-violet-400/10 dark:hover:text-violet-200'
                      }`}
                      data-requirement-package={s.id}
                      onClick={() => {
                        const current = fv.requirementPackageIds ?? []
                        const next = active
                          ? current.filter(id => id !== s.id)
                          : [...current, s.id]
                        updateFilter({
                          requirementPackageIds:
                            next.length > 0 ? next : undefined,
                        })
                      }}
                      type="button"
                    >
                      <span className="truncate">
                        {requirementPackageName(s)}
                      </span>
                    </button>
                  </RequirementPackagePurposeTooltip>
                )
              })}
            </div>
            {(fv.requirementPackageIds ?? []).length > 0 && (
              <button
                aria-label={tc('clearFilters')}
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-xs text-secondary-400 transition-colors hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                onClick={() =>
                  updateFilter({ requirementPackageIds: undefined })
                }
                type="button"
              >
                <X aria-hidden="true" className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
        {normReferences.length > 0 &&
          visibleColumnSet.has('normReferences') && (
            <div
              className={`flex items-center gap-2 border-b px-4 py-2 text-sm ${
                isThemesMode
                  ? 'border-(--gray-a5) bg-(--gray-2)'
                  : 'border-secondary-950/10 bg-white/95 backdrop-blur-sm dark:border-white/10 dark:bg-[#151518]/95'
              }`}
            >
              <span
                className={`shrink-0 text-xs font-semibold ${
                  isThemesMode
                    ? 'text-(--gray-12)'
                    : 'text-secondary-700 dark:text-secondary-300'
                }`}
              >
                {t('normReferences')}:
              </span>
              <div className="flex min-w-0 flex-1 flex-nowrap gap-1 overflow-x-auto">
                {normReferences.map(nr => {
                  const active = (fv.normReferenceIds ?? []).includes(nr.id)
                  return (
                    <button
                      aria-label={`${nr.normReferenceId} ${nr.name}`}
                      aria-pressed={active}
                      className={`min-h-11 min-w-11 shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                        active
                          ? isThemesMode
                            ? 'bg-(--accent-9) text-(--accent-contrast)'
                            : 'bg-secondary-950 text-white dark:bg-white dark:text-[#111113]'
                          : isThemesMode
                            ? 'bg-(--gray-a3) text-(--gray-12) hover:bg-(--accent-a3) hover:text-(--accent-12)'
                            : 'bg-[#f6f5f8] text-secondary-700 hover:bg-violet-50 hover:text-violet-800 dark:bg-[#1c1c20] dark:text-secondary-300 dark:hover:bg-violet-400/10 dark:hover:text-violet-200'
                      }`}
                      key={nr.id}
                      onClick={() => {
                        const current = fv.normReferenceIds ?? []
                        const next = active
                          ? current.filter(id => id !== nr.id)
                          : [...current, nr.id]
                        updateFilter({
                          normReferenceIds: next.length > 0 ? next : undefined,
                        })
                      }}
                      title={nr.name}
                      type="button"
                    >
                      {nr.normReferenceId}
                    </button>
                  )
                })}
              </div>
              {(fv.normReferenceIds ?? []).length > 0 && (
                <button
                  aria-label={tc('clearFilters')}
                  className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-xs text-secondary-400 transition-colors hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  onClick={() => updateFilter({ normReferenceIds: undefined })}
                  type="button"
                >
                  <X aria-hidden="true" className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        <div
          className={`overflow-hidden border-b ${
            isThemesMode
              ? 'border-(--gray-a6) bg-(--gray-3)'
              : 'border-secondary-950/10 bg-[#f6f5f8] dark:border-white/10 dark:bg-[#18181b]'
          }`}
        >
          <div
            className="relative"
            data-sticky-table-header="true"
            ref={stickyHeaderContentRef}
            style={{ width: `${tableWidth}px`, willChange: 'transform' }}
          >
            <table
              className="w-full table-fixed text-sm"
              data-sticky-table-header-table="true"
              role="presentation"
            >
              <colgroup>
                {selectable && <col style={{ width: '36px' }} />}
                {columnDefinitions.map(column => (
                  <col
                    key={`sticky-header-column-${column.id}`}
                    ref={node => {
                      stickyHeaderColRefs.current[column.id] = node
                    }}
                    style={{ width: `${renderedColumnWidths[column.id]}px` }}
                  />
                ))}
              </colgroup>
              {renderTableHeader('interactive')}
            </table>
          </div>
        </div>
      </div>
      <div
        className={`relative overflow-x-auto ${
          isThemesMode ? 'bg-(--color-panel)' : 'bg-white dark:bg-[#111113]'
        }`}
        {...devMarker({
          context: 'requirements table',
          name: 'table space',
          priority: 330,
        })}
        data-requirements-scroll-container="true"
        ref={scrollContainerRef}
      >
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-linear-to-r ${
            isThemesMode
              ? 'from-(--color-panel) via-(--gray-a3) to-transparent'
              : 'from-white/90 via-white/55 to-transparent dark:from-[#111113]/90 dark:via-[#111113]/55'
          } transition-opacity ${
            scrollFadeState.left ? 'opacity-100' : 'opacity-0'
          }`}
          data-scroll-fade="left"
        />
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-linear-to-l ${
            isThemesMode
              ? 'from-(--color-panel) via-(--gray-a3) to-transparent'
              : 'from-white/90 via-white/55 to-transparent dark:from-[#111113]/90 dark:via-[#111113]/55'
          } transition-opacity ${
            scrollFadeState.right ? 'opacity-100' : 'opacity-0'
          }`}
          data-scroll-fade="right"
        />
        <div
          className="relative"
          ref={tableContentRef}
          style={{ width: `${tableWidth}px` }}
        >
          {shouldRenderResizeHandles
            ? resizeHandleOffsets.map(({ columnId, left }) => {
                const label = getColumnLabel(columnId)

                return renderResizeHandle(columnId, left, label)
              })
            : null}
          <table
            className="w-full table-fixed text-sm"
            {...devMarker({ name: 'requirements table', priority: 320 })}
            data-requirements-data-table="true"
            ref={tableRef}
          >
            <caption className="sr-only">{t('tableCaption')}</caption>
            <colgroup>
              {selectable && <col style={{ width: '36px' }} />}
              {columnDefinitions.map(column => (
                <col
                  key={column.id}
                  ref={node => {
                    colRefs.current[column.id] = node
                  }}
                  style={{ width: `${renderedColumnWidths[column.id]}px` }}
                />
              ))}
            </colgroup>
            {renderTableHeader('semantic')}
            <tbody
              className={`${showSpinner ? 'opacity-40' : ''} ${loading ? 'pointer-events-none' : ''}`}
            >
              {shouldShowEmptyState ? (
                <tr>
                  <td
                    className="py-12 text-center text-secondary-600 dark:text-secondary-400"
                    colSpan={columnDefinitions.length + (selectable ? 1 : 0)}
                  >
                    <span aria-live="polite" role="status">
                      {tc('noResults')}
                    </span>
                  </td>
                </tr>
              ) : rows.length > 0 ? (
                rows.map((row, idx) => {
                  const isExpanded = row.id === expandedId
                  const isPinned = pinnedIds?.has(row.id) ?? false

                  return (
                    <Fragment key={row.id}>
                      <tr
                        className={`cursor-pointer border-b transition-colors ${
                          isThemesMode
                            ? 'border-(--gray-a4) hover:bg-(--accent-a2)'
                            : 'border-secondary-950/[0.07] hover:bg-[#f8f5ff] dark:border-white/8 dark:hover:bg-[#1b1624]'
                        } ${
                          isExpanded
                            ? isThemesMode
                              ? 'border-l-4 border-l-(--accent-9) bg-(--accent-a3)'
                              : 'border-l-2 border-l-violet-500 bg-[#f4efff] dark:bg-[#21172f]'
                            : ''
                        } ${
                          !isExpanded && isPinned
                            ? isThemesMode
                              ? 'border-l-4 border-l-dashed border-l-(--gray-a9) opacity-70'
                              : 'border-l-2 border-l-dashed border-l-secondary-500 opacity-60 dark:border-l-secondary-500'
                            : ''
                        } ${
                          !isExpanded && !isPinned && idx % 2 === 1
                            ? isThemesMode
                              ? 'bg-(--gray-a2)'
                              : 'bg-[#fbfbfd] dark:bg-[#151518]'
                            : ''
                        }`}
                        {...devMarker({
                          context: 'requirements table',
                          name: 'table row',
                          priority: 300,
                          value: row.uniqueId,
                        })}
                        onClick={event => handleBodyRowClick(event, row.id)}
                      >
                        {selectable && (
                          <td className="w-9 px-1 py-2 text-center align-middle">
                            <input
                              aria-label={tc('selectRow', { id: row.uniqueId })}
                              checked={selectedIds?.has(row.id) ?? false}
                              className="h-4 w-4 rounded border-secondary-300 accent-primary-600 cursor-pointer"
                              {...devMarker({
                                context: 'requirements table',
                                name: 'row checkbox',
                                priority: 300,
                                value: row.uniqueId,
                              })}
                              onChange={e => {
                                e.stopPropagation()
                                if (!onSelectionChange) return
                                const next = new Set(selectedIds ?? [])
                                if (e.target.checked) {
                                  next.add(row.id)
                                } else {
                                  next.delete(row.id)
                                }
                                onSelectionChange(next)
                              }}
                              onClick={e => e.stopPropagation()}
                              type="checkbox"
                            />
                          </td>
                        )}
                        {columnDefinitions.map((column, columnIndex) => (
                          <Fragment key={column.id}>
                            {renderCell(
                              row,
                              column.id,
                              columnIndex === columnDefinitions.length - 1,
                            )}
                          </Fragment>
                        ))}
                      </tr>
                      {isExpanded && renderExpanded && (
                        <tr>
                          <td
                            className="border-b border-l-2 border-l-violet-500 border-secondary-950/[0.07] bg-[#f8f7fb] p-0 dark:border-white/8 dark:bg-[#151518]"
                            colSpan={
                              columnDefinitions.length + (selectable ? 1 : 0)
                            }
                            {...devMarker({
                              context: 'requirements table',
                              name: 'inline detail pane',
                              priority: 360,
                              value: row.uniqueId,
                            })}
                            data-expanded-detail-cell="true"
                            id={`requirement-row-detail-${row.id}`}
                            ref={expandedDetailCellRef}
                          >
                            <div
                              className="sticky left-0 box-border overflow-hidden"
                              style={
                                scrollContainerWidth
                                  ? {
                                      contain: 'inline-size',
                                      maxWidth: scrollContainerWidth,
                                      width: scrollContainerWidth,
                                    }
                                  : {
                                      contain: 'inline-size',
                                      maxWidth: '100vw',
                                    }
                              }
                            >
                              {renderExpanded(row.id)}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      {hasMore && (
        <div
          aria-hidden="true"
          className="h-10 flex items-center justify-center"
          ref={sentinelRef}
        >
          {loadingMore && (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600 dark:border-primary-700 dark:border-t-primary-400" />
          )}
        </div>
      )}
    </div>
  )
}
