import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ListWorkspace from '@/components/ListWorkspace'

describe('ListWorkspace', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('keeps the workspace content available without developer annotations in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    render(
      <ListWorkspace
        aria-label="Library"
        context="requirements table"
        reserveActions
        role="region"
      >
        Requirements
      </ListWorkspace>,
    )
    const workspace = screen.getByRole('region', { name: 'Library' })
    expect(workspace).toHaveTextContent('Requirements')
    expect(workspace).not.toHaveAttribute('data-developer-mode-name')
    expect(workspace).not.toHaveAttribute('context')
    expect(workspace).not.toHaveAttribute('reserveActions')
  })

  it('identifies the list surface in Developer Mode and forwards native attributes and refs', () => {
    const ref = createRef<HTMLDivElement>()
    const { rerender } = render(
      <ListWorkspace
        aria-label="Library"
        context="requirements table"
        ref={ref}
        role="region"
      >
        <table>
          <caption>Requirements</caption>
          <tbody>
            <tr>
              <td>Long requirement text</td>
            </tr>
          </tbody>
        </table>
      </ListWorkspace>,
    )
    const workspace = screen.getByRole('region', { name: 'Library' })
    expect(ref.current).toBe(workspace)
    expect(workspace).toHaveAttribute(
      'data-developer-mode-name',
      'list workspace',
    )
    expect(workspace).toHaveAttribute(
      'data-developer-mode-context',
      'requirements table',
    )
    expect(screen.getByRole('table', { name: 'Requirements' })).toBeVisible()
    rerender(
      <ListWorkspace
        className="space-y-6"
        context="specifications"
        reserveActions
      >
        Specifications
      </ListWorkspace>,
    )
    expect(screen.getByText('Specifications')).toHaveAttribute(
      'data-developer-mode-value',
      'fluid',
    )
  })
})
