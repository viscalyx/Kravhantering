import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { loadCertificateProfile } from '../src/profile.mjs'
import { stageGeneration } from '../src/provisioner.mjs'

const PROFILE_PATH = path.resolve(
  process.cwd(),
  process.cwd().endsWith('hsa-person-lookup-adapter') ||
    process.cwd().endsWith('hsa-directory-mock')
    ? '../hsa-mtls/certificate-profile.json'
    : 'containers/hsa-mtls/certificate-profile.json',
)

export async function createRuntimeCertificateFixture() {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'hsa-runtime-fixture-'))
  const issuerRoot = await mkdtemp('/dev/shm/hsa-runtime-issuer-')
  const profile = await loadCertificateProfile(PROFILE_PATH)
  const uid = process.getuid?.() ?? 1000
  const gid = process.getgid?.() ?? 1000
  for (const bundle of Object.values(profile.runtimeBundles)) {
    bundle.owner = { gid, uid }
  }
  const metadata = await stageGeneration({
    issuerRoot,
    lifetime: 'ephemeral',
    profile,
    rootDir,
  })
  const generationDir = path.join(rootDir, 'staged', metadata.generationId)
  return {
    bundle(role, filename) {
      return path.join(generationDir, 'bundles', role, filename)
    },
    async cleanup() {
      await Promise.all([
        rm(rootDir, { force: true, recursive: true }),
        rm(issuerRoot, { force: true, recursive: true }),
      ])
    },
    generationDir,
    profile,
  }
}
