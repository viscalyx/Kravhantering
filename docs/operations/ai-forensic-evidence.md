# AI forensic evidence: suspected credential exposure

Use this procedure when real credentials may have entered an approved
AI forensic capture window. Coordinate the review with the incident owner,
the requesting administrator, the approving Privacy Officer, and the database
and backup operators. Do not start a new capture to investigate stored data.

Credential masking applies when evidence is written; changes to masking do
not sanitize existing evidence or backup copies. Masking recognizes known
credential patterns and direct identifiers; excerpts remain sensitive and
must not be treated as anonymous or free of secrets.

## Authorized review

1. Record the suspected operation, capture window, and time range in the
   authorized incident process. Use `GET /api/admin/ai-forensic-captures`
   without a capture ID to identify affected captures from metadata.
   Do not copy credentials or excerpts into tickets, logs, stdout, or SIEM.
2. Have an Admin or Privacy Officer stop an affected active capture through
   `PATCH /api/admin/ai-forensic-captures`, using `action: "stop"` and its
   numeric `captureWindowId`. Review evidence only after stop or expiry,
   through `GET /api/admin/ai-forensic-captures?captureWindowId=<id>` in an
   authenticated, protected client. The reviewer must be the original
   requester or approver and currently hold the Admin or Privacy Officer role.
   Do not bypass these
   restrictions with database queries or create a separate export channel.
3. If exposure is suspected, arrange credential revocation or rotation with
   the credential owner through the incident process. Do not wait for evidence
   deletion to make an exposed credential unusable. Record decisions and
   completion metadata without including credential values.
4. Handle live evidence under the existing retention rules. Scheduled cleanup
   removes evidence once it is 72 hours past stop or expiry; a Privacy Officer
   can purge it earlier through the same `PATCH` endpoint with
   `action: "purge"` and its `captureWindowId`. The incident review does not
   extend retention or authorize a bulk rewrite of evidence.
5. Have backup operators identify potentially affected copies using the capture
   time range and backup metadata. Keep database and backup encryption and
   restricted access in place. Copies follow the approved backup retention
   policy; deleting live evidence does not remove it from backups. After a
   restore, run the existing cleanup procedure before allowing application
   traffic so expired evidence cannot become operationally accessible.

See the [capture contract](../governance/admin-center.md),
[retention rules](../security-privacy/informationsmangder-kravhantering.md),
[cleanup procedure](transient-state-cleanup.md), and
[ADR 0050](../adr/0050-tidsbegransat-sql-lager-for-ai-forensisk-evidens.md).
