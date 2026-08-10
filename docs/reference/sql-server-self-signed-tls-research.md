# SQL Server self-signed TLS research note

Research date: 2026-08-10

## Decision summary

Add a dedicated, standalone Appendix B to the self-contained single-node
deployment guide. Keep Appendix A focused on the public nginx certificate.
Appendix B should explain and provision only the SQL Server trust set for the
fixed internal service identity `sqlserver`.

For production, the default remains a leaf certificate from an approved CA.
Microsoft explicitly says that its self-signed SQL Server example is for test
and non-production use and recommends a CA-issued certificate for production.
A local trust set therefore needs to be presented as an explicitly approved
exception, not as the normal production path. See Microsoft's
[SQL Server on Linux encrypted-connections guidance](https://learn.microsoft.com/en-us/sql/linux/security/encrypted-connections?view=sql-server-ver17#generate-certificate).

For the exception, prefer this two-certificate structure:

1. a self-signed, SQL-Server-specific local root CA; and
2. a separate CA-signed server leaf for `DNS:sqlserver`.

Do not describe the leaf itself as self-signed. This structure lets an operator
renew the leaf under the already trusted root without changing every client's
trust anchor. A directly self-signed leaf is technically usable as its own
trust anchor, but every leaf rotation also becomes a coordinated client trust
rotation. Microsoft distinguishes the public server certificate from the CA
certificate that must be copied to clients in its
[client registration instructions](https://learn.microsoft.com/en-us/sql/linux/security/encrypted-connections?view=sql-server-ver17#register-the-certificate-on-your-client-machine-windows-linux-or-macos).

## Repository topology contract

The release currently pins SQL Server 2025 CU7 in
[`containers/sqlserver/image.lock.json`](../../containers/sqlserver/image.lock.json).
The single-node unit gives the database container the stable network alias
`sqlserver`, mounts the host certificate and key read-only, and preserves the
host service user's supplementary group. See the
[`kravhantering-sqlserver` Quadlet template](../../containers/production/quadlet/templates/single-node/kravhantering-sqlserver.container.template).

The release-owned
[`mssql.conf`](../../containers/production/sqlserver/mssql.conf) already sets:

```ini
[network]
tlscert = /etc/kravhantering/sqlserver-tls/server.crt
tlskey = /etc/kravhantering/sqlserver-tls/server.key
forceencryption = 1
```

These are the correct absolute in-container paths, and `forceencryption = 1`
requires encryption for all connections. Microsoft documents the three
settings and their meanings in the
[`mssql-conf` TLS reference](https://learn.microsoft.com/en-us/sql/linux/configure/mssql-conf?view=sql-server-ver17#specify-tls-settings).

The application and database job connect as `sqlserver`, enable encryption,
and keep server-certificate validation enabled. The application container
mounts the common CA bundle through `NODE_EXTRA_CA_CERTS`; the database-job
template expects the same trust mechanism at its one-shot mount path. See the
[`app-runtime` Quadlet template](../../containers/production/quadlet/templates/single-node/kravhantering-app-runtime.container.template)
and
[`db-job.env.template`](../../containers/production/env/db-job.env.template).

## Required certificate profile

The SQL Server leaf should have all of these properties:

<!-- markdownlint-disable MD013 -->
| Property | Required value | Reason |
| --- | --- | --- |
| Subject common name | `CN=sqlserver` | Microsoft requires the subject CN to match the SQL Server host name or FQDN. |
| Subject alternative name | `DNS:sqlserver` | Clients connect through the fixed Quadlet DNS alias and validate the connection name against the CN or SAN. |
| Extended key usage | `serverAuth` / `1.3.6.1.5.5.7.3.1` | Microsoft requires Server Authentication EKU. |
| Key usage | Critical `digitalSignature,keyEncipherment` | Microsoft requires an exchange-capable certificate and normally expects key encipherment; its general requirements also include digital signature. |
| Basic constraints | Critical `CA:FALSE` | The leaf must not be usable as a CA. |
| Key | RSA 2048 bits or stronger | Microsoft's Linux and container examples use RSA 2048. |
| Signature | SHA-256 or stronger | Microsoft warns that MD5 and SHA-1 certificates can fail with modern OpenSSL security levels and recommends a signature with at least 112 bits of security. |
| Validity | Currently valid and monitored before expiry | Microsoft requires current time to fall between `notBefore` and `notAfter`. |
| Private-key encoding | Separate, unencrypted PEM key | SQL Server must load the key unattended at process start; Microsoft's OpenSSL example creates a separate unencrypted key. |
<!-- markdownlint-enable MD013 -->

Microsoft's Linux-specific requirements cover validity, EKU, exchange key
usage, and CN in
[Requirements for certificates](https://learn.microsoft.com/en-us/sql/linux/security/encrypted-connections?view=sql-server-ver17#requirements-for-certificates).
Its broader SQL Server requirements say that SAN should contain every name
clients use and that key usage usually contains both key encipherment and
digital signature. See
[Certificate requirements for SQL Server](https://learn.microsoft.com/en-us/sql/database-engine/configure-windows/certificate-requirements?view=sql-server-ver17).
Microsoft's client documentation confirms that server validation matches the
connection name against the certificate CN or DNS SAN. See
[ODBC encrypted connection names](https://learn.microsoft.com/en-us/sql/connect/odbc/linux-mac/connection-string-keywords-and-data-source-names-dsns?view=sql-server-ver17#using-tlsssl).

The root CA should explicitly contain critical `CA:TRUE,pathlen:0` basic
constraints and critical `keyCertSign,cRLSign` key usage. The server leaf should
explicitly contain critical `CA:FALSE`. OpenSSL says a CA certificate must set
`CA:TRUE`, explains that `pathlen:0` prevents subordinate CAs, and defines the
key-usage and `serverAuth` extension names in its
[X.509 v3 extension reference](https://docs.openssl.org/4.0/man5/x509v3_config/#standard-extensions).

Do not add `localhost`, a container ID, a host IP address, or the public app
name merely for convenience. Every additional SAN is another identity for
which the certificate is valid. Administration clients should join the
database network and connect as `sqlserver`, matching the repository's fixed
service-name contract.

## Generation design for Appendix B

The appendix should be standalone and use a root-only staging directory outside
the runtime mount tree. A safe outline is:

```bash
umask 077
SQLSERVER_TLS_STAGING="$(mktemp -d \
  /var/tmp/kravhantering-sqlserver-tls.XXXXXX)"
SQLSERVER_TLS_DIR=/etc/kravhantering/sqlserver-tls
SQLSERVER_CA_SUBJECT='/C=SE/O=Viscalyx/CN=Kravhantering SQL Server Local CA'
```

Generate the local root with an RSA 4096-bit key, SHA-256, and explicit CA
extensions:

```bash
openssl req -x509 -newkey rsa:4096 -noenc -sha256 -days 3650 \
  -subj "$SQLSERVER_CA_SUBJECT" \
  -addext 'basicConstraints=critical,CA:TRUE,pathlen:0' \
  -addext 'keyUsage=critical,keyCertSign,cRLSign' \
  -addext 'subjectKeyIdentifier=hash' \
  -keyout "${SQLSERVER_TLS_STAGING}/local-root-ca.key" \
  -out "${SQLSERVER_TLS_STAGING}/local-root-ca.crt"
```

Generate a distinct RSA 2048-bit server key and CSR with all leaf extensions:

```bash
openssl req -new -newkey rsa:2048 -noenc -sha256 \
  -subj '/CN=sqlserver' \
  -addext 'basicConstraints=critical,CA:FALSE' \
  -addext 'keyUsage=critical,digitalSignature,keyEncipherment' \
  -addext 'extendedKeyUsage=serverAuth' \
  -addext 'subjectAltName=DNS:sqlserver' \
  -keyout "${SQLSERVER_TLS_STAGING}/server.key" \
  -out "${SQLSERVER_TLS_STAGING}/sqlserver.csr"
```

Sign only this operator-generated CSR and copy its requested extensions into
the leaf:

```bash
openssl x509 -req -sha256 -days 365 \
  -in "${SQLSERVER_TLS_STAGING}/sqlserver.csr" \
  -CA "${SQLSERVER_TLS_STAGING}/local-root-ca.crt" \
  -CAkey "${SQLSERVER_TLS_STAGING}/local-root-ca.key" \
  -CAcreateserial -copy_extensions copy \
  -out "${SQLSERVER_TLS_STAGING}/server.crt"
```

OpenSSL documents `-noenc`, `-addext`, CA signing, and extension copying in
[`openssl-req`](https://docs.openssl.org/3.1/man1/openssl-req/) and
[`openssl-x509`](https://docs.openssl.org/3.3/man1/openssl-x509/). `-nodes`
still appears in Microsoft's example but is deprecated in OpenSSL 3; use
`-noenc` in a new RHEL 10 procedure.

The 365-day leaf and ten-year local root above are example lifetimes, not a
site policy. The appendix should tell operators to replace them with approved
lifetimes, record both expiry dates, and rotate before either expires.

Keep the CA signing key out of `/etc/kravhantering/tls` and
`/etc/kravhantering/sqlserver-tls`. Retain it only in an approved offline
secret store if the same root will issue renewal leaves. Never bind-mount it,
copy it into a container, or include it in deployment evidence. Microsoft's
container guidance warns that compromise of SQL Server certificate and key
paths compromises the encryption configuration. See
[Secure SQL Server Linux containers](https://learn.microsoft.com/en-us/sql/linux/containers/security?view=sql-server-ver17#encrypt-connections-to-sql-server-linux-containers).

## Pre-install verification

The appendix should stop on any failed check. Use one command to enforce the
chain, current validity, TLS-server purpose, and fixed DNS identity:

```bash
openssl verify \
  -CAfile "${SQLSERVER_TLS_STAGING}/local-root-ca.crt" \
  -purpose sslserver \
  -verify_hostname sqlserver \
  "${SQLSERVER_TLS_STAGING}/server.crt"
```

Review the resulting subject, issuer, validity, SAN, EKU, key usage, and basic
constraints, then prove that the public keys match:

```bash
set -euo pipefail

openssl x509 -in "${SQLSERVER_TLS_STAGING}/server.crt" -noout \
  -subject -issuer -dates \
  -ext subjectAltName -ext extendedKeyUsage \
  -ext keyUsage -ext basicConstraints

CERT_PUBLIC_KEY_SHA256="$(
  openssl x509 -in "${SQLSERVER_TLS_STAGING}/server.crt" -pubkey -noout |
    openssl pkey -pubin -outform DER | sha256sum
)"
PRIVATE_KEY_PUBLIC_SHA256="$(
  openssl pkey -in "${SQLSERVER_TLS_STAGING}/server.key" \
    -pubout -outform DER | sha256sum
)"
test "$CERT_PUBLIC_KEY_SHA256" = "$PRIVATE_KEY_PUBLIC_SHA256"
```

OpenSSL documents purpose and host-name verification in
[`openssl-verify`](https://docs.openssl.org/3.6/man1/openssl-verify/) and
certificate inspection and host checking in
[`openssl-x509`](https://docs.openssl.org/3.3/man1/openssl-x509/).

## Deployment paths, ownership, and trust bundle

Install only the leaf and leaf key into the SQL Server runtime directory:

```bash
sudo install -d -o root -g kravhantering -m 0750 \
  /etc/kravhantering/sqlserver-tls
sudo install -o root -g kravhantering -m 0644 \
  "${SQLSERVER_TLS_STAGING}/server.crt" \
  /etc/kravhantering/sqlserver-tls/server.crt
sudo install -o root -g kravhantering -m 0640 \
  "${SQLSERVER_TLS_STAGING}/server.key" \
  /etc/kravhantering/sqlserver-tls/server.key
```

Microsoft requires the `mssql` account to be able to read both files. Its
general Linux examples use mode `0600`, while its container example uses
`0440` and bind mounts the files. See the
[Linux file-permission guidance](https://learn.microsoft.com/en-us/sql/linux/security/encrypted-connections?view=sql-server-ver17#generate-certificate)
and
[container example](https://learn.microsoft.com/en-us/sql/linux/containers/security?view=sql-server-ver17#encrypt-connections-to-sql-server-linux-containers).

The repository's host-side `root:kravhantering` ownership and `0640` key mode
are a deliberate equivalent: the rootless SQL Server unit preserves the
`kravhantering` supplementary group and mounts the files read-only. The public
certificate does not need private-key confidentiality, so `0644` is
appropriate; the private key must never become world-readable. Verification
should include a container-context read/start check, not just a host `ls`.

Install the local root CA into the client bundle, not beside the SQL Server
private key. A standalone Appendix B must preserve all existing approved roots
in `/etc/kravhantering/tls/ca.crt`; it must rebuild or extend the PEM bundle
rather than overwrite the nginx/Keycloak trust chain. Node.js accepts one or
more PEM certificates in `NODE_EXTRA_CA_CERTS` and reads the file only when the
process starts. See the
[`NODE_EXTRA_CA_CERTS` reference](https://nodejs.org/docs/latest/api/cli.html#node_extra_ca_certsfile).

The RHEL host can trust the local root by placing its public certificate in
`/etc/pki/ca-trust/source/anchors/` and running `update-ca-trust extract`.
Red Hat documents the trust-anchor path, PEM support, and update command in
[RHEL 10 shared system certificates](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/10/html/securing_networks/using-shared-system-certificates).
Host trust is useful for host-side tools, but it does not replace the explicit
CA bundle mounted into the application and one-shot database-job containers.

Reapply the repository's SELinux label after every installed or replaced file,
as the deployment guide already requires. Do not install the CA signing key in
a path that receives `container_file_t`.

## Activation and end-to-end verification

Installing or replacing the pair requires a SQL Server restart. Microsoft's
Linux procedure restarts `mssql-server` after TLS configuration; in this
topology the equivalent is:

```bash
sudo -iu kravhantering
systemctl --user restart kravhantering-sqlserver.service
systemctl --user status kravhantering-sqlserver.service --no-pager
journalctl --user-unit kravhantering-sqlserver.service -n 100 --no-pager
exit
```

See Microsoft's
[SQL Server on Linux configuration sequence](https://learn.microsoft.com/en-us/sql/linux/security/encrypted-connections?view=sql-server-ver17#configure-sql-server).

Then use a real database client on the Quadlet database network with all of
these settings:

```env
DB_HOST=sqlserver
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=false
NODE_EXTRA_CA_CERTS=/run/kravhantering/sqlserver-ca.crt
```

The current deployment guide's `db-job wait` command is the correct topology
test because it exercises DNS name matching, trust-chain validation, and login
without publishing port 1433. Do not use a trust bypass such as
`DB_TRUST_SERVER_CERTIFICATE=true` or `sqlcmd -C`. Microsoft explains that a
verifiable certificate should use encryption with
`TrustServerCertificate=False`; trusting the presented certificate without
validation allows a man-in-the-middle proxy. See
[Encryption and certificate validation](https://learn.microsoft.com/en-us/sql/connect/ado-net/encryption-and-certificate-validation?view=sql-server-ver17).

After the validated client connects, verify transport encryption for that
session:

```sql
SELECT encrypt_option
FROM sys.dm_exec_connections
WHERE session_id = @@SPID;
```

`encrypt_option` must be `TRUE`. Microsoft documents this verification in
[Verify network encryption](https://learn.microsoft.com/en-us/sql/database-engine/configure-windows/configure-sql-server-encryption?view=sql-server-ver17#verify-network-encryption).
This query proves encryption, while the successful client connection with
validation enabled proves trust and name matching; neither check replaces the
other.

If the CA bundle changes after `app-runtime` starts, restart `app-runtime`
because Node.js reads `NODE_EXTRA_CA_CERTS` only at process launch. One-shot
database jobs naturally read the mounted bundle at their next process start.

## TLS protocol setting

Do not add `tlsprotocols = 1.2` blindly to the repository configuration.
Microsoft recommends that explicit restriction for SQL Server 2022 and earlier
when all clients support TLS 1.2, but its SQL Server 2025 sequence omits the
setting and SQL Server 2025 enables TLS 1.3 by default. See
[SQL Server on Linux TLS versions](https://learn.microsoft.com/en-us/sql/linux/security/encrypted-connections?view=sql-server-ver17#operating-system-support)
and the version-specific configuration blocks on that page.

The current release uses SQL Server 2025, so retaining the release-owned
`mssql.conf` without a `tlsprotocols` override is correct. A future explicit
protocol policy should be versioned with the SQL Server image and verified
against every client driver.

## Rotation and recovery

For ordinary leaf renewal under the same local root:

1. generate a new leaf key and leaf certificate in protected staging;
2. verify chain, purpose, `DNS:sqlserver`, validity, and key match;
3. retain the current pair as a short-lived protected rollback pair;
4. stop SQL Server during a maintenance window;
5. install both the new leaf and key while the service is stopped, then apply
   the documented ownership, mode, and SELinux label;
6. start SQL Server;
7. run the validated `db-job wait` path and check `encrypt_option`; and
8. retain serial numbers and expiry dates, but never private keys, as evidence.

Microsoft's TLS setup requires a SQL Server restart, and certificate validity
is part of client validation. Those facts make a monitored pre-expiry restart
the supported operational model. See
[SQL Server on Linux encrypted connections](https://learn.microsoft.com/en-us/sql/linux/security/encrypted-connections?view=sql-server-ver17).

If the local root changes, first publish a bundle containing both old and new
roots to every client and restart `app-runtime`. Then rotate the leaf and SQL
Server, verify every client, remove the old root, and restart clients again.
This overlap prevents a window in which either the old or new server leaf is
untrusted. It is an operational inference from Microsoft's requirement to
install the issuing CA on clients and Node.js's process-start trust loading.

If validation fails, stop SQL Server, restore both files from the protected
previous leaf/key pair, restore the previous CA bundle, and reapply ownership,
mode, and SELinux labels while the service is stopped. Start SQL Server,
restart affected Node.js clients, and repeat the validated connection checks.
A database restore does not restore these bind-mounted host files.

## Limitations of the local trust set

- Microsoft does not recommend self-signed certificates for production. Use
  this flow only for an isolated host or a recorded, approved exception.
- The local root has no managed issuance, revocation, audit, or recovery
  service. Its private key becomes a high-value credential that can authorize
  another certificate trusted by these clients.
- Every client must receive the public root securely. Encryption alone is not
  server authentication; `TrustServerCertificate=true` encrypts traffic while
  bypassing certificate validation.
- The leaf authenticates only `sqlserver`. A client that connects as
  `localhost`, an IP address, a container name, or a public host name should
  fail name validation.
- TLS protects client-to-database traffic in transit. It does not encrypt SQL
  Server data files or backups at rest.
- SQL Server TLS does not cover Always On availability-group database mirroring
  endpoints. Microsoft calls out that limitation in the
  [Linux encrypted-connections overview](https://learn.microsoft.com/en-us/sql/linux/security/encrypted-connections?view=sql-server-ver17#overview).

## Review of the current Appendix A commands

The current SQL Server section is directionally correct: it uses a separate
leaf/key pair, RSA 2048, SHA-256, `CN=sqlserver`, `DNS:sqlserver`, server-auth
EKU, key encipherment, the expected host paths, and a non-world-readable key.
The release configuration also forces encryption and clients keep certificate
validation enabled.

Before turning that material into a dedicated production-exception appendix,
address these gaps:

1. Make Appendix B standalone. The current SQL block depends on `TLS_DIR` and
   CA files created earlier for nginx, which makes the database prerequisite
   easy to miss during an upgrade.
2. Use a SQL-Server-specific local root, or explicitly declare that the nginx
   root also owns SQL Server issuance. A dedicated root reduces accidental
   coupling and makes the trust boundary visible.
3. Add explicit critical root `CA:TRUE,pathlen:0` and
   `keyCertSign,cRLSign` extensions. The current root command relies on the
   host's default OpenSSL configuration for CA extensions.
4. Add explicit critical leaf `CA:FALSE` and make `digitalSignature` as well as
   `keyEncipherment` critical. The current leaf omits basic constraints.
5. Replace deprecated `-nodes` with OpenSSL 3 `-noenc`.
6. Generate and retain the CA signing key in protected staging or an approved
   offline secret store, never in the runtime TLS directory that receives
   container-readable SELinux labeling.
7. When Appendix B has a separate root, merge it into the existing
   `/etc/kravhantering/tls/ca.crt`; do not overwrite the trust needed for nginx
   and Keycloak.
8. Strengthen verification to enforce `-purpose sslserver` and
   `-verify_hostname sqlserver`, and add a certificate/private-key match check.
   Merely printing EKU and SAN leaves acceptance to visual inspection.
9. End with a validated database connection and `encrypt_option = TRUE`, not
   only offline OpenSSL inspection.
10. State the restart behavior and the different leaf-only and CA-changing
    rotation sequences in the appendix, with a link to day-2 operations.

These changes preserve the repository's existing verified-client design while
making the exceptional local-PKI procedure complete enough to execute without
hidden dependencies.
