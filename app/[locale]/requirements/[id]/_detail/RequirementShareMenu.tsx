'use client'

import { Check, CircleAlert, Share2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'
import { useDetailActionMenu } from './useDetailActionMenu'

interface RequirementShareMenuProps {
  detailContext?: string
  locale: string
  requirementUniqueId: string
  selectedVersionNumber: number | null
}

interface ShareLink {
  mode: 'inline' | 'page'
  url: string
}

export default function RequirementShareMenu({
  detailContext,
  locale,
  requirementUniqueId,
  selectedVersionNumber,
}: RequirementShareMenuProps) {
  const t = useTranslations('requirement')
  const tc = useTranslations('common')
  const [copied, setCopied] = useState<ShareLink | null>(null)
  const [failure, setFailure] = useState<{
    link: ShareLink
    repeatAnnouncement: boolean
  } | null>(null)
  const [isCopying, setIsCopying] = useState(false)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const recoveryRef = useRef<HTMLDivElement>(null)
  const shareMenu = useDetailActionMenu({
    idPrefix: 'requirement-share-menu',
    isOpen: showShareMenu,
    setIsOpen: setShowShareMenu,
  })

  useEffect(() => {
    if (!copied) return
    const timeout = setTimeout(() => setCopied(null), 2000)
    return () => clearTimeout(timeout)
  }, [copied])

  const copyLink = async (link: ShareLink) => {
    if (isCopying) return
    setIsCopying(true)
    setCopied(null)

    try {
      await navigator.clipboard.writeText(link.url)
    } catch {
      setFailure(previous => ({
        link,
        repeatAnnouncement: previous != null && !previous.repeatAnnouncement,
      }))
      return
    } finally {
      setIsCopying(false)
    }

    if (recoveryRef.current?.contains(document.activeElement)) {
      shareMenu.triggerRef.current?.focus()
    }
    setFailure(null)
    setCopied(link)
  }

  const handleShare = (mode: ShareLink['mode']) => {
    const url = new URL(window.location.href)
    url.search = ''
    if (mode === 'inline') {
      url.pathname = `/${locale}/requirements`
      url.searchParams.set('selected', requirementUniqueId)
    } else {
      const versionSuffix =
        selectedVersionNumber != null ? `/${selectedVersionNumber}` : ''
      url.pathname = `/${locale}/requirements/${requirementUniqueId}${versionSuffix}`
    }
    shareMenu.closeMenu({ restoreFocus: true })
    void copyLink({ mode, url: url.toString() })
  }

  return (
    <div className="relative" ref={shareMenu.rootRef}>
      <button
        aria-controls={shareMenu.menuId}
        aria-disabled={isCopying || undefined}
        aria-expanded={showShareMenu}
        aria-haspopup="menu"
        className="btn-secondary inline-flex items-center gap-1.5 w-full justify-center min-h-11 min-w-11 aria-disabled:cursor-wait aria-disabled:opacity-60"
        {...devMarker({
          context: detailContext,
          name: 'share toggle',
          priority: 300,
          value: 'share',
        })}
        id={shareMenu.triggerId}
        onClick={() => {
          if (!isCopying) setShowShareMenu(prev => !prev)
        }}
        ref={shareMenu.triggerRef}
        title={isCopying ? t('share.copying') : tc('share')}
        type="button"
      >
        {copied ? (
          <Check aria-hidden="true" className="h-4 w-4 text-green-500" />
        ) : (
          <Share2 aria-hidden="true" className="h-4 w-4" />
        )}
        {copied
          ? tc('copied')
          : isCopying && !failure
            ? t('share.copying')
            : tc('share')}
      </button>
      {showShareMenu && (
        <div
          aria-labelledby={shareMenu.triggerId}
          className="absolute right-0 z-20 mt-1 w-full max-w-xs rounded-xl border border-secondary-200 bg-white py-1 text-secondary-900 shadow-lg dark:border-secondary-700 dark:bg-secondary-800 dark:text-secondary-100"
          id={shareMenu.menuId}
          onKeyDown={shareMenu.handleMenuKeyDown}
          ref={shareMenu.menuRef}
          role="menu"
        >
          <button
            className="flex min-h-11 min-w-11 w-full items-center gap-2 px-3 py-2 text-left text-sm text-secondary-700 transition-colors hover:bg-secondary-50 hover:text-secondary-900 dark:text-secondary-100 dark:hover:bg-secondary-700 dark:hover:text-white"
            {...devMarker({
              context: detailContext,
              name: 'share option',
              priority: 310,
              value: 'share inline',
            })}
            onClick={() => void handleShare('inline')}
            role="menuitem"
            type="button"
          >
            {copied?.mode === 'inline' ? (
              <Check aria-hidden="true" className="h-4 w-4 text-green-500" />
            ) : (
              <Share2 aria-hidden="true" className="h-4 w-4" />
            )}
            {t('shareLinkInline')}
          </button>
          <button
            className="flex min-h-11 min-w-11 w-full items-center gap-2 px-3 py-2 text-left text-sm text-secondary-700 transition-colors hover:bg-secondary-50 hover:text-secondary-900 dark:text-secondary-100 dark:hover:bg-secondary-700 dark:hover:text-white"
            {...devMarker({
              context: detailContext,
              name: 'share option',
              priority: 310,
              value: 'share page',
            })}
            onClick={() => void handleShare('page')}
            role="menuitem"
            type="button"
          >
            {copied?.mode === 'page' ? (
              <Check aria-hidden="true" className="h-4 w-4 text-green-500" />
            ) : (
              <Share2 aria-hidden="true" className="h-4 w-4" />
            )}
            {t('shareLinkPage')}
          </button>
        </div>
      )}
      <p
        aria-atomic="true"
        aria-live="polite"
        className={
          failure
            ? 'mt-2 flex max-w-60 gap-1.5 text-sm text-red-700 dark:text-red-400'
            : 'sr-only'
        }
        {...(failure &&
          devMarker({
            context: detailContext,
            name: 'share recovery',
            priority: 310,
            value: 'copy failed',
          }))}
        role="status"
      >
        {failure ? (
          <>
            <CircleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            <span>
              {t('share.copyFailed')}
              {/* VoiceOver can skip identical consecutive status messages. */}
              {failure.repeatAnnouncement ? '\u00a0' : null}
            </span>
          </>
        ) : copied ? (
          tc('copied')
        ) : null}
      </p>
      {failure && (
        <div className="mt-2 grid gap-2" ref={recoveryRef}>
          <label className="grid min-w-0 gap-1 text-sm text-secondary-900 dark:text-secondary-100">
            {t('share.urlLabel')}
            <input
              className="block min-h-11 w-full min-w-0 rounded-lg border border-secondary-300 bg-white px-2 text-sm focus-visible:outline-2 focus-visible:outline-primary-500 dark:border-secondary-700 dark:bg-secondary-900"
              {...devMarker({
                context: detailContext,
                name: 'share recovery',
                priority: 310,
                value: 'share URL',
              })}
              readOnly
              value={failure.link.url}
            />
          </label>
          <button
            aria-disabled={isCopying || undefined}
            className="btn-secondary min-h-11 min-w-11 w-full aria-disabled:cursor-wait aria-disabled:opacity-60"
            {...devMarker({
              context: detailContext,
              name: 'share recovery',
              priority: 310,
              value: 'retry copy',
            })}
            onClick={() => void copyLink(failure.link)}
            title={isCopying ? t('share.copying') : undefined}
            type="button"
          >
            {isCopying ? t('share.copying') : tc('retry')}
          </button>
        </div>
      )}
    </div>
  )
}
