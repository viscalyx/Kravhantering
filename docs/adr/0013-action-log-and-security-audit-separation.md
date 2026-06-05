# Action Log And Platform Security Log Separation

Status: Accepted on 2026-06-05.

Kravhantering keeps two separate evidence channels: the application
`Åtgärdslogg` and the platform `Säkerhetslogg`. The action log stores durable
`action_audit_events` rows for app-owned mutations and authorization denials so
Admins can review business and administration actions from the application.

The platform security log emits structured JSON lines tagged
`channel: "security-audit"` for authentication, session, token, CSRF,
privileged action, privacy, retention and other security-relevant events. The
application does not store that stream in SQL or expose it through the
action-log UI; routing, retention and SIEM delivery belong to the hosting
platform.

Some workflows may emit both when they are both security-relevant and
application-reviewable. In both channels, payloads must stay bounded and
redacted: no secrets, tokens, submitted free text, requirement text, raw target
HSA-IDs or other unnecessary personal data should be written as details.

## Considered Options

- Store all audit evidence in `action_audit_events`: rejected because auth and
  platform security monitoring need an operational log stream that can be
  routed outside the application database.
- Use only platform security logs: rejected because Admins need durable,
  queryable in-app evidence for app-owned mutations and authorization denials.
- Mirror every event into both channels: rejected because it would duplicate
  personal data and make retention, privacy handling and operational alerting
  harder to reason about.
