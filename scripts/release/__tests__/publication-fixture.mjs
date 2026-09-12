import { PUBLICATION_CHECKS, RELEASE_IMAGE_ROLES } from '../publication.mjs'
import { selectValidation } from '../selection.mjs'
export function publicationFixture(overrides = {}) {
  const selection = selectValidation({
    eventName: 'push',
    ref: 'refs/heads/main',
    commitSha: 'a'.repeat(40),
    collection: { complete: true, files: ['app/page.tsx'] },
    workflow: 'container-release',
    ...overrides,
  })
  const version = selection.ref.startsWith('refs/tags/')
    ? selection.ref.slice('refs/tags/v'.length)
    : '1.2.3-preview.1'
  const plan = {
    selection,
    commitSha: selection.commitSha,
    ref: selection.ref,
    eventName: selection.eventName,
    repository: 'viscalyx/Kravhantering',
    runId: '123',
    version,
    releaseTagName: `v${version}`,
    createGitHubRelease: selection.releaseEligible,
    prerelease: !selection.ref.startsWith('refs/tags/'),
  }
  const evidence = {
    ...plan,
    tagSha: selection.ref.startsWith('refs/tags/') ? plan.commitSha : undefined,
    selection,
    checks: Object.fromEntries(
      PUBLICATION_CHECKS.map(name => [name, 'success']),
    ),
    notesContent: '# Operator Upgrade Notes\n\n## Unreleased\n\nBack up SQL.\n',
  }
  const metadata = {
    commitSha: plan.commitSha,
    version: plan.version,
    releaseTagName: plan.releaseTagName,
  }
  for (const [objectPath, name] of RELEASE_IMAGE_ROLES) {
    const keys = objectPath.split('.')
    let target = metadata
    for (const key of keys.slice(0, -1)) target = target[key] ??= {}
    const tags = selection.ref.startsWith('refs/tags/')
      ? [plan.version]
      : [
          plan.version,
          `main-${plan.commitSha.slice(0, 12)}`,
          `sha-${plan.commitSha}`,
        ]
    target[keys.at(-1)] = {
      candidate: {
        artifactPath: `${name}.tar`,
        manifestDigest: `sha256:${name}`,
      },
      manifestDigest: `sha256:${name}`,
      tags: tags.map(tag => `ghcr.io/viscalyx/kravhantering-${name}:${tag}`),
    }
  }
  return { plan, evidence, metadata }
}
