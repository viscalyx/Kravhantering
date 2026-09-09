import { describe, expect, it, vi } from 'vitest'
import { loadStatusIconNodes } from '@/lib/icons/status-icon-allowlist'

vi.mock('lucide-react/dynamicIconImports', () => ({
  default: {
    circle: async () => ({
      __iconData: {
        node: [
          [
            'circle',
            {
              cx: 12,
              cy: '12',
              r: 0,
              key: 'circle',
              style: { opacity: 0.5 },
              suppressHydrationWarning: true,
              className: undefined,
            },
          ],
        ],
      },
    }),
  },
}))

describe('status icon report attributes', () => {
  it('converts SVG coordinates to strings and omits React-only attributes', async () => {
    expect(await loadStatusIconNodes('Circle')).toEqual([
      ['circle', { cx: '12', cy: '12', r: '0' }],
    ])
  })
})
