'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import DirtyStateButton from '@/components/DirtyStateButton'
import FieldHelpButton from '@/components/FieldHelpButton'
import FormActionRow from '@/components/FormActionRow'
import ReferenceDataStatus, {
  ReferenceDataSaveHint,
} from '@/components/ReferenceDataStatus'
import RequirementFormFields, {
  type RequirementFormFieldValues,
} from '@/components/RequirementFormFields'
import type { AsyncResourceState } from '@/hooks/useAsyncResource'
import { useDiscardChangesConfirmation } from '@/hooks/useDiscardChangesConfirmation'
import {
  createReferenceDataReadiness,
  mergeReferenceDataReadiness,
  useTaxonomyOptions,
} from '@/hooks/useTaxonomyOptions'
import { createDirtySnapshot } from '@/lib/forms/dirty-state'
import { ARRAY_INPUT_MAX_ITEMS } from '@/lib/http/validation-constants'

export interface SpecificationLocalRequirementSubmitPayload {
  acceptanceCriteria: string | null
  description: string
  needsReferenceId: number | null
  normReferenceIds: number[]
  priorityLevelId: number | null
  qualityCharacteristicId: number | null
  requirementCategoryId: number | null
  requirementTypeId: number | null
  verifiable: boolean
  verificationMethod: string | null
}

interface SpecificationLocalRequirementFormProps {
  initialValue?: Partial<
    RequirementFormFieldValues & { needsReferenceId: string }
  >
  needsReferencesResource: AsyncResourceState<{ id: number; text: string }[]>
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
  onSubmit: (
    payload: SpecificationLocalRequirementSubmitPayload,
  ) => Promise<void>
  submitLabel: string
}

const EMPTY_FIELDS: RequirementFormFieldValues = {
  acceptanceCriteria: '',
  areaId: '',
  categoryId: '',
  description: '',
  normReferenceIds: [],
  qualityCharacteristicId: '',
  verifiable: false,
  priorityLevelId: '',
  requirementPackageIds: [],
  typeId: '',
  verificationMethod: '',
}

const SPECIFICATION_LOCAL_REQUIREMENT_DIRTY_OPTIONS = {
  unorderedArrayPaths: ['normReferenceIds'],
} as const

const SPECIFICATION_LOCAL_REQUIREMENT_INITIAL_VALUE_OPTIONS = {
  unorderedArrayPaths: ['fields.normReferenceIds'],
} as const

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
    ...(initial.priorityLevelId != null
      ? { priorityLevelId: initial.priorityLevelId }
      : {}),
    ...(initial.description != null
      ? { description: initial.description }
      : {}),
    ...(initial.acceptanceCriteria != null
      ? { acceptanceCriteria: initial.acceptanceCriteria }
      : {}),
    ...(initial.verifiable != null ? { verifiable: initial.verifiable } : {}),
    ...(initial.verificationMethod != null
      ? { verificationMethod: initial.verificationMethod }
      : {}),
    ...(initial.normReferenceIds != null
      ? { normReferenceIds: initial.normReferenceIds }
      : {}),
  }
}

function toSubmitPayload(
  fields: RequirementFormFieldValues,
  needsReferenceId: string,
): SpecificationLocalRequirementSubmitPayload {
  return {
    acceptanceCriteria: fields.acceptanceCriteria.trim() || null,
    description: fields.description.trim(),
    needsReferenceId: needsReferenceId ? Number(needsReferenceId) : null,
    normReferenceIds: fields.normReferenceIds,
    qualityCharacteristicId: fields.qualityCharacteristicId
      ? Number(fields.qualityCharacteristicId)
      : null,
    requirementCategoryId: fields.categoryId ? Number(fields.categoryId) : null,
    requirementTypeId: fields.typeId ? Number(fields.typeId) : null,
    verifiable: fields.verifiable,
    priorityLevelId: fields.priorityLevelId
      ? Number(fields.priorityLevelId)
      : null,
    verificationMethod: fields.verifiable
      ? fields.verificationMethod.trim() || null
      : null,
  }
}

function createSubmitSignature(
  fields: RequirementFormFieldValues,
  needsReferenceId: string,
) {
  return createDirtySnapshot(
    toSubmitPayload(fields, needsReferenceId),
    SPECIFICATION_LOCAL_REQUIREMENT_DIRTY_OPTIONS,
  )
}

function createInitialValueSignature(
  fields: RequirementFormFieldValues,
  needsReferenceId: string,
) {
  return createDirtySnapshot(
    { fields, needsReferenceId },
    SPECIFICATION_LOCAL_REQUIREMENT_INITIAL_VALUE_OPTIONS,
  )
}

