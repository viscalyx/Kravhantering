'use client'

// THROWAWAY #1359: three layouts plus the original on /admin?variant=0|A|B|C.
// Question: which header and column-row structure best balances density and clarity?
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import PrototypeSwitcher from '@/components/PrototypeSwitcher'
import { useRouter } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import styles from './admin-layout-prototype.module.css'

export const adminPrototypeEnabled =
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PUBLIC_ADMIN_LAYOUT_PROTOTYPE === 'true'

type PrototypeContext = {
  variant: string
  longLabels: boolean
  reportState: (state: string) => void
}
const Context = createContext<PrototypeContext | null>(null)
export const useAdminPrototype = () => useContext(Context)

export default function AdminLayoutPrototype({
  children,
  activeTab,
}: {
  children: ReactNode
  activeTab: string
}) {
  const t = useTranslations('adminLayoutPrototype')
  const params = useSearchParams()
  const router = useRouter()
  const requested = params.get('variant') ?? 'A'
  const variant = ['0', 'A', 'B', 'C'].includes(requested) ? requested : 'A'
  const [state, setState] = useState('{}')
  const [inspect, setInspect] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [longLabels, setLongLabels] = useState(false)
  const reportState = useCallback((next: string) => setState(next), [])
  const onChange = (next: string) => {
    const query = new URLSearchParams(params)
    query.set('variant', next)
    router.replace(
      { pathname: '/admin', query: Object.fromEntries(query) },
      { scroll: false },
    )
  }
  useEffect(() => {
    if (adminPrototypeEnabled)
      console.info('[Prototype #1359 state]', {
        variant,
        activeTab,
        longLabels,
        ...JSON.parse(state),
      })
  }, [variant, activeTab, longLabels, state])
  if (!adminPrototypeEnabled) return children
  return (
    <Context.Provider value={{ variant, longLabels, reportState }}>
      <div
        className={styles.surface}
        data-prototype-variant={variant}
        {...devMarker({
          name: 'prototype layout',
          value: variant,
          context: 'admin center',
        })}
      >
        {children}
      </div>
      <aside
        aria-label={t('tools')}
        className="fixed bottom-3 left-1/2 z-90 w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded-xl border border-slate-600 bg-slate-950 p-2 text-white shadow-xl"
        data-prototype-tools="true"
      >
        {hidden ? (
          <button
            className="min-h-8 px-3 text-xs"
            onClick={() => setHidden(false)}
            type="button"
          >
            {t('showTools')}
          </button>
        ) : (
          <>
            {inspect && (
              <div className="mb-2 max-h-[45vh] w-[min(42rem,calc(100vw-3rem))] overflow-auto rounded border border-slate-700 bg-slate-900 p-3 text-xs">
                <p className="mb-2 font-semibold">{t('question')}</p>
                <p className="mb-2 text-slate-300">{t('explanation')}</p>
                <pre className="whitespace-pre-wrap break-all">
                  {JSON.stringify(
                    { variant, activeTab, longLabels, ...JSON.parse(state) },
                    null,
                    2,
                  )}
                </pre>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <PrototypeSwitcher onChange={onChange} variant={variant} />
              <div className="flex items-center gap-2 text-xs">
                <button
                  aria-expanded={inspect}
                  className="min-h-8 rounded px-2 hover:bg-white/15"
                  onClick={() => setInspect(!inspect)}
                  type="button"
                >
                  {t('inspect')}
                </button>
                <label className="flex min-h-8 cursor-pointer items-center gap-1.5">
                  <input
                    checked={longLabels}
                    onChange={e => setLongLabels(e.target.checked)}
                    type="checkbox"
                  />
                  {t('longLabels')}
                </label>
                <button
                  className="min-h-8 rounded px-2 hover:bg-white/15"
                  onClick={() => window.location.reload()}
                  type="button"
                >
                  {t('reload')}
                </button>
                <button
                  className="min-h-8 rounded px-2 hover:bg-white/15"
                  onClick={() => setHidden(true)}
                  type="button"
                >
                  {t('hide')}
                </button>
              </div>
            </div>
            <p
              className="mt-1 text-center text-[11px] text-slate-300"
              role="status"
            >
              {t('memoryOnly')} · {t(`notes.${variant}`)}
            </p>
          </>
        )}
      </aside>
    </Context.Provider>
  )
}
