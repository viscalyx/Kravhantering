import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEVELOPER_MODE_OVERLAY_CLASSES } from '@/lib/runtime/developer-mode-safelist'

// Guards against silent drift when @viscalyx/developer-mode-react publishes
// new Tailwind classes inside its compiled overlay. We extract every string
// that looks like a Tailwind class group from the published `dist/index.js`
// and assert each token appears somewhere in our local safelist file. If
// upstream adds new utility classes, this test fails and the safelist must
// be updated to match.

const require_ = createRequire(import.meta.url)
const packageJsonPath = require_.resolve(
  '@viscalyx/developer-mode-react/package.json',
)
const distIndexPath = resolve(dirname(packageJsonPath), 'dist/index.js')
const distIndexSource = readFileSync(distIndexPath, 'utf8')

// Collect every string literal in the bundle, then keep only those that look
// like Tailwind class lists (whitespace-separated tokens that include a
// utility-shaped token). This is a coarse filter — extra strings that pass
// it are harmless because the assertion only requires they be present in
// the safelist source.
const STRING_LITERAL_RE = /"((?:[^"\\]|\\.)*)"/g
// Single non-ambiguous body class avoids exponential backtracking that arises
// when overlapping `-` repetitions are split across multiple groups.
const TAILWIND_TOKEN_RE =
  /^(?:[a-z][a-z0-9-]*:)*-?[a-z][a-z0-9.[\]/_()#-]*\/?[0-9]*$/i

function looksLikeTailwindClassList(value: string): boolean {
  if (!value.includes(' ')) return false
  if (value.includes('<') || value.includes('{')) return false
  const tokens = value.split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return false
  // Require a recognisable Tailwind prefix on at least one token to avoid
  // matching prose strings.
  return tokens.some(token =>
    /^(?:hover:|focus:|focus-visible:|dark:|sm:|md:|lg:)?(?:bg-|text-|border-|rounded|px-|py-|p-|m-|mx-|my-|mt-|mb-|ml-|mr-|fixed|absolute|relative|flex|grid|inline|block|hidden|shadow|ring-|gap-|space-|w-|h-|max-|min-|top-|bottom-|left-|right-|inset-|z-|opacity-|backdrop-|transition|truncate|font-|tracking-|uppercase|lowercase|pointer-events-)/.test(
      token,
    ),
  )
}

const safelistSource = readFileSync(
  resolve(__dirname, '../../lib/runtime/developer-mode-safelist.ts'),
  'utf8',
)

describe('developer-mode safelist', () => {
  const upstreamClassLists = new Set<string>()
  for (const match of distIndexSource.matchAll(STRING_LITERAL_RE)) {
    const value = match[1]
    if (looksLikeTailwindClassList(value)) {
      upstreamClassLists.add(value)
    }
  }

  it('extracts at least one class list from the published overlay', () => {
    expect(upstreamClassLists.size).toBeGreaterThan(0)
  })

  it('exports the same class strings that Tailwind needs to scan', () => {
    expect(DEVELOPER_MODE_OVERLAY_CLASSES.length).toBeGreaterThan(0)
  })

  it('safelist source mentions every Tailwind token used by the overlay', () => {
    const missing: { source: string; token: string }[] = []
    for (const classList of upstreamClassLists) {
      for (const token of classList.split(/\s+/).filter(Boolean)) {
        if (!TAILWIND_TOKEN_RE.test(token)) continue
        if (!safelistSource.includes(token)) {
          missing.push({ source: classList, token })
        }
      }
    }
    expect(missing, JSON.stringify(missing, null, 2)).toEqual([])
  })
})
