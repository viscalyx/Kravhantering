import {
  type AdminApplicationSettings,
  APPLICATION_SETTING_CONSTRAINTS,
  type ApplicationSettingField,
  type ApplicationSettings,
  isValidApplicationSetting,
} from '@/lib/application-settings'
import type { SqlServerDatabase } from '@/lib/db'
import { validationError } from '@/lib/requirements/errors'
import { toIsoString } from '@/lib/typeorm/value-mappers'

interface ApplicationSettingsRow {
  createdAt: Date | string
  csvExportConcurrencyPerNode: number | string
  csvExportMaxFileBytes: number | string
  csvExportMaxRequirements: number | string
  csvExportTimeoutSeconds: number | string
  id: number | string
  pdfReportConcurrencyPerNode: number | string
  pdfReportMaxFileBytes: number | string
  pdfReportMaxRequirements: number | string
  pdfReportTimeoutSeconds: number | string
  pdfWorkerMemoryMib: number | string
  updatedAt: Date | string
}

interface QueryExecutor {
  query<T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T>
}

interface ApplicationSettingChange {
  field: ApplicationSettingField
  newValue: number
  oldValue: number
}

interface ApplicationSettingsWriteOptions {
  audit?: (
    executor: QueryExecutor,
    change: ApplicationSettingChange,
  ) => Promise<void>
}

export interface ApplicationSettingUpdate {
  field: ApplicationSettingField
  updatedAt: string
  value: number
}

const COLUMN_BY_FIELD: Readonly<Record<ApplicationSettingField, string>> =
  Object.freeze({
    csvExportConcurrencyPerNode: 'csv_export_concurrency_per_node',
    csvExportMaxFileBytes: 'csv_export_max_file_bytes',
    csvExportMaxRequirements: 'csv_export_max_requirements',
    csvExportTimeoutSeconds: 'csv_export_timeout_seconds',
    pdfReportConcurrencyPerNode: 'pdf_report_concurrency_per_node',
    pdfReportMaxFileBytes: 'pdf_report_max_file_bytes',
    pdfReportMaxRequirements: 'pdf_report_max_requirements',
    pdfReportTimeoutSeconds: 'pdf_report_timeout_seconds',
    pdfWorkerMemoryMib: 'pdf_worker_memory_mib',
  })

const APPLICATION_SETTINGS_SELECT = `
  SELECT
    [id],
    [csv_export_max_requirements] AS [csvExportMaxRequirements],
    [csv_export_max_file_bytes] AS [csvExportMaxFileBytes],
    [csv_export_concurrency_per_node] AS [csvExportConcurrencyPerNode],
    [csv_export_timeout_seconds] AS [csvExportTimeoutSeconds],
    [pdf_report_max_requirements] AS [pdfReportMaxRequirements],
    [pdf_report_max_file_bytes] AS [pdfReportMaxFileBytes],
    [pdf_report_concurrency_per_node] AS [pdfReportConcurrencyPerNode],
    [pdf_report_timeout_seconds] AS [pdfReportTimeoutSeconds],
    [pdf_worker_memory_mib] AS [pdfWorkerMemoryMib],
    [created_at] AS [createdAt],
    [updated_at] AS [updatedAt]
  FROM [application_settings]
  WHERE [id] = 1
`

function rowToSettings(row: ApplicationSettingsRow): ApplicationSettings {
  return {
    csvExportConcurrencyPerNode: Number(row.csvExportConcurrencyPerNode),
    csvExportMaxFileBytes: Number(row.csvExportMaxFileBytes),
    csvExportMaxRequirements: Number(row.csvExportMaxRequirements),
    csvExportTimeoutSeconds: Number(row.csvExportTimeoutSeconds),
    pdfReportConcurrencyPerNode: Number(row.pdfReportConcurrencyPerNode),
    pdfReportMaxFileBytes: Number(row.pdfReportMaxFileBytes),
    pdfReportMaxRequirements: Number(row.pdfReportMaxRequirements),
    pdfReportTimeoutSeconds: Number(row.pdfReportTimeoutSeconds),
    pdfWorkerMemoryMib: Number(row.pdfWorkerMemoryMib),
  }
}

function assertSettings(settings: ApplicationSettings): void {
  for (const [field, value] of Object.entries(settings) as [
    ApplicationSettingField,
    number,
  ][]) {
    if (!isValidApplicationSetting(field, value)) {
      throw new Error(`Invalid persisted application setting: ${field}`)
    }
  }
}

async function readSingleton(
  executor: QueryExecutor,
  lock = false,
): Promise<ApplicationSettingsRow> {
  const query = lock
    ? APPLICATION_SETTINGS_SELECT.replace(
        'FROM [application_settings]',
        'FROM [application_settings] WITH (UPDLOCK, HOLDLOCK)',
      )
    : APPLICATION_SETTINGS_SELECT
  const rows = await executor.query<ApplicationSettingsRow[]>(query)
  const row = rows[0]
  if (!row) {
    throw new Error('Application settings singleton row is missing.')
  }
  return row
}

export async function getApplicationSettings(
  db: QueryExecutor,
): Promise<ApplicationSettings> {
  const settings = rowToSettings(await readSingleton(db))
  assertSettings(settings)
  return Object.freeze(settings)
}

export async function getAdminApplicationSettings(
  db: QueryExecutor,
): Promise<AdminApplicationSettings> {
  const row = await readSingleton(db)
  const settings = rowToSettings(row)
  assertSettings(settings)
  return {
    ...settings,
    constraints: APPLICATION_SETTING_CONSTRAINTS,
    updatedAt: toIsoString(row.updatedAt),
  }
}

export async function updateApplicationSetting(
  db: SqlServerDatabase,
  field: ApplicationSettingField,
  value: number,
  options: ApplicationSettingsWriteOptions = {},
): Promise<ApplicationSettingUpdate> {
  if (!isValidApplicationSetting(field, value)) {
    throw validationError('Invalid application setting value', {
      field,
      value,
    })
  }
  const column = COLUMN_BY_FIELD[field]
  const now = new Date().toISOString()

  await db.transaction(async manager => {
    const current = rowToSettings(await readSingleton(manager, true))
    const change = { field, newValue: value, oldValue: current[field] }
    await manager.query(
      `UPDATE [application_settings]
       SET [${column}] = @0, [updated_at] = @1
       WHERE [id] = 1`,
      [value, now],
    )
    await options.audit?.(manager, change)
  })

  return { field, updatedAt: now, value }
}
