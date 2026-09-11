---
applyTo: "**/{Dockerfile,.devcontainer/**,.github/workflows/**,package.json,.nvmrc}"
---

# Node Version Synchronization

- Use code, configuration, and lockfiles as the source of truth for Node and
  image versions, role ownership, and validation commands.
- For Node major changes, synchronize all declarations, including `.nvmrc`,
  package engines, workflows, Dockerfile references and ARG defaults, locks,
  generated constants, and runtime major checks. Preserve each image family.
- For base-image updates within the current major, update only the selected
  maintenance role and all its consumers, as registered in
  `.github/dependency-maintenance.json`.
- Scan repository documentation, including pages not linked here, for affected
  Node and base-image claims. Update current guidance to match the implementation.
- After Node major changes, run `nvm install && nvm use`, `npm ci`, and
  `npm run check`.
- For base-image changes, run the affected image checks defined by tests and CI.
- Register newly discovered Dockerfile image references under the matching
  role's `paths` in `.github/dependency-maintenance.json`, synchronize them,
  and run `npm run dependency-maintenance:check`.
