---
applyTo: "{package.json,package-lock.json,.npmrc}"
---

# Package Management

- Preserve exact dependency pins unless the requested update changes them.
- Keep Node.js, npm, CI, production images, and both devcontainer profiles
  compatible. Use `packageManager` as the npm version source.
- Keep React and React DOM aligned; match their type packages to their major.
- Keep Vitest and its coverage provider at the same version.
- Match the Biome configuration schema to the installed Biome version.
- Review `npm approve-scripts --allow-scripts-pending` after installation.
  Record approvals for reviewed package versions in `allowScripts`.
- Use `npm run purge:install` for explicit dependency maintenance. Preserve
  `npm ci` for CI and devcontainer creation.
- Update direct pins with explicit `npm install package@version` commands;
  `purge:install` regenerates the installation without changing those pins.
- After updating Playwright, install its matching Chromium browser with
  `npx playwright install chromium`.
- Run `npm run check` and `npm audit` after dependency changes. Run
  `npm run test:container` when production image inputs change.
