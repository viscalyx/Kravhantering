'use client'

import { HelpCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import RequirementFormFields, {
  type RequirementFormFieldValues,
} from '@/components/RequirementFormFields'

export interface PackageLocalRequirementSubmitPayload {
  acceptanceCriteria: string | null
  description: string
  needsReferenceId: number | null
  normReferenceIds: number[]
  qualityCharacteristicId: number | null
  requirementAreaId: number | null
  requirementCategoryId: number | null
  requirementTypeId: number | null
  requiresTesting: boolean
  riskLevelId: number | null
  scenarioIds: number[]
  verificationMethod: string | null
}

interface PackageLocalRequirementFormProps {
  initialValue?: Partial<
    RequirementFormFieldValues & { needsReferenceId: string }
  >
  needsReferences: { id: number; text: string }[]
  onCancel: () => void
  onSubmit: (payload: PackageLocalRequirementSubmitPayload) => Promise<void>
  submitLabel: string
}

const EMPTY_FIELDS: RequirementFormFieldValues = {
  acceptanceCriteria: '',
  areaId: '',
  categoryId: '',
  description: '',
  normReferenceIds: [],
  qualityCharacteristicId: '',
  requiresTesting: false,
  riskLevelId: '',
  scenarioIds: [],
  typeId: '',
  verificationMethod: '',
}

function toFieldValues(
  initial?: Partial<RequirementFormFieldValues & { needsReferenceId: string }>,
): RequirementFormFieldValues {
  if (!initial) return EMPTY_FIELDS
  return {
    ...EMPTY_FIELDS,
    ...(initial.areaId != null ? { areaId: initial.areaId } : {}),
    ...(initial.categoryId != null ? { categoryId: initial.categoryId } : {}),
    ...(initial.typeId != null ? { typeId: initial.typeId } : {}),
    ...(initial.qualityCharacteristicId != null
      ? { qualityCharacteristicId: initial.qualityCharacteristicId }
      : {}),
    ...(initial.riskLevelId != null
      ? { riskLevelId: initial.riskLevelId }
      : {}),
    ...(initial.description != null
      ? { description: initial.description }
      : {}),
    ...(initial.acceptanceCriteria != null
      ? { acceptanceCriteria: initial.acceptanceCriteria }
      : {}),
    ...(initial.requiresTesting != null
      ? { requiresTesting: initial.requiresTesting }
      : {}),
    ...(initial.verificationMethod != null
      ? { verificationMethod: initial.verificationMethod }
      : {}),
    ...(initial.normReferenceIds != null
      ? { normReferenceIds: initial.normReferenceIds }
      : {}),
    ...(initial.scenarioIds != null
      ? { scenarioIds: initial.scenarioIds }
      : {}),
  }
}

export default function PackageLocalRequirementForm({
  initialValue,
  needsReferences,
  onCancel,
  onSubmit,
  submitLabel,
}: PackageLocalRequirementFormProps) {
  const tc = useTranslations('common')
  const tp = useTranslations('package')

  const [fields, setFields] = useState<RequirementFormFieldValues>(() =>
    toFieldValues(initialValue),
  )
  const [needsReferenceId, setNeedsReferenceId] = useState(
    initialValue?.needsReferenceId ?? '',
  )
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [needsRefHelpOpen, setNeedsRefHelpOpen] = useState(false)

  useEffect(() => {
    setFields(toFieldValues(initialValue))
    setNeedsReferenceId(initialValue?.needsReferenceId ?? '')
    setNeedsRefHelpOpen(false)
  }, [initialValue])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await onSubmit({
        acceptanceCriteria: fields.acceptanceCriteria.trim() || null,
        description: fields.description.trim(),
        needsReferenceId: needsReferenceId ? Number(needsReferenceId) : null,
        normReferenceIds: fields.normReferenceIds,
        qualityCharacteristicId: fields.qualityCharacteristicId
          ? Number(fields.qualityCharacteristicId)
          : null,
        requirementAreaId: fields.areaId ? Number(fields.areaId) : null,
        requirementCategoryId: fields.categoryId
          ? Number(fields.categoryId)
          : null,
        requirementTypeId: fields.typeId ? Number(fields.typeId) : null,
        requiresTesting: fields.requiresTesting,
        riskLevelId: fields.riskLevelId ? Number(fields.riskLevelId) : null,
        scenarioIds: fields.scenarioIds,
        verificationMethod: fields.requiresTesting
          ? fields.verificationMethod.trim() || null
          : null,
      })
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : tc('error'),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const needsReferenceField = (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-sm font-medium" htmlFor="plr-needs-reference">
          {tp('needsReference')}
        </label>
        <button
          aria-controls="help-plr-needs-reference"
          aria-expanded={needsRefHelpOpen}
          aria-label={`${tc('help')}: ${tp('needsReference')}`}
          className="min-h-11 min-w-11 inline-flex items-center justify-center text-secondary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          onClick={() => setNeedsRefHelpOpen(v => !v)}
          type="button"
        >
          <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>
      <AnimatedHelpPanel
        id="help-plr-needs-reference"
        isOpen={needsRefHelpOpen}
      >
        {tp('needsReferenceHelp')}
      </AnimatedHelpPanel>
      <select
        className="w-full rounded-xl border dark:border-secondary-600 bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
        disabled={isSubmitting}
        id="plr-needs-reference"
        onChange={e => setNeedsReferenceId(e.target.value)}
        value={needsReferenceId}
      >
        <option value="">{tp('noNeedsRef')}</option>
        {needsReferences.map(nr => (
          <option key={nr.id} value={nr.id}>
            {nr.text}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <RequirementFormFields
        areaRequired={false}
        extraFieldsAfterRiskLevel={needsReferenceField}
        idPrefix="plr"
        layout="sidebar"
        onChange={setFields}
        values={fields}
      />

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button className="btn-primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? tc('saving') : submitLabel}
        </button>
        <button
          className="min-h-11 rounded-xl border px-4 py-2.5 text-sm text-secondary-700 dark:text-secondary-300 transition-colors hover:bg-secondary-50 dark:hover:bg-secondary-800"
          disabled={isSubmitting}
          onClick={onCancel}
          type="button"
        >
          {tc('cancel')}
        </button>
      </div>
    </form>
  )
}
