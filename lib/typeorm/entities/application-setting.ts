import { EntitySchema } from 'typeorm'
import {
  APPLICATION_SETTING_CONSTRAINTS,
  MIB,
} from '@/lib/application-settings'

export interface ApplicationSettingEntity {
  createdAt: Date
  csvExportConcurrencyPerNode: number
  csvExportMaxFileBytes: number
  csvExportMaxRequirements: number
  csvExportTimeoutSeconds: number
  id: number
  pdfReportConcurrencyPerNode: number
  pdfReportMaxFileBytes: number
  pdfReportMaxRequirements: number
  pdfReportTimeoutSeconds: number
  pdfWorkerMemoryMib: number
  updatedAt: Date
}

export const applicationSettingEntity =
  new EntitySchema<ApplicationSettingEntity>({
    name: 'ApplicationSetting',
    tableName: 'application_settings',
    columns: {
      id: {
        generated: 'increment',
        name: 'id',
        primary: true,
        type: 'int',
      },
      csvExportMaxRequirements: {
        default: 1000,
        name: 'csv_export_max_requirements',
        type: 'int',
      },
      csvExportMaxFileBytes: {
        default: 104857600,
        name: 'csv_export_max_file_bytes',
        type: 'int',
      },
      csvExportConcurrencyPerNode: {
        default: 5,
        name: 'csv_export_concurrency_per_node',
        type: 'int',
      },
      csvExportTimeoutSeconds: {
        default: 120,
        name: 'csv_export_timeout_seconds',
        type: 'int',
      },
      pdfReportMaxRequirements: {
        default: 1000,
        name: 'pdf_report_max_requirements',
        type: 'int',
      },
      pdfReportMaxFileBytes: {
        default: 52428800,
        name: 'pdf_report_max_file_bytes',
        type: 'int',
      },
      pdfReportConcurrencyPerNode: {
        default: 3,
        name: 'pdf_report_concurrency_per_node',
        type: 'int',
      },
      pdfReportTimeoutSeconds: {
        default: 180,
        name: 'pdf_report_timeout_seconds',
        type: 'int',
      },
      pdfWorkerMemoryMib: {
        default: 512,
        name: 'pdf_worker_memory_mib',
        type: 'int',
      },
      createdAt: { name: 'created_at', type: 'datetime2' },
      updatedAt: { name: 'updated_at', type: 'datetime2' },
    },
    checks: [
      {
        expression: '[id] = 1',
        name: 'chk_application_settings_id',
      },
      {
        expression: `[csv_export_max_requirements] >= ${APPLICATION_SETTING_CONSTRAINTS.csvExportMaxRequirements.min} AND [csv_export_max_requirements] <= ${APPLICATION_SETTING_CONSTRAINTS.csvExportMaxRequirements.max}`,
        name: 'chk_application_settings_csv_export_max_requirements',
      },
      {
        expression: `[csv_export_max_file_bytes] >= ${APPLICATION_SETTING_CONSTRAINTS.csvExportMaxFileBytes.min} AND [csv_export_max_file_bytes] <= ${APPLICATION_SETTING_CONSTRAINTS.csvExportMaxFileBytes.max} AND [csv_export_max_file_bytes] % ${MIB} = 0`,
        name: 'chk_application_settings_csv_export_max_file_bytes',
      },
      {
        expression: `[csv_export_concurrency_per_node] >= ${APPLICATION_SETTING_CONSTRAINTS.csvExportConcurrencyPerNode.min} AND [csv_export_concurrency_per_node] <= ${APPLICATION_SETTING_CONSTRAINTS.csvExportConcurrencyPerNode.max}`,
        name: 'chk_application_settings_csv_export_concurrency_per_node',
      },
      {
        expression: `[csv_export_timeout_seconds] >= ${APPLICATION_SETTING_CONSTRAINTS.csvExportTimeoutSeconds.min} AND [csv_export_timeout_seconds] <= ${APPLICATION_SETTING_CONSTRAINTS.csvExportTimeoutSeconds.max}`,
        name: 'chk_application_settings_csv_export_timeout_seconds',
      },
      {
        expression: `[pdf_report_max_requirements] >= ${APPLICATION_SETTING_CONSTRAINTS.pdfReportMaxRequirements.min} AND [pdf_report_max_requirements] <= ${APPLICATION_SETTING_CONSTRAINTS.pdfReportMaxRequirements.max}`,
        name: 'chk_application_settings_pdf_report_max_requirements',
      },
      {
        expression: `[pdf_report_max_file_bytes] >= ${APPLICATION_SETTING_CONSTRAINTS.pdfReportMaxFileBytes.min} AND [pdf_report_max_file_bytes] <= ${APPLICATION_SETTING_CONSTRAINTS.pdfReportMaxFileBytes.max} AND [pdf_report_max_file_bytes] % ${MIB} = 0`,
        name: 'chk_application_settings_pdf_report_max_file_bytes',
      },
      {
        expression: `[pdf_report_concurrency_per_node] >= ${APPLICATION_SETTING_CONSTRAINTS.pdfReportConcurrencyPerNode.min} AND [pdf_report_concurrency_per_node] <= ${APPLICATION_SETTING_CONSTRAINTS.pdfReportConcurrencyPerNode.max}`,
        name: 'chk_application_settings_pdf_report_concurrency_per_node',
      },
      {
        expression: `[pdf_report_timeout_seconds] >= ${APPLICATION_SETTING_CONSTRAINTS.pdfReportTimeoutSeconds.min} AND [pdf_report_timeout_seconds] <= ${APPLICATION_SETTING_CONSTRAINTS.pdfReportTimeoutSeconds.max}`,
        name: 'chk_application_settings_pdf_report_timeout_seconds',
      },
      {
        expression: `[pdf_worker_memory_mib] >= ${APPLICATION_SETTING_CONSTRAINTS.pdfWorkerMemoryMib.min} AND [pdf_worker_memory_mib] <= ${APPLICATION_SETTING_CONSTRAINTS.pdfWorkerMemoryMib.max}`,
        name: 'chk_application_settings_pdf_worker_memory_mib',
      },
    ],
  })
