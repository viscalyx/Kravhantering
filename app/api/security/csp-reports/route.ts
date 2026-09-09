import { getApplicationSettings } from '@/lib/dal/application-settings'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { nativeCspReportRoute } from '@/lib/http/native-csp-report-route'
import { createCspReportReceiver } from '@/lib/security/csp-reports'

export const POST = nativeCspReportRoute(
  createCspReportReceiver(async () => {
    const db = await getRequestSqlServerDataSource()
    return (await getApplicationSettings(db)).cspViolationLoggingEnabled
  }),
)
