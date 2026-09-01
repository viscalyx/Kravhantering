# Azure CLI service-principal session-reuse research note

Research date: 2026-09-01

## Decision summary

When a complete service-principal configuration is present, the Azure Dev
lifecycle commands should reuse the Azure CLI session only after two separate
checks:

1. Read the cached subscription profile and require the configured subscription
   ID, tenant ID, service-principal client ID, and identity type to match.
2. Silently acquire an Azure Resource Manager access token for that explicit
   subscription and tenant.

The first check proves which cached identity Azure CLI associates with the
target subscription. It does not prove that authentication still works. Azure
CLI implements `az account show` by reading `Profile.get_subscription`, which
selects an entry from the local profile. See the Azure CLI
[`show_subscription` implementation](https://github.com/Azure/azure-cli/blob/dev/src/azure-cli/azure/cli/command_modules/profile/custom.py#L910-L914)
and the
[`get_subscription` implementation](https://github.com/Azure/azure-cli/blob/dev/src/azure-cli-core/azure/cli/core/_profile.py#L3092-L3122).

The second check asks Azure CLI to obtain a usable token without printing it.
Azure CLI documents `az account get-access-token` as the supported command for
this purpose and permits both subscription and tenant targeting. The command
defaults to the Azure Resource Manager scope. See the
[`az account get-access-token` reference](https://learn.microsoft.com/en-us/cli/azure/account?view=azure-cli-latest#az-account-get-access-token)
and its
[`get_raw_token` call](https://github.com/Azure/azure-cli/blob/dev/src/azure-cli/azure/cli/command_modules/profile/custom.py#L915-L954).

Do not use `az account list --all` for this decision. Do not use
`az account set`. Every lifecycle operation should continue to pass the
configured subscription ID explicitly.

## Exact reuse checks

Read only the four identity fields needed for the decision:

<!-- markdownlint-disable MD013 -->
```powershell
az account show `
  --subscription $SubscriptionId `
  --query '{subscriptionId:id,tenantId:tenantId,clientId:user.name,identityType:user.type}' `
  --output json `
  --only-show-errors
```
<!-- markdownlint-enable MD013 -->

Require all of these conditions:

- `subscriptionId` equals the configured subscription ID.
- `tenantId` equals the configured tenant ID.
- `clientId` equals the configured client/application ID.
- `identityType` equals `servicePrincipal`.

Compare GUID values case-insensitively after parsing them as GUIDs. Reject a
missing, malformed, or ambiguous field. Azure CLI stores the login name passed
for a service principal, which is the client/application ID, in `user.name` and
stores `servicePrincipal` in `user.type`. See the Azure CLI
[`_normalize_properties` implementation](https://github.com/Azure/azure-cli/blob/dev/src/azure-cli-core/azure/cli/core/_profile.py#L2861-L2888).
The value is not the service-principal object ID. Checking only `user.type` is
not sufficient because Azure CLI also represents managed identities with that
type.

If the profile matches, test current authentication without returning the
access token:

```powershell
az account get-access-token `
  --subscription $SubscriptionId `
  --tenant $TenantId `
  --output none `
  --only-show-errors
```

Exit code zero means that Azure CLI can currently supply an ARM token for the
matching profile. It does not prove that the identity has permission to start
or deallocate the VM; the explicitly targeted VM command remains the
authorization check.

This token check can succeed with a still-valid cached token after the client
secret changes. That is valid session reuse. It proves the configured identity,
not that the cached credential bytes equal the current environment variable.

## Login fallback

Run service-principal login only when the cached profile is absent or does not
match, or when silent token acquisition fails. Azure CLI 2.86.0 adds the
single-subscription login path. It avoids listing every visible subscription
and retrieves only the configured subscription:

<!-- markdownlint-disable MD013 -->
```powershell
az login `
  --service-principal `
  --username $ClientId `
  --password=$ClientSecret `
  --tenant $TenantId `
  --skip-subscription-discovery `
  --subscription $SubscriptionId `
  --output none `
  --only-show-errors
```
<!-- markdownlint-enable MD013 -->

The
[`az login` reference](https://learn.microsoft.com/en-us/cli/azure/reference-index?view=azure-cli-latest#az-login)
calls this the fastest path for tenants with many subscriptions. The Azure CLI
source performs one direct `GET /subscriptions/{id}` and fails when the
specified subscription cannot be retrieved. See the
[`Profile.login` fast path](https://github.com/Azure/azure-cli/blob/dev/src/azure-cli-core/azure/cli/core/_profile.py#L2472-L2506).
The Azure CLI
[`2.86.0 release notes`](https://learn.microsoft.com/en-us/cli/azure/release-notes-azure-cli?view=azure-cli-latest#may-05-2026)
identify the version that introduces `--subscription` and
`--skip-subscription-discovery` on `az login`.

The implementation should require Azure CLI 2.86.0 or later before using this
exact login command. If the project keeps support for an older CLI, use the
ordinary service-principal login without these two new options as an explicit
compatibility fallback; that fallback performs broader subscription discovery
and is therefore slower.

After login, repeat the profile-identity check and fail closed if it does not
match. A successful single-subscription login already authenticates and
retrieves the target subscription, so a second token acquisition is not needed
before the lifecycle operation.

Do not call `az account set`. Login changes the shared Azure CLI profile and can
select the requested subscription as its default, but lifecycle correctness
must not depend on that side effect. Pass `--subscription $SubscriptionId`,
`--resource-group $ResourceGroup`, and `--name $VmName` to every VM command.

## Secret handling

Microsoft documents the client-secret login syntax and recommends the
`--password=<secret>` form when a secret starts with a hyphen or another special
character. See
[`Sign into Azure with a service principal`](https://learn.microsoft.com/en-us/cli/azure/authenticate-azure-cli-service-principal?view=azure-cli-latest).

The repository already redacts a secret passed as the argument after
`--password`, but its combined `name=value` redaction does not currently match
the leading hyphens in `--password=<secret>`. See
[`Format-AzureDevCommand`](../../scripts/azure-dev/AzureDev.Logging.psm1).
Before the combined form is used, extend the formatter and its tests so every
spelling below is redacted before verbose output, debug output, exceptions, or
audit details are constructed:

- `--password`, followed by a separate secret argument;
- `--password=<secret>`;
- `-p=<secret>` if the short spelling is ever accepted by the wrapper.

Use `--output none` for both token acquisition and login. Never parse, return,
or log the access-token document. Never include the raw login command in an
exception. The formatted command may include only a `[redacted]` placeholder.

Azure CLI persists its MSAL token cache and service-principal entries. Microsoft
states that these files are encrypted on Windows and plaintext on macOS and
Linux. See the
[`MSAL-based Azure CLI` storage description](https://learn.microsoft.com/en-us/cli/azure/msal-based-azure-cli?view=azure-cli-latest).
This persistence is why reuse works and why login is a local shared-state
mutation. The repository lock prevents overlapping Azure Dev commands from one
checkout, but it cannot coordinate another shell or repository that uses the
same Azure CLI profile.

## Repository implications

The current
[`Connect-AzureDevServicePrincipal`](../../scripts/azure-dev/AzureDev.Azure.psm1)
logs in whenever all three service-principal values exist. The current
`Get-AzureDevAccount` reads only the default profile entry, and
`Test-AzureDevPrerequisites` separately lists all visible subscriptions. The
streamlined lifecycle path should replace those behaviors with the targeted
two-check algorithm above.

The existing configuration validation already enforces the all-or-none triple
`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, and `AZURE_CLIENT_SECRET`. Preserve that
invariant. If no triple is configured, the lifecycle path can use the same
targeted profile and token checks without the client-ID identity requirement;
if they fail, it must tell the user to run `az login` because it has no
credential with which to repair the session.

No Azure resource access or live authentication is necessary to implement or
test this decision. Mock the Azure CLI wrapper and cover cached-profile match,
identity mismatch, token failure, login fallback, post-login mismatch,
unsupported CLI version, and secret redaction.
