# Upstream source and maintenance

This directory adapts the Google Chrome Modern Web Guidance skill for this
repository. It copies `SKILL.md` from
[GoogleChrome/modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance)
at commit
[`4dd968349e54ca45a05dd5c818fb035c9054b022`](https://github.com/GoogleChrome/modern-web-guidance/tree/4dd968349e54ca45a05dd5c818fb035c9054b022),
release `1.0.0`. Its upstream skill marker is `2026_11_09-5bcc021b`.

## Local adaptations

- Shorten the discovery description while retaining web platform triggers.
- Use the project's npm script and pinned development dependency in place of
  upstream's on-demand `@latest` commands and installer instructions.
- Disable telemetry through the npm script on every invocation.
- Give repository conventions priority and use narrowly typed attribute
  extensions instead of broad `any` casts.
- Add an agent display entry and this provenance record.

Running `npm install` (or `npm ci`) adds the remaining skill files from the
pinned npm package under `node_modules/modern-web-guidance/`: the CLI,
search model and data, guide catalog, and guides. npm does not copy these
files into `.agents/skills/modern-web-guidance/`; the project command reads
them from the installed package. No separate skill installation is required.
The project command is documented in
[the dependency workflow](../../../docs/development/dependency-workflow.md#modern-web-guidance).

## Attribution and licenses

Credit: Google Chrome Modern Web Guidance authors. The upstream software is
Apache-2.0 licensed; [LICENSE](LICENSE) is copied unchanged from the source
revision above. Upstream identifies documentation and guide content as
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
This adapted skill retains that attribution and identifies its modifications
above. See the upstream
[license declaration](https://github.com/GoogleChrome/modern-web-guidance/blob/4dd968349e54ca45a05dd5c818fb035c9054b022/README.md#-license).
Upstream documentation also credits Mozilla Contributors' MDN Web Docs and
W3C, WHATWG, and IETF specifications. Package-specific third-party notices
remain in the installed npm package.

## Updating

1. Review an upstream release and its matching skill instructions. Update the
   exact development dependency and lockfile through the normal dependency
   workflow.
2. Compare this skill with that release's `SKILL.md`, preserve the local
   adaptations, and update this source revision and the search version marker
   together. Preserve upstream licensing and attribution.
3. Verify search, retrieval, and catalog commands through the project npm
   script, including operation without registry access and with telemetry
   disabled. Run the repository dependency checks before committing.
