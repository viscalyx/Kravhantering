import sqlServerDriver from 'mssql'
import { DataSource } from 'typeorm'

process.once('message', async ({ options, attemptId }) => {
  try {
    const db = new DataSource({
      ...options,
      driver: sqlServerDriver,
      logger: 'advanced-console',
      logging: false,
      entities: [],
      migrations: [],
      subscribers: [],
    })
    await db.initialize()
    const runner = db.createQueryRunner()
    await runner.connect()
    await runner.startTransaction()
    await runner.query(
      'DELETE FROM ai_model_verification_attempts WHERE id = @0',
      [attemptId],
    )
    process.send?.('reserved')
    // Bound the open transaction even if the parent disappears before killing us.
    setTimeout(() => process.exit(1), 30_000).unref()
    // The parent normally kills this process while its SQL transaction is open.
  } catch {
    process.send?.('failed')
    process.exitCode = 1
  }
})
