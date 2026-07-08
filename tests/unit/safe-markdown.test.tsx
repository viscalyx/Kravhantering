import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SafeMarkdown, { prepareSafeMarkdown } from '@/components/SafeMarkdown'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      imageOmitted: 'Image omitted',
    }
    return messages[key] ?? key
  },
}))

describe('SafeMarkdown', () => {
  it('renders the supported Markdown subset as semantic content', () => {
    render(
      <SafeMarkdown>
        {[
          '# Analysis',
          '',
          '**Important** and *supporting* with `schemaVersion`.',
          '',
          '- first point',
          '- second point',
          '',
          '1. inspect',
          '2. validate',
          '',
          '> Quoted source text',
          '',
          '```json',
          '{"schemaVersion":"requirement-import.v3"}',
          '```',
        ].join('\n')}
      </SafeMarkdown>,
    )

    expect(
      screen.getByRole('heading', { level: 3, name: 'Analysis' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Important').tagName).toBe('STRONG')
    expect(screen.getByText('supporting').tagName).toBe('EM')
    expect(screen.getByText('schemaVersion').tagName).toBe('CODE')
    expect(screen.getAllByRole('list')).toHaveLength(2)
    expect(screen.getByText('Quoted source text')).toBeInTheDocument()
    expect(screen.getByText(/requirement-import\.v3/u)).toBeInTheDocument()
  })

  it('normalizes deeper Markdown headings to compact in-panel headings', () => {
    render(<SafeMarkdown>{'## Step\n\n### Detail'}</SafeMarkdown>)

    expect(
      screen.getByRole('heading', { level: 4, name: 'Step' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 4, name: 'Detail' }),
    ).toBeInTheDocument()
  })

  it('renders standalone bold section labels as separate compact headings', () => {
    render(
      <SafeMarkdown>
        {
          'I need to clarify those aspects further!\n**Considering functional correctness**\n\nThe next paragraph stays separate.'
        }
      </SafeMarkdown>,
    )

    expect(
      screen.getByText('I need to clarify those aspects further!'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 4,
        name: 'Considering functional correctness',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('The next paragraph stays separate.'),
    ).toBeInTheDocument()
  })

  it('splits streamed bold section labels that arrive attached to sentence text', () => {
    const prepared = prepareSafeMarkdown(
      'The requirement centers on accuracy.**Structuring grade management requirements**\n\nThe user asked for requirements.',
    )

    expect(prepared).toBe(
      'The requirement centers on accuracy.\n## Structuring grade management requirements\n\nThe user asked for requirements.',
    )

    render(<SafeMarkdown>{prepared}</SafeMarkdown>)
    expect(
      screen.getByText('The requirement centers on accuracy.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 4,
        name: 'Structuring grade management requirements',
      }),
    ).toBeInTheDocument()
  })

  it('renders Markdown links as inert text', () => {
    render(
      <SafeMarkdown>
        {'[Safe site](https://example.test) and [unsafe](javascript:alert(1))'}
      </SafeMarkdown>,
    )

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('Safe site')).toBeInTheDocument()
    expect(screen.getByText('unsafe')).toBeInTheDocument()
  })

  it('renders Markdown images as non-loading placeholders with the original URL', () => {
    render(
      <SafeMarkdown>
        {'![Generated diagram](https://example.test/diagram.png?user=ada)'}
      </SafeMarkdown>,
    )

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('Generated diagram')).toBeInTheDocument()
    expect(
      screen.getByText('https://example.test/diagram.png?user=ada'),
    ).toBeInTheDocument()
  })

  it('renders Markdown images without alt text with a translated placeholder label', () => {
    render(<SafeMarkdown>{'![](data:image/svg+xml,<svg></svg>)'}</SafeMarkdown>)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('Image omitted')).toBeInTheDocument()
    expect(
      screen.getByText('data:image/svg+xml,<svg></svg>'),
    ).toBeInTheDocument()
  })

  it('prepares obvious raw HTML blocks as fenced code blocks', () => {
    const prepared = prepareSafeMarkdown(
      [
        '<script>alert(1)</script>',
        '<iframe src="https://example.test"></iframe>',
      ].join('\n'),
    )

    expect(prepared).toBe(
      [
        '```html',
        '<script>alert(1)</script>',
        '<iframe src="https://example.test"></iframe>',
        '```',
      ].join('\n'),
    )
  })

  it('renders raw HTML blocks as code without creating active DOM', () => {
    const { container } = render(
      <SafeMarkdown>
        {[
          '<script>alert(1)</script>',
          '<iframe src="https://example.test"></iframe>',
          '<form><input onclick="alert(1)"></form>',
          '<object data="https://example.test"></object>',
          '<style>body { color: red; }</style>',
        ].join('\n')}
      </SafeMarkdown>,
    )

    const code = container.querySelector('pre code')
    expect(code).not.toBeNull()
    expect(code).toHaveTextContent('<script>alert(1)</script>')
    expect(code).toHaveTextContent('<iframe src="https://example.test">')
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('form')).toBeNull()
    expect(container.querySelector('object')).toBeNull()
    expect(container.querySelector('style')).toBeNull()
  })

  it('keeps malformed Markdown readable', () => {
    render(
      <SafeMarkdown>{'**Unclosed strong\n\n- still visible'}</SafeMarkdown>,
    )

    expect(screen.getByText(/Unclosed strong/u)).toBeInTheDocument()
    expect(
      within(screen.getByRole('list')).getByText('still visible'),
    ).toBeInTheDocument()
  })
})
