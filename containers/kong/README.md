# Kong Development Contract

This directory owns the local development contract for the Kong Gateway vendor
container and the release test support Kong configuration. Kong is used for
development-time verification of DB-less API-management wiring in the
devcontainer and Azure VM environment, and for the test-only `single-node-demo`
release topology. It is not part of the production runtime topology.

## Owned Configuration

- The vendor image lock in `image.lock.json`.
- The DB-less declarative configuration in `kong.yml`.
- Documentation for the devcontainer-only lifecycle scripts.
- The synchronized devcontainer Compose and Azure VM Quadlet image references.

Kong runs the upstream `kong/kong-gateway` image directly. Do not add a
project-owned wrapper image unless a later design decision requires custom
runtime code.

## Runtime Contract

The devcontainer Compose service runs Kong with:

- `KONG_DATABASE=off`
- `KONG_DECLARATIVE_CONFIG=/kong/declarative/kong.yml`
- proxy listener on the internal compose network at `kong:8000`
- Admin API listener on the internal compose network at `kong:8001`

No Kong ports are published to the host. The Admin API has no local dev token
in this phase because it is reachable only from containers on the same
devcontainer Compose network.

`kong.yml` contains one HSA route: `POST /hsa/person-records/lookup`.
Kong proxies that app-facing REST contract to
`hsa-person-lookup-adapter` on the internal Compose network. The adapter calls
the HSA directory mock SOAP `GetHsaPerson` endpoint over mTLS. Kong does not
proxy the SOAP path in the repository-supported topology.

## Lifecycle Scripts

Use the npm scripts from the repository root:

```sh
npm run devcontainer:kong:config
npm run devcontainer:kong:pull
npm run devcontainer:kong:up
npm run devcontainer:kong:status
npm run devcontainer:kong:logs
npm run devcontainer:kong:restart
npm run devcontainer:kong:recreate
npm run devcontainer:kong:down
```

The wrapper auto-detects whether the default or elevated devcontainer Compose
profile is active and controls only the `kong` service. If no devcontainer is
running, it falls back to the default profile.

`status` verifies Kong from inside the devcontainer `app` service by calling
`http://kong:8001/status`. If the `app` service is not running, start or attach
the devcontainer before using `status`.

Pass additional `docker compose logs` options after `--`, for example:

```sh
npm run devcontainer:kong:logs -- --follow
```

After changing `kong.yml`, recreate Kong so the DB-less config is reloaded:

```sh
npm run devcontainer:kong:recreate
```

## Image Lock Updates

`image.lock.json` pins the upstream image by tag, manifest digest and image ID.

The normal detection path is `.github/workflows/dependency-drift.yml`. It runs
weekly from `main` and can also be started manually with `workflow_dispatch`.
The detector opens or refreshes a dependency-drift issue for the Kong Gateway
major-version lane. Resolve that issue with the named maintenance skill, update
`tag`, `manifestDigest` and `imageId` together when the version changes, and
update digest evidence when content drifts under the same tag. Keep supported
devcontainer and Azure development references aligned to `image:tag` without a
manifest digest. Release locks retain the reviewed digest and image ID. Let the
normal pull request workflows, including Container PR Smoke, validate the
change before merging.

Use the manual path when selecting an exceptional LTS tag, recovering a failed
automation run, or changing devcontainer or release test-support pinning
policy:

1. Choose the new official Kong Gateway tag. Prefer a version-specific LTS tag
   and do not use `latest`.
2. Resolve the manifest digest with
   `docker buildx imagetools inspect kong/kong-gateway:<tag>`.
3. Resolve the platform image config digest with
   `docker manifest inspect --verbose kong/kong-gateway:<tag>`.
4. Update `tag`, `manifestDigest` and `imageId` together in the lock. Repeat the
   new tag without a digest in both devcontainer Compose files and the Azure VM
   Quadlet.
5. Run `npm run devcontainer:kong:pull`, `npm run devcontainer:kong:up` and
   `npm run devcontainer:kong:status`.
6. Run `npm run dependency-maintenance:check` and verify that
   `.github/workflows/dependency-drift.yml` reports no Kong drift. The check
   keeps supported Kong development references aligned with the canonical lock
   tag while release evidence retains its immutable identities.

## Update Rules

- Keep Kong DB-less and file-configured for the devcontainer.
- Keep the Admin API internal to the active Compose network.
- Keep the HSA route plain and DB-less. The current REST route is a proxy to
  `hsa-person-lookup-adapter`; do not reintroduce a direct SOAP route or a
  mock-owned JSON facade in Kong.
- Do not add Kong to the required production runtime topology. Its release use is
  limited to `single-node-demo` test support.
