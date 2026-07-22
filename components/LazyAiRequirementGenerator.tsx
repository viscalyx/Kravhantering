'use client'

import { useTranslations } from 'next-intl'
import { lazy } from 'react'
import type { AiRequirementGeneratorProps } from '@/components/AiRequirementGenerator'
import OnDemandFeatureDialog from '@/components/OnDemandFeatureDialog'
import { restoreFocus } from '@/lib/restore-focus'

const AiRequirementGenerator = lazy(
  () => import('@/components/AiRequirementGenerator'),
)

interface LazyAiRequirementGeneratorProps
  extends Omit<AiRequirementGeneratorProps, 'embedded' | 'onClose'> {
  onClose: () => void
  returnFocusTarget?: HTMLElement | null
}

export default function LazyAiRequirementGenerator({
  onClose,
  open,
  returnFocusTarget,
  ...props
}: LazyAiRequirementGeneratorProps) {
  const t = useTranslations('ai')
  const tc = useTranslations('common')
  const tl = useTranslations('onDemandFeature')

  if (!open) return null

  const closeAndRestoreFocus = () => {
    onClose()
    restoreFocus(returnFocusTarget)
  }

  return (
    <OnDemandFeatureDialog
      closeLabel={tc('close')}
      errorDescription={tl('aiAuthoring.loadErrorDescription')}
      errorTitle={tl('aiAuthoring.loadErrorTitle')}
      featureId="ai-authoring"
      loadingLabel={tl('aiAuthoring.loading')}
      onErrorClose={closeAndRestoreFocus}
      reloadLabel={tl('reloadPage')}
      title={t('generateTitle')}
      variant="ai"
    >
      <AiRequirementGenerator
        {...props}
        embedded
        onClose={closeAndRestoreFocus}
        open
      />
    </OnDemandFeatureDialog>
  )
}
