'use client'

import type { ReactNode } from 'react'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'

export function nullable(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function inputClassName(): string {
  return 'min-h-11 w-full rounded-xl border border-secondary-300 bg-white px-3 py-2 text-sm text-secondary-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-700 dark:bg-secondary-950 dark:text-secondary-50'
}

export function textareaClassName(): string {
  return `${inputClassName()} min-h-24`
}

export function Field({
  children,
  help,
  id,
  label,
  required = false,
}: {
  children: ReactNode
  help: ReactNode
  id: string
  label: string
  required?: boolean
}) {
  return (
    <div>
      <FieldLabelWithHelp
        help={help}
        htmlFor={id}
        label={label}
        required={required}
      />
      {children}
    </div>
  )
}

export function DialogActions({
  busy,
  cancel,
  onCancel,
  save,
}: {
  busy: boolean
  cancel: string
  onCancel: () => void
  save: string
}) {
  return (
    <div className="mt-6 flex flex-wrap justify-end gap-3">
      <button
        className="btn-secondary px-4! py-2! text-sm"
        disabled={busy}
        onClick={onCancel}
        type="button"
      >
        {cancel}
      </button>
      <button
        className="btn-primary px-4! py-2! text-sm"
        disabled={busy}
        type="submit"
      >
        {save}
      </button>
    </div>
  )
}
