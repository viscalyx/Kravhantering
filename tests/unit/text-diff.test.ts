import { describe, expect, it } from 'vitest'
import { diffText } from '@/lib/reports/text-diff'

describe('diffText', () => {
  it('returns empty array for two null inputs', () => {
    expect(diffText(null, null)).toEqual([])
  })

  it('returns empty array for two empty strings', () => {
    expect(diffText('', '')).toEqual([])
  })

  it('returns unchanged for identical text', () => {
    expect(diffText('hello world', 'hello world')).toEqual([
      { type: 'unchanged', text: 'hello world' },
    ])
  })

  it('returns added for null old text', () => {
    expect(diffText(null, 'new text')).toEqual([
      { type: 'added', text: 'new text' },
    ])
  })

  it('returns removed for null new text', () => {
    expect(diffText('old text', null)).toEqual([
      { type: 'removed', text: 'old text' },
    ])
  })

  it('returns added for empty old text', () => {
    expect(diffText('', 'new text')).toEqual([
      { type: 'added', text: 'new text' },
    ])
  })

  it('returns removed for empty new text', () => {
    expect(diffText('old text', '')).toEqual([
      { type: 'removed', text: 'old text' },
    ])
  })

  it('detects word-level additions', () => {
    const result = diffText('hello world', 'hello beautiful world')
    expect(result).toEqual([
      { type: 'unchanged', text: 'hello ' },
      { type: 'added', text: 'beautiful ' },
      { type: 'unchanged', text: 'world' },
    ])
  })

  it('detects word-level removals', () => {
    const result = diffText('hello beautiful world', 'hello world')
    expect(result).toEqual([
      { type: 'unchanged', text: 'hello ' },
      { type: 'removed', text: 'beautiful ' },
      { type: 'unchanged', text: 'world' },
    ])
  })

  it('detects word replacements', () => {
    const result = diffText('the cat sat', 'the dog sat')
    expect(result).toEqual([
      { type: 'unchanged', text: 'the ' },
      { type: 'removed', text: 'cat' },
      { type: 'added', text: 'dog' },
      { type: 'unchanged', text: ' sat' },
    ])
  })

  it('handles completely different text', () => {
    const result = diffText('alpha beta', 'gamma delta')
    // The space between words is a shared token, so it appears as unchanged
    expect(result).toEqual([
      { type: 'removed', text: 'alpha' },
      { type: 'added', text: 'gamma' },
      { type: 'unchanged', text: ' ' },
      { type: 'removed', text: 'beta' },
      { type: 'added', text: 'delta' },
    ])
  })

  it('handles multi-line text', () => {
    const result = diffText('line one\nline two', 'line one\nline three')
    expect(result).toEqual([
      { type: 'unchanged', text: 'line one\nline ' },
      { type: 'removed', text: 'two' },
      { type: 'added', text: 'three' },
    ])
  })

  it('preserves whitespace in segments', () => {
    const result = diffText('a  b', 'a  c')
    expect(result).toEqual([
      { type: 'unchanged', text: 'a  ' },
      { type: 'removed', text: 'b' },
      { type: 'added', text: 'c' },
    ])
  })
})
