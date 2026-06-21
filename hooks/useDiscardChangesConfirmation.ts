'use client'

import { useTranslations } from 'next-intl'
import { useCallback } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'

export function useDiscardChangesConfirmation() {
  const { confirm } = useConfirmModal()
  const tc = useTranslations('common')

  return useCallback(
    (anchorEl?: HTMLElement | null) =>
      confirm({
        anchorEl: anchorEl ?? undefined,
        icon: 'caution',
        message: tc('unsavedChangesConfirm'),
        variant: 'danger',
      }),
    [confirm, tc],
  )
}
