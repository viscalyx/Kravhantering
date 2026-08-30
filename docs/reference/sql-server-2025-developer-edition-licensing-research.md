# SQL Server 2025 Developer edition licensing research note

Research date: 2026-08-30

## Decision summary

SQL Server 2025 Developer edition is permitted for the manually initiated,
non-production deployment-verification workflow. Microsoft permits any number
of Developer copies on any device, including third-party shared devices, to
design, develop, test, and demonstrate programs, and permits end users to
perform acceptance tests. It prohibits use in a production environment. See
the current
[SQL Server 2025 Developer license terms](https://www.microsoft.com/content/dam/microsoft/usetm/documents/sql-server/sql-server-2025-developer,-express,-evaluation/retail/SQL_Server_2025_Developer_Express_and_Evaluation_Edition_English.pdf).

The workflow fits that grant because it installs synthetic fixtures in an
isolated topology solely to test a release's documented deployment behavior.
It does not serve production traffic, process production work, or provide a
service on which business operations depend. Running it manually in paid Azure
infrastructure, retaining a failed environment for diagnosis, and using an
Azure VM do not by themselves make it production use. The environment must not
be repurposed while retained.

This is a technical reading of Microsoft's published terms, not legal advice.
The terms accompanying the selected image remain authoritative.

## Frozen image and edition contract

Use this first-party Microsoft Container Registry image:

```text
Repository: mcr.microsoft.com/mssql/server
Human-readable tag: 2025-CU7-ubuntu-24.04
Runtime reference: mcr.microsoft.com/mssql/server@sha256:86cc6144ef39bb0fbed2329e1ad79b13ee82e7b2e4739213a0db0800e668a74a
Platform: linux/amd64
SQL Server build: 17.0.4065.4
Update level: CU7
```

The
[Microsoft Artifact Registry entry](https://mcr.microsoft.com/en-us/artifact/mar/mssql/server)
publishes that tag and digest. A Registry V2 manifest request on the research
date returns the same digest in `Docker-Content-Digest`. The repository's
[`image.lock.json`](../../containers/sqlserver/image.lock.json) also records
the same repository, tag, manifest digest, and image identity.

The trusted module must pull and run the digest reference. The tag is evidence
and operator context, not mutable runtime authority. It must verify that the
recorded tag still resolves to the frozen digest before use and must stop on a
mismatch. It must not use `latest` or `2025-latest`. A future CU change is a
reviewed update to the deployment-verification adapter and its independent
expected results.

Set the exact edition input:

```text
MSSQL_PID=Developer
```

Microsoft's current
[Linux environment-variable guidance](https://learn.microsoft.com/en-us/sql/linux/configure/environment-variables?view=sql-server-linux-ver17)
uses `MSSQL_PID=Developer` in its SQL Server 2025 container command and calls it
the freely licensed Developer edition for non-production use. SQL Server 2025
also introduces the explicit `StandardDeveloper` and `EnterpriseDeveloper`
values. The generic `Developer` value is the documented compatibility input
and selects Enterprise Developer in the frozen CU7 image.

A one-off inspection of the exact digest returns the following secret-free
facts:

```text
Edition: Enterprise Developer Edition (64-bit)
EditionID: -2117995310
EngineEdition: 3
ProductVersion: 17.0.4065.4
ProductLevel: RTM
ProductUpdateLevel: CU7
ProductUpdateReference: KB5096981
ProductMajorVersion: 17
```

Microsoft documents `EditionID=-2117995310` as Developer or Enterprise
Developer and `EngineEdition=3` as the Enterprise-family engine in
[`SERVERPROPERTY`](https://learn.microsoft.com/en-us/sql/t-sql/functions/serverproperty-transact-sql?view=sql-server-ver17).
The downstream verifier must require the complete expected tuple rather than
accepting any string containing `Developer`.

## EULA and secret inputs

The container requires these startup values:

- `ACCEPT_EULA=Y`, supplied as a fixed, non-secret value by the trusted module;
- `MSSQL_PID=Developer`, also fixed and non-secret; and
- `MSSQL_SA_PASSWORD`, a unique run secret that satisfies the default SQL
  Server password policy.

Microsoft documents `ACCEPT_EULA` and `MSSQL_SA_PASSWORD` as required container
settings in the
[SQL Server 2025 container quickstart](https://learn.microsoft.com/en-us/sql/linux/install-upgrade/quickstart-install-docker?view=sql-server-ver17#pull-and-run-the-sql-server-linux-container-image).
The password must contain 8 through 128 characters and characters from at least
three of the four uppercase, lowercase, digit, and symbol classes. The trusted
module should generate a longer random value rather than rely only on that
minimum.

The operator or organization must have authority to accept the Microsoft
terms. Retained-charge consent is not a substitute for EULA acceptance. The
run record may retain the accepted terms identity or URL and a boolean
acceptance result, but never a password.

`MSSQL_SA_PASSWORD` is available in the container process environment. Root or
container-administration access can therefore disclose the bootstrap secret.
The bootstrap contract must:

- keep the value out of command arguments, shell tracing, journals, process
  listings, generated sets, ARM state, and evidence;
- deliver it only through the trusted guest setup path and a root-restricted
  environment source;
- prevent candidate logic and application hosts from reading it; and
- rotate it after first startup, or disable `sa` after creating the bounded
  trusted-module administration identity, so the environment value is no
  longer an active credential.

Microsoft deprecates `SA_PASSWORD`; do not supply it. The image does not
document an `MSSQL_SA_PASSWORD_FILE` alternative, so the contract must not
invent one.

## Secret-free runtime proof

Use an authenticated query after SQL Server reports ready. Pass the password to
`sqlcmd` through its `SQLCMDPASSWORD` environment variable, never its `-P`
argument. Microsoft explicitly warns that `-P` is insecure and documents
`SQLCMDPASSWORD` in the
[`sqlcmd` reference](https://learn.microsoft.com/en-us/sql/tools/sqlcmd/sqlcmd-utility?view=sql-server-ver17#-p-password).
Disable command echo around the trusted invocation and unset the variable as
soon as the client exits.

After the run CA is trusted and the SQL certificate is active, execute the
public query file through the private service name:

```bash
/opt/mssql-tools18/bin/sqlcmd \
  -S 'tcp:<private-sql-service-name>,1433' \
  -U '<trusted-administration-login>' \
  -b -W -s '|' \
  -i /run/kravhantering/sqlserver-version-query.sql
```

The trusted module injects `SQLCMDPASSWORD` into this process environment. The
command must not use `-C`, because that would bypass the already settled
certificate-chain and host-name validation contract.

The query may emit only these individually named properties:

```sql
SET NOCOUNT ON;
SELECT
  CONVERT(nvarchar(128), SERVERPROPERTY('Edition')) AS Edition,
  CONVERT(bigint, SERVERPROPERTY('EditionID')) AS EditionID,
  CONVERT(int, SERVERPROPERTY('EngineEdition')) AS EngineEdition,
  CONVERT(nvarchar(128), SERVERPROPERTY('ProductVersion')) AS ProductVersion,
  CONVERT(nvarchar(128), SERVERPROPERTY('ProductLevel')) AS ProductLevel,
  CONVERT(nvarchar(128), SERVERPROPERTY('ProductUpdateLevel'))
    AS ProductUpdateLevel,
  CONVERT(nvarchar(128), SERVERPROPERTY('ProductUpdateReference'))
    AS ProductUpdateReference,
  CONVERT(nvarchar(128), SERVERPROPERTY('ProductMajorVersion'))
    AS ProductMajorVersion;
```

These fields contain no credential or business data. Prefer them over parsing
`@@VERSION`. Do not use `SERVERPROPERTY('LicenseType')` or
`SERVERPROPERTY('NumLicenses')`: Microsoft documents them as unused and says
the product does not maintain that license information. Runtime edition proof
does not prove compliant use; the frozen non-production run purpose and
execution boundary supply that separate fact.

Before database startup, the trusted module may also run the digest-pinned
image with `PAL_PROGRAM_INFO=1`:

```bash
podman run --rm \
  --env PAL_PROGRAM_INFO=1 \
  'mcr.microsoft.com/mssql/server@sha256:86cc6144ef39bb0fbed2329e1ad79b13ee82e7b2e4739213a0db0800e668a74a'
```

Microsoft's
[container deployment guidance](https://learn.microsoft.com/en-us/sql/linux/containers/deploy?view=sql-server-ver17#check-the-container-version)
documents this password-free inspection for image version and build facts. It
does not prove the selected runtime edition, so it complements rather than
replaces the authenticated `SERVERPROPERTY` query.

## Downstream Rocky bootstrap limits

- Microsoft supports SQL Server Linux container images only on Intel and AMD
  x86-64 Linux hosts. Emulation and translation are not supported. The Azure
  VM and bootstrap preflight must therefore prove `x86_64`/`amd64` before
  pulling or starting the image. See the
  [SQL Server 2025 Linux release notes](https://learn.microsoft.com/en-us/sql/linux/sql-server-linux-release-notes-2025?view=sql-server-ver17#supported-platforms).
- The selected image contains an Ubuntu 24.04 user space. The Rocky Linux 10
  VM is the container host; it does not change the image's distribution or
  digest. Microsoft documents `podman run` as an alternative on RHEL 8 and
  later in its
  [container security guidance](https://learn.microsoft.com/en-us/sql/linux/containers/security?view=sql-server-ver17#encrypt-connections-to-sql-server-linux-containers).
- SQL Server 2019 and later images run as the non-root `mssql` user. Mounted
  data, backup, configuration, certificate, and key paths must be readable or
  writable by that identity as appropriate. The bootstrap decision must retain
  the already settled XFS data-disk and TLS contracts.
- Persist `/var/opt/mssql` on the declared SQL data disk. Microsoft warns that
  removing a container deletes data kept only in its writable layer. Retained
  state is required for diagnosis and forward-transition verification.
- Developer edition grants development and test use, not production rights.
  The workflow must use only synthetic verification data, must not serve live
  users or business operations, and must not expose an operator override for a
  paid edition or product key.
- Developer edition has no Evaluation edition's 180-day limit. The map's
  explicit cleanup and retained-cost controls remain operational requirements,
  not Developer license-duration conditions. Microsoft's
  [SQL Server 2025 edition comparison](https://learn.microsoft.com/en-us/sql/sql-server/editions-and-components-of-sql-server-2025?view=sql-server-ver17)
  assigns the 180-day limit to Evaluation edition.

This decision applies only to the shared SQL adapter for guide-based deployment
verification in [the Wayfinder map](https://github.com/viscalyx/Kravhantering/issues/944).
It neither changes nor selects SQL Server image, edition, licensing, secret, or
upgrade policy for AzureDev.
