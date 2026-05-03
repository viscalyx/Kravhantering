# Red Hat OpenShift Dev Spaces

This repository ships a [`devfile.yaml`](../devfile.yaml) so it can be
opened directly in [Red Hat OpenShift Dev
Spaces](https://developers.redhat.com/products/openshift-dev-spaces/overview)
(Dev Spaces 3.x, Devfile schema `2.2.2`).

The Dev Spaces workspace mirrors the local devcontainer setup
(`.devcontainer/`): a tools container plus a SQL Server sidecar and a
Keycloak sidecar, all sharing the same pod so the app can reach them
on `localhost`.

## Quick start

1. Open the Dev Spaces dashboard for your cluster.
2. Choose **Create Workspace → Git Repository** and paste the HTTPS URL
   of this repo (or click a factory link, see below).
3. Pick an editor in the **Choose an Editor** dialog (see
   [Choosing the editor](#choosing-the-editor)).
4. Ensure the required Secret exists in the same OpenShift project as
   the workspace (see [Required Secrets](#required-secrets)).
5. Start the workspace and wait for the IDE to open.
6. Run the **install** command from the Dev Spaces command palette. The
   first run downloads Node 24 via `nvm`, installs npm packages, and
   downloads the Playwright Chromium browser — expect 5–10 minutes.
7. Run the **db-setup** command from the Dev Spaces command palette to
   migrate and seed SQL Server.
8. Run the **dev** command from the Dev Spaces command palette to start
   `next dev` on the public `next-dev` route.

## Components

The devfile defines three containers in a single pod:

<!-- markdownlint-disable MD013 -->

| Component | Image                                                  | Purpose                                                                      |
| --------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `tools`   | `registry.redhat.io/devspaces/udi-rhel9:latest`        | Universal Developer Image with git, gh, zsh, podman, python3, ripgrep, nvm.  |
| `db`      | `mcr.microsoft.com/mssql/rhel/server:2025-latest`      | SQL Server 2025 Developer edition for Red Hat environments.                  |
| `idp`     | `quay.io/keycloak/keycloak:26.6`                       | Keycloak with the `kravhantering-dev` realm imported on every start.         |

<!-- markdownlint-enable MD013 -->

Storage behavior:

- `node-modules` (3 Gi) — `node_modules`
- `next-cache` (2 Gi) — `.next`
- `nvm-data` (2 Gi) — `~/.nvm` (so Node 24 survives restarts)
- SQL Server data is container-local in Dev Spaces. It is recreated when
  the workspace pod is recreated; run **db-setup** after starting a fresh
  workspace.

Plan for **at least 12 Gi RAM and 4 vCPU** of namespace quota per
workspace.

## Choosing the editor

The "Choose an Editor" picker in the Dev Spaces dashboard is **not** part
of the Devfile spec — it is selected per workspace and stored on the
`DevWorkspace` resource as a contribution. The devfile in this repo is
intentionally editor-agnostic so each developer can pick their preferred
client.

### Per-workspace (recommended for most teams)

In the dashboard, pick **Visual Studio Code (desktop) (SSH)** when
prompted. Dev Spaces will provision an SSH endpoint and your local VS
Code attaches to the workspace via the [Remote -
SSH](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-ssh)
extension.

### Factory URL (share a one-click link)

Append `che-editor` to the factory URL to skip the picker:

```text
https://devspaces.<cluster-domain>/#https://github.com/<org>/<repo>?che-editor=che-incubator/che-code-desktop/latest
```

Other useful editor IDs:

- `che-incubator/che-code/latest` — code-server in the browser
- `che-incubator/che-code-desktop/latest` — VS Code Desktop via SSH
- `che-incubator/che-idea/latest` — JetBrains Gateway

### Cluster default (admins only)

To make VS Code Desktop SSH the default for every new workspace, set
`spec.devEnvironments.defaultEditor` on the `CheCluster` custom resource
in the `openshift-devspaces` namespace:

```yaml
spec:
  devEnvironments:
    defaultEditor: che-incubator/che-code-desktop/latest
```

## Required Secrets

App-level credentials must **not** be committed. Provide them as Dev
Spaces user-namespace `Secret`s labeled and annotated so the
DevWorkspace operator mounts them as environment variables in the
workspace containers.

Create a manifest like this in your developer namespace
(`<user>-devspaces`):

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: kravhantering-secrets
  labels:
    app.kubernetes.io/part-of: che.eclipse.org
    controller.devfile.io/watch-secret: 'true'
    controller.devfile.io/mount-to-devworkspace: 'true'
  annotations:
    controller.devfile.io/mount-as: env
type: Opaque
stringData:
  # Optional: the devfile already provides dev-only fallbacks for the
  # SQL Server and Keycloak sidecars. Keep these here only if you want
  # the same values available in every workspace container through
  # Secret injection.
  MSSQL_SA_PASSWORD: 'YourStrong!Passw0rd'
  KEYCLOAK_ADMIN_PASSWORD: 'admin'
  DB_READONLY_PASSWORD: 'BrowseOnly!Passw0rd7'
  # Optional per-developer secrets normally placed in
  # .env.development.local on a workstation:
  OPENROUTER_API_KEY: ''
  OPENROUTER_MGMT_API_KEY: ''
  GH_TOKEN: ''
```

The repository template lives at
[`dev/devspaces/kravhantering-secrets.yaml`](../dev/devspaces/kravhantering-secrets.yaml).
Copy or edit it with your own per-developer values before applying it.

You can create the Secret before or after creating the workspace. The
important part is that the Secret exists in the same OpenShift project
as the Dev Spaces workspace before the workspace containers start. If
your Dev Spaces project already exists, apply the Secret first and then
create or start the workspace. If the project is only created when your
first workspace is created, create the workspace once, add the Secret to
that project, then restart the workspace. If you add or change the
Secret after the workspace is already running, restart the workspace so
the environment variables are injected.

### CLI setup

Find the OpenShift API URL from the web console before applying the
Secret. Open the OpenShift console, use the account menu to choose
**Copy login command**, then select **Display Token**. The generated
command includes both the token and API URL:

```bash
oc login --token=<token> --server=https://api.<cluster-domain>:6443
```

The API URL is the `--server` value. It is **not** the Dev Spaces
dashboard URL and is usually different from the OpenShift console URL.
If `oc` is already logged in, print the current API URL with:

```bash
oc whoami --show-server
```

Log in, select your Dev Spaces namespace, then apply the Secret:

```bash
oc login --token=<token> --server=<openshift-api-url>
oc project <user>-devspaces # or <user>-dev
# copy from the dev/devspaces/kravhantering-secrets-example.yaml
oc apply -f dev/devspaces/kravhantering-secrets.yaml
```

Ensure the Secret has the Dev Spaces mount label and env annotation.
This is harmless if the manifest already contains them:

```bash
oc label secret kravhantering-secrets \
  controller.devfile.io/mount-to-devworkspace=true \
  controller.devfile.io/watch-secret=true \
  --overwrite

oc annotate secret kravhantering-secrets \
  controller.devfile.io/mount-as=env \
  --overwrite
```

Restart the Dev Spaces workspace after applying or changing the Secret.
Environment variables are injected when the workspace containers start,
and changing mounted DevWorkspace Secrets can restart running workspaces
in the same project. Save work before updating the Secret.

After the workspace restarts, verify that values are present without
printing the secrets:

```bash
test -n "$MSSQL_SA_PASSWORD" && echo "MSSQL_SA_PASSWORD is set"
test -n "$AUTH_SESSION_COOKIE_PASSWORD" && \
  echo "AUTH_SESSION_COOKIE_PASSWORD is set"
```

The DevWorkspace operator injects every key in the secret as an env var
in `tools`, `db`, and `idp` (so `MSSQL_SA_PASSWORD` reaches both the
client and the server side).

### Web console setup

You can also create the Secret without the `oc` CLI:

1. Open the OpenShift web console.
2. Select your `<user>-devspaces` project.
3. Choose **+Add** or **Import YAML**.
4. Paste the Secret manifest.
5. Create the resource.
6. Confirm that the labels and annotation from the CLI setup are
   present on the Secret.
7. Restart the Dev Spaces workspace.

## Auth on Dev Spaces

The Keycloak sidecar publishes its issuer on the **public** Dev Spaces
route (e.g. `https://keycloak-<workspace>.<cluster-domain>`), not on
`localhost:8080` like the devcontainer setup. Override the relevant
`AUTH_*` env vars in the `kravhantering-secrets` Secret so Next.js
discovers the right issuer:

```yaml
stringData:
  AUTH_ISSUER: 'https://keycloak-<workspace>.<cluster-domain>/realms/kravhantering-dev'
  NEXT_PUBLIC_SITE_URL: 'https://next-dev-<workspace>.<cluster-domain>'
  # ...plus AUTH_CLIENT_ID / AUTH_CLIENT_SECRET / ANALYTICS_HASH_SECRET
  # as documented in /workspace/.env.example
```

The route hostnames are visible in the Dev Spaces dashboard under
**Endpoints** for each workspace. If the workspace is recreated, update
the secret with the new hostnames.

## SQL Server on OpenShift

The Dev Spaces workspace uses Microsoft's certified SQL Server image for
Red Hat environments:

```yaml
image: mcr.microsoft.com/mssql/rhel/server:2025-latest
```

SQL Server data is not mounted on a Dev Spaces PVC by default. Developer
Sandbox-style SCCs commonly reject `fsGroup: 10001`, and SQL Server
needs that group to write a mounted `/var/opt/mssql` volume. The sidecar
therefore uses container-local storage so the workspace can start under
the default Dev Spaces permissions. Data is recreated when the workspace
pod is recreated; run **db-setup** after starting a fresh workspace.

SQL Server still has stricter startup requirements than the `tools`
container. If the `db` container enters `CrashLoopBackOff`, get the
container log first:

```bash
oc logs -n <user>-devspaces <workspace-pod-name> -c db --previous
```

If you do not know the pod name, list pods in the Dev Spaces project:

```bash
oc get pods -n <user>-devspaces
```

Common causes are:

- `MSSQL_SA_PASSWORD` is missing from the generated `db` container.
  The devfile includes a dev-only fallback; if the resolved
  `DevWorkspace` does not show it, recreate the workspace from the
  current `devfile.yaml`.
- `MSSQL_SA_PASSWORD` does not satisfy SQL Server complexity rules:
  at least 8 characters and at least three of uppercase, lowercase,
  digits, and symbols.
- The OpenShift cluster's SCC and storage settings do not allow the SQL
  Server image to start. If the error mentions `fsGroup: 10001 is not an
  allowed group`, recreate the workspace from the current devfile, which
  intentionally does not set `fsGroup`.

Verify that the Secret has the expected keys without printing values:

```bash
oc get secret kravhantering-secrets -n <user>-devspaces \
  -o go-template='{{range $k, $_ := .data}}{{println $k}}{{end}}'
```

Verify the Dev Spaces mount label and env annotation:

```bash
oc get secret kravhantering-secrets -n <user>-devspaces --show-labels
oc annotate secret kravhantering-secrets -n <user>-devspaces --list
```

The metadata should include:

```yaml
labels:
  controller.devfile.io/mount-to-devworkspace: 'true'
  controller.devfile.io/watch-secret: 'true'
annotations:
  controller.devfile.io/mount-as: env
```

If your team needs persistent SQL Server data in Dev Spaces, ask a
cluster administrator for one of these OpenShift-side fixes:

1. **Grant a suitable SCC to the workspace ServiceAccount**
   (cluster-admin):

   ```bash
   oc adm policy add-scc-to-user anyuid \
     -z <workspace-sa> -n <user>-devspaces
   ```

2. Configure an SCC or storage policy that allows `fsGroup: 10001` and a
   writable `/var/opt/mssql` volume for the SQL Server sidecar.

3. Use an external development SQL Server instead of the sidecar, then
   point `DB_HOST`, `DB_PORT`, and related `DB_*` variables at it.

## Differences vs. the devcontainer

<!-- markdownlint-disable MD013 -->

| Aspect           | Devcontainer (`.devcontainer/`)                                | Dev Spaces (`devfile.yaml`)                            |
| ---------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| Tools image      | Custom `Dockerfile`                                            | `udi-rhel9` (UDI, prebuilt)                            |
| Node install     | `devcontainers/features/node`                                  | Manual `install` cmd with `nvm install 24`             |
| Service network  | Compose service names (`db`, `idp`) + socat forwarder for OIDC | Shared pod, all on `localhost`                         |
| Secrets          | `.env.development.local` (host)                                | Labeled/annotated Kubernetes `Secret`                  |
| Codex bind mount | `~/.codex` from host                                           | Not available                                          |
| HTTPS for `dev`  | `mkcert` + `next dev --experimental-https`                     | Dev Spaces ingress terminates TLS on the public route  |

<!-- markdownlint-enable MD013 -->

## Troubleshooting

### Debug failed starts

Use the actual Dev Spaces project/namespace from the error message. In
Red Hat Developer Sandbox this may be `<user>-dev`; in other clusters it
may be `<user>-devspaces`.

```bash
oc project <workspace-namespace>
```

If you are unsure which project Dev Spaces used, list the workspaces and
look at the namespace column:

```bash
oc get devworkspaces -A
```

Inspect the resolved `DevWorkspace`. This is the source of truth for the
devfile Dev Spaces is actually using, including cached or factory-loaded
content:

```bash
oc describe devworkspace kravhantering -n <workspace-namespace>
```

Check the resolved `db` and `idp` container env sections. The `db`
container must include:

```text
MSSQL_SA_PASSWORD=YourStrong!Passw0rd
```

The `idp` container must include:

```text
KEYCLOAK_ADMIN_PASSWORD=admin
```

If those values are missing from the resolved `DevWorkspace`, the
workspace was not created from the current `devfile.yaml`. Delete and
recreate the workspace from the current branch.

If `oc get pods` returns no resources, Dev Spaces has already stopped
and cleaned up the failed pod. Use events to find the failed pod names
and the last reported reason:

```bash
oc get pods -n <workspace-namespace>
oc get events -n <workspace-namespace> --sort-by=.lastTimestamp
```

When a workspace pod exists, inspect the generated Kubernetes env for
the `db` container without printing secret values:

```bash
DB_ENV='{range .spec.containers[?(@.name=="db")].env[*]}{.name}{"\n"}{end}'
oc get pod <workspace-pod-name> -n <workspace-namespace> \
  -o jsonpath="$DB_ENV" | sort
```

Expected `db` names include:

```text
ACCEPT_EULA
MSSQL_PID
MSSQL_SA_PASSWORD
```

For Keycloak, verify the `idp` container env names:

```bash
IDP_ENV='{range .spec.containers[?(@.name=="idp")].env[*]}{.name}{"\n"}{end}'
oc get pod <workspace-pod-name> -n <workspace-namespace> \
  -o jsonpath="$IDP_ENV" | sort
```

Expected `idp` names include:

```text
KEYCLOAK_ADMIN
KEYCLOAK_ADMIN_PASSWORD
KC_HTTP_PORT
```

For `CrashLoopBackOff`, the kubelet event is not enough; get the
container's own log. Use `--previous` first because the failed process
may already have restarted:

```bash
oc logs -n <workspace-namespace> <workspace-pod-name> -c db \
  --previous --tail=200
oc logs -n <workspace-namespace> <workspace-pod-name> -c db --tail=200
```

When the pod disappears too quickly, start the workspace again and watch
for the pod name in a second terminal:

```bash
watch -n 1 'oc get pods -n <workspace-namespace>'
```

Then run the `oc logs` command as soon as the `workspace...` pod appears.

- **Workspace fails with `postStart hook` or exit code 243** — make sure
  the workspace was created from the current `devfile.yaml`. Older
  versions bound `install` and `db-setup` to `events.postStart`; Dev
  Spaces treats a non-zero `postStart` lifecycle command as a deployment
  failure. Delete and recreate the workspace if Dev Spaces cached the old
  devfile, then run **install** and **db-setup** manually from the command
  palette.
- **`install` fails with "engine 'node' is incompatible"** — open a
  terminal in the `tools` container and run `nvm use 24` before
  retrying. The default-alias is set on first run, so this usually
  only affects the very first session.
- **`db-setup` fails** — check the `db` container log in the workspace
  pod. `MSSQL_SA_PASSWORD` must satisfy the SQL Server complexity
  policy (≥ 8 chars, mixed case, digit, symbol).
- **Login redirect loops** — `AUTH_ISSUER` and `NEXT_PUBLIC_SITE_URL`
  must match the public route hostnames of the current workspace.
  Update the Secret and restart the workspace.
- **OOMKilled** — increase `memoryLimit` on the `tools` component or
  raise the namespace quota.
