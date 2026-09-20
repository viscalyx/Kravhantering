// THROWAWAY: embeds captured measurements so the gallery also opens offline.
import { readFile, writeFile } from 'node:fs/promises'

const dir = 'app/[locale]/specifications/[specificationId]/prototype-review'
const measurements = JSON.parse(
  await readFile(`${dir}/measurements.json`, 'utf8'),
)
const template = await readFile(`${dir}/gallery.template.html`, 'utf8')
await writeFile(
  `${dir}/index.html`,
  template.replace(
    '/* MEASUREMENTS */',
    `const results = ${JSON.stringify(measurements)};`,
  ),
)
console.log(`Gallery includes ${measurements.length} captured configurations.`)
