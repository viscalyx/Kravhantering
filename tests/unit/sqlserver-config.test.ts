import { describe, expect, it } from 'vitest'
import {
  buildSqlServerDataSourceOptions,
  getSqlServerDatabaseUrl,
  type SqlServerRuntimeEnv,
  tryGetSqlServerDatabaseUrl,
} from '@/lib/typeorm/sqlserver-config'

function env(values: Partial<SqlServerRuntimeEnv>): SqlServerRuntimeEnv {
  return {
    NODE_ENV: 'test',
    ...values,
  } as SqlServerRuntimeEnv
}

describe('SQL Server TypeORM config', () => {
  it('builds the hardened default DataSource options', () => {
    const options = buildSqlServerDataSourceOptions({
      env: env({
        DATABASE_URL: 'mssql://app:secret@db.example:1433/kravhantering',
        DB_ENCRYPT: 'false',
        DB_TRUST_SERVER_CERTIFICATE: 'true',
      }),
    })

    expect(options).toMatchObject({
      connectionTimeout: 15_000,
      invalidWhereValuesBehavior: {
        null: 'throw',
        undefined: 'throw',
      },
      logging: false,
      options: {
        abortTransactionOnError: true,
        enableArithAbort: true,
        encrypt: false,
        trustServerCertificate: true,
        useUTC: true,
      },
      pool: {
        acquireTimeoutMillis: 15_000,
        idleTimeoutMillis: 30_000,
        max: 10,
        min: 1,
      },
      requestTimeout: 15_000,
      synchronize: false,
      type: 'mssql',
      url: 'mssql://app:secret@db.example:1433/kravhantering',
    })
  })

  it('allows runtime pool and timeout tuning through DB_* variables', () => {
    const options = buildSqlServerDataSourceOptions({
      env: env({
        DATABASE_URL: 'mssql://app:secret@db.example:1433/kravhantering',
        DB_CONNECTION_TIMEOUT_MS: '5000',
        DB_LOGGING: 'true',
        DB_POOL_ACQUIRE_TIMEOUT_MS: '9000',
        DB_POOL_IDLE_TIMEOUT_MS: '45000',
        DB_POOL_MAX: '24',
        DB_POOL_MIN: '3',
        DB_REQUEST_TIMEOUT_MS: '12000',
      }),
    })

    expect(options).toMatchObject({
      connectionTimeout: 5000,
      logging: ['error'],
      pool: {
        acquireTimeoutMillis: 9000,
        idleTimeoutMillis: 45000,
        max: 24,
        min: 3,
      },
      requestTimeout: 12000,
    })
  })

  it('preserves the SNI workaround for IP-hosted local SQL Server URLs', () => {
    const options = buildSqlServerDataSourceOptions({
      env: env({
        DATABASE_URL:
          'mssql://app:secret@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
      }),
    })

    expect(options).toMatchObject({
      options: {
        serverName: 'localhost',
      },
    })
  })

  it('derives SQL Server URLs from DB_* parts when no explicit URL is set', () => {
    expect(
      tryGetSqlServerDatabaseUrl(
        env({
          DB_HOST: 'sqlserver',
          DB_NAME: 'kravhantering',
          DB_PASSWORD: 'AppSecret123!',
          DB_PORT: '1444',
          DB_TRUST_SERVER_CERTIFICATE: 'true',
          DB_USER: 'app',
        }),
      ),
    ).toBe(
      'mssql://app:AppSecret123!@sqlserver:1444/kravhantering?encrypt=true&trustServerCertificate=true',
    )
  })

  it('throws a helpful error when no write SQL Server URL can be resolved', () => {
    expect(() => getSqlServerDatabaseUrl(env({}))).toThrow(
      /SQLSERVER_DATABASE_URL or DATABASE_URL/,
    )
  })
})
