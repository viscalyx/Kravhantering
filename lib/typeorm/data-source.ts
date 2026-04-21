import 'reflect-metadata'
import type { DataSource } from 'typeorm'
import { sqlServerEntities } from '@/lib/typeorm/entities'
import { createSqlServerDataSource } from '@/lib/typeorm/sqlserver-config'

interface AppDataSourceOptions {
  name?: string
  readonly?: boolean
  url?: string
}

export function createAppDataSource(
  options: AppDataSourceOptions = {},
): DataSource {
  return createSqlServerDataSource({
    entities: sqlServerEntities,
    name: options.name ?? 'kravhantering-app',
    readonly: options.readonly ?? false,
    url: options.url,
  })
}

export function createReadonlyBrowseDataSource(
  options: Omit<AppDataSourceOptions, 'readonly'> = {},
): DataSource {
  return createAppDataSource({
    ...options,
    name: options.name ?? 'kravhantering-readonly-browse',
    readonly: true,
  })
}
