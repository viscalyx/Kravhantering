# UBI Node.js 24 comparison prototype

This throwaway prototype asks whether the exact public UBI 10 Node.js 24
builder and minimal-runtime images can preserve the six published container
contracts, and where the result differs materially from the current
`node:24-trixie-slim` images.

It does not authorize or implement a production migration. The candidate
Dockerfiles intentionally live only on this prototype branch. They keep the
source tree at commit `032ddeeacbac6d32c0247fddbcba25c32b493973`, pin the
Linux AMD64 UBI manifests observed on 2026-09-04, make the inherited runtime
command explicit, retain UID/GID `1000:1000`, and retain the release-proof
utilities present in the UBI minimal image.

Run the complete paired build and local contract probe from the repository
root:

```bash
prototypes/ubi-nodejs-24/run.sh
```

The command writes disposable OCI archives and machine-readable evidence below
`tmp/ubi-nodejs-24-prototype/`. The committed `RESULTS.md` is a concise snapshot
of the reviewed run. Full release smoke, attestations, prospective remediation
observation, and the redistribution approval gate remain outside this local
probe and must not be inferred from a successful run.
