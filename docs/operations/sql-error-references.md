# SQL failure references

This guide is for operators who investigate an application SQL failure.
Use the existing restricted application log stream. The reference is not a
credential and does not grant access to diagnostics.

## Find the occurrence

Copy the correlation reference and UTC timestamp from the application error
or MCP result. Search the application's stderr or its platform log collector
for that reference near the displayed time. Locate `sql.operation.failed`:
its `correlation_id`, `code` and `timestamp` match the returned error. A code
such as `sql_failure` identifies a category, not a unique occurrence.

AI import generation and model verification can report the reference inside
a failed stream event after the response starts. Import generation and repair
can also retain an HTTP 503 response. Use the SQL failure code and event
outcome when assessing these results; status alone does not identify the
cause or confirm completed work.

For a systemd-managed application, select the application unit and time window
with `journalctl`, then search the captured output for the exact reference.
For container deployments, use the existing restricted container log view.
Include all application instances when the load balancer selects an instance.

The record includes the permitted error message, stack and SQL Server metadata
such as error number, driver code, procedure and line number when supplied by
the driver. Service context includes the operation and request identifiers.
This record is emitted even with database query logging disabled. Enabled
driver logging can also emit `sql.driver.failed`; start with the occurrence
record when linking a user report. Raw query parameters are not diagnostic
fields because they can contain credentials or protected content.

## Interpret and recover

A failed response does not prove rollback. Check the saved business state and
required Action log before repeating a write whose outcome is uncertain. Keep
verified operation-specific retry and no-op contracts. Do not automatically
repeat a mutation from the generic SQL failure code.

Operational diagnostics, the Action log and the Security audit log have
separate purposes. A diagnostic failure record is neither an action-history
entry nor a security success event. Preserve each channel's access controls
and retention policy. Do not paste restricted diagnostics into user-visible
responses or unrestricted tickets.

Credential and secret redaction still applies. Protected model-verification
content is suppressed even in alternate error paths. AI telemetry and capacity
telemetry retain their own limited fields; do not recover excluded content
through another logger. Developer environment diagnostic commands retain
their existing output.
