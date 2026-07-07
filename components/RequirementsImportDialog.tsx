'use client'

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Download,
  FileInput,
  FileJson,
  Info,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import {
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useConfirmModal } from '@/components/ConfirmModal'
import NormReferenceModal, {
  type NormReferenceFormData,
} from '@/components/NormReferenceModal'
import QualityCharacteristicSelectOptions from '@/components/QualityCharacteristicSelectOptions'
import RequiredFieldMarker from '@/components/RequiredFieldMarker'
import RequirementPackagePurposeTooltip from '@/components/RequirementPackagePurposeTooltip'
import { downloadBlob } from '@/lib/browser-download'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import {
  type ImportRequirementsPayload,
  REQUIREMENTS_IMPORT_SCHEMA_VERSION,
  requirementsImportPayloadSchema,
} from '@/lib/requirements/import-schema'
import { createUtf8BomBlob } from '@/lib/text-export'

type ImportMode = 'library' | 'specification-local'
type ReviewTab = 'needsReferenceProposals' | 'proposals' | 'requirements'
type AssociationPickerKind = 'normReferences' | 'requirementPackages'

interface AreaOption {
  id: number
  name: string
  permissions?: { canAuthor?: boolean }
  prefix?: string
}

interface NeedsReferenceOption {
  description?: string | null
  id: number
  text: string
}

interface TaxonomyOption {
  id: number
  nameEn: string
  nameSv: string
}

interface PriorityLevelOption extends TaxonomyOption {
  assessmentCriteriaEn: string
  assessmentCriteriaSv: string
  code: string
  color?: string
  descriptionEn: string
  descriptionSv: string
}

interface QualityCharacteristicOption extends TaxonomyOption {
  parentId: number | null
  requirementTypeId: number
}

interface RequirementPackageOption {
  id: number
  name: string
  purposeAndScope: string
}

interface NormReferenceOption {
  id: number
  name: string
  normReferenceId: string
}

interface ImportMessage {
  code: string
  field?: string
  level: 'error' | 'info' | 'warning'
  message: string
  originalValue?: string
}

interface ImportPreviewRow {
  errors: ImportMessage[]
  infos?: ImportMessage[]
  labels?: {
    category: string | null
    priorityLevel: string | null
    qualityCharacteristic: string | null
    type: string | null
  }
  proposedNeedsReferenceKey: string | null
  proposedNormReferenceKeys: string[]
  reviewRowId: string
  selected: boolean
  sourceIndex: number
  values: ImportReviewValues
  warnings: ImportMessage[]
}

interface ImportReviewValues {
  acceptanceCriteria: string | null
  categoryId: number | null
  description: string
  needsReferenceId: number | null
  normReferenceIds: number[]
  priorityLevelId: number | null
  qualityCharacteristicId: number | null
  requirementPackageIds: number[]
  typeId: number | null
  verifiable: boolean
  verificationMethod: string | null
}

interface ImportProposalPreview {
  issuer: string
  key: string
  name: string
  normReferenceId: string | null
  reference: string
  referencedCount: number
  resolvedNormReferenceDbId: number | null
  type: string
  uri: string | null
  version: string | null
  warnings: ImportMessage[]
}

interface ImportNeedsReferenceProposalPreview {
  description: string | null
  key: string
  referencedCount: number
  resolvedNeedsReferenceId: number | null
  text: string
  warnings: ImportMessage[]
}

export interface ImportPreviewResponse {
  needsReferenceProposals?: ImportNeedsReferenceProposalPreview[]
  previewToken: string
  proposals: ImportProposalPreview[]
  rows: ImportPreviewRow[]
  summary: {
    errorCount: number
    rowCount: number
    warningCount: number
  }
}

interface ImportReceiptRow {
  acceptanceCriteria: string | null
  categoryName: string | null
  createdDatabaseId: number
  createdVisibleId: string
  description: string
  importMode: ImportMode
  needsReferenceId: number | null
  normReferences: string[]
  priorityLevelName: string | null
  qualityCharacteristicName: string | null
  requirementPackageNames: string[]
  sourceIndex: number
  targetAreaId: number | null
  targetSpecificationId: number | null
  typeName: string | null
  verifiable: boolean
  verificationMethod: string | null
}

interface ImportExecuteResponse {
  createdRows: ImportReceiptRow[]
  summary: { createdCount: number }
}

export interface InitialRequirementsImport {
  areaId?: number
  key: string
  payload: ImportRequirementsPayload
  preview?: ImportPreviewResponse
}

interface RequirementsImportDialogProps {
  areas?: AreaOption[]
  destinationName?: string
  initialImport?: InitialRequirementsImport | null
  mode: ImportMode
  needsReferences?: NeedsReferenceOption[]
  onClose: (importSucceeded: boolean) => void
  open: boolean
  specificationId?: number
}

type ImportPayloadValidation =
  | {
      payload: ImportRequirementsPayload
      reason: null
    }
  | {
      payload: null
      reason:
        | 'invalid-json'
        | 'missing-json'
        | 'schema-invalid'
        | 'wrong-version'
    }

const TEXT = {
  en: {
    acceptanceCriteria: 'Acceptance criteria',
    area: 'Requirement area',
    cancel: 'Cancel',
    category: 'Category',
    close: 'Close',
    confirmWarnings:
      'Selected rows contain warnings. Unresolved optional metadata will be omitted. Continue?',
    dropJsonFile: 'Drop a JSON file here, or click to browse.',
    downloadImportInstruction: 'Download import instruction',
    downloadArtifactsHelp:
      'Use the schema to validate the file. The import instruction is only the output-format and import-reference part for AI work; combine it with your own prompt describing the requirements and text content to produce.',
    downloadCsv: 'Download CSV receipt',
    downloadSchema: 'Download schema',
    error: 'Something went wrong',
    errors: 'errors',
    execute: 'Import selected',
    collapseAll: 'Collapse all',
    collapseRow: 'Collapse row',
    file: 'JSON file',
    createNeedsReference: 'Create needs reference',
    createNormReference: 'Create norm reference',
    deselectRowForImport: (rowNumber: number) =>
      `Exclude row #${rowNumber} from import`,
    errorCount: (count: number) =>
      `${count} ${count === 1 ? 'error' : 'errors'}`,
    expandAll: 'Expand all',
    expandRow: 'Expand row',
    infoCount: (count: number) => `${count} info`,
    invalidSchema: `The JSON does not match ${REQUIREMENTS_IMPORT_SCHEMA_VERSION}. Fix the import file before previewing requirements.`,
    importTitleLibrary: 'Import requirements',
    importTitleSpecification: 'Import local requirements',
    importReviewTabs: 'Import review',
    ignoredRequirementPackagesInfo:
      'Requirement packages in the import file are not used for specification-local requirements.',
    linkExistingNormReference: 'Link existing norm reference',
    linkExistingNeedsReference: 'Link existing needs reference',
    loadReview: 'Preview requirements',
    needsReference: 'Needs reference',
    needsReferenceDescription: 'Description',
    noExistingNormReference: 'No linked norm reference',
    noExistingNeedsReference: 'No linked needs reference',
    noNormReferenceIds: 'No norm reference IDs are selected.',
    noPackageIds: 'No requirement package IDs are selected.',
    noProposals: 'No proposed norm references are loaded.',
    noNeedsReferenceProposals: 'No proposed needs references are loaded.',
    noRows: 'No rows are loaded.',
    noPickerMatches: 'No matches.',
    noPickerOptions: 'No options are available.',
    normReferenceIds: 'Norm reference IDs',
    normReferenceIdPrefillHelp:
      'This field is filled with the proposal ID so future imports can match the same source. Change it if needed, or clear it to let the system generate an ID.',
    applySelection: 'Use selection',
    packageIds: 'Package IDs',
    packagePickerTitle: 'Select requirement packages',
    pickerSearchPlaceholder: 'Search...',
    pickerSelectedCount: (count: number) => `${count} selected`,
    proposalResolved: 'Resolved',
    proposalImportKey: 'Import key',
    proposedNormReferenceUnresolved: (tabName: string) =>
      `Proposed norm reference is unresolved and will not be saved. Validate and create it in the ${tabName} tab.`,
    proposedNeedsReferenceUnresolved: (tabName: string) =>
      `Proposed needs reference is unresolved and will not be saved. Validate and create it in the ${tabName} tab.`,
    proposalUsedByRows: 'Used by rows',
    proposedNeedsReferences: 'Proposed needs references',
    proposedNormReferences: 'Proposed norm references',
    qualityCharacteristic: 'Quality characteristic',
    instructionFile: 'requirement-import-instruction.md',
    rawJson: 'Import JSON',
    rawJsonPlaceholder: 'Paste import JSON here.',
    remove: 'Remove from import',
    removeNormReferenceId: 'Remove norm reference ID',
    removePackageId: 'Remove package ID',
    requirementText: 'Requirement text',
    requirementsTab: 'Requirements',
    normReferencePickerTitle: 'Select norm references',
    verifiable: 'Verifiable',
    priorityLevel: 'Priority',
    schemaFile: 'requirement-import.schema.json',
    selectedRows: 'selected',
    selectRowForImport: (rowNumber: number) =>
      `Include row #${rowNumber} in import`,
    showLess: 'Show less',
    showMore: 'Show more',
    startImportMissingJson:
      'Paste import JSON or choose a JSON file to preview requirements.',
    startImportMissingTargetAndJson:
      'Select a requirement area and add import JSON to preview requirements.',
    startImportMissingTarget:
      'Select a requirement area to preview requirements.',
    startImportInvalidJson:
      'The JSON cannot be parsed. Check the syntax before previewing requirements.',
    startImportInvalidSchema:
      'The JSON does not match the import schema. Check required fields and field names.',
    startImportWrongSchemaVersion: (schemaVersion: string) =>
      `schemaVersion must be ${schemaVersion}.`,
    success: 'Imported rows',
    tooManyRows:
      'The file contains 200 or more requirements. You can continue, but review may be slower.',
    type: 'Type',
    unknownNormReferenceId: 'No matching norm reference found.',
    unknownPackageId: 'No matching requirement package found.',
    verificationMethod: 'Verification method',
    warningCount: (count: number) =>
      `${count} ${count === 1 ? 'warning' : 'warnings'}`,
    warnings: 'warnings',
  },
  sv: {
    acceptanceCriteria: 'Acceptanskriterier',
    area: 'Kravområde',
    cancel: 'Avbryt',
    category: 'Kategori',
    close: 'Stäng',
    confirmWarnings:
      'Valda rader innehåller varningar. Olöst frivillig metadata utelämnas. Fortsätta?',
    dropJsonFile: 'Släpp en JSON-fil här, eller klicka för att välja fil.',
    downloadImportInstruction: 'Ladda ner importinstruktion',
    downloadArtifactsHelp:
      'Använd schemat för att validera filen. Importinstruktionen är bara formatdelen och referensdata för import för AI-arbete; kombinera den med en egen prompt som beskriver vilka krav och texter som ska tas fram.',
    downloadCsv: 'Ladda ner CSV-kvitto',
    downloadSchema: 'Ladda ner schema',
    error: 'Något gick fel',
    errors: 'fel',
    execute: 'Importera valda',
    collapseAll: 'Kollapsa alla',
    collapseRow: 'Kollapsa rad',
    file: 'JSON-fil',
    createNeedsReference: 'Skapa behovsreferens',
    createNormReference: 'Skapa normreferens',
    deselectRowForImport: (rowNumber: number) =>
      `Välj inte rad #${rowNumber} för import`,
    errorCount: (count: number) => `${count} fel`,
    expandAll: 'Expandera alla',
    expandRow: 'Expandera rad',
    infoCount: (count: number) => `${count} info`,
    invalidSchema: `JSON följer inte ${REQUIREMENTS_IMPORT_SCHEMA_VERSION}. Korrigera importfilen innan granskningen laddas.`,
    importTitleLibrary: 'Importera krav',
    importTitleSpecification: 'Importera lokala krav',
    importReviewTabs: 'Importgranskning',
    ignoredRequirementPackagesInfo:
      'Kravpaket i importfilen används inte för kravunderlagslokala krav.',
    linkExistingNormReference: 'Länka befintlig normreferens',
    linkExistingNeedsReference: 'Länka befintlig behovsreferens',
    loadReview: 'Förhandsgranska krav',
    needsReference: 'Behovsreferens',
    needsReferenceDescription: 'Beskrivning',
    noExistingNormReference: 'Ingen länkad normreferens',
    noExistingNeedsReference: 'Ingen länkad behovsreferens',
    noNormReferenceIds: 'Inga normreferens-ID:n är valda.',
    noPackageIds: 'Inga kravpakets-ID:n är valda.',
    noProposals: 'Inga föreslagna normreferenser är laddade.',
    noNeedsReferenceProposals: 'Inga föreslagna behovsreferenser är laddade.',
    noRows: 'Inga rader är laddade.',
    noPickerMatches: 'Inga träffar.',
    noPickerOptions: 'Inga val är tillgängliga.',
    normReferenceIds: 'Normreferens-ID:n',
    normReferenceIdPrefillHelp:
      'Fältet är ifyllt med förslagets ID så att kommande importer kan matcha samma källa. Ändra det vid behov, eller töm fältet om systemet ska skapa ID automatiskt.',
    applySelection: 'Använd val',
    packageIds: 'Kravpakets-ID:n',
    packagePickerTitle: 'Välj kravpaket',
    pickerSearchPlaceholder: 'Sök...',
    pickerSelectedCount: (count: number) => `${count} valda`,
    proposalResolved: 'Löst',
    proposalImportKey: 'Importnyckel',
    proposedNormReferenceUnresolved: (tabName: string) =>
      `Föreslagen normreferens är inte löst och sparas inte. Kontrollera och skapa den i fliken ${tabName}.`,
    proposedNeedsReferenceUnresolved: (tabName: string) =>
      `Föreslagen behovsreferens är inte löst och sparas inte. Kontrollera och skapa den i fliken ${tabName}.`,
    proposalUsedByRows: 'Används av rader',
    proposedNeedsReferences: 'Föreslagna behovsreferenser',
    proposedNormReferences: 'Föreslagna normreferenser',
    qualityCharacteristic: 'Kvalitetsegenskap',
    instructionFile: 'kravimport-instruktion.md',
    rawJson: 'Import-JSON',
    rawJsonPlaceholder: 'Klistra in import-JSON här.',
    remove: 'Ta bort från import',
    removeNormReferenceId: 'Ta bort normreferens-ID',
    removePackageId: 'Ta bort kravpakets-ID',
    requirementText: 'Kravtext',
    requirementsTab: 'Krav',
    normReferencePickerTitle: 'Välj normreferenser',
    verifiable: 'Verifierbar',
    priorityLevel: 'Prioritet',
    schemaFile: 'kravimport.schema.json',
    selectedRows: 'valda',
    selectRowForImport: (rowNumber: number) =>
      `Välj rad #${rowNumber} för import`,
    showLess: 'Visa mindre',
    showMore: 'Visa mer',
    startImportMissingJson:
      'Klistra in import-JSON eller välj en JSON-fil för att förhandsgranska kraven.',
    startImportMissingTargetAndJson:
      'Välj kravområde och lägg till import-JSON för att förhandsgranska kraven.',
    startImportMissingTarget: 'Välj kravområde för att förhandsgranska kraven.',
    startImportInvalidJson:
      'JSON kan inte läsas. Kontrollera syntaxen innan kraven förhandsgranskas.',
    startImportInvalidSchema:
      'JSON följer inte importschemat. Kontrollera obligatoriska fält och fältnamn.',
    startImportWrongSchemaVersion: (schemaVersion: string) =>
      `schemaVersion måste vara ${schemaVersion}.`,
    success: 'Importerade rader',
    tooManyRows:
      'Filen innehåller 200 eller fler krav. Du kan fortsätta, men granskningen kan bli långsammare.',
    type: 'Typ',
    unknownNormReferenceId: 'Ingen matchande normreferens hittades.',
    unknownPackageId: 'Inget matchande kravpaket hittades.',
    verificationMethod: 'Verifieringsmetod',
    warningCount: (count: number) =>
      `${count} ${count === 1 ? 'varning' : 'varningar'}`,
    warnings: 'varningar',
  },
} as const

