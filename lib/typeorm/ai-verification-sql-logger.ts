import {
  AdvancedConsoleLogger,
  type LogLevel,
  type LogMessage,
  type QueryRunner,
} from 'typeorm'

/** Candidate snapshots must not reach TypeORM's parameter or error logging. */
export class AiVerificationSqlLogger extends AdvancedConsoleLogger {
  protected override writeLog(
    level: LogLevel,
    message: LogMessage | LogMessage[],
    queryRunner?: QueryRunner,
  ): void {
    const messages = Array.isArray(message) ? message : [message]
    if (
      queryRunner?.data.aiModelVerification === true ||
      messages.some(
        entry =>
          typeof entry.message === 'string' &&
          /\bai_model_verification_attempts\b/iu.test(entry.message),
      )
    )
      return
    super.writeLog(level, message, queryRunner)
  }
}
