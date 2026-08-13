import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import {
  APPLICATION_SETTING_CONSTRAINTS,
  DEFAULT_APPLICATION_SETTINGS,
  isValidApplicationSetting,
  MIB,
} from '@/lib/application-settings'
import { applicationSettingEntity } from '@/lib/typeorm/entities/application-setting'

describe('application settings contract', () => {
  it('keeps every default inside its database/API constraint', () => {
    for (const [field, value] of Object.entries(DEFAULT_APPLICATION_SETTINGS)) {
      expect(
        isValidApplicationSetting(
          field as keyof typeof DEFAULT_APPLICATION_SETTINGS,
          value,
        ),
      ).toBe(true)
    }
    expect(DEFAULT_APPLICATION_SETTINGS).toEqual({
      csvExportConcurrencyPerNode: 5,
      csvExportMaxFileBytes: 100 * MIB,
      csvExportMaxItems: 1000,
      csvExportTimeoutSeconds: 120,
      pdfReportConcurrencyPerNode: 3,
      pdfReportMaxFileBytes: 50 * MIB,
      pdfReportMaxRequirements: 1000,
      pdfReportTimeoutSeconds: 180,
      pdfWorkerMemoryMib: 512,
      requirementImportMaxJsonDepth: 8,
      requirementImportMaxNestedItems: 200,
      requirementImportMaxProposedNeedsReferences: 500,
      requirementImportMaxProposedNormReferences: 500,
      requirementImportMaxRows: 500,
    })
  })

  it('enforces boundaries, integers, and MiB steps', () => {
    for (const [field, constraint] of Object.entries(
      APPLICATION_SETTING_CONSTRAINTS,
    )) {
      const typedField = field as keyof typeof APPLICATION_SETTING_CONSTRAINTS
      expect(isValidApplicationSetting(typedField, constraint.min)).toBe(true)
      expect(isValidApplicationSetting(typedField, constraint.max)).toBe(true)
      expect(isValidApplicationSetting(typedField, constraint.min - 1)).toBe(
        false,
      )
      expect(isValidApplicationSetting(typedField, constraint.max + 1)).toBe(
        false,
      )
      expect(isValidApplicationSetting(typedField, 1.5)).toBe(false)
    }
    expect(isValidApplicationSetting('csvExportMaxFileBytes', MIB + 1)).toBe(
      false,
    )
    expect(isValidApplicationSetting('pdfReportMaxFileBytes', 2 * MIB)).toBe(
      true,
    )
    expect(
      isValidApplicationSetting(
        'missingField' as keyof typeof APPLICATION_SETTING_CONSTRAINTS,
        1,
      ),
    ).toBe(false)
  })

  it('maps the singleton entity and every application setting check', () => {
    expect(applicationSettingEntity.options.tableName).toBe(
      'application_settings',
    )
    expect(applicationSettingEntity.options.columns?.id).toMatchObject({
      primary: true,
    })
    expect(
      applicationSettingEntity.options.columns?.csvExportMaxItems,
    ).toMatchObject({
      name: 'csv_export_max_items',
    })
    expect(applicationSettingEntity.options.checks).toHaveLength(15)
    expect(
      applicationSettingEntity.options.checks?.map(check => check.name),
    ).toContain('chk_application_settings_pdf_worker_memory_mib')
    const expressions = new Map(
      applicationSettingEntity.options.checks?.map(check => [
        check.name,
        check.expression,
      ]),
    )
    expect(
      expressions.get('chk_application_settings_csv_export_max_file_bytes'),
    ).toBe(
      `[csv_export_max_file_bytes] >= ${APPLICATION_SETTING_CONSTRAINTS.csvExportMaxFileBytes.min} AND [csv_export_max_file_bytes] <= ${APPLICATION_SETTING_CONSTRAINTS.csvExportMaxFileBytes.max} AND [csv_export_max_file_bytes] % ${MIB} = 0`,
    )
    expect(
      expressions.get('chk_application_settings_pdf_worker_memory_mib'),
    ).toBe(
      `[pdf_worker_memory_mib] >= ${APPLICATION_SETTING_CONSTRAINTS.pdfWorkerMemoryMib.min} AND [pdf_worker_memory_mib] <= ${APPLICATION_SETTING_CONSTRAINTS.pdfWorkerMemoryMib.max}`,
    )
    expect(
      expressions.get('chk_application_settings_requirement_import_max_rows'),
    ).toBe(
      '[requirement_import_max_rows] >= 1 AND [requirement_import_max_rows] <= 500',
    )
  })

  it('adds requirement import settings and clamps legacy MCP rows in migration 0055', async () => {
    const migration = await import(
      '@/typeorm/migrations/0055_requirement_import_budget.mjs'
    )
    const queryRunner = { query: vi.fn(async (_statement: string) => {}) }

    await new migration.default().up(queryRunner)

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n')
    expect(sql).toContain('requirement_import_max_rows')
    expect(sql).toContain('requirement_import_max_json_depth')
    expect(sql).toContain('mcp_import_max_rows] > 500')
    expect(sql).toContain('chk_ai_settings_mcp_import_max_rows')
  })

  it('keeps migration and both seed profiles synchronized', async () => {
    const migration = await import(
      '@/typeorm/migrations/0048_application_settings.mjs'
    )
    const queryRunner = {
      query: vi.fn(async (_statement: string) => {}),
    }
    const Migration = migration.default
    await new Migration().up(queryRunner)

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n')
    expect(sql).toContain('CREATE TABLE [application_settings]')
    expect(sql).toContain('chk_application_settings_id')
    expect(sql).toContain('csv_export_max_file_bytes')
    expect(sql).toContain('pdf_worker_memory_mib')
    expect(sql).toContain('AND NOT EXISTS')

    for (const seedFile of ['typeorm/seed-required.mjs', 'typeorm/seed.mjs']) {
      const source = await readFile(seedFile, 'utf8')
      expect(source).toContain('application_settings')
      expect(source).toContain('csv_export_max_items')
      expect(source).toContain('pdf_worker_memory_mib')
    }
  })

  it('renames the CSV row limit losslessly and extends Action-log indexes', async () => {
    const migration = await import(
      '@/typeorm/migrations/0051_action_log_csv_export.mjs'
    )
    const queryRunner = {
      query: vi.fn(async (_statement: string) => {}),
    }
    const Migration = migration.default
    const instance = new Migration()

    await instance.up(queryRunner)
    const upSql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n')
    expect(upSql).toContain('sp_rename')
    expect(upSql).toContain('csv_export_max_items')
    expect(upSql).toContain('[actor_hsa_id], [occurred_at] DESC, [id] DESC')

    queryRunner.query.mockClear()
    await instance.down(queryRunner)
    const downSql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n')
    expect(downSql).toContain('csv_export_max_requirements')
    expect(downSql).toContain('[actor_hsa_id], [occurred_at] DESC')
  })
})