export default function SpecificationLocalRequirementForm({
  initialValue,
  needsReferencesResource,
  onCancel,
  onDirtyChange,
  onSubmit,
  submitLabel,
}: SpecificationLocalRequirementFormProps) {
  const tc = useTranslations('common')
  const tp = useTranslations('specification')
  const confirmDiscardChanges = useDiscardChangesConfirmation()

  const initialFields = toFieldValues(initialValue)
  const initialNeedsReferenceId = initialValue?.needsReferenceId ?? ''
  const initialValueSignature = createInitialValueSignature(
    initialFields,
    initialNeedsReferenceId,
  )
  const initialValueRef = useRef(initialValue)
  initialValueRef.current = initialValue

  const [fields, setFields] = useState<RequirementFormFieldValues>(
    () => initialFields,
  )
  const [needsReferenceId, setNeedsReferenceId] = useState(
    initialNeedsReferenceId,
  )
  const [baselineSignature, setBaselineSignature] = useState(() =>
    createSubmitSignature(initialFields, initialNeedsReferenceId),
  )
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [needsRefHelpOpen, setNeedsRefHelpOpen] = useState(false)
  const appliedInitialValueSignatureRef = useRef(initialValueSignature)

  const taxonomyOptions = useTaxonomyOptions(
    fields.typeId,
    initialFields.normReferenceIds,
    { variant: 'specificationLocal' },
  )
  const referenceDataReadiness = mergeReferenceDataReadiness(
    taxonomyOptions.readiness,
    createReferenceDataReadiness([
      {
        catalog: 'needsReferences',
        resource: needsReferencesResource,
      },
    ]),
  )
  const referenceDataStatusId = useId()
  const referenceDataSaveHintId = useId()
  const needsReferences = needsReferencesResource.data ?? []

  useEffect(() => {
    if (appliedInitialValueSignatureRef.current === initialValueSignature) {
      return
    }

    appliedInitialValueSignatureRef.current = initialValueSignature
    const nextInitialValue = initialValueRef.current
    const nextFields = toFieldValues(nextInitialValue)
    const nextNeedsReferenceId = nextInitialValue?.needsReferenceId ?? ''
    setFields(nextFields)
    setNeedsReferenceId(nextNeedsReferenceId)
    setBaselineSignature(
      createSubmitSignature(nextFields, nextNeedsReferenceId),
    )
    setNeedsRefHelpOpen(false)
  }, [initialValueSignature])

  const formDirty =
    baselineSignature !== createSubmitSignature(fields, needsReferenceId)
  const associationSelectionsValid =
    fields.normReferenceIds.length <= ARRAY_INPUT_MAX_ITEMS

  useEffect(() => {
    onDirtyChange?.(formDirty)
  }, [formDirty, onDirtyChange])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (
      !formDirty ||
      !associationSelectionsValid ||
      !referenceDataReadiness.canSave
    ) {
      return
    }
    setError(null)
    setIsSubmitting(true)

    try {
      await onSubmit(toSubmitPayload(fields, needsReferenceId))
      setBaselineSignature(createSubmitSignature(fields, needsReferenceId))
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

  const handleCancel = async (anchorEl?: HTMLElement | null) => {
    if (isSubmitting) return
    if (formDirty && !(await confirmDiscardChanges(anchorEl))) return
    onCancel()
  }

  const needsReferenceField = (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-sm font-medium" htmlFor="plr-needs-reference">
          {tp('needsReference')}
        </label>
        <FieldHelpButton
          controls="help-plr-needs-reference"
          expanded={needsRefHelpOpen}
          label={`${tc('help')}: ${tp('needsReference')}`}
          onClick={() => setNeedsRefHelpOpen(v => !v)}
        />
      </div>
      <AnimatedHelpPanel
        id="help-plr-needs-reference"
        isOpen={needsRefHelpOpen}
      >
        {tp('needsReferenceHelp')}
      </AnimatedHelpPanel>
      <select
        aria-describedby={
          needsReferencesResource.data === undefined
            ? referenceDataStatusId
            : undefined
        }
        className="w-full rounded-xl border dark:border-secondary-600 bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
        disabled={isSubmitting || needsReferencesResource.data === undefined}
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
      <ReferenceDataStatus
        id={referenceDataStatusId}
        readiness={referenceDataReadiness}
      />

      <RequirementFormFields
        areaRequired={false}
        extraFieldsAfterPriorityLevel={needsReferenceField}
        idPrefix="plr"
        layout="sidebar"
        onChange={setFields}
        referenceDataReadiness={referenceDataReadiness}
        referenceDataStatusId={referenceDataStatusId}
        showArea={false}
        showRequirementPackages={false}
        taxonomyOptions={taxonomyOptions}
        values={fields}
      />

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <FormActionRow
        hint={
          referenceDataReadiness.canSave ? undefined : (
            <ReferenceDataSaveHint id={referenceDataSaveHintId} />
          )
        }
      >
        <DirtyStateButton
          aria-describedby={
            !associationSelectionsValid
              ? 'plr-normReferences-selection-limit'
              : referenceDataReadiness.canSave
                ? undefined
                : referenceDataSaveHintId
          }
          className="btn-primary"
          dirty={formDirty}
          disabled={
            isSubmitting ||
            !associationSelectionsValid ||
            !referenceDataReadiness.canSave
          }
          type="submit"
        >
          {isSubmitting ? tc('saving') : submitLabel}
        </DirtyStateButton>
        <button
          className="min-h-11 rounded-xl border px-4 py-2.5 text-sm text-secondary-700 dark:text-secondary-300 transition-colors hover:bg-secondary-50 dark:hover:bg-secondary-800"
          disabled={isSubmitting}
          onClick={event => void handleCancel(event.currentTarget)}
          type="button"
        >
          {tc('cancel')}
        </button>
      </FormActionRow>
    </form>
  )
}
