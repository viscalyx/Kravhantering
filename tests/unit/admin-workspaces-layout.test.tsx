import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(
    async (namespace: string) => (key: string) => `${namespace}.${key}`,
  ),
}))

import AdminWorkspacesLayout, {
  generateMetadata,
} from '@/app/[locale]/admin/workspaces/layout'

beforeEach(() => vi.clearAllMocks())

describe('AdminWorkspacesLayout', () => {
  it('generates its translated page title', async () => {
    await expect(generateMetadata()).resolves.toEqual({ title: 'admin.title' })
  })

  it('renders its child unchanged', () => {
    const child: ReactNode = <main>workspace content</main>
    render(<AdminWorkspacesLayout>{child}</AdminWorkspacesLayout>)
    expect(screen.getByRole('main')).toHaveTextContent('workspace content')
  })
})
