'use client'

import { Info } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'

// Throwaway, read-only area information for prototype A.
export default function PrototypeAreaInfo({
  areaId,
  name,
  ownerName,
}: {
  areaId: number
  name: string
  ownerName: string | null
}) {
  const t = useTranslations('prototype1348')
  const tr = useTranslations('requirement')
  const tc = useTranslations('common')
  const id = useId()
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [position, setPosition] = useState({ left: 16, top: 16 })

  async function loadDescription() {
    setLoading(true)
    setFailed(false)
    try {
      const response = await apiFetch(`/api/requirement-areas/${areaId}`)
      if (!response.ok) throw new Error('Area read failed')
      const data = await response.json()
      setDescription(data.area.description?.trim() || '')
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="inline-flex items-center gap-1">
      {name}
      <button
        aria-controls={id}
        aria-expanded={open}
        aria-label={t('areaInfo', { name })}
        className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full text-secondary-500 hover:bg-secondary-100 focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-secondary-400 dark:hover:bg-secondary-800"
        onClick={event => {
          const rect = event.currentTarget.getBoundingClientRect()
          setPosition({
            left: Math.max(16, Math.min(rect.left, window.innerWidth - 352)),
            top: rect.bottom + 8,
          })
          if (!open) void loadDescription()
        }}
        popoverTarget={id}
        type="button"
        {...devMarker({
          context: 'requirement detail prototype',
          name: 'area information button',
          priority: 355,
        })}
      >
        <Info aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      <section
        aria-label={t('areaInfo', { name })}
        className="fixed m-0 max-h-[50vh] w-84 max-w-[calc(100vw-32px)] overflow-auto rounded-lg border border-secondary-200 bg-white p-4 text-sm leading-5 text-secondary-800 shadow-lg dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100"
        id={id}
        onToggle={event => setOpen(event.newState === 'open')}
        popover="auto"
        style={position}
        {...devMarker({
          context: 'requirement detail prototype',
          name: 'area information panel',
          priority: 355,
        })}
      >
        <p className="mb-2 font-semibold">{name}</p>
        <p className="whitespace-pre-wrap" role="status">
          {loading
            ? t('areaInfoLoading')
            : failed
              ? t('areaInfoError')
              : description || t('areaDescriptionEmpty')}
        </p>
        <dl className="mt-3 border-t border-secondary-200 pt-3 dark:border-secondary-700">
          <dt className="text-xs text-secondary-500 dark:text-secondary-400">
            {tr('areaOwner')}
          </dt>
          <dd className="mt-1">{ownerName || tc('noneAvailable')}</dd>
        </dl>
      </section>
    </div>
  )
}
