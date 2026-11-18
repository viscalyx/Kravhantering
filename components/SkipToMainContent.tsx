'use client'

import { useTranslations } from 'next-intl'
import { devMarker } from '@/lib/developer-mode-markers'

function focusMainContent() {
  const main = document.getElementById('main-content')
  if (!main) return

  // Keep real focus until the user moves on, without making later content
  // clicks reset the browser's sequential keyboard navigation to main.
  const restoreFocusBehavior = () => {
    main.removeAttribute('tabindex')
    main.removeEventListener('blur', restoreFocusBehavior)
    main.removeEventListener('pointerdown', restoreFocusBehavior)
  }
  main.tabIndex = -1
  main.addEventListener('blur', restoreFocusBehavior)
  main.addEventListener('pointerdown', restoreFocusBehavior)
  main.focus()
}

export default function SkipToMainContent() {
  const t = useTranslations('common')

  return (
    // biome-ignore lint/a11y/useValidAnchor: This is native fragment navigation; the handler adds focus without cancelling navigation.
    <a
      {...devMarker({
        context: 'navigation',
        name: 'link',
        value: 'skip to main content',
      })}
      aria-label={t('skipToMainContent')}
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-100 focus:max-w-[calc(100vw-1.5rem)] focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-secondary-950 focus:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700 dark:focus:bg-secondary-950 dark:focus:text-white dark:focus-visible:outline-primary-300"
      href="#main-content"
      onClick={focusMainContent}
    >
      {t('skipToMainContent')}
    </a>
  )
}
