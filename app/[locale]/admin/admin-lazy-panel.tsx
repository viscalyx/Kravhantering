'use client'

import { useTranslations } from 'next-intl'
import type { ErrorInfo, ReactNode } from 'react'
import { Component, Suspense } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

interface AdminPanelErrorBoundaryProps {
  children: ReactNode
  description: string
  retryLabel: string
  tabId: string
  title: string
}

interface AdminPanelErrorBoundaryState {
  hasError: boolean
}

class AdminPanelErrorBoundary extends Component<
  AdminPanelErrorBoundaryProps,
  AdminPanelErrorBoundaryState
> {
  state: AdminPanelErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AdminPanelErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Failed to load Admin Center panel', {
      componentStack: info.componentStack,
      error,
      tabId: this.props.tabId,
    })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <section
        aria-labelledby={`${this.props.tabId}-tab`}
        className="rounded-4xl border border-red-200/80 bg-white/90 p-6 shadow-sm dark:border-red-900/70 dark:bg-secondary-900/80"
        id={`${this.props.tabId}-panel`}
        role="tabpanel"
        {...devMarker({
          context: 'admin center',
          name: 'panel load error',
          priority: 360,
          value: this.props.tabId,
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
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-primary-700 px-4 py-2 text-sm font-medium text-white hover:bg-primary-800"
            onClick={() => window.location.reload()}
            type="button"
          >
            {this.props.retryLabel}
          </button>
        </div>
      </section>
    )
  }
}

function AdminPanelLoading({ tabId, tabLabel }: AdminLazyPanelProps) {
  const t = useTranslations('admin')

  return (
    <section
      aria-labelledby={`${tabId}-tab`}
      className="rounded-4xl border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80"
      id={`${tabId}-panel`}
      role="tabpanel"
      {...devMarker({
        context: 'admin center',
        name: 'panel loading',
        priority: 340,
        value: tabId,
      })}
    >
      <div className="flex min-h-40 items-center justify-center" role="status">
        <span className="text-sm text-secondary-600 dark:text-secondary-300">
          {t('panelLoading', { tab: tabLabel })}
        </span>
      </div>
    </section>
  )
}

interface AdminLazyPanelProps {
  children?: ReactNode
  tabId: string
  tabLabel: string
}

export default function AdminLazyPanel({
  children,
  tabId,
  tabLabel,
}: AdminLazyPanelProps) {
  const t = useTranslations('admin')

  return (
    <AdminPanelErrorBoundary
      description={t('panelLoadError.description')}
      key={tabId}
      retryLabel={t('panelLoadError.retry')}
      tabId={tabId}
      title={t('panelLoadError.title', { tab: tabLabel })}
    >
      <Suspense
        fallback={<AdminPanelLoading tabId={tabId} tabLabel={tabLabel} />}
      >
        {children}
      </Suspense>
    </AdminPanelErrorBoundary>
  )
}
