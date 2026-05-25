import 'reflect-metadata'
import type { DataSource } from 'typeorm'
import { sqlServerEntities } from '@/lib/typeorm/entities'
import { createSqlServerDataSource } from '@/lib/typeorm/sqlserver-config'

interface AppDataSourceOptions {
  readonly?: boolean
  url?: string
}

export function createAppDataSource(
  options: AppDataSourceOptions = {},
): DataSource {
  return createSqlServerDataSource({
    entities: sqlServerEntities,
    readonly: options.readonly ?? false,
    url: options.url,
  })
}

export function createReadonlyBrowseDataSource(
  options: Omit<AppDataSourceOptions, 'readonly'> = {},
): DataSource {
  return createAppDataSource({
    ...options,
    readonly: true,
  })
}
