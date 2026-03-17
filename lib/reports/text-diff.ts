import type { DiffSegment } from './types'

/**
 * Word-level diff using longest common subsequence.
 * Splits text into words and computes added/removed/unchanged segments.
 */
export function diffText(
  oldText: string | null,
  newText: string | null,
): DiffSegment[] {
  const oldStr = oldText ?? ''
  const newStr = newText ?? ''

  if (oldStr === newStr) {
    return oldStr.length > 0 ? [{ type: 'unchanged', text: oldStr }] : []
  }

  if (oldStr.length === 0) {
    return [{ type: 'added', text: newStr }]
  }

  if (newStr.length === 0) {
    return [{ type: 'removed', text: oldStr }]
  }

  const oldWords = tokenize(oldStr)
  const newWords = tokenize(newStr)
  const lcs = computeLcs(oldWords, newWords)

  const segments: DiffSegment[] = []
  let oldIdx = 0
  let newIdx = 0

  for (const match of lcs) {
    if (oldIdx < match.oldIndex) {
      pushSegment(segments, 'removed', oldWords.slice(oldIdx, match.oldIndex))
    }
    if (newIdx < match.newIndex) {
      pushSegment(segments, 'added', newWords.slice(newIdx, match.newIndex))
    }
    pushSegment(segments, 'unchanged', [oldWords[match.oldIndex]])
    oldIdx = match.oldIndex + 1
    newIdx = match.newIndex + 1
  }

  if (oldIdx < oldWords.length) {
    pushSegment(segments, 'removed', oldWords.slice(oldIdx))
  }
  if (newIdx < newWords.length) {
    pushSegment(segments, 'added', newWords.slice(newIdx))
  }

  return segments
}

interface LcsMatch {
  newIndex: number
  oldIndex: number
}

function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter(token => token.length > 0)
}

function computeLcs(oldTokens: string[], newTokens: string[]): LcsMatch[] {
  const oldLen = oldTokens.length
  const newLen = newTokens.length

  const dp: number[][] = Array.from({ length: oldLen + 1 }, () =>
    new Array<number>(newLen + 1).fill(0),
  )

  for (let i = oldLen - 1; i >= 0; i--) {
    for (let j = newLen - 1; j >= 0; j--) {
      if (oldTokens[i] === newTokens[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  const matches: LcsMatch[] = []
  let i = 0
  let j = 0

  while (i < oldLen && j < newLen) {
    if (oldTokens[i] === newTokens[j]) {
      matches.push({ oldIndex: i, newIndex: j })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++
    } else {
      j++
    }
  }

  return matches
}

function pushSegment(
  segments: DiffSegment[],
  type: DiffSegment['type'],
  tokens: string[],
) {
  if (tokens.length === 0) return
  const text = tokens.join('')
  const last = segments[segments.length - 1]
  if (last && last.type === type) {
    last.text += text
  } else {
    segments.push({ type, text })
  }
}
