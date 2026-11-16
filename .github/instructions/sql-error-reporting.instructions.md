---
applyTo: "{app/api/**/*.ts,lib/http/safe-errors.ts,lib/http/response-message.ts,lib/requirements/http-errors.ts,lib/requirements/service-shared.ts,lib/requirements/logging.ts,lib/mcp/server.ts,lib/observability/request-ids.ts}"
---

## SQL Failure Reporting

- Return and display a safe message, correlation reference, stable error code
  and timestamp for application SQL failures.
- Link the reference to useful restricted operator diagnostics.
- Retain relevant message, stack, SQL metadata and context within existing
  credential, secret and protected-content restrictions.
- Keep Action log, Security audit log and operational diagnostics distinct.
- Preserve explicit AI verification, AI telemetry and capacity-telemetry
  content restrictions across every diagnostic path.
