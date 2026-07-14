'use client'

import { useTranslations } from 'next-intl'
import type { ErrorInfo, ReactNode } from 'react'
import { Component, Suspense } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

export type StewardshipWorkspaceId = 'norms' | 'packages' | 'questions' | 'rfi'

interface StewardshipWorkspaceErrorBoundaryProps {
  children: ReactNode
  description: string
  reloadPage: () => void
  retryLabel: string
  title: string
  workspaceId: StewardshipWorkspaceId
  workspaceLabel: string
}

interface StewardshipWorkspaceErrorBoundaryState {
  hasError: boolean
}

const workspaceHeadingClassName =
  'text-2xl font-bold text-secondary-900 dark:text-secondary-100'

class StewardshipWorkspaceErrorBoundary extends Component<
  StewardshipWorkspaceErrorBoundaryProps,
  StewardshipWorkspaceErrorBoundaryState
> {
  state: StewardshipWorkspaceErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): StewardshipWorkspaceErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Failed to load stewardship workspace', {
      componentStack: info.componentStack,
      error,
      workspaceId: this.props.workspaceId,
    })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="section-padding px-4 sm:px-6 lg:px-8">
        <div className="container-custom space-y-6">
          <h1 className={workspaceHeadingClassName}>
            {this.props.workspaceLabel}
          </h1>
          <section
            className="flex min-h-40 items-center rounded-2xl border border-red-200/80 bg-white/90 p-6 shadow-sm dark:border-red-900/70 dark:bg-secondary-900/80"
            {...devMarker({
              context: 'requirements library stewardship',
              name: 'workspace load error',
              priority: 360,
              value: this.props.workspaceId,
            })}
          >
            <div role="alert">
              <h2 className="text-xl font-semibold text-red-800 dark:text-red-300">
                {this.props.title}
              </h2>
              <p className="mt-2 text-sm text-secondary-600 dark:text-secondary-300">
                {this.props.description}
              </p>
              <button
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-primary-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:bg-primary-600 dark:hover:bg-primary-500"
                onClick={this.props.reloadPage}
                type="button"
              >
                {this.props.retryLabel}
              </button>
            </div>
          </section>
        </div>
      </div>
    )
  }
}

interface StewardshipLazyWorkspaceProps {
  children?: ReactNode
  reloadPage?: () => void
  workspaceId: StewardshipWorkspaceId
  workspaceLabel: string
}

function StewardshipWorkspaceLoading({
  workspaceId,
  workspaceLabel,
}: StewardshipLazyWorkspaceProps) {
  const t = useTranslations('stewardshipWorkspace')

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom space-y-6">
        <h1 className={workspaceHeadingClassName}>{workspaceLabel}</h1>
        <section
          className="flex min-h-40 items-center justify-center rounded-2xl border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80"
          {...devMarker({
            context: 'requirements library stewardship',
            name: 'workspace loading',
            priority: 340,
            value: workspaceId,
          })}
          role="status"
        >
          <span className="text-sm text-secondary-600 dark:text-secondary-300">
            {t('loading', { workspace: workspaceLabel })}
          </span>
        </section>
      </div>
    </div>
  )
}

export default function StewardshipLazyWorkspace({
  children,
  reloadPage = () => window.location.reload(),
  workspaceId,
  workspaceLabel,
}: StewardshipLazyWorkspaceProps) {
  const t = useTranslations('stewardshipWorkspace')

  return (
    <StewardshipWorkspaceErrorBoundary
      description={t('loadError.description')}
      key={workspaceId}
      reloadPage={reloadPage}
      retryLabel={t('loadError.retry')}
      title={t('loadError.title', { workspace: workspaceLabel })}
      workspaceId={workspaceId}
      workspaceLabel={workspaceLabel}
    >
      <Suspense
        fallback={
          <StewardshipWorkspaceLoading
            workspaceId={workspaceId}
            workspaceLabel={workspaceLabel}
          />
        }
      >
        {children}
      </Suspense>
    </StewardshipWorkspaceErrorBoundary>
  )
}
