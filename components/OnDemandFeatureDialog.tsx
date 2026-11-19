'use client'

import { AlertTriangle, Loader2, Sparkles } from 'lucide-react'
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  Suspense,
  useId,
  useRef,
} from 'react'
import { createPortal } from 'react-dom'
import { useModalFocus } from '@/hooks/useModalFocus'
import { devMarker } from '@/lib/developer-mode-markers'

export type OnDemandFeatureId = 'ai-authoring' | 'import-review'

interface OnDemandFeatureDialogProps {
  children: ReactNode
  closeLabel: string
  errorDescription: string
  errorTitle: string
  featureId: OnDemandFeatureId
  loadingLabel: string
  onErrorClose: () => void
  reloadLabel: string
  title: string
  variant: 'ai' | 'import'
  wide?: boolean
}

function featureContext(featureId: OnDemandFeatureId) {
  return featureId === 'ai-authoring'
    ? 'AI-assisted authoring'
    : 'requirement import review'
}

function panelClassName(
  variant: OnDemandFeatureDialogProps['variant'],
  wide: boolean,
) {
  if (variant === 'ai') {
    return 'flex max-h-[90dvh] w-full max-w-7xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-secondary-900'
  }
  return `flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-secondary-950 ${
    wide ? 'h-[calc(100dvh-2rem)] max-w-6xl' : 'max-w-xl'
  }`
}

function stateBodyClassName(variant: OnDemandFeatureDialogProps['variant']) {
  return variant === 'ai'
    ? 'flex min-h-64 flex-1 flex-col items-center justify-center gap-3 p-8 text-center'
    : 'flex min-h-64 flex-1 flex-col items-center justify-center gap-3 p-6 text-center'
}

function FeatureStatePanel({
  closeLabel,
  description,
  featureId,
  heading,
  onClose,
  reloadLabel,
  state,
  title,
  variant,
  wide = false,
}: {
  closeLabel: string
  description?: string
  featureId: OnDemandFeatureId
  heading: string
  onClose: () => void
  reloadLabel: string
  state: 'error' | 'loading'
  title: string
  variant: OnDemandFeatureDialogProps['variant']
  wide?: boolean
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  const { handleKeyDown } = useModalFocus({
    modalRef: panelRef,
    initialFocusRef: panelRef,
    open: true,
    closeDisabled: state === 'loading',
    onClose,
  })

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className={panelClassName(variant, wide)}
      onKeyDown={handleKeyDown}
      ref={panelRef}
      role="dialog"
      tabIndex={-1}
      {...devMarker({
        context: featureContext(featureId),
        name: state === 'loading' ? 'feature loading' : 'feature load error',
        priority: state === 'loading' ? 340 : 360,
        value: featureId,
      })}
    >
      <header className="flex items-center gap-3 border-b border-secondary-200 px-5 py-4 dark:border-secondary-800">
        {variant === 'ai' ? (
          <Sparkles aria-hidden="true" className="h-5 w-5 text-primary-600" />
        ) : (
          <span className="text-xs font-semibold uppercase text-primary-700 dark:text-primary-300">
            JSON
          </span>
        )}
        <h2
          className="text-lg font-semibold text-secondary-950 dark:text-secondary-50"
          id={titleId}
        >
          {title}
        </h2>
      </header>
      <div className={stateBodyClassName(variant)}>
        {state === 'loading' ? (
          <>
            <Loader2
              aria-hidden="true"
              className="h-8 w-8 motion-safe:animate-spin text-primary-600"
            />
            <p
              className="text-sm font-medium text-secondary-700 dark:text-secondary-200"
              role="status"
            >
              {heading}
            </p>
          </>
        ) : (
          <div className="max-w-lg" role="alert">
            <AlertTriangle
              aria-hidden="true"
              className="mx-auto h-8 w-8 text-red-600 dark:text-red-400"
            />
            <h3 className="mt-3 text-lg font-semibold text-red-800 dark:text-red-300">
              {heading}
            </h3>
            {description ? (
              <p className="mt-2 text-sm text-secondary-600 dark:text-secondary-300">
                {description}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-secondary-300 px-4 text-sm font-medium text-secondary-700 hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
                onClick={onClose}
                type="button"
              >
                {closeLabel}
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary-700 px-4 text-sm font-medium text-white hover:bg-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:bg-primary-600 dark:hover:bg-primary-500"
                onClick={() => window.location.reload()}
                type="button"
              >
                {reloadLabel}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface FeatureErrorBoundaryProps
  extends Omit<OnDemandFeatureDialogProps, 'children'> {
  children: ReactNode
}

interface FeatureErrorBoundaryState {
  hasError: boolean
}

class FeatureErrorBoundary extends Component<
  FeatureErrorBoundaryProps,
  FeatureErrorBoundaryState
> {
  state: FeatureErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): FeatureErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Failed to load on-demand feature', {
      componentStack: info.componentStack,
      error,
      featureId: this.props.featureId,
    })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <FeatureStatePanel
        closeLabel={this.props.closeLabel}
        description={this.props.errorDescription}
        featureId={this.props.featureId}
        heading={this.props.errorTitle}
        onClose={this.props.onErrorClose}
        reloadLabel={this.props.reloadLabel}
        state="error"
        title={this.props.title}
        variant={this.props.variant}
        wide={this.props.wide}
      />
    )
  }
}

export default function OnDemandFeatureDialog({
  children,
  closeLabel,
  errorDescription,
  errorTitle,
  featureId,
  loadingLabel,
  onErrorClose,
  reloadLabel,
  title,
  variant,
  wide = false,
}: OnDemandFeatureDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  useModalFocus({
    modalRef: containerRef,
    open: true,
    closeDisabled: true,
    onClose: onErrorClose,
  })

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm ${
        variant === 'ai' ? 'bg-secondary-900/60' : 'bg-black/40'
      }`}
      data-modal-layer=""
      ref={containerRef}
      role="presentation"
    >
      <FeatureErrorBoundary
        closeLabel={closeLabel}
        errorDescription={errorDescription}
        errorTitle={errorTitle}
        featureId={featureId}
        loadingLabel={loadingLabel}
        onErrorClose={onErrorClose}
        reloadLabel={reloadLabel}
        title={title}
        variant={variant}
        wide={wide}
      >
        <Suspense
          fallback={
            <FeatureStatePanel
              closeLabel={closeLabel}
              featureId={featureId}
              heading={loadingLabel}
              onClose={onErrorClose}
              reloadLabel={reloadLabel}
              state="loading"
              title={title}
              variant={variant}
              wide={wide}
            />
          }
        >
          {children}
        </Suspense>
      </FeatureErrorBoundary>
    </div>,
    document.body,
  )
}