const EDITABLE_ERROR_CODES = new Set([
  'description_required',
  'import_verification_method_required',
  'verification_method_required',
])

const PROPOSAL_RESOLUTION_WARNING_CODES = new Set([
  'import_needs_reference_unresolved',
  'import_proposed_norm_reference_unresolved',
])

const EMPTY_NORM_REFERENCE_FORM: NormReferenceFormData = {
  issuer: '',
  name: '',
  normReferenceId: '',
  reference: '',
  type: '',
  uri: '',
  version: '',
}

const EMPTY_AREA_OPTIONS: AreaOption[] = []
const EMPTY_NEEDS_REFERENCE_OPTIONS: NeedsReferenceOption[] = []

const inputClass =
  'w-full rounded-lg border border-secondary-300 bg-white px-3 py-2 text-sm text-secondary-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100'
const editableIdRowClass =
  'grid grid-cols-[minmax(0,1fr)_2.75rem] gap-2 rounded-lg border border-secondary-200 bg-white p-2 dark:border-secondary-800 dark:bg-secondary-950 sm:grid-cols-[8rem_minmax(0,1fr)_2.75rem] sm:items-center'
const editableIdLabelClass =
  'col-span-2 wrap-break-word text-xs sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:text-sm'
const resolvedAssociationRowClass =
  'grid grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-2 rounded-lg border border-secondary-200 bg-white p-2 dark:border-secondary-800 dark:bg-secondary-950'
const resolvedAssociationLabelClass =
  'wrap-break-word text-sm text-secondary-700 dark:text-secondary-200'
const editableIdRemoveButtonClass =
  'col-start-2 row-start-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-secondary-200 text-secondary-600 hover:bg-secondary-50 dark:border-secondary-700 dark:text-secondary-300 dark:hover:bg-secondary-900 sm:col-start-3'
const resolvedAssociationRemoveButtonClass =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-secondary-200 text-secondary-600 hover:bg-secondary-50 dark:border-secondary-700 dark:text-secondary-300 dark:hover:bg-secondary-900'

function toNormReferencePayload(form: NormReferenceFormData) {
  return {
    issuer: form.issuer,
    name: form.name,
    normReferenceId: form.normReferenceId || undefined,
    reference: form.reference,
    type: form.type,
    uri: form.uri || null,
    version: form.version || null,
  }
}

