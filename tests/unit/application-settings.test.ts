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
      csvExportMaxRequirements: 1000,
      csvExportTimeoutSeconds: 120,
      pdfReportConcurrencyPerNode: 3,
      pdfReportMaxFileBytes: 50 * MIB,
      pdfReportMaxRequirements: 1000,
      pdfReportTimeoutSeconds: 180,
      pdfWorkerMemoryMib: 512,
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
  })

  it('maps the singleton entity and all nine checks', () => {
    expect(applicationSettingEntity.options.tableName).toBe(
      'application_settings',
    )
    expect(applicationSettingEntity.options.columns?.id).toMatchObject({
      primary: true,
    })
    expect(applicationSettingEntity.options.checks).toHaveLength(10)
    expect(
      applicationSettingEntity.options.checks?.map(check => check.name),
    ).toContain('chk_application_settings_pdf_worker_memory_mib')
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
      expect(source).toContain('pdf_worker_memory_mib')
    }
  })
})
