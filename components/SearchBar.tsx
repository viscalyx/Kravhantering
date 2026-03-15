'use client'

import { Search, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useState } from 'react'

interface SearchBarProps {
  onChange: (value: string) => void
  value: string
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  const t = useTranslations('common')
  const [localValue, setLocalValue] = useState(value)

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      onChange(localValue)
    },
    [localValue, onChange],
  )

  const handleClear = useCallback(() => {
    setLocalValue('')
    onChange('')
  }, [onChange])

  return (
    <form className="relative flex-1 max-w-md" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="search-requirements">
        {t('search')}
      </label>
      <Search
        aria-hidden="true"
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary-400"
      />
      <input
        className="w-full pl-10 pr-10 py-2.5 rounded-xl border bg-white dark:bg-secondary-800/50 text-sm placeholder:text-secondary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
        id="search-requirements"
        onChange={e => setLocalValue(e.target.value)}
        placeholder={`${t('search')}...`}
        type="search"
        value={localValue}
      />
      {localValue && (
        <button
          aria-label={t('clearSearch')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary-400 hover:text-secondary-600"
          onClick={handleClear}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </form>
  )
}
