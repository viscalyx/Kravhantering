import fs from 'node:fs'

export const DEFAULT_OPERATOR_UPGRADE_NOTES_PATH =
  'docs/operations/operator-upgrade-notes.md'
export const OPERATOR_UPGRADE_SOURCE_PREFIX = 'operator-upgrade:source'
export const operatorUpgradeSourceStartMarker = id =>
  `<!-- ${OPERATOR_UPGRADE_SOURCE_PREFIX} ${id} start -->`
export const operatorUpgradeSourceEndMarker = id =>
  `<!-- ${OPERATOR_UPGRADE_SOURCE_PREFIX} ${id} end -->`

export function stripOperatorUpgradeSourceMarkers(content) {
  return String(content).replace(
    /^\s*<!-- operator-upgrade:source \S+ (?:start|end) -->\s*$/gmu,
    '',
  )
}

export function parseOperatorUpgradeNotes(
  content,
  filePath = DEFAULT_OPERATOR_UPGRADE_NOTES_PATH,
) {
  if (typeof content !== 'string' || !/^# [^\n]+/u.test(content))
    throw new Error(
      `Operator upgrade notes file ${filePath} is missing or malformed.`,
    )
  const headings = [...content.matchAll(/^##[ \t]+(.+?)[ \t]*$/gmu)]
  if (
    headings[0]?.[1] !== 'Unreleased' ||
    headings.filter(match => match[1] === 'Unreleased').length !== 1
  )
    throw new Error(
      `Operator upgrade notes file ${filePath} must contain exactly one leading "## Unreleased".`,
    )
  if (
    headings
      .slice(1)
      .some(match => !/^v\d+\.\d+\.\d+ - \d{4}-\d{2}-\d{2}$/u.test(match[1]))
  )
    throw new Error('Malformed operator notes release history heading.')
  let open
  const sources = new Set()
  for (const match of content.matchAll(
    /<!-- operator-upgrade:source (\S+) (start|end) -->/gu,
  )) {
    if (match[2] === 'start') {
      if (open || sources.has(match[1]))
        throw new Error('Duplicate or nested operator notes source marker.')
      open = match[1]
      sources.add(open)
    } else {
      if (open !== match[1])
        throw new Error('Unbalanced operator notes source marker.')
      open = undefined
    }
  }
  if (open) throw new Error('Unbalanced operator notes source marker.')
  const start = headings[0].index + headings[0][0].length
  const end = headings[1]?.index ?? content.length
  const section = content.slice(start, end)
  return {
    content,
    before: content.slice(0, start),
    section,
    history: content.slice(end),
    unreleased: stripOperatorUpgradeSourceMarkers(section).trim(),
  }
}

export function meaningfulUnreleasedChange(baseNotes, headNotes) {
  const normalize = value =>
    value
      .replace(/<!--[\s\S]*?-->/gu, '')
      .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gmu, '')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/gu, (_match, label, url) =>
        label === url ? url : `${label} ${url}`,
      )
      .replace(/<([^>]+)>/gu, '$1')
      .replace(/[*_#>`~]/gu, '')
      .replace(/\s+/gu, ' ')
      .trim()
  const before = normalize(parseOperatorUpgradeNotes(baseNotes).unreleased)
  const after = normalize(parseOperatorUpgradeNotes(headNotes).unreleased)
  // New wording is required: whitespace and removal alone cannot assert an addition/correction.
  return after.length > 0 && after !== before && !before.includes(after)
}

function unreleasedEntries(section) {
  const blocks =
    section.match(
      /<!-- operator-upgrade:source \S+ start -->[\s\S]*?<!-- operator-upgrade:source \S+ end -->|(?:(?!<!-- operator-upgrade:source)[\s\S])+(?=<!-- operator-upgrade:source|$)/gu,
    ) ?? []
  return blocks
    .flatMap(block =>
      block.trimStart().startsWith('<!-- operator-upgrade:source')
        ? [block]
        : block.split(/(?=^### )/mu),
    )
    .map(value => value.trim())
    .filter(Boolean)
}

export function archiveStableOperatorUpgradeNotesContent(
  content,
  { date, filePath, version, sourceContent },
) {
  if (!/^v\d+\.\d+\.\d+$/u.test(version ?? ''))
    throw new Error('Stable release version must look like vX.Y.Z.')
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date ?? ''))
    throw new Error('Release date must use YYYY-MM-DD.')
  const current = parseOperatorUpgradeNotes(content, filePath)
  const source = parseOperatorUpgradeNotes(sourceContent, 'tagged source notes')
  const delivered = source.section.trim()
  if (!delivered) return { changed: false, content, reason: 'no-notes' }
  if (current.history.includes(`## ${version} - `))
    return { changed: false, content, reason: 'already-archived' }
  // Remove only exact delivered blocks. Changed shipped guidance requires manual reconciliation.
  const remaining = unreleasedEntries(current.section)
  for (const entry of unreleasedEntries(delivered)) {
    const index = remaining.indexOf(entry)
    if (index === -1)
      throw new Error(
        'Delivered operator notes changed on main; reconcile archival manually.',
      )
    remaining.splice(index, 1)
  }
  const next =
    `${current.before}\n\n${remaining.join('\n\n')}\n\n## ${version} - ${date}\n\n${delivered}\n\n${current.history}`.trimEnd() +
    '\n'
  return { changed: true, content: next, reason: 'archived' }
}

export function archiveStableOperatorUpgradeNotesFile({
  date,
  filePath = DEFAULT_OPERATOR_UPGRADE_NOTES_PATH,
  fsImpl = fs,
  version,
  sourceContent,
}) {
  const result = archiveStableOperatorUpgradeNotesContent(
    fsImpl.readFileSync(filePath, 'utf8'),
    { date, filePath, version, sourceContent },
  )
  if (result.changed) fsImpl.writeFileSync(filePath, result.content)
  return result
}

/* v8 ignore start -- CLI file orchestration. */
export async function main(args = process.argv.slice(2), dependencies = {}) {
  const consoleObj = dependencies.consoleObj ?? console
  const fsImpl = dependencies.fsImpl ?? fs
  try {
    const [command, ...rest] = args
    if (command !== 'archive-stable' || rest.length % 2)
      throw new Error(
        'Usage: archive-stable --version vX.Y.Z --date YYYY-MM-DD --source-notes <tagged-document> [--operator-notes <path>]',
      )
    const options = Object.fromEntries(
      Array.from({ length: rest.length / 2 }, (_, index) => [
        rest[index * 2].replace(/^--/u, ''),
        rest[index * 2 + 1],
      ]),
    )
    const result = archiveStableOperatorUpgradeNotesFile({
      date: options.date,
      version: options.version,
      filePath: options['operator-notes'],
      sourceContent: fsImpl.readFileSync(options['source-notes'], 'utf8'),
      fsImpl,
    })
    consoleObj.log(`Operator notes ${result.reason}.`)
    return 0
  } catch (error) {
    consoleObj.error(error.message)
    return 1
  }
}
if (import.meta.url === `file://${process.argv[1]}`)
  process.exitCode = await main()
/* v8 ignore stop */