function csvCell(value: unknown): string {
  if (value == null) return ''
  const text = Array.isArray(value) ? value.join('; ') : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function receiptCsv(rows: ImportReceiptRow[]): string {
  const headers = [
    'importMode',
    'sourceIndex',
    'createdVisibleId',
    'createdDatabaseId',
    'description',
    'acceptanceCriteria',
    'category',
    'type',
    'qualityCharacteristic',
    'priorityLevel',
    'requirementPackages',
    'normReferences',
    'verifiable',
    'verificationMethod',
    'targetAreaId',
    'targetSpecificationId',
    'needsReferenceId',
  ]
  const body = rows.map(row =>
    [
      row.importMode,
      row.sourceIndex,
      row.createdVisibleId,
      row.createdDatabaseId,
      row.description,
      row.acceptanceCriteria,
      row.categoryName,
      row.typeName,
      row.qualityCharacteristicName,
      row.priorityLevelName,
      row.requirementPackageNames,
      row.normReferences,
      row.verifiable,
      row.verificationMethod,
      row.targetAreaId,
      row.targetSpecificationId,
      row.needsReferenceId,
    ]
      .map(csvCell)
      .join(','),
  )
  return `${headers.join(',')}\n${body.join('\n')}\n`
}

function downloadText(
  filename: string,
  content: string,
  type: string,
  options: { bom?: boolean } = {},
) {
  const blob = options.bom
    ? createUtf8BomBlob(content, type)
    : new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}

function uniquePositiveIds(values: number[]): number[] {
  return [...new Set(values.filter(id => Number.isInteger(id) && id > 0))]
}

function colorWithAlpha(color: string, alpha: number): string | null {
  const match = color.trim().match(/^#?([0-9a-f]{6})$/i)
  if (!match) return null
  const value = match[1]
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return `rgb(${red} ${green} ${blue} / ${alpha})`
}

function priorityChipStyle(option: PriorityLevelOption): CSSProperties {
  if (!option.color) return {}
  return {
    backgroundColor: colorWithAlpha(option.color, 0.08) ?? undefined,
    borderColor: option.color,
    color: option.color,
  }
}

function RequirementSummaryText({
  allowToggle = true,
  collapseLabel,
  expandLabel,
  expanded,
  onToggle,
  onRowToggle,
  rowActionLabel,
  textValue,
}: {
  allowToggle?: boolean
  collapseLabel: string
  expandLabel: string
  expanded: boolean
  onToggle: () => void
  onRowToggle: () => void
  rowActionLabel: string
  textValue: string
}) {
  const summaryRef = useRef<HTMLParagraphElement>(null)
  const [hasOverflow, setHasOverflow] = useState(false)

  useEffect(() => {
    const element = summaryRef.current
    if (!element) return
    const clipped = element.scrollHeight > element.clientHeight + 1
    setHasOverflow(
      clipped || textValue.length > 260 || textValue.includes('\n'),
    )
  }, [textValue])

  return (
    <div className="min-w-0">
      <button
        aria-label={rowActionLabel}
        className="block w-full rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50"
        onClick={onRowToggle}
        type="button"
      >
        <p
          className={`wrap-break-word text-left text-sm leading-relaxed text-secondary-900 dark:text-secondary-100 ${
            expanded ? '' : 'overflow-hidden'
          }`}
          ref={summaryRef}
          style={
            expanded
              ? undefined
              : {
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 3,
                  display: '-webkit-box',
                }
          }
        >
          {textValue}
        </p>
      </button>
      {allowToggle && hasOverflow ? (
        <button
          className="mt-1 text-xs font-medium text-primary-700 hover:text-primary-900 dark:text-primary-300 dark:hover:text-primary-100"
          onClick={event => {
            event.stopPropagation()
            onToggle()
          }}
          type="button"
        >
          {expanded ? collapseLabel : expandLabel}
        </button>
      ) : null}
    </div>
  )
}

export default function RequirementsImportDialog({
  areas = EMPTY_AREA_OPTIONS,
  destinationName,
  initialImport = null,
  mode,
  needsReferences = EMPTY_NEEDS_REFERENCE_OPTIONS,
  onClose,
  open,
  specificationId,
}: RequirementsImportDialogProps) {
  const locale = useLocale() === 'sv' ? 'sv' : 'en'
  const text = TEXT[locale]
  const importText = useTranslations('requirementsImportDialog')
  const { confirm } = useConfirmModal()
  const titleId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rawJson, setRawJson] = useState('')
  const [selectedAreaId, setSelectedAreaId] = useState('')
  const [jsonDropActive, setJsonDropActive] = useState(false)
  const [rows, setRows] = useState<ImportPreviewRow[]>([])
  const [proposals, setProposals] = useState<ImportProposalPreview[]>([])
  const [needsReferenceProposals, setNeedsReferenceProposals] = useState<
    ImportNeedsReferenceProposalPreview[]
  >([])
  const [createdProposalKeys, setCreatedProposalKeys] = useState<string[]>([])
  const [
    createdNeedsReferenceProposalKeys,
    setCreatedNeedsReferenceProposalKeys,
  ] = useState<string[]>([])
  const [previewToken, setPreviewToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [initialImportLoading, setInitialImportLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null)
  const [normReferences, setNormReferences] = useState<NormReferenceOption[]>(
    [],
  )
  const [localNeedsReferences, setLocalNeedsReferences] =
    useState<NeedsReferenceOption[]>(needsReferences)
  const [resolvingProposalKey, setResolvingProposalKey] = useState<
    string | null
  >(null)
  const [normRefForm, setNormRefForm] = useState<NormReferenceFormData>(
    EMPTY_NORM_REFERENCE_FORM,
  )
  const [normReferenceEditDraftIds, setNormReferenceEditDraftIds] = useState<
    Record<string, string>
  >({})
  const [packageEditDraftIds, setPackageEditDraftIds] = useState<
    Record<string, string>
  >({})
  const [associationPicker, setAssociationPicker] = useState<{
    kind: AssociationPickerKind
    reviewRowId: string
  } | null>(null)
  const [associationPickerDraftIds, setAssociationPickerDraftIds] = useState<
    number[]
  >([])
  const [associationPickerSearch, setAssociationPickerSearch] = useState('')
  const [normRefSubmitting, setNormRefSubmitting] = useState(false)
  const [normRefError, setNormRefError] = useState<string | null>(null)
  const [taxonomy, setTaxonomy] = useState<{
    categories: TaxonomyOption[]
    qualityCharacteristics: QualityCharacteristicOption[]
    requirementPackages: RequirementPackageOption[]
    priorityLevels: PriorityLevelOption[]
    types: Array<
      TaxonomyOption & {
        qualityCharacteristics?: QualityCharacteristicOption[]
      }
    >
  }>({
    categories: [],
    qualityCharacteristics: [],
    requirementPackages: [],
    priorityLevels: [],
    types: [],
  })
  const [receiptRows, setReceiptRows] = useState<ImportReceiptRow[]>([])
  const [hadSuccessfulImport, setHadSuccessfulImport] = useState(false)
  const [activeReviewTab, setActiveReviewTab] =
    useState<ReviewTab>('requirements')
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [expandedSummaryRowIds, setExpandedSummaryRowIds] = useState<
    Set<string>
  >(() => new Set())
  const appliedInitialImportKeyRef = useRef<string | null>(null)

  const authorableAreas = useMemo(
    () => areas.filter(area => area.permissions?.canAuthor !== false),
    [areas],
  )
  const selectedAreaName = useMemo(() => {
    if (mode !== 'library' || !selectedAreaId) return null
    return areas.find(area => String(area.id) === selectedAreaId)?.name ?? null
  }, [areas, mode, selectedAreaId])
  const importPayloadValidation = useMemo<ImportPayloadValidation>(() => {
    if (!rawJson.trim()) return { payload: null, reason: 'missing-json' }
    try {
      const parsed = JSON.parse(rawJson) as unknown
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('schemaVersion' in parsed) ||
        (parsed as { schemaVersion?: unknown }).schemaVersion !==
          REQUIREMENTS_IMPORT_SCHEMA_VERSION
      ) {
        return { payload: null, reason: 'wrong-version' }
      }
      const result = requirementsImportPayloadSchema.safeParse(parsed)
      return result.success
        ? { payload: result.data, reason: null }
        : { payload: null, reason: 'schema-invalid' }
    } catch {
      return { payload: null, reason: 'invalid-json' }
    }
  }, [rawJson])
  const parsedImportPayload = importPayloadValidation.payload
  const hasRequiredImportTarget = mode !== 'library' || selectedAreaId !== ''
  const canDownloadImportInstruction =
    mode === 'library' || specificationId != null
  const canLoadPreview =
    !loading && parsedImportPayload !== null && hasRequiredImportTarget
  const startImportDisabledReason = useMemo(() => {
    if (loading || canLoadPreview) return null
    const jsonReason =
      importPayloadValidation.reason === 'missing-json'
        ? text.startImportMissingJson
        : importPayloadValidation.reason === 'invalid-json'
          ? text.startImportInvalidJson
          : importPayloadValidation.reason === 'wrong-version'
            ? text.startImportWrongSchemaVersion(
                REQUIREMENTS_IMPORT_SCHEMA_VERSION,
              )
            : importPayloadValidation.reason === 'schema-invalid'
              ? text.startImportInvalidSchema
              : null
    if (
      !hasRequiredImportTarget &&
      importPayloadValidation.reason === 'missing-json'
    ) {
      return text.startImportMissingTargetAndJson
    }
    if (!hasRequiredImportTarget) {
      return jsonReason
        ? `${text.startImportMissingTarget} ${jsonReason}`
        : text.startImportMissingTarget
    }
    return jsonReason
  }, [
    canLoadPreview,
    hasRequiredImportTarget,
    importPayloadValidation.reason,
    loading,
    text,
  ])
  const selectedCount = rows.filter(row => row.selected).length
  const selectedWarnings = rows
    .filter(row => row.selected)
    .reduce((count, row) => count + row.warnings.length, 0)
  const selectedErrors = rows
    .filter(row => row.selected)
    .reduce((count, row) => count + row.errors.length, 0)
  const showNeedsReferenceProposalsTab =
    mode === 'specification-local' && needsReferenceProposals.length > 0
  const allRowsExpanded =
    rows.length > 0 && rows.every(row => expandedRowIds.has(row.reviewRowId))
  const allRowsCollapsed =
    rows.length > 0 && rows.every(row => !expandedRowIds.has(row.reviewRowId))
  const normRefFormDirty =
    JSON.stringify(toNormReferencePayload(normRefForm)) !==
    JSON.stringify(toNormReferencePayload(EMPTY_NORM_REFERENCE_FORM))

  const getEditableErrors = useCallback(
    (values: ImportReviewValues): ImportMessage[] => {
      const nextErrors: ImportMessage[] = []
      if (!values.description.trim()) {
        nextErrors.push({
          code: 'description_required',
          field: 'description',
          level: 'error',
          message: importText('descriptionRequired'),
        })
      }
      if (values.verifiable && !values.verificationMethod?.trim()) {
        nextErrors.push({
          code: 'verification_method_required',
          field: 'verificationMethod',
          level: 'error',
          message: importText('verificationMethodRequired'),
        })
      }
      return nextErrors
    },
    [importText],
  )

  const revalidateEditableRow = useCallback(
    (row: ImportPreviewRow): ImportPreviewRow => {
      const values =
        row.values.typeId == null
          ? { ...row.values, qualityCharacteristicId: null }
          : row.values
      return {
        ...row,
        infos: row.infos ?? [],
        values,
        errors: [
          ...row.errors.filter(error => !EDITABLE_ERROR_CODES.has(error.code)),
          ...getEditableErrors(values),
        ],
      }
    },
    [getEditableErrors],
  )

  useEffect(() => {
    setLocalNeedsReferences(needsReferences)
  }, [needsReferences])

  useEffect(() => {
    if (
      activeReviewTab === 'needsReferenceProposals' &&
      !showNeedsReferenceProposalsTab
    ) {
      setActiveReviewTab('requirements')
    }
  }, [activeReviewTab, showNeedsReferenceProposalsTab])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function fetchTaxonomy() {
      const [
        categoriesRes,
        typesRes,
        priorityLevelsRes,
        packagesRes,
        normRefsRes,
      ] = await Promise.allSettled([
        fetch('/api/requirement-categories'),
        fetch('/api/requirement-types'),
        fetch('/api/priority-levels'),
        fetch('/api/requirement-packages'),
        fetch('/api/norm-references'),
      ])
      if (cancelled) return
      async function read<T>(
        result: PromiseSettledResult<Response>,
        key: string,
      ) {
        if (result.status !== 'fulfilled' || !result.value.ok) return []
        const body = (await result.value.json().catch(() => ({}))) as Record<
          string,
          T[]
        >
        return body[key] ?? []
      }
      const types = await read<
        TaxonomyOption & {
          qualityCharacteristics?: QualityCharacteristicOption[]
        }
      >(typesRes, 'types')
      setTaxonomy({
        categories: await read<TaxonomyOption>(categoriesRes, 'categories'),
        qualityCharacteristics: types.flatMap(
          type => type.qualityCharacteristics ?? [],
        ),
        requirementPackages: await read<RequirementPackageOption>(
          packagesRes,
          'requirementPackages',
        ),
        priorityLevels: await read<PriorityLevelOption>(
          priorityLevelsRes,
          'priorityLevels',
        ),
        types,
      })
      setNormReferences(
        await read<NormReferenceOption>(normRefsRes, 'normReferences'),
      )
    }
    void fetchTaxonomy()
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open || !initialImport) return
    if (appliedInitialImportKeyRef.current === initialImport.key) return
    const initial = initialImport
    setInitialImportLoading(true)
    appliedInitialImportKeyRef.current = initial.key

    let cancelled = false
    async function loadInitialImport() {
      setRawJson(JSON.stringify(initial.payload, null, 2))
      setLoading(true)
      setErrorMessage(null)
      setNoticeMessage(null)
      setReceiptRows([])
      setHadSuccessfulImport(false)
      if (mode === 'library' && initial.areaId) {
        setSelectedAreaId(String(initial.areaId))
      }
      const applyPreview = (preview: ImportPreviewResponse) => {
        setProposals(preview.proposals)
        setNeedsReferenceProposals(preview.needsReferenceProposals ?? [])
        setCreatedProposalKeys([])
        setCreatedNeedsReferenceProposalKeys([])
        setRows(preview.rows.map(revalidateEditableRow))
        setActiveReviewTab('requirements')
        setExpandedRowIds(new Set())
        setExpandedSummaryRowIds(new Set())
        setNormReferenceEditDraftIds({})
        setPackageEditDraftIds({})
        setAssociationPicker(null)
        setAssociationPickerDraftIds([])
        setAssociationPickerSearch('')
        setPreviewToken(preview.previewToken)
        if (preview.rows.length >= 200) {
          setNoticeMessage(text.tooManyRows)
        }
      }
      try {
        if (initial.preview) {
          applyPreview(initial.preview)
          return
        }
        const isLibrary = mode === 'library'
        const response = await apiFetch(
          isLibrary
            ? '/api/requirements/import/preview'
            : '/api/specification-local-requirements/import/preview',
          {
            body: JSON.stringify({
              ...(isLibrary ? { areaId: initial.areaId } : {}),
              ...(!isLibrary ? { specificationId } : {}),
              locale,
              payload: initial.payload,
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          },
        )
        if (cancelled) return
        if (!response.ok) {
          setErrorMessage(await readResponseMessage(response))
          return
        }
        const preview = (await response.json()) as ImportPreviewResponse
        if (cancelled) return
        applyPreview(preview)
      } catch {
        if (!cancelled) {
          setErrorMessage(text.error)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setInitialImportLoading(false)
        }
      }
    }
    void loadInitialImport()
    return () => {
      cancelled = true
    }
  }, [
    initialImport,
    locale,
    mode,
    open,
    revalidateEditableRow,
    specificationId,
    text.error,
    text.tooManyRows,
  ])

  useEffect(() => {
    if (
      !open ||
      typeof document === 'undefined' ||
      typeof window === 'undefined'
    ) {
      return
    }
    const body = document.body
    const html = document.documentElement
    const scrollX = window.scrollX
    const scrollY = window.scrollY
    const previousBodyOverflow = body.style.overflow
    const previousBodyPosition = body.style.position
    const previousBodyTop = body.style.top
    const previousBodyLeft = body.style.left
    const previousBodyRight = body.style.right
    const previousBodyWidth = body.style.width
    const previousHtmlOverflow = html.style.overflow

    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = `-${scrollX}px`
    body.style.right = '0'
    body.style.width = '100%'
    html.style.overflow = 'hidden'

    return () => {
      body.style.overflow = previousBodyOverflow
      body.style.position = previousBodyPosition
      body.style.top = previousBodyTop
      body.style.left = previousBodyLeft
      body.style.right = previousBodyRight
      body.style.width = previousBodyWidth
      html.style.overflow = previousHtmlOverflow
      window.scrollTo(scrollX, scrollY)
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  const updateRow = (
    reviewRowId: string,
    updater: (row: ImportPreviewRow) => ImportPreviewRow,
  ) => {
    setRows(current =>
      current.map(row =>
        row.reviewRowId === reviewRowId ? updater(row) : row,
      ),
    )
  }

  const removeRowState = (reviewRowId: string) => {
    setExpandedRowIds(current => {
      const next = new Set(current)
      next.delete(reviewRowId)
      return next
    })
    setExpandedSummaryRowIds(current => {
      const next = new Set(current)
      next.delete(reviewRowId)
      return next
    })
  }

  const setRowExpanded = (reviewRowId: string, expanded: boolean) => {
    setExpandedRowIds(current => {
      const next = new Set(current)
      if (expanded) {
        next.add(reviewRowId)
      } else {
        next.delete(reviewRowId)
      }
      return next
    })
    setExpandedSummaryRowIds(current => {
      const next = new Set(current)
      next.delete(reviewRowId)
      return next
    })
  }

  const toggleRowExpanded = (reviewRowId: string) => {
    setRowExpanded(reviewRowId, !expandedRowIds.has(reviewRowId))
  }

  const toggleSummaryExpanded = (reviewRowId: string) => {
    setExpandedSummaryRowIds(current => {
      const next = new Set(current)
      if (next.has(reviewRowId)) {
        next.delete(reviewRowId)
      } else {
        next.add(reviewRowId)
      }
      return next
    })
  }

  const expandAllRows = () => {
    setExpandedRowIds(new Set(rows.map(row => row.reviewRowId)))
    setExpandedSummaryRowIds(new Set())
  }

  const collapseAllRows = () => {
    setExpandedRowIds(new Set())
    setExpandedSummaryRowIds(new Set())
  }

  const updateRowValue = <K extends keyof ImportReviewValues>(
    reviewRowId: string,
    key: K,
    value: ImportReviewValues[K],
  ) => {
    updateRow(reviewRowId, row =>
      revalidateEditableRow({
        ...row,
        values: { ...row.values, [key]: value },
      }),
    )
  }

  const qualityCharacteristicBelongsToType = (
    qualityCharacteristicId: number | null,
    typeId: number | null,
  ) => {
    if (qualityCharacteristicId == null) return true
    if (typeId == null) return false
    return taxonomy.qualityCharacteristics.some(
      option =>
        option.id === qualityCharacteristicId &&
        option.requirementTypeId === typeId,
    )
  }

  const updateRowTypeId = (reviewRowId: string, typeId: number | null) => {
    updateRow(reviewRowId, row => {
      const qualityCharacteristicId = qualityCharacteristicBelongsToType(
        row.values.qualityCharacteristicId,
        typeId,
      )
        ? row.values.qualityCharacteristicId
        : null
      return revalidateEditableRow({
        ...row,
        values: { ...row.values, qualityCharacteristicId, typeId },
      })
    })
  }

  const getQualityCharacteristicOptionsForRow = (row: ImportPreviewRow) => {
    if (row.values.typeId == null) return []

    const selectedId = row.values.qualityCharacteristicId
    const options = taxonomy.qualityCharacteristics.filter(
      option =>
        option.requirementTypeId === row.values.typeId ||
        option.id === selectedId,
    )
    const parentIds = new Set(
      options
        .map(option => option.parentId)
        .filter((parentId): parentId is number => parentId != null),
    )
    if (parentIds.size === 0) return options

    return taxonomy.qualityCharacteristics.filter(
      option =>
        option.requirementTypeId === row.values.typeId ||
        option.id === selectedId ||
        parentIds.has(option.id),
    )
  }

  const clearNormReferenceDrafts = (reviewRowId: string) => {
    setNormReferenceEditDraftIds(current => {
      const next = { ...current }
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${reviewRowId}:`)) {
          delete next[key]
        }
      }
      return next
    })
  }

  const clearPackageDrafts = (reviewRowId: string) => {
    setPackageEditDraftIds(current => {
      const next = { ...current }
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${reviewRowId}:`)) {
          delete next[key]
        }
      }
      return next
    })
  }

  const updateNormReferenceId = (
    row: ImportPreviewRow,
    index: number,
    rawValue: string,
    draftKey: string,
  ) => {
    const value = rawValue.trim()
    setNormReferenceEditDraftIds(current => {
      const next = { ...current }
      delete next[draftKey]
      return next
    })
    if (!value) {
      updateRowValue(
        row.reviewRowId,
        'normReferenceIds',
        row.values.normReferenceIds.filter((_, candidateIndex) => {
          return candidateIndex !== index
        }),
      )
      return
    }
    const nextId = Number(value)
    if (!Number.isInteger(nextId) || nextId <= 0) return
    updateRowValue(
      row.reviewRowId,
      'normReferenceIds',
      uniquePositiveIds(
        row.values.normReferenceIds.map((currentId, candidateIndex) =>
          candidateIndex === index ? nextId : currentId,
        ),
      ),
    )
  }

  const updatePackageId = (
    row: ImportPreviewRow,
    index: number,
    rawValue: string,
    draftKey: string,
  ) => {
    const value = rawValue.trim()
    setPackageEditDraftIds(current => {
      const next = { ...current }
      delete next[draftKey]
      return next
    })
    if (!value) {
      updateRowValue(
        row.reviewRowId,
        'requirementPackageIds',
        row.values.requirementPackageIds.filter((_, candidateIndex) => {
          return candidateIndex !== index
        }),
      )
      return
    }
    const nextId = Number(value)
    if (!Number.isInteger(nextId) || nextId <= 0) return
    updateRowValue(
      row.reviewRowId,
      'requirementPackageIds',
      uniquePositiveIds(
        row.values.requirementPackageIds.map((currentId, candidateIndex) =>
          candidateIndex === index ? nextId : currentId,
        ),
      ),
    )
  }

  const openAssociationPicker = (
    kind: AssociationPickerKind,
    row: ImportPreviewRow,
  ) => {
    const validIds = new Set(
      kind === 'requirementPackages'
        ? taxonomy.requirementPackages.map(option => option.id)
        : normReferences.map(option => option.id),
    )
    setAssociationPicker({ kind, reviewRowId: row.reviewRowId })
    setAssociationPickerDraftIds(
      (kind === 'requirementPackages'
        ? row.values.requirementPackageIds
        : row.values.normReferenceIds
      ).filter(id => validIds.has(id)),
    )
    setAssociationPickerSearch('')
  }

  const toggleAssociationPickerId = (id: number) => {
    setAssociationPickerDraftIds(current =>
      current.includes(id)
        ? current.filter(candidate => candidate !== id)
        : [...current, id],
    )
  }

  const closeAssociationPicker = () => {
    setAssociationPicker(null)
    setAssociationPickerDraftIds([])
    setAssociationPickerSearch('')
  }

  const applyAssociationPicker = () => {
    if (!associationPicker) return
    const row = rows.find(
      candidate => candidate.reviewRowId === associationPicker.reviewRowId,
    )
    if (!row) {
      closeAssociationPicker()
      return
    }

    if (associationPicker.kind === 'requirementPackages') {
      const validIds = new Set(
        taxonomy.requirementPackages.map(option => option.id),
      )
      const unknownIds = row.values.requirementPackageIds.filter(
        id => !validIds.has(id),
      )
      updateRowValue(
        row.reviewRowId,
        'requirementPackageIds',
        uniquePositiveIds([...unknownIds, ...associationPickerDraftIds]),
      )
    } else {
      const validIds = new Set(normReferences.map(option => option.id))
      const unknownIds = row.values.normReferenceIds.filter(
        id => !validIds.has(id),
      )
      updateRowValue(
        row.reviewRowId,
        'normReferenceIds',
        uniquePositiveIds([...unknownIds, ...associationPickerDraftIds]),
      )
    }

    closeAssociationPicker()
  }

  const closeDialog = async () => {
    const hasRemainingImportEdits =
      rows.length > 0 || (!hadSuccessfulImport && rawJson.trim())
    if (hasRemainingImportEdits) {
      const ok = await confirm({
        confirmText: text.close,
        icon: 'caution',
        message:
          locale === 'sv'
            ? 'Importgranskningen stängs och kvarvarande ändringar försvinner.'
            : 'The import review will close and remaining edits will be lost.',
        title: text.close,
        variant: 'default',
      })
      if (!ok) return
    }
    setRawJson('')
    setSelectedAreaId('')
    setRows([])
    setProposals([])
    setNeedsReferenceProposals([])
    setCreatedProposalKeys([])
    setCreatedNeedsReferenceProposalKeys([])
    setActiveReviewTab('requirements')
    setExpandedRowIds(new Set())
    setExpandedSummaryRowIds(new Set())
    setNormReferenceEditDraftIds({})
    setPackageEditDraftIds({})
    closeAssociationPicker()
    setPreviewToken(null)
    setInitialImportLoading(false)
    setReceiptRows([])
    setErrorMessage(null)
    setNoticeMessage(null)
    onClose(hadSuccessfulImport)
    setHadSuccessfulImport(false)
  }

  const refreshPreviewToken = async () => {
    if (!rawJson.trim()) return
    let payload: unknown
    try {
      payload = JSON.parse(rawJson)
    } catch {
      return
    }
    const isLibrary = mode === 'library'
    if (isLibrary && !selectedAreaId) return
    const response = await apiFetch(
      isLibrary
        ? '/api/requirements/import/preview'
        : '/api/specification-local-requirements/import/preview',
      {
        body: JSON.stringify({
          ...(isLibrary ? { areaId: Number(selectedAreaId) } : {}),
          ...(!isLibrary ? { specificationId } : {}),
          locale,
          payload,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )
    if (!response.ok) {
      setErrorMessage(await readResponseMessage(response))
      return
    }
    const preview = (await response.json()) as ImportPreviewResponse
    setPreviewToken(preview.previewToken)
  }

  const resolveProposalWithNormReference = (
    proposalKey: string,
    normReference: NormReferenceOption,
  ) => {
    setProposals(current =>
      current.map(proposal =>
        proposal.key === proposalKey
          ? {
              ...proposal,
              normReferenceId: normReference.normReferenceId,
              resolvedNormReferenceDbId: normReference.id,
              warnings: [],
            }
          : proposal,
      ),
    )
    setRows(current =>
      current.map(row => {
        if (!row.proposedNormReferenceKeys.includes(proposalKey)) return row
        return {
          ...row,
          values: {
            ...row.values,
            normReferenceIds: uniquePositiveIds([
              ...row.values.normReferenceIds,
              normReference.id,
            ]),
          },
          warnings: row.warnings.filter(
            warning =>
              !(
                PROPOSAL_RESOLUTION_WARNING_CODES.has(warning.code) &&
                warning.originalValue === proposalKey
              ),
          ),
        }
      }),
    )
  }

  const resolveProposalWithNeedsReference = (
    proposalKey: string,
    needsReference: NeedsReferenceOption,
  ) => {
    setNeedsReferenceProposals(current =>
      current.map(proposal =>
        proposal.key === proposalKey
          ? {
              ...proposal,
              resolvedNeedsReferenceId: needsReference.id,
              warnings: [],
            }
          : proposal,
      ),
    )
    setRows(current =>
      current.map(row => {
        if (row.proposedNeedsReferenceKey !== proposalKey) return row
        return revalidateEditableRow({
          ...row,
          errors: row.errors.filter(
            message =>
              !(
                PROPOSAL_RESOLUTION_WARNING_CODES.has(message.code) &&
                message.originalValue === proposalKey
              ),
          ),
          values: {
            ...row.values,
            needsReferenceId: needsReference.id,
          },
        })
      }),
    )
  }

  const createNeedsReferenceForProposal = async (
    proposal: ImportNeedsReferenceProposalPreview,
  ) => {
    if (mode !== 'specification-local' || !specificationId) return
    setLoading(true)
    setErrorMessage(null)
    try {
      const response = await apiFetch(
        `/api/requirements-specifications/${specificationId}/needs-references`,
        {
          body: JSON.stringify({
            description: proposal.description,
            text: proposal.text,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      )
      if (!response.ok) {
        setErrorMessage(await readResponseMessage(response))
        return
      }
      const data = (await response.json()) as {
        needsReference?: NeedsReferenceOption
      }
      const created = data.needsReference
      if (!created) {
        setErrorMessage(text.error)
        return
      }
      setLocalNeedsReferences(current => [...current, created])
      resolveProposalWithNeedsReference(proposal.key, created)
      setCreatedNeedsReferenceProposalKeys(current => [
        ...new Set([...current, proposal.key]),
      ])
      await refreshPreviewToken()
    } finally {
      setLoading(false)
    }
  }

  const openCreateNormReference = (proposal: ImportProposalPreview) => {
    setResolvingProposalKey(proposal.key)
    setNormRefError(null)
    setNormRefForm({
      issuer: proposal.issuer,
      name: proposal.name,
      normReferenceId: proposal.normReferenceId?.trim() || proposal.key,
      reference: proposal.reference,
      type: proposal.type,
      uri: proposal.uri ?? '',
      version: proposal.version ?? '',
    })
  }

  const createNormReferenceForProposal = async () => {
    if (!resolvingProposalKey) return
    setNormRefSubmitting(true)
    setNormRefError(null)
    try {
      const response = await apiFetch('/api/norm-references', {
        body: JSON.stringify(toNormReferencePayload(normRefForm)),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) {
        setNormRefError(await readResponseMessage(response))
        return
      }
      const created = (await response.json()) as NormReferenceOption
      setNormReferences(current => [...current, created])
      resolveProposalWithNormReference(resolvingProposalKey, created)
      setCreatedProposalKeys(current => [
        ...new Set([...current, resolvingProposalKey]),
      ])
      setResolvingProposalKey(null)
      setNormRefForm(EMPTY_NORM_REFERENCE_FORM)
      await refreshPreviewToken()
    } catch {
      setNormRefError(text.error)
    } finally {
      setNormRefSubmitting(false)
    }
  }

  const closeNormReferenceModal = () => {
    setResolvingProposalKey(null)
    setNormRefError(null)
    setNormRefForm(EMPTY_NORM_REFERENCE_FORM)
  }

  const downloadArtifact = async (kind: 'schema' | 'instruction') => {
    const instructionParams = new URLSearchParams({ locale })
    if (kind === 'instruction') {
      if (mode === 'specification-local') {
        if (specificationId == null) return
        instructionParams.set('kind', 'requirements_specification')
        instructionParams.set('specificationId', String(specificationId))
      } else {
        instructionParams.set('kind', 'requirements_library')
      }
    }
    const path =
      kind === 'schema'
        ? `/api/requirements/import/schema?locale=${locale}`
        : `/api/requirements/import/instruction?${instructionParams}`
    const response = await fetch(path)
    if (!response.ok) {
      setErrorMessage(await readResponseMessage(response))
      return
    }
    downloadBlob(
      await response.blob(),
      kind === 'schema' ? text.schemaFile : text.instructionFile,
    )
  }

  const readImportFile = async (file: File | undefined) => {
    if (!file) return
    setRawJson(await file.text())
    setErrorMessage(null)
  }

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    await readImportFile(event.target.files?.[0])
    event.target.value = ''
  }

  const handleJsonDrop = async (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    setJsonDropActive(false)
    await readImportFile(event.dataTransfer.files?.[0])
  }

  const loadPreview = async () => {
    setLoading(true)
    setErrorMessage(null)
    setNoticeMessage(null)
    try {
      if (rows.length > 0) {
        const ok = await confirm({
          confirmText: text.loadReview,
          icon: 'caution',
          message:
            locale === 'sv'
              ? 'Nuvarande importgranskning ersätts och gjorda ändringar försvinner.'
              : 'The current import review will be replaced and edited values will be lost.',
          title: text.loadReview,
          variant: 'default',
        })
        if (!ok) return
      }
      let payload: unknown
      try {
        payload = JSON.parse(rawJson)
      } catch {
        setErrorMessage(locale === 'sv' ? 'Ogiltig JSON.' : 'Invalid JSON.')
        return
      }
      const schemaResult = requirementsImportPayloadSchema.safeParse(payload)
      if (!schemaResult.success) {
        setErrorMessage(text.invalidSchema)
        return
      }
      const isLibrary = mode === 'library'
      if (isLibrary && !selectedAreaId) {
        setErrorMessage(
          locale === 'sv'
            ? 'Välj kravområde innan granskning laddas.'
            : 'Select a requirement area before previewing requirements.',
        )
        return
      }
      const response = await apiFetch(
        isLibrary
          ? '/api/requirements/import/preview'
          : '/api/specification-local-requirements/import/preview',
        {
          body: JSON.stringify({
            ...(isLibrary ? { areaId: Number(selectedAreaId) } : {}),
            ...(!isLibrary ? { specificationId } : {}),
            locale,
            payload: schemaResult.data,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      )
      if (!response.ok) {
        setErrorMessage(await readResponseMessage(response))
        return
      }
      const preview = (await response.json()) as ImportPreviewResponse
      setProposals(preview.proposals)
      setNeedsReferenceProposals(preview.needsReferenceProposals ?? [])
      setCreatedProposalKeys([])
      setCreatedNeedsReferenceProposalKeys([])
      setRows(preview.rows.map(revalidateEditableRow))
      setActiveReviewTab('requirements')
      setExpandedRowIds(new Set())
      setExpandedSummaryRowIds(new Set())
      setNormReferenceEditDraftIds({})
      setPackageEditDraftIds({})
      closeAssociationPicker()
      setPreviewToken(preview.previewToken)
      if (preview.rows.length >= 200) {
        setNoticeMessage(text.tooManyRows)
      }
    } finally {
      setLoading(false)
    }
  }

  const executeImport = async () => {
    if (!previewToken) return
    const selectedRows = rows.filter(row => row.selected)
    if (selectedRows.length === 0 || selectedErrors > 0) return
    if (selectedWarnings > 0) {
      const ok = await confirm({
        confirmText: text.execute,
        icon: 'caution',
        message: text.confirmWarnings,
        title: text.warnings,
        variant: 'default',
      })
      if (!ok) return
    }
    setLoading(true)
    setErrorMessage(null)
    try {
      const isLibrary = mode === 'library'
      const response = await apiFetch(
        isLibrary
          ? '/api/requirements/import/execute'
          : '/api/specification-local-requirements/import/execute',
        {
          body: JSON.stringify({
            ...(isLibrary ? { areaId: Number(selectedAreaId) } : {}),
            ...(!isLibrary ? { specificationId } : {}),
            locale,
            previewToken,
            rows: selectedRows.map(row => ({
              ...row.values,
              reviewRowId: row.reviewRowId,
              sourceIndex: row.sourceIndex,
            })),
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      )
      if (!response.ok) {
        setErrorMessage(await readResponseMessage(response))
        return
      }
      const result = (await response.json()) as ImportExecuteResponse
      const importedIds = new Set(selectedRows.map(row => row.reviewRowId))
      const remainingRows = rows.filter(
        row => !importedIds.has(row.reviewRowId),
      )
      setRows(remainingRows)
      setExpandedRowIds(current => {
        const next = new Set(current)
        for (const reviewRowId of importedIds) {
          next.delete(reviewRowId)
        }
        return next
      })
      setExpandedSummaryRowIds(current => {
        const next = new Set(current)
        for (const reviewRowId of importedIds) {
          next.delete(reviewRowId)
        }
        return next
      })
      setNormReferenceEditDraftIds(current => {
        const next = { ...current }
        for (const key of Object.keys(next)) {
          if (
            [...importedIds].some(reviewRowId =>
              key.startsWith(`${reviewRowId}:`),
            )
          ) {
            delete next[key]
          }
        }
        return next
      })
      setPackageEditDraftIds(current => {
        const next = { ...current }
        for (const key of Object.keys(next)) {
          if (
            [...importedIds].some(reviewRowId =>
              key.startsWith(`${reviewRowId}:`),
            )
          ) {
            delete next[key]
          }
        }
        return next
      })
      setProposals(current =>
        current
          .map(proposal => ({
            ...proposal,
            referencedCount: remainingRows.filter(row =>
              row.proposedNormReferenceKeys.includes(proposal.key),
            ).length,
          }))
          .filter(proposal => proposal.referencedCount > 0),
      )
      setNeedsReferenceProposals(current =>
        current
          .map(proposal => ({
            ...proposal,
            referencedCount: remainingRows.filter(
              row => row.proposedNeedsReferenceKey === proposal.key,
            ).length,
          }))
          .filter(proposal => proposal.referencedCount > 0),
      )
      setReceiptRows(result.createdRows)
      setNoticeMessage(null)
      setHadSuccessfulImport(true)
    } finally {
      setLoading(false)
    }
  }

  const titleBase =
    mode === 'library' ? text.importTitleLibrary : text.importTitleSpecification
  const titleDestination =
    mode === 'library' ? selectedAreaName : destinationName?.trim() || null
  const title = titleDestination
    ? importText('importTitleWithDestination', {
        destination: titleDestination,
        title: titleBase,
      })
    : titleBase
  const hasLoadedReview = previewToken !== null
  const isPreparingInitialImport = Boolean(
    initialImport &&
      !hasLoadedReview &&
      (initialImportLoading ||
        appliedInitialImportKeyRef.current !== initialImport.key),
  )
  const formatMessage = (message: ImportMessage) =>
    message.code === 'import_proposed_norm_reference_unresolved'
      ? text.proposedNormReferenceUnresolved(text.proposedNormReferences)
      : message.code === 'import_needs_reference_unresolved'
        ? text.proposedNeedsReferenceUnresolved(text.proposedNeedsReferences)
        : message.code ===
            'import_requirement_packages_ignored_for_specification_local'
          ? text.ignoredRequirementPackagesInfo
          : message.message
  const associationPickerRow = associationPicker
    ? rows.find(row => row.reviewRowId === associationPicker.reviewRowId)
    : null
  const associationPickerOptions =
    associationPicker?.kind === 'requirementPackages'
      ? taxonomy.requirementPackages.map(option => ({
          id: option.id,
          purposeAndScope: option.purposeAndScope,
          searchText: `${option.id} ${option.name} ${option.purposeAndScope}`,
          subtitle: null,
          title: option.name,
        }))
      : normReferences.map(option => ({
          id: option.id,
          purposeAndScope: null,
          searchText: `${option.id} ${option.normReferenceId} ${option.name}`,
          subtitle: option.normReferenceId,
          title: option.name,
        }))
  const normalizedAssociationPickerSearch = associationPickerSearch
    .trim()
    .toLocaleLowerCase('sv')
  const filteredAssociationPickerOptions =
    normalizedAssociationPickerSearch.length === 0
      ? associationPickerOptions
      : associationPickerOptions.filter(option =>
          option.searchText
            .toLocaleLowerCase('sv')
            .includes(normalizedAssociationPickerSearch),
        )
  const associationPickerTitle =
    associationPicker?.kind === 'requirementPackages'
      ? text.packagePickerTitle
      : text.normReferencePickerTitle
  const getLocalizedName = (option: TaxonomyOption) =>
    locale === 'sv' ? option.nameSv : option.nameEn
  const getPriorityLabel = (option: PriorityLevelOption) =>
    `${option.code} - ${getLocalizedName(option)}`
  const getPriorityChipLabel = (option: PriorityLevelOption) =>
    getLocalizedName(option)
  const getPriorityDescription = (option: PriorityLevelOption) =>
    locale === 'sv' ? option.descriptionSv : option.descriptionEn
  const getPriorityAssessmentCriteria = (option: PriorityLevelOption) =>
    locale === 'sv' ? option.assessmentCriteriaSv : option.assessmentCriteriaEn
  const getRowMessageSummary = (row: ImportPreviewRow) =>
    [
      row.errors.length > 0 ? text.errorCount(row.errors.length) : null,
      row.warnings.length > 0 ? text.warningCount(row.warnings.length) : null,
      (row.infos?.length ?? 0) > 0
        ? text.infoCount(row.infos?.length ?? 0)
        : null,
    ]
      .filter(Boolean)
      .join(', ')

  return createPortal(
    <>
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        role="dialog"
      >
        <div
          className={`flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-secondary-950 ${
            hasLoadedReview || isPreparingInitialImport
              ? 'h-[calc(100dvh-2rem)] max-w-6xl'
              : 'max-w-xl'
          }`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-secondary-200 px-5 py-3 dark:border-secondary-800">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-primary-700 dark:text-primary-300">
                JSON
              </p>
              <h2
                className="truncate text-lg font-semibold text-secondary-950 dark:text-secondary-50"
                id={titleId}
              >
                {title}
              </h2>
            </div>
            <button
              aria-label={text.close}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-secondary-100 dark:hover:bg-secondary-900"
              onClick={() => void closeDialog()}
              type="button"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          <div
            className={
              hasLoadedReview || isPreparingInitialImport
                ? 'min-h-0 flex-1 overflow-hidden'
                : 'overflow-y-auto overscroll-contain'
            }
          >
            {isPreparingInitialImport ? (
              <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 p-6 text-center">
                <Loader2
                  aria-hidden="true"
                  className="h-8 w-8 animate-spin text-primary-600"
                />
                <p className="text-sm font-medium text-secondary-700 dark:text-secondary-200">
                  {importText('loadingInitialImport')}
                </p>
              </div>
            ) : null}
            {!hasLoadedReview && !isPreparingInitialImport ? (
              <aside className="space-y-4 p-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      aria-describedby="requirements-import-download-help"
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-secondary-50 dark:border-secondary-700 dark:hover:bg-secondary-900"
                      onClick={() => void downloadArtifact('schema')}
                      type="button"
                    >
                      <Download aria-hidden="true" className="h-4 w-4" />
                      {text.downloadSchema}
                    </button>
                    <button
                      aria-describedby="requirements-import-download-help"
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-secondary-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-secondary-700 dark:hover:bg-secondary-900"
                      disabled={!canDownloadImportInstruction}
                      onClick={() => void downloadArtifact('instruction')}
                      type="button"
                    >
                      <FileJson aria-hidden="true" className="h-4 w-4" />
                      {text.downloadImportInstruction}
                    </button>
                  </div>
                  <p
                    className="max-w-3xl text-xs leading-relaxed text-secondary-500 dark:text-secondary-400"
                    id="requirements-import-download-help"
                  >
                    {text.downloadArtifactsHelp}
                  </p>
                </div>
                {mode === 'library' ? (
                  <div>
                    <label
                      className="mb-1 block text-sm font-medium"
                      htmlFor="requirements-import-area"
                    >
                      {text.area}
                      <RequiredFieldMarker />
                    </label>
                    <select
                      className={inputClass}
                      disabled={
                        rows.length > 0 ||
                        previewToken !== null ||
                        hadSuccessfulImport
                      }
                      id="requirements-import-area"
                      onChange={event => setSelectedAreaId(event.target.value)}
                      value={selectedAreaId}
                    >
                      <option value="">{text.area}...</option>
                      {authorableAreas.map(area => (
                        <option key={area.id} value={area.id}>
                          {area.prefix ? `${area.prefix} ` : ''}
                          {area.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="import-json"
                    >
                      {text.rawJson}
                      <RequiredFieldMarker />
                    </label>
                    <input
                      accept=".json,application/json"
                      className="hidden"
                      onChange={event => void handleFile(event)}
                      ref={fileInputRef}
                      type="file"
                    />
                  </div>
                  <button
                    className={`mb-2 flex min-h-24 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-3 text-center text-sm transition-colors ${
                      jsonDropActive
                        ? 'border-primary-500 bg-primary-50 text-primary-800 dark:border-primary-400 dark:bg-primary-950/30 dark:text-primary-100'
                        : 'border-secondary-300 bg-secondary-50/60 text-secondary-700 hover:border-primary-400 hover:bg-primary-50/60 dark:border-secondary-700 dark:bg-secondary-900/50 dark:text-secondary-200 dark:hover:border-primary-500 dark:hover:bg-primary-950/20'
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragEnter={event => {
                      event.preventDefault()
                      setJsonDropActive(true)
                    }}
                    onDragLeave={event => {
                      event.preventDefault()
                      setJsonDropActive(false)
                    }}
                    onDragOver={event => {
                      event.preventDefault()
                      setJsonDropActive(true)
                    }}
                    onDrop={event => void handleJsonDrop(event)}
                    type="button"
                  >
                    <FileInput aria-hidden="true" className="h-5 w-5" />
                    <span>{text.dropJsonFile}</span>
                  </button>
                  <textarea
                    className={`${inputClass} min-h-52 resize-y font-mono text-xs`}
                    id="import-json"
                    onChange={event => setRawJson(event.target.value)}
                    placeholder={text.rawJsonPlaceholder}
                    value={rawJson}
                  />
                </div>
                {!canLoadPreview && startImportDisabledReason ? (
                  <p
                    aria-live="polite"
                    className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
                  >
                    <AlertTriangle
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0"
                    />
                    <span>{startImportDisabledReason}</span>
                  </p>
                ) : null}
                <button
                  className="btn-primary inline-flex w-full items-center justify-center gap-2"
                  disabled={!canLoadPreview}
                  onClick={() => void loadPreview()}
                  type="button"
                >
                  {text.loadReview}
                </button>
                {errorMessage ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                    {errorMessage}
                  </p>
                ) : null}
                {noticeMessage ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                    {noticeMessage}
                  </p>
                ) : null}
              </aside>
            ) : null}
            {hasLoadedReview ? (
              <main className="flex h-full flex-col overflow-hidden">
                <div className="border-b border-secondary-200 px-4 pt-3 dark:border-secondary-800">
                  <div
                    aria-label={text.importReviewTabs}
                    className="flex flex-wrap gap-2"
                    role="tablist"
                  >
                    <button
                      aria-controls="requirements-import-requirements-panel"
                      aria-selected={activeReviewTab === 'requirements'}
                      className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium ${
                        activeReviewTab === 'requirements'
                          ? 'border-primary-600 text-primary-700 dark:border-primary-300 dark:text-primary-200'
                          : 'border-transparent text-secondary-600 hover:text-secondary-950 dark:text-secondary-300 dark:hover:text-secondary-50'
                      }`}
                      id="requirements-import-requirements-tab"
                      onClick={() => setActiveReviewTab('requirements')}
                      role="tab"
                      type="button"
                    >
                      {text.requirementsTab}
                      <span className="rounded-full bg-secondary-100 px-2 py-0.5 text-xs text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200">
                        {rows.length}
                      </span>
                    </button>
                    <button
                      aria-controls="requirements-import-proposals-panel"
                      aria-selected={activeReviewTab === 'proposals'}
                      className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium ${
                        activeReviewTab === 'proposals'
                          ? 'border-primary-600 text-primary-700 dark:border-primary-300 dark:text-primary-200'
                          : 'border-transparent text-secondary-600 hover:text-secondary-950 dark:text-secondary-300 dark:hover:text-secondary-50'
                      }`}
                      id="requirements-import-proposals-tab"
                      onClick={() => setActiveReviewTab('proposals')}
                      role="tab"
                      type="button"
                    >
                      {text.proposedNormReferences}
                      <span className="rounded-full bg-secondary-100 px-2 py-0.5 text-xs text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200">
                        {proposals.length}
                      </span>
                    </button>
                    {showNeedsReferenceProposalsTab ? (
                      <button
                        aria-controls="requirements-import-needs-reference-proposals-panel"
                        aria-selected={
                          activeReviewTab === 'needsReferenceProposals'
                        }
                        className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium ${
                          activeReviewTab === 'needsReferenceProposals'
                            ? 'border-primary-600 text-primary-700 dark:border-primary-300 dark:text-primary-200'
                            : 'border-transparent text-secondary-600 hover:text-secondary-950 dark:text-secondary-300 dark:hover:text-secondary-50'
                        }`}
                        id="requirements-import-needs-reference-proposals-tab"
                        onClick={() =>
                          setActiveReviewTab('needsReferenceProposals')
                        }
                        role="tab"
                        type="button"
                      >
                        {text.proposedNeedsReferences}
                        <span className="rounded-full bg-secondary-100 px-2 py-0.5 text-xs text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200">
                          {needsReferenceProposals.length}
                        </span>
                      </button>
                    ) : null}
                  </div>
                </div>
                {(errorMessage || noticeMessage || receiptRows.length > 0) && (
                  <div className="space-y-2 border-b border-secondary-200 px-4 py-3 dark:border-secondary-800">
                    {errorMessage ? (
                      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                        {errorMessage}
                      </p>
                    ) : null}
                    {noticeMessage ? (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                        {noticeMessage}
                      </p>
                    ) : null}
                    {receiptRows.length > 0 ? (
                      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                        <CheckCircle2
                          aria-hidden="true"
                          className="mr-1 inline h-4 w-4"
                        />
                        {text.success}: {receiptRows.length}
                      </p>
                    ) : null}
                  </div>
                )}
                {activeReviewTab === 'proposals' ? (
                  <section
                    aria-labelledby="requirements-import-proposals-tab"
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
                    id="requirements-import-proposals-panel"
                    role="tabpanel"
                  >
                    {proposals.length > 0 ? (
                      <div className="rounded-lg border border-secondary-200 bg-secondary-50/70 p-3 dark:border-secondary-800 dark:bg-secondary-900/50">
                        <h3 className="text-sm font-semibold text-secondary-950 dark:text-secondary-50">
                          {text.proposedNormReferences}
                        </h3>
                        <div className="mt-3 space-y-3">
                          {proposals.map(proposal => {
                            const wasCreatedFromProposal =
                              createdProposalKeys.includes(proposal.key)
                            const linkedNormReference =
                              proposal.resolvedNormReferenceDbId == null
                                ? null
                                : normReferences.find(
                                    normReference =>
                                      normReference.id ===
                                      proposal.resolvedNormReferenceDbId,
                                  )
                            return (
                              <article
                                className={`rounded-lg border bg-white p-3 dark:bg-secondary-950 ${
                                  proposal.resolvedNormReferenceDbId == null
                                    ? 'border-amber-300 dark:border-amber-900/70'
                                    : 'border-emerald-300 dark:border-emerald-900/70'
                                }`}
                                key={proposal.key}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="wrap-break-word text-sm font-semibold text-secondary-950 dark:text-secondary-50">
                                        {proposal.key}
                                      </p>
                                      {proposal.resolvedNormReferenceDbId !=
                                      null ? (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200">
                                          <CheckCircle2
                                            aria-hidden="true"
                                            className="h-3.5 w-3.5"
                                          />
                                          {text.proposalResolved}
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className="mt-1 wrap-break-word text-sm text-secondary-800 dark:text-secondary-100">
                                      {proposal.name}
                                    </p>
                                    <p className="mt-1 text-xs text-secondary-600 dark:text-secondary-300">
                                      {[
                                        proposal.type,
                                        proposal.reference,
                                        proposal.issuer,
                                      ]
                                        .filter(Boolean)
                                        .join(' - ')}
                                    </p>
                                    {linkedNormReference ? (
                                      <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">
                                        {linkedNormReference.normReferenceId} -{' '}
                                        {linkedNormReference.name}
                                      </p>
                                    ) : null}
                                  </div>
                                  <button
                                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-secondary-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-secondary-700 dark:hover:bg-secondary-900"
                                    disabled={
                                      proposal.resolvedNormReferenceDbId != null
                                    }
                                    onClick={() =>
                                      openCreateNormReference(proposal)
                                    }
                                    type="button"
                                  >
                                    {text.createNormReference}
                                  </button>
                                </div>
                                <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                                  <label
                                    className={
                                      wasCreatedFromProposal ? 'opacity-50' : ''
                                    }
                                  >
                                    <span className="mb-1 block text-sm font-medium">
                                      {text.linkExistingNormReference}
                                    </span>
                                    <select
                                      className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-70`}
                                      disabled={wasCreatedFromProposal}
                                      onChange={event => {
                                        const normReference =
                                          normReferences.find(
                                            candidate =>
                                              candidate.id ===
                                              Number(event.target.value),
                                          )
                                        if (!normReference) return
                                        resolveProposalWithNormReference(
                                          proposal.key,
                                          normReference,
                                        )
                                      }}
                                      value={
                                        proposal.resolvedNormReferenceDbId ?? ''
                                      }
                                    >
                                      <option value="">
                                        {text.noExistingNormReference}
                                      </option>
                                      {normReferences.map(normReference => (
                                        <option
                                          key={normReference.id}
                                          value={normReference.id}
                                        >
                                          {normReference.normReferenceId} -{' '}
                                          {normReference.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <div className="text-sm text-secondary-600 dark:text-secondary-300 md:self-end md:pb-2">
                                    {text.proposalUsedByRows}:{' '}
                                    {proposal.referencedCount}
                                  </div>
                                </div>
                                {proposal.warnings.length > 0 ? (
                                  <ul className="mt-3 space-y-1 text-sm">
                                    {proposal.warnings.map(message => (
                                      <li
                                        className="text-amber-800 dark:text-amber-200"
                                        key={`${message.code}-${message.originalValue ?? ''}`}
                                      >
                                        <AlertTriangle
                                          aria-hidden="true"
                                          className="mr-1 inline h-4 w-4"
                                        />
                                        {formatMessage(message)}
                                        {message.originalValue
                                          ? ` (${message.originalValue})`
                                          : ''}
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </article>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="rounded-lg border border-dashed border-secondary-300 p-6 text-center text-sm text-secondary-500 dark:border-secondary-700 dark:text-secondary-400">
                        {text.noProposals}
                      </p>
                    )}
                  </section>
                ) : null}
                {activeReviewTab === 'needsReferenceProposals' ? (
                  <section
                    aria-labelledby="requirements-import-needs-reference-proposals-tab"
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
                    id="requirements-import-needs-reference-proposals-panel"
                    role="tabpanel"
                  >
                    {needsReferenceProposals.length > 0 ? (
                      <div className="rounded-lg border border-secondary-200 bg-secondary-50/70 p-3 dark:border-secondary-800 dark:bg-secondary-900/50">
                        <h3 className="text-sm font-semibold text-secondary-950 dark:text-secondary-50">
                          {text.proposedNeedsReferences}
                        </h3>
                        <div className="mt-3 space-y-3">
                          {needsReferenceProposals.map(proposal => {
                            const wasCreatedFromProposal =
                              createdNeedsReferenceProposalKeys.includes(
                                proposal.key,
                              )
                            const linkedNeedsReference =
                              proposal.resolvedNeedsReferenceId == null
                                ? null
                                : localNeedsReferences.find(
                                    needsReference =>
                                      needsReference.id ===
                                      proposal.resolvedNeedsReferenceId,
                                  )
                            return (
                              <article
                                className={`rounded-lg border bg-white p-3 dark:bg-secondary-950 ${
                                  proposal.resolvedNeedsReferenceId == null
                                    ? 'border-amber-300 dark:border-amber-900/70'
                                    : 'border-emerald-300 dark:border-emerald-900/70'
                                }`}
                                key={proposal.key}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <h4 className="wrap-break-word text-sm font-semibold text-secondary-950 dark:text-secondary-50">
                                      {proposal.text}
                                    </h4>
                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                      <p className="wrap-break-word text-xs text-secondary-600 dark:text-secondary-300">
                                        {text.proposalImportKey}: {proposal.key}
                                      </p>
                                      {proposal.resolvedNeedsReferenceId !=
                                      null ? (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200">
                                          <CheckCircle2
                                            aria-hidden="true"
                                            className="h-3.5 w-3.5"
                                          />
                                          {text.proposalResolved}
                                        </span>
                                      ) : null}
                                    </div>
                                    {proposal.description ? (
                                      <p className="mt-1 wrap-break-word text-xs text-secondary-600 dark:text-secondary-300">
                                        {proposal.description}
                                      </p>
                                    ) : null}
                                    {linkedNeedsReference ? (
                                      <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">
                                        {linkedNeedsReference.text}
                                      </p>
                                    ) : null}
                                  </div>
                                  <button
                                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-secondary-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-secondary-700 dark:hover:bg-secondary-900"
                                    disabled={
                                      proposal.resolvedNeedsReferenceId != null
                                    }
                                    onClick={() =>
                                      void createNeedsReferenceForProposal(
                                        proposal,
                                      )
                                    }
                                    type="button"
                                  >
                                    {text.createNeedsReference}
                                  </button>
                                </div>
                                <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                                  <label
                                    className={
                                      wasCreatedFromProposal ? 'opacity-50' : ''
                                    }
                                  >
                                    <span className="mb-1 block text-sm font-medium">
                                      {text.linkExistingNeedsReference}
                                    </span>
                                    <select
                                      className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-70`}
                                      disabled={wasCreatedFromProposal}
                                      onChange={event => {
                                        const needsReference =
                                          localNeedsReferences.find(
                                            candidate =>
                                              candidate.id ===
                                              Number(event.target.value),
                                          )
                                        if (!needsReference) return
                                        resolveProposalWithNeedsReference(
                                          proposal.key,
                                          needsReference,
                                        )
                                      }}
                                      value={
                                        proposal.resolvedNeedsReferenceId ?? ''
                                      }
                                    >
                                      <option value="">
                                        {text.noExistingNeedsReference}
                                      </option>
                                      {localNeedsReferences.map(
                                        needsReference => (
                                          <option
                                            key={needsReference.id}
                                            value={needsReference.id}
                                          >
                                            {needsReference.text}
                                          </option>
                                        ),
                                      )}
                                    </select>
                                  </label>
                                  <div className="text-sm text-secondary-600 dark:text-secondary-300 md:self-end md:pb-2">
                                    {text.proposalUsedByRows}:{' '}
                                    {proposal.referencedCount}
                                  </div>
                                </div>
                                {proposal.warnings.length > 0 ? (
                                  <ul className="mt-3 space-y-1 text-sm">
                                    {proposal.warnings.map(message => (
                                      <li
                                        className="text-amber-800 dark:text-amber-200"
                                        key={`${message.code}-${message.originalValue ?? ''}`}
                                      >
                                        <AlertTriangle
                                          aria-hidden="true"
                                          className="mr-1 inline h-4 w-4"
                                        />
                                        {formatMessage(message)}
                                        {message.originalValue
                                          ? ` (${message.originalValue})`
                                          : ''}
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </article>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="rounded-lg border border-dashed border-secondary-300 p-6 text-center text-sm text-secondary-500 dark:border-secondary-700 dark:text-secondary-400">
                        {text.noNeedsReferenceProposals}
                      </p>
                    )}
                  </section>
                ) : null}
                {activeReviewTab === 'requirements' ? (
                  <section
                    aria-labelledby="requirements-import-requirements-tab"
                    className="flex min-h-0 flex-1 flex-col overflow-hidden"
                    id="requirements-import-requirements-panel"
                    role="tabpanel"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary-200 bg-white px-4 py-3 dark:border-secondary-800 dark:bg-secondary-950">
                      <div className="text-sm text-secondary-600 dark:text-secondary-300">
                        {selectedCount} {text.selectedRows}
                        {selectedErrors > 0
                          ? `, ${selectedErrors} ${text.errors}`
                          : ''}
                        {selectedWarnings > 0
                          ? `, ${selectedWarnings} ${text.warnings}`
                          : ''}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-secondary-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-secondary-700 dark:hover:bg-secondary-900"
                          disabled={rows.length === 0 || allRowsExpanded}
                          onClick={expandAllRows}
                          type="button"
                        >
                          <ChevronsDown
                            aria-hidden="true"
                            className="h-4 w-4"
                          />
                          {text.expandAll}
                        </button>
                        <button
                          className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-secondary-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-secondary-700 dark:hover:bg-secondary-900"
                          disabled={rows.length === 0 || allRowsCollapsed}
                          onClick={collapseAllRows}
                          type="button"
                        >
                          <ChevronsUp aria-hidden="true" className="h-4 w-4" />
                          {text.collapseAll}
                        </button>
                        {receiptRows.length > 0 ? (
                          <button
                            className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-secondary-50 dark:border-secondary-700 dark:hover:bg-secondary-900"
                            onClick={() =>
                              downloadText(
                                'requirements-import-receipt.csv',
                                receiptCsv(receiptRows),
                                'text/csv;charset=utf-8',
                                { bom: true },
                              )
                            }
                            type="button"
                          >
                            <Download aria-hidden="true" className="h-4 w-4" />
                            {text.downloadCsv}
                          </button>
                        ) : null}
                        <button
                          className="btn-primary inline-flex items-center gap-2"
                          disabled={
                            loading ||
                            !previewToken ||
                            selectedCount === 0 ||
                            selectedErrors > 0
                          }
                          onClick={() => void executeImport()}
                          type="button"
                        >
                          <Upload aria-hidden="true" className="h-4 w-4" />
                          {text.execute}
                        </button>
                      </div>
                    </div>
                    {rows.length === 0 ? (
                      <p className="m-4 rounded-lg border border-dashed border-secondary-300 p-6 text-center text-sm text-secondary-500 dark:border-secondary-700 dark:text-secondary-400">
                        {text.noRows}
                      </p>
                    ) : (
                      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
                        {rows.map(row => {
                          const rowNumber = row.sourceIndex + 1
                          const isExpanded = expandedRowIds.has(row.reviewRowId)
                          const summaryExpanded = expandedSummaryRowIds.has(
                            row.reviewRowId,
                          )
                          const rowMessageSummary = getRowMessageSummary(row)
                          const selectedPriorityLevel =
                            row.values.priorityLevelId == null
                              ? null
                              : (taxonomy.priorityLevels.find(
                                  option =>
                                    option.id === row.values.priorityLevelId,
                                ) ?? null)
                          return (
                            <div
                              className="grid gap-2 md:grid-cols-[3rem_minmax(0,1fr)] md:items-start"
                              key={row.reviewRowId}
                            >
                              <div className="hidden pt-4 text-sm font-semibold text-secondary-700 dark:text-secondary-200 md:block">
                                #{rowNumber}
                              </div>
                              <article
                                className={`rounded-lg border ${
                                  row.selected && row.errors.length > 0
                                    ? 'border-red-300 bg-red-50/60 dark:border-red-900/70 dark:bg-red-950/20'
                                    : row.selected && row.warnings.length > 0
                                      ? 'border-amber-300 bg-amber-50/60 dark:border-amber-900/70 dark:bg-amber-950/20'
                                      : row.selected
                                        ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-900/70 dark:bg-emerald-950/10'
                                        : 'border-secondary-200 bg-white dark:border-secondary-800 dark:bg-secondary-950'
                                }`}
                              >
                                <div
                                  className={`grid gap-3 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start ${
                                    !row.selected && !isExpanded
                                      ? 'opacity-70'
                                      : ''
                                  }`}
                                >
                                  <div className="flex min-w-12 flex-col items-center gap-2">
                                    <span className="text-sm font-semibold text-secondary-700 dark:text-secondary-200 md:hidden">
                                      #{rowNumber}
                                    </span>
                                    <button
                                      aria-checked={row.selected}
                                      aria-label={
                                        row.selected
                                          ? text.deselectRowForImport(rowNumber)
                                          : text.selectRowForImport(rowNumber)
                                      }
                                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400/50 ${
                                        row.selected
                                          ? 'border-primary-600 bg-primary-600'
                                          : 'border-secondary-300 bg-secondary-200 dark:border-secondary-700 dark:bg-secondary-800'
                                      }`}
                                      onClick={event => {
                                        event.stopPropagation()
                                        updateRow(row.reviewRowId, current => ({
                                          ...current,
                                          selected: !current.selected,
                                        }))
                                      }}
                                      role="switch"
                                      type="button"
                                    >
                                      <span
                                        aria-hidden="true"
                                        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                                          row.selected
                                            ? 'translate-x-5'
                                            : 'translate-x-1'
                                        }`}
                                      />
                                    </button>
                                    <button
                                      aria-label={`${isExpanded ? text.collapseRow : text.expandRow} #${rowNumber}`}
                                      className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-secondary-200 text-secondary-600 hover:bg-secondary-50 dark:border-secondary-700 dark:text-secondary-300 dark:hover:bg-secondary-900"
                                      onClick={() =>
                                        toggleRowExpanded(row.reviewRowId)
                                      }
                                      type="button"
                                    >
                                      {isExpanded ? (
                                        <ChevronDown
                                          aria-hidden="true"
                                          className="h-4 w-4"
                                        />
                                      ) : (
                                        <ChevronRight
                                          aria-hidden="true"
                                          className="h-4 w-4"
                                        />
                                      )}
                                    </button>
                                  </div>
                                  <div className="min-w-0 space-y-2">
                                    <RequirementSummaryText
                                      allowToggle={!isExpanded}
                                      collapseLabel={text.showLess}
                                      expanded={!isExpanded && summaryExpanded}
                                      expandLabel={text.showMore}
                                      onRowToggle={() =>
                                        toggleRowExpanded(row.reviewRowId)
                                      }
                                      onToggle={() =>
                                        toggleSummaryExpanded(row.reviewRowId)
                                      }
                                      rowActionLabel={`${isExpanded ? text.collapseRow : text.expandRow} #${rowNumber}: ${row.values.description}`}
                                      textValue={row.values.description}
                                    />
                                    <div className="flex flex-wrap items-center gap-2">
                                      {selectedPriorityLevel ? (
                                        <span
                                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
                                          style={priorityChipStyle(
                                            selectedPriorityLevel,
                                          )}
                                        >
                                          {getPriorityChipLabel(
                                            selectedPriorityLevel,
                                          )}
                                        </span>
                                      ) : null}
                                      {rowMessageSummary ? (
                                        <button
                                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
                                            row.errors.length > 0
                                              ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200 dark:hover:bg-red-950/50'
                                              : row.warnings.length > 0
                                                ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-950/50'
                                                : 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50'
                                          }`}
                                          onClick={event => {
                                            event.stopPropagation()
                                            setRowExpanded(
                                              row.reviewRowId,
                                              true,
                                            )
                                          }}
                                          type="button"
                                        >
                                          {row.errors.length > 0 ||
                                          row.warnings.length > 0 ? (
                                            <AlertTriangle
                                              aria-hidden="true"
                                              className="h-3.5 w-3.5"
                                            />
                                          ) : (
                                            <Info
                                              aria-hidden="true"
                                              className="h-3.5 w-3.5"
                                            />
                                          )}
                                          {rowMessageSummary}
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="flex items-start justify-end gap-2">
                                    <button
                                      aria-label={text.remove}
                                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-secondary-200 text-secondary-600 hover:bg-secondary-50 dark:border-secondary-700 dark:text-secondary-300 dark:hover:bg-secondary-900"
                                      onClick={event => {
                                        event.stopPropagation()
                                        setRows(current =>
                                          current.filter(
                                            candidate =>
                                              candidate.reviewRowId !==
                                              row.reviewRowId,
                                          ),
                                        )
                                        removeRowState(row.reviewRowId)
                                        clearNormReferenceDrafts(
                                          row.reviewRowId,
                                        )
                                        clearPackageDrafts(row.reviewRowId)
                                      }}
                                      title={text.remove}
                                      type="button"
                                    >
                                      <Trash2
                                        aria-hidden="true"
                                        className="h-4 w-4"
                                      />
                                    </button>
                                  </div>
                                </div>
                                {isExpanded ? (
                                  <div className="grid gap-3 border-t border-secondary-200 p-3 dark:border-secondary-800 md:grid-cols-2">
                                    <label className="md:col-span-2">
                                      <span className="mb-1 block text-sm font-medium">
                                        {text.requirementText}
                                        <RequiredFieldMarker />
                                      </span>
                                      <textarea
                                        className={`${inputClass} min-h-24`}
                                        onChange={event =>
                                          updateRowValue(
                                            row.reviewRowId,
                                            'description',
                                            event.target.value,
                                          )
                                        }
                                        value={row.values.description}
                                      />
                                    </label>
                                    <label className="md:col-span-2">
                                      <span className="mb-1 block text-sm font-medium">
                                        {text.acceptanceCriteria}
                                      </span>
                                      <textarea
                                        className={`${inputClass} min-h-20`}
                                        onChange={event =>
                                          updateRowValue(
                                            row.reviewRowId,
                                            'acceptanceCriteria',
                                            event.target.value || null,
                                          )
                                        }
                                        value={
                                          row.values.acceptanceCriteria ?? ''
                                        }
                                      />
                                    </label>
                                    <label>
                                      <span className="mb-1 block text-sm font-medium">
                                        {text.category}
                                      </span>
                                      <select
                                        className={inputClass}
                                        onChange={event =>
                                          updateRowValue(
                                            row.reviewRowId,
                                            'categoryId',
                                            event.target.value
                                              ? Number(event.target.value)
                                              : null,
                                          )
                                        }
                                        value={row.values.categoryId ?? ''}
                                      >
                                        <option value="">-</option>
                                        {taxonomy.categories.map(option => (
                                          <option
                                            key={option.id}
                                            value={option.id}
                                          >
                                            {locale === 'sv'
                                              ? option.nameSv
                                              : option.nameEn}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label>
                                      <span className="mb-1 block text-sm font-medium">
                                        {text.priorityLevel}
                                      </span>
                                      <select
                                        className={inputClass}
                                        onChange={event =>
                                          updateRowValue(
                                            row.reviewRowId,
                                            'priorityLevelId',
                                            event.target.value
                                              ? Number(event.target.value)
                                              : null,
                                          )
                                        }
                                        value={row.values.priorityLevelId ?? ''}
                                      >
                                        <option value="">-</option>
                                        {taxonomy.priorityLevels.map(option => (
                                          <option
                                            key={option.id}
                                            value={option.id}
                                          >
                                            {getPriorityLabel(option)}
                                          </option>
                                        ))}
                                      </select>
                                      {selectedPriorityLevel ? (
                                        <div className="mt-2 rounded-lg border border-secondary-200 bg-secondary-50 px-3 py-2 text-xs leading-relaxed text-secondary-700 dark:border-secondary-700 dark:bg-secondary-900/40 dark:text-secondary-200">
                                          <p>
                                            {getPriorityDescription(
                                              selectedPriorityLevel,
                                            )}
                                          </p>
                                          <p className="mt-1 text-secondary-500 dark:text-secondary-400">
                                            {getPriorityAssessmentCriteria(
                                              selectedPriorityLevel,
                                            )}
                                          </p>
                                        </div>
                                      ) : null}
                                    </label>
                                    <label>
                                      <span className="mb-1 block text-sm font-medium">
                                        {text.type}
                                      </span>
                                      <select
                                        className={inputClass}
                                        onChange={event =>
                                          updateRowTypeId(
                                            row.reviewRowId,
                                            event.target.value
                                              ? Number(event.target.value)
                                              : null,
                                          )
                                        }
                                        value={row.values.typeId ?? ''}
                                      >
                                        <option value="">-</option>
                                        {taxonomy.types.map(option => (
                                          <option
                                            key={option.id}
                                            value={option.id}
                                          >
                                            {locale === 'sv'
                                              ? option.nameSv
                                              : option.nameEn}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label
                                      className={
                                        row.values.typeId == null
                                          ? 'opacity-60'
                                          : undefined
                                      }
                                    >
                                      <span className="mb-1 block text-sm font-medium">
                                        {text.qualityCharacteristic}
                                      </span>
                                      <select
                                        className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-70`}
                                        disabled={row.values.typeId == null}
                                        onChange={event =>
                                          updateRowValue(
                                            row.reviewRowId,
                                            'qualityCharacteristicId',
                                            event.target.value
                                              ? Number(event.target.value)
                                              : null,
                                          )
                                        }
                                        value={
                                          row.values.qualityCharacteristicId ??
                                          ''
                                        }
                                      >
                                        <option value="">-</option>
                                        <QualityCharacteristicSelectOptions
                                          locale={locale}
                                          options={getQualityCharacteristicOptionsForRow(
                                            row,
                                          )}
                                        />
                                      </select>
                                    </label>
                                    {mode === 'specification-local' ? (
                                      <label>
                                        <span className="mb-1 block text-sm font-medium">
                                          {text.needsReference}
                                        </span>
                                        <select
                                          className={inputClass}
                                          onChange={event =>
                                            updateRowValue(
                                              row.reviewRowId,
                                              'needsReferenceId',
                                              event.target.value
                                                ? Number(event.target.value)
                                                : null,
                                            )
                                          }
                                          value={
                                            row.values.needsReferenceId ?? ''
                                          }
                                        >
                                          <option value="">-</option>
                                          {localNeedsReferences.map(option => (
                                            <option
                                              key={option.id}
                                              value={option.id}
                                            >
                                              {option.text}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                    ) : null}
                                    <label className="inline-flex min-h-11 items-center gap-2 text-sm font-medium">
                                      <input
                                        checked={row.values.verifiable}
                                        onChange={event =>
                                          updateRowValue(
                                            row.reviewRowId,
                                            'verifiable',
                                            event.target.checked,
                                          )
                                        }
                                        type="checkbox"
                                      />
                                      {text.verifiable}
                                    </label>
                                    <label>
                                      <span className="mb-1 block text-sm font-medium">
                                        {text.verificationMethod}
                                        {row.values.verifiable ? (
                                          <RequiredFieldMarker />
                                        ) : null}
                                      </span>
                                      <input
                                        className={inputClass}
                                        disabled={!row.values.verifiable}
                                        onChange={event =>
                                          updateRowValue(
                                            row.reviewRowId,
                                            'verificationMethod',
                                            event.target.value || null,
                                          )
                                        }
                                        value={
                                          row.values.verificationMethod ?? ''
                                        }
                                      />
                                    </label>
                                    {mode === 'library' ? (
                                      <div>
                                        <span className="mb-1 block text-sm font-medium">
                                          {text.packageIds}
                                        </span>
                                        <div className="space-y-2">
                                          {row.values.requirementPackageIds
                                            .length > 0 ? (
                                            <div className="space-y-2">
                                              {row.values.requirementPackageIds.map(
                                                (packageId, index) => {
                                                  const requirementPackage =
                                                    taxonomy.requirementPackages.find(
                                                      candidate =>
                                                        candidate.id ===
                                                        packageId,
                                                    )
                                                  const inputId = `requirements-import-row-${row.sourceIndex}-package-${index}`
                                                  const draftKey = `${row.reviewRowId}:${packageId}`
                                                  const inputValue =
                                                    packageEditDraftIds[
                                                      draftKey
                                                    ] ?? String(packageId)

                                                  return (
                                                    <div
                                                      className={
                                                        requirementPackage
                                                          ? resolvedAssociationRowClass
                                                          : editableIdRowClass
                                                      }
                                                      key={`${row.reviewRowId}-package-${packageId}`}
                                                    >
                                                      {requirementPackage ? (
                                                        <RequirementPackagePurposeTooltip
                                                          maxWidth={320}
                                                          purposeAndScope={
                                                            requirementPackage.purposeAndScope
                                                          }
                                                        >
                                                          <p
                                                            className={
                                                              resolvedAssociationLabelClass
                                                            }
                                                          >
                                                            {
                                                              requirementPackage.name
                                                            }
                                                          </p>
                                                        </RequirementPackagePurposeTooltip>
                                                      ) : (
                                                        <>
                                                          <label
                                                            className="sr-only"
                                                            htmlFor={inputId}
                                                          >
                                                            {text.packageIds}{' '}
                                                            {index + 1}
                                                          </label>
                                                          <input
                                                            className={
                                                              inputClass
                                                            }
                                                            id={inputId}
                                                            min={1}
                                                            onBlur={event =>
                                                              updatePackageId(
                                                                row,
                                                                index,
                                                                event.target
                                                                  .value,
                                                                draftKey,
                                                              )
                                                            }
                                                            onChange={event =>
                                                              setPackageEditDraftIds(
                                                                current => ({
                                                                  ...current,
                                                                  [draftKey]:
                                                                    event.target
                                                                      .value,
                                                                }),
                                                              )
                                                            }
                                                            onKeyDown={event => {
                                                              if (
                                                                event.key !==
                                                                'Enter'
                                                              ) {
                                                                return
                                                              }
                                                              event.preventDefault()
                                                              updatePackageId(
                                                                row,
                                                                index,
                                                                event
                                                                  .currentTarget
                                                                  .value,
                                                                draftKey,
                                                              )
                                                            }}
                                                            type="number"
                                                            value={inputValue}
                                                          />
                                                        </>
                                                      )}
                                                      {requirementPackage ? null : (
                                                        <p
                                                          className={`${editableIdLabelClass} text-amber-800 dark:text-amber-200`}
                                                        >
                                                          {
                                                            text.unknownPackageId
                                                          }
                                                        </p>
                                                      )}
                                                      <button
                                                        aria-label={`${text.removePackageId} ${index + 1}`}
                                                        className={
                                                          requirementPackage
                                                            ? resolvedAssociationRemoveButtonClass
                                                            : editableIdRemoveButtonClass
                                                        }
                                                        onClick={() =>
                                                          updateRowValue(
                                                            row.reviewRowId,
                                                            'requirementPackageIds',
                                                            row.values.requirementPackageIds.filter(
                                                              (
                                                                _,
                                                                candidateIndex,
                                                              ) =>
                                                                candidateIndex !==
                                                                index,
                                                            ),
                                                          )
                                                        }
                                                        title={
                                                          text.removePackageId
                                                        }
                                                        type="button"
                                                      >
                                                        <Trash2
                                                          aria-hidden="true"
                                                          className="h-4 w-4"
                                                        />
                                                      </button>
                                                    </div>
                                                  )
                                                },
                                              )}
                                            </div>
                                          ) : (
                                            <p className="rounded-lg border border-dashed border-secondary-300 px-3 py-2 text-sm text-secondary-500 dark:border-secondary-700 dark:text-secondary-400">
                                              {text.noPackageIds}
                                            </p>
                                          )}
                                          <button
                                            className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-secondary-50 dark:border-secondary-700 dark:hover:bg-secondary-900"
                                            onClick={() =>
                                              openAssociationPicker(
                                                'requirementPackages',
                                                row,
                                              )
                                            }
                                            type="button"
                                          >
                                            <Plus
                                              aria-hidden="true"
                                              className="h-4 w-4"
                                            />
                                            {text.packagePickerTitle}
                                          </button>
                                        </div>
                                      </div>
                                    ) : null}
                                    <div>
                                      <span className="mb-1 block text-sm font-medium">
                                        {text.normReferenceIds}
                                      </span>
                                      <div className="space-y-2">
                                        {row.values.normReferenceIds.length >
                                        0 ? (
                                          <div className="space-y-2">
                                            {row.values.normReferenceIds.map(
                                              (normReferenceId, index) => {
                                                const normReference =
                                                  normReferences.find(
                                                    candidate =>
                                                      candidate.id ===
                                                      normReferenceId,
                                                  )
                                                const inputId = `requirements-import-row-${row.sourceIndex}-norm-reference-${index}`
                                                const draftKey = `${row.reviewRowId}:${normReferenceId}`
                                                const inputValue =
                                                  normReferenceEditDraftIds[
                                                    draftKey
                                                  ] ?? String(normReferenceId)

                                                return (
                                                  <div
                                                    className={
                                                      normReference
                                                        ? resolvedAssociationRowClass
                                                        : editableIdRowClass
                                                    }
                                                    key={`${row.reviewRowId}-norm-reference-${normReferenceId}`}
                                                  >
                                                    {normReference ? (
                                                      <p
                                                        className={
                                                          resolvedAssociationLabelClass
                                                        }
                                                      >
                                                        {
                                                          normReference.normReferenceId
                                                        }
                                                        {' - '}
                                                        {normReference.name}
                                                      </p>
                                                    ) : (
                                                      <>
                                                        <label
                                                          className="sr-only"
                                                          htmlFor={inputId}
                                                        >
                                                          {
                                                            text.normReferenceIds
                                                          }{' '}
                                                          {index + 1}
                                                        </label>
                                                        <input
                                                          className={inputClass}
                                                          id={inputId}
                                                          min={1}
                                                          onBlur={event =>
                                                            updateNormReferenceId(
                                                              row,
                                                              index,
                                                              event.target
                                                                .value,
                                                              draftKey,
                                                            )
                                                          }
                                                          onChange={event =>
                                                            setNormReferenceEditDraftIds(
                                                              current => ({
                                                                ...current,
                                                                [draftKey]:
                                                                  event.target
                                                                    .value,
                                                              }),
                                                            )
                                                          }
                                                          onKeyDown={event => {
                                                            if (
                                                              event.key !==
                                                              'Enter'
                                                            ) {
                                                              return
                                                            }
                                                            event.preventDefault()
                                                            updateNormReferenceId(
                                                              row,
                                                              index,
                                                              event
                                                                .currentTarget
                                                                .value,
                                                              draftKey,
                                                            )
                                                          }}
                                                          type="number"
                                                          value={inputValue}
                                                        />
                                                      </>
                                                    )}
                                                    {normReference ? null : (
                                                      <p
                                                        className={`${editableIdLabelClass} text-amber-800 dark:text-amber-200`}
                                                      >
                                                        {
                                                          text.unknownNormReferenceId
                                                        }
                                                      </p>
                                                    )}
                                                    <button
                                                      aria-label={`${text.removeNormReferenceId} ${index + 1}`}
                                                      className={
                                                        normReference
                                                          ? resolvedAssociationRemoveButtonClass
                                                          : editableIdRemoveButtonClass
                                                      }
                                                      onClick={() =>
                                                        updateRowValue(
                                                          row.reviewRowId,
                                                          'normReferenceIds',
                                                          row.values.normReferenceIds.filter(
                                                            (
                                                              _,
                                                              candidateIndex,
                                                            ) =>
                                                              candidateIndex !==
                                                              index,
                                                          ),
                                                        )
                                                      }
                                                      title={
                                                        text.removeNormReferenceId
                                                      }
                                                      type="button"
                                                    >
                                                      <Trash2
                                                        aria-hidden="true"
                                                        className="h-4 w-4"
                                                      />
                                                    </button>
                                                  </div>
                                                )
                                              },
                                            )}
                                          </div>
                                        ) : (
                                          <p className="rounded-lg border border-dashed border-secondary-300 px-3 py-2 text-sm text-secondary-500 dark:border-secondary-700 dark:text-secondary-400">
                                            {text.noNormReferenceIds}
                                          </p>
                                        )}
                                        <button
                                          className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-secondary-50 dark:border-secondary-700 dark:hover:bg-secondary-900"
                                          onClick={() =>
                                            openAssociationPicker(
                                              'normReferences',
                                              row,
                                            )
                                          }
                                          type="button"
                                        >
                                          <Plus
                                            aria-hidden="true"
                                            className="h-4 w-4"
                                          />
                                          {text.normReferencePickerTitle}
                                        </button>
                                      </div>
                                    </div>
                                    {[
                                      ...row.errors,
                                      ...row.warnings,
                                      ...(row.infos ?? []),
                                    ].length > 0 ? (
                                      <ul className="space-y-1 text-sm md:col-span-2">
                                        {[
                                          ...row.errors,
                                          ...row.warnings,
                                          ...(row.infos ?? []),
                                        ].map(message => (
                                          <li
                                            className={
                                              message.level === 'error'
                                                ? 'text-red-700 dark:text-red-300'
                                                : message.level === 'warning'
                                                  ? 'text-amber-800 dark:text-amber-200'
                                                  : 'text-sky-700 dark:text-sky-200'
                                            }
                                            key={`${message.code}-${message.field ?? ''}-${message.originalValue ?? ''}`}
                                          >
                                            {message.level === 'info' ? (
                                              <Info
                                                aria-hidden="true"
                                                className="mr-1 inline h-4 w-4"
                                              />
                                            ) : (
                                              <AlertTriangle
                                                aria-hidden="true"
                                                className="mr-1 inline h-4 w-4"
                                              />
                                            )}
                                            {formatMessage(message)}
                                            {message.originalValue
                                              ? ` (${message.originalValue})`
                                              : ''}
                                          </li>
                                        ))}
                                      </ul>
                                    ) : null}
                                  </div>
                                ) : null}
                              </article>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </section>
                ) : null}
              </main>
            ) : null}
          </div>
        </div>
      </div>
      {resolvingProposalKey ? (
        <NormReferenceModal
          idPrefix="requirements-import-norm-reference"
          normRefError={normRefError}
          normReferenceIdHelperText={text.normReferenceIdPrefillHelp}
          normRefForm={normRefForm}
          normRefFormDirty={normRefFormDirty}
          normRefSubmitting={normRefSubmitting}
          onCancel={closeNormReferenceModal}
          onSave={() => void createNormReferenceForProposal()}
          onSetField={(field, value) =>
            setNormRefForm(current => ({ ...current, [field]: value }))
          }
        />
      ) : null}
      {associationPicker && associationPickerRow ? (
        <div
          aria-labelledby="requirements-import-association-picker-title"
          aria-modal="true"
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
          role="dialog"
        >
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-secondary-950">
            <div className="flex items-center justify-between gap-3 border-b border-secondary-200 px-5 py-3 dark:border-secondary-800">
              <div className="min-w-0">
                <h3
                  className="truncate text-lg font-semibold text-secondary-950 dark:text-secondary-50"
                  id="requirements-import-association-picker-title"
                >
                  {associationPickerTitle}
                </h3>
                <p className="text-sm text-secondary-600 dark:text-secondary-300">
                  {text.pickerSelectedCount(associationPickerDraftIds.length)}
                </p>
              </div>
              <button
                aria-label={text.close}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-secondary-100 dark:hover:bg-secondary-900"
                onClick={closeAssociationPicker}
                type="button"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-hidden p-4">
              <label
                className="sr-only"
                htmlFor="requirements-import-association-picker-search"
              >
                {text.pickerSearchPlaceholder}
              </label>
              <input
                className={inputClass}
                id="requirements-import-association-picker-search"
                onChange={event =>
                  setAssociationPickerSearch(event.target.value)
                }
                placeholder={text.pickerSearchPlaceholder}
                value={associationPickerSearch}
              />
              <div className="max-h-[55dvh] overflow-y-auto overscroll-contain rounded-lg border border-secondary-200 bg-secondary-50/60 p-2 dark:border-secondary-800 dark:bg-secondary-900/40">
                {associationPickerOptions.length === 0 ? (
                  <p className="p-4 text-sm text-secondary-600 dark:text-secondary-300">
                    {text.noPickerOptions}
                  </p>
                ) : filteredAssociationPickerOptions.length === 0 ? (
                  <p className="p-4 text-sm text-secondary-600 dark:text-secondary-300">
                    {text.noPickerMatches}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filteredAssociationPickerOptions.map(option => {
                      const checked = associationPickerDraftIds.includes(
                        option.id,
                      )
                      return (
                        <label
                          className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm ${
                            checked
                              ? 'border-primary-300 bg-primary-50 text-primary-950 dark:border-primary-800 dark:bg-primary-950/30 dark:text-primary-100'
                              : 'border-secondary-200 bg-white text-secondary-900 hover:bg-secondary-50 dark:border-secondary-800 dark:bg-secondary-950 dark:text-secondary-100 dark:hover:bg-secondary-900'
                          }`}
                          key={option.id}
                        >
                          <input
                            checked={checked}
                            className="mt-1 rounded border-secondary-300 text-primary-700 focus:ring-primary-400/50"
                            onChange={() =>
                              toggleAssociationPickerId(option.id)
                            }
                            type="checkbox"
                          />
                          <span className="min-w-0">
                            <RequirementPackagePurposeTooltip
                              maxWidth={360}
                              purposeAndScope={option.purposeAndScope}
                            >
                              <span className="block wrap-break-word font-medium">
                                {option.title}
                              </span>
                            </RequirementPackagePurposeTooltip>
                            {option.subtitle ? (
                              <span className="block wrap-break-word text-xs text-secondary-600 dark:text-secondary-300">
                                {option.subtitle}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-secondary-200 px-5 py-3 dark:border-secondary-800">
              <button
                className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-medium hover:bg-secondary-50 dark:border-secondary-700 dark:hover:bg-secondary-900"
                onClick={closeAssociationPicker}
                type="button"
              >
                {text.close}
              </button>
              <button
                className="btn-primary"
                onClick={applyAssociationPicker}
                type="button"
              >
                {text.applySelection}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>,
    document.body,
  )
}
