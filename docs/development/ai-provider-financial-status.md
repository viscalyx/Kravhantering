# AI provider financial status

Financial administration is optional on `AiAdminConnectionAdapter.financial`.
Existing adapters without it remain fully usable. This contract complements
the adapter and secret boundaries in
[ADR 0051](../adr/0051-ai-integrationslager-med-korprofiler-och-adaptrar.md) and
[ADR 0052](../adr/0052-tillitsgrans-och-krypterade-ai-leverantorshemligheter.md).

## Adapter contract

Declare operations with a stable, bounded ID, a scope (`account`,
`organization`, or `credential`), required credential purpose (`runtime`,
`management`, or none), and supported fields. The five distinct fields are
purchased credits, reported usage, remaining credit balance, configured
spending limit, and remaining spending allowance. Scopes are provider scopes;
account usage is not usage attributable to this connection.

`none` means no operations and no management-key requirement. `partial` means
some fields or scopes are unavailable. `full` means all five fields are
supported in each declared scope; it does not require every provider to have
accounts, organizations or API keys. Admin Center derives its controls from
the declared operations. Missing financial support never changes connection
or model availability.

Return normalized measurements with currency, measurement/reset period and
an explicit value state. Missing data is `unavailable`, a provider's unbounded
limit is `unlimited`, and an unimplemented field is `unsupported`. None of
these becomes zero. Free-form provider labels, identifiers, errors and raw
responses must not enter this contract. The trusted secret boundary validates
the normalized snapshot, scope and declared fields before returning it.

The secret service supplies only the purpose declared for that operation.
It decrypts inside the trusted provider call and exposes no plaintext-returning
API. Management candidates are verified before activation; failure preserves
the active credential. Rotation and removal erase local encrypted material
without making provider-side key changes. Pending candidates can be discarded.

## OpenRouter

The adapter implements two separate GET requests:

- `/credits` uses a management key and returns purchased credits, usage and
  their difference as credit balance for the authenticated account credit
  pool. The pool may be shared by an organization. A credit balance is not a
  configured organization spending cap; organization caps are unsupported.
- `/key` uses the connection's runtime key for its own usage, limit, remaining
  allowance and reset period. It does not derive key hashes, compare masked
  labels or enumerate keys. Key-level data remains available without a
  management key. Reported daily, weekly and monthly usage stays separate
  from lifetime usage. Unknown reset periods remain unknown.

Provider contracts:
[account credits](https://openrouter.ai/docs/api/api-reference/credits/get-remaining-credits)
and
[current-key information](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key).

Each financial provider request has a separate five-second deadline and a
32 KiB response limit, caller cancellation, redirect rejection and safe error
normalization. It uses the existing approved egress and TLS transport. No
completion request, provider key mutation or background polling is performed.

## Refresh and access

Entering the settings page fetches each supported scope independently for
each connection. Both collapsed and expanded connections show two compact
total/remaining summaries before lifecycle and operational health, with a
refresh button. The organization summary shows purchased account credits and
the remaining balance, or a provider-reported organization limit and remaining
allowance. The key summary shows its configured spending limit and remaining
allowance for the same period. A tooltip explains that these totals are
credits or limits; consumption remains in the details. Unlimited and missing
values keep their explicit states. The entire connection row toggles its
details, except the independent refresh button.
Opening connection details initially shows only the
financial section heading; its button expands the values and credential
controls. Toggling either section reuses the same in-memory report. Manual
refresh in either view updates both views without background polling.
Results distinguish missing credentials, invalid credentials,
unsupported data and temporary errors. The successful-fetch timestamp is set
only after a validated provider response. Values are provider-reported
information, not internal accounting or an execution gate. Reports from
different connections must not be summed into an organization total.
The panel displays amounts rounded to exactly two decimal places using the
current locale. The underlying normalized amounts retain their precision.

Each connection retains successful values in memory during its mounted
session. A failed refresh can retain a report only when a new server response
confirms the same opaque connection/configuration/credential/operation
binding. Stale reports keep their original timestamp and show the refresh
error. A failed HTTP request cannot confirm a binding and clears the report.
Credential replacement or removal and configuration/scope changes
cannot rebind old values to the new credential. A page reload starts with no
cached report. There is no financial-history store.

All financial reads use the Admin-only, same-origin connection-action route.
Fetches, views and credential actions create bounded action-log records;
credential mutations and their audit writes share a SQL transaction. Audit
records contain connection identity, operation and normalized outcome, never
provider responses, amounts, secret identifiers or secret material.
