import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import AccessReviewPage from '@/app/[locale]/admin/workspaces/access-review/page'
import ActionAuditLogPage from '@/app/[locale]/admin/workspaces/action-audit-log/page'
import ArchivingPage from '@/app/[locale]/admin/workspaces/archiving/page'
import ColumnsPage from '@/app/[locale]/admin/workspaces/columns/page'
import IdentityPage from '@/app/[locale]/admin/workspaces/identity/page'
import PrivacyPage from '@/app/[locale]/admin/workspaces/privacy/page'
import SettingsPage from '@/app/[locale]/admin/workspaces/settings/page'
import StatusesPage from '@/app/[locale]/admin/workspaces/statuses-and-workflows/page'
import TaxonomyPage from '@/app/[locale]/admin/workspaces/taxonomy/page'

vi.mock('@/app/[locale]/admin/admin-workspace-page', () => ({
  default: ({ children, tab }: { children: ReactNode; tab: string }) => (
    <section>
      <h1>{tab}</h1>
      {children}
    </section>
  ),
}))

vi.mock('@/app/[locale]/admin/panels/access-review-panel', () => ({
  default: () => <p>access review panel</p>,
}))
vi.mock('@/app/[locale]/admin/panels/action-audit-log-panel', () => ({
  default: () => <p>action audit log panel</p>,
}))
vi.mock('@/app/[locale]/admin/panels/archiving-panel', () => ({
  default: () => <p>archiving panel</p>,
}))
vi.mock('@/app/[locale]/admin/panels/columns-panel', () => ({
  default: () => <p>columns panel</p>,
}))
vi.mock('@/app/[locale]/admin/panels/identity-panel', () => ({
  default: () => <p>identity panel</p>,
}))
vi.mock('@/app/[locale]/admin/panels/privacy-panel', () => ({
  default: () => <p>privacy panel</p>,
}))
vi.mock('@/app/[locale]/admin/panels/settings-panel', () => ({
  default: () => <p>settings panel</p>,
}))
vi.mock('@/app/[locale]/admin/panels/statuses-and-workflows-panel', () => ({
  default: () => <p>statuses panel</p>,
}))
vi.mock('@/app/[locale]/admin/panels/taxonomy-panel', () => ({
  default: () => <p>taxonomy panel</p>,
}))

const params = Promise.resolve({ locale: 'sv' })
const searchParams = Promise.resolve({})

describe.each([
  {
    Page: ColumnsPage,
    content: 'columns panel',
    tab: 'columns',
  },
  {
    Page: IdentityPage,
    content: 'identity panel',
    tab: 'identity',
  },
  {
    Page: SettingsPage,
    content: 'settings panel',
    tab: 'settings',
  },
  {
    Page: TaxonomyPage,
    content: 'taxonomy panel',
    tab: 'taxonomy',
  },
  {
    Page: StatusesPage,
    content: 'statuses panel',
    tab: 'statusesAndWorkflows',
  },
  {
    Page: AccessReviewPage,
    content: 'access review panel',
    tab: 'accessReview',
  },
  {
    Page: ArchivingPage,
    content: 'archiving panel',
    tab: 'archiving',
  },
  {
    Page: PrivacyPage,
    content: 'privacy panel',
    tab: 'privacy',
  },
])('isolated Admin workspace', ({ Page, content, tab }) => {
  it(`renders only the ${tab} panel`, () => {
    render(<Page params={params} />)

    expect(screen.getByRole('heading', { name: tab })).toBeVisible()
    expect(screen.getByText(content)).toBeVisible()
  })
})

describe('isolated action-audit-log Admin workspace', () => {
  it('passes search parameters through its isolated route', () => {
    render(<ActionAuditLogPage params={params} searchParams={searchParams} />)

    expect(
      screen.getByRole('heading', { name: 'actionAuditLog' }),
    ).toBeVisible()
    expect(screen.getByText('action audit log panel')).toBeVisible()
  })
})
