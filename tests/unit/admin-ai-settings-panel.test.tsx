import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AiSettingsPanel from '@/app/[locale]/admin/panels/ai-settings-panel'
import {
  expectAdminPanelContract,
  pendingFetch,
  renderAdminPanel,
} from './helpers/admin-panel-contract'

const fetchMock = vi.fn()

function okJson(body: unknown): Response {
  return { json: vi.fn(async () => body), ok: true } as unknown as Response
}

function safetyRulesResponse() {
  return {
    rules: [
      {
        category: 'prompt_injection',
        descriptionEn: 'English description',
        descriptionSv: 'Svensk beskrivning',
        id: 1,
        nameEn: 'Safety rule',
        nameSv: 'Säkerhetsregel',
        patternKind: 'paired_terms',
        ruleId: 'instruction_override',
        sortOrder: 10,
        terms: [
          {
            direction: 'input',
            id: 11,
            isActive: false,
            isStandard: true,
            normalizedTerm: 'ignore',
            standardDirection: 'input_output',
            termText: 'ignore',
            termType: 'action',
          },
        ],
        windowChars: 80,
      },
    ],
  }
}

vi.mock('next-intl', () => ({
  useLocale: () => 'sv',
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

describe('AiSettingsPanel', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(pendingFetch)
    vi.stubGlobal('fetch', fetchMock)
  })

  it('owns the AI tab panel contract', () => {
    renderAdminPanel(<AiSettingsPanel />, { confirmModal: true })
    expectAdminPanelContract({ markerValue: 'ai', tabId: 'ai' })
  })

  it('confirms before restoring a safety rule', async () => {
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (url === '/api/admin/ai-settings' && method === 'GET') {
          return Promise.resolve(okJson({}))
        }
        if (url === '/api/admin/ai-safety-rules' && method === 'GET') {
          return Promise.resolve(okJson(safetyRulesResponse()))
        }
        if (
          url ===
            '/api/admin/ai-safety-rules/instruction_override/restore-defaults' &&
          method === 'POST'
        ) {
          return Promise.resolve(okJson({ restoredCount: 1 }))
        }
        return Promise.reject(new Error(`Unexpected fetch ${method} ${url}`))
      },
    )

    renderAdminPanel(<AiSettingsPanel />, { confirmModal: true })

    const ruleName = await screen.findByText('Säkerhetsregel')
    fireEvent.click(ruleName.closest('button') as HTMLButtonElement)
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.ai.restoreRuleDefaults' }),
    )

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('admin.ai.restoreRuleDefaultsConfirmTitle')
    expect(dialog).toHaveTextContent(
      'admin.ai.restoreRuleDefaultsConfirmMessage',
    )
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toHaveLength(0)

    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'admin.ai.restoreRuleDefaults',
      }),
    )

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
        ),
      ).toHaveLength(1),
    )
  })
})
