import {
  AdvancedConsoleLogger,
  type LogLevel,
  type LogMessage,
  QueryFailedError,
  type QueryRunner,
} from 'typeorm'
import {
  containsProtectedSqlContent,
  toSafeErrorLogValue,
} from '../http/safe-errors'

/** Candidate snapshots must not reach TypeORM's parameter or error logging. */
export class AiVerificationSqlLogger extends AdvancedConsoleLogger {
  override logQueryError(
    error: string | Error,
    query: string,
    _parameters?: unknown[],
    queryRunner?: QueryRunner,
  ): void {
    if (
      !this.isLogEnabledFor('query-error') ||
      queryRunner?.data.aiModelVerification === true ||
      containsProtectedSqlContent(query)
    )
      return
    // Query parameters can contain credentials or protected AI content. The
    // driver message, stack and SQL metadata identify the failed operation.
    console.error(
      JSON.stringify({
        event: 'sql.driver.failed',
        error: toSafeErrorLogValue(
          new QueryFailedError(
            query,
            undefined,
            error instanceof Error ? error : new Error(error),
          ),
        ),
      }),
    )
  }
  protected override writeLog(
    level: LogLevel,
    message: LogMessage | LogMessage[],
    queryRunner?: QueryRunner,
  ): void {
    const messages = Array.isArray(message) ? message : [message]
    if (
      queryRunner?.data.aiModelVerification === true ||
      messages.some(entry => containsProtectedSqlContent(entry.message))
    )
      return
    super.writeLog(level, message, queryRunner)
  }
}
