import fs from 'node:fs'

const steps = JSON.parse(process.env.STEPS)
const root = 'tmp/container-release-artifacts/metadata'
const lines = [
  `Source: ${process.env.GITHUB_SHA}`,
  `Run: ${process.env.GITHUB_RUN_ID}`,
]
for (const [id, label] of [
  ['candidate-build', 'Candidate build'],
  ['validation', 'Production validation'],
  ['image-publication', 'Image publication'],
]) {
  lines.push(`- ${label}: ${steps[id]?.outcome ?? 'missing'}`)
}
const githubResultPath = `${root}/github-publication-result.json`
if (fs.existsSync(githubResultPath)) {
  const result = JSON.parse(fs.readFileSync(githubResultPath, 'utf8'))
  lines.push(`- Release page publication: ${result.releasePage}`)
  lines.push(
    `- Required asset delivery: ${steps['github-publication']?.outcome ?? 'missing'}; ${result.assets.length} assets verified`,
  )
  for (const asset of result.assets)
    lines.push(`  - ${asset.name}: ${asset.outcome}`)
} else {
  lines.push(
    `- Release page publication: ${steps['github-publication']?.outcome ?? 'missing'}; no verified result`,
  )
  lines.push('- Required asset delivery: no verified result')
}
for (const file of [
  'promotion-result.json',
  'github-publication-result.json',
]) {
  if (fs.existsSync(`${root}/${file}`))
    lines.push(
      `\n${file}:\n\n\x60\x60\x60json\n${fs.readFileSync(`${root}/${file}`, 'utf8')}\n\x60\x60\x60`,
    )
}
lines.push(
  '\nEnvironment deployment: not observed. For partial or uncertain publication, inspect remote state and manually rerun failed jobs for this original source. Preserve matching published content; reconcile conflicts manually.',
)
fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`)
