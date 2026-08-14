import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AiSettingsPanel from '@/app/[locale]/admin/panels/settings/ai-settings-panel'
import { ConfirmModalProvider } from '@/components/ConfirmModal'
import { DEFAULT_ADMIN_AI_SETTINGS } from '@/lib/ai/generation-availability'
import {
  clickAdminConfirmationAction,
  expectAdminPanelContract,
  pendingFetch,
  renderAdminPanel,
} from './helpers/admin-panel-contract'

const fetchMock = vi.fn()
const intlState = vi.hoisted(() => ({ locale: 'sv' }))

function okJson(body: unknown): Response {
  return { json: vi.fn(async () => body), ok: true } as unknown as Response
}

function errorJson(error?: string, status = 500): Response {
  return new Response(JSON.stringify(error ? { error } : {}), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
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
          {
            direction: 'output',
            id: 12,
            isActive: true,
            isStandard: false,
            normalizedTerm: 'custom target',
            standardDirection: 'output',
            termText: 'custom target',
            termType: 'target',
          },
        ],
        windowChars: 80,
      },
    ],
  }
}

vi.mock('next-intl', () => ({
  useLocale: () => intlState.locale,
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

describe('AiSettingsPanel', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(pendingFetch)
    vi.stubGlobal('fetch', fetchMock)
    intlState.locale = 'sv'
  })

  it('owns the AI tab panel contract', () => {
    renderAdminPanel(<AiSettingsPanel />, { confirmModal: true })
    expectAdminPanelContract({ markerValue: 'ai', tabId: 'ai' })
    expect(
      screen
        .getByRole('heading', { name: 'admin.ai.title' })
        .querySelector('.lucide-sparkles'),
    ).toHaveAttribute('aria-hidden', 'true')
  })

  it('uses matching plain minus and plus icons for the MCP limit stepper', async () => {
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
        return Promise.reject(new Error(`Unexpected fetch ${method} ${url}`))
      },
    )

    renderAdminPanel(<AiSettingsPanel />, { confirmModal: true })

    const input = await screen.findByLabelText('admin.ai.mcpMaxRequestLimit')
    const buttons = input.parentElement?.querySelectorAll('button')
    expect(buttons?.[0].querySelector('.lucide-minus')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(buttons?.[1].querySelector('.lucide-plus')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
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

    await clickAdminConfirmationAction('admin.ai.restoreRuleDefaults')

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
        ),
      ).toHaveLength(1),
    )
  })

  it('autosaves every AI setting and exercises the field help controls', async () => {
    const settled = vi.fn()
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (url === '/api/admin/ai-settings' && method === 'GET') {
          return Promise.resolve(
            okJson({
              aiSafetyForensicLoggingEnabled: false,
              aiSafetyRuleCacheTtlSeconds: 60,
              disabledByEnvironment: true,
              mcpImportMaxActiveSessionsPerDestination: 100,
              mcpImportMaxActiveSessionsPerPrincipal: 10,
              mcpImportMaxCreationsPerWindow: 20,
              mcpImportMaxRows: 500,
              mcpImportMaxReservedBytes: 512 * 1024 * 1024,
              mcpImportValidationTtlMinutes: 60,
              mcpMaxRequestBytes: 5 * 1024 * 1024,
              requirementGenerationEnabled: false,
            }),
          )
        }
        if (url === '/api/admin/ai-safety-rules' && method === 'GET') {
          return Promise.resolve(okJson(safetyRulesResponse()))
        }
        if (url === '/api/admin/ai-settings' && method === 'PATCH') {
          return Promise.resolve(okJson(JSON.parse(String(init?.body))))
        }
        return Promise.reject(new Error(`Unexpected fetch ${method} ${url}`))
      },
    )

    renderAdminPanel(<AiSettingsPanel onSettingsSettled={settled} />, {
      confirmModal: true,
    })

    const requirementToggle = await screen.findByLabelText(
      'admin.ai.requirementGenerationEnabled',
    )
    await waitFor(() => expect(requirementToggle).toBeEnabled())
    expect(screen.getByText('admin.ai.environmentOverrideNotice')).toBeVisible()
    await waitFor(() => expect(settled).toHaveBeenCalled())

    for (const label of [
      'admin.ai.requirementGenerationEnabled',
      'admin.ai.aiSafetyForensicLogging',
      'admin.ai.safetyRuleCacheTtl',
      'admin.ai.safetyRulesTitle',
      'admin.ai.mcpMaxRequestLimit',
      'admin.ai.mcpImportMaxActiveSessionsPerPrincipal',
      'admin.ai.mcpImportMaxActiveSessionsPerDestination',
      'admin.ai.mcpImportMaxCreationsPerWindow',
      'admin.ai.mcpImportMaxReservedBytes',
      'admin.ai.mcpImportMaxRows',
      'admin.ai.mcpImportValidationTtl',
    ]) {
      const button = screen.getByRole('button', {
        name: `common.help: ${label}`,
      })
      fireEvent.click(button)
      expect(button).toHaveAttribute('aria-expanded', 'true')
      fireEvent.click(button)
    }

    fireEvent.click(requirementToggle)
    await waitFor(() => expect(requirementToggle).toBeEnabled())
    const forensicToggle = screen.getByLabelText(
      'admin.ai.aiSafetyForensicLogging',
    )
    fireEvent.click(forensicToggle)
    await waitFor(() => expect(forensicToggle).toBeEnabled())

    const cacheTtl = screen.getByLabelText('admin.ai.safetyRuleCacheTtl')
    fireEvent.change(cacheTtl, { target: { value: '61' } })
    fireEvent.keyDown(cacheTtl, { key: 'Escape' })
    fireEvent.keyDown(cacheTtl, { key: 'Enter' })
    await waitFor(() => expect(cacheTtl).toBeEnabled())

    const mcpLimit = screen.getByLabelText('admin.ai.mcpMaxRequestLimit')
    fireEvent.change(mcpLimit, { target: { value: '6144' } })
    fireEvent.blur(mcpLimit)
    await waitFor(() => expect(mcpLimit).toBeEnabled())
    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.ai.decreaseMcpMaxRequestLimit',
      }),
    )
    await waitFor(() => expect(mcpLimit).toBeEnabled())

    for (const [label, value] of [
      ['admin.ai.mcpImportMaxActiveSessionsPerPrincipal', '11'],
      ['admin.ai.mcpImportMaxActiveSessionsPerDestination', '101'],
      ['admin.ai.mcpImportMaxCreationsPerWindow', '21'],
      ['admin.ai.mcpImportMaxReservedBytes', '576'],
    ] as const) {
      const input = screen.getByLabelText(label)
      fireEvent.change(input, { target: { value } })
      if (label === 'admin.ai.mcpImportMaxActiveSessionsPerPrincipal') {
        fireEvent.keyDown(input, { key: 'Escape' })
        fireEvent.keyDown(input, { key: 'Enter' })
      } else {
        fireEvent.blur(input)
      }
      await waitFor(() => expect(input).toBeEnabled())
    }
    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.ai.increaseMcpMaxRequestLimit',
      }),
    )
    await waitFor(() => expect(mcpLimit).toBeEnabled())

    const importRows = screen.getByLabelText('admin.ai.mcpImportMaxRows')
    fireEvent.change(importRows, { target: { value: '499' } })
    fireEvent.blur(importRows)
    await waitFor(() => expect(importRows).toBeEnabled())

    const importTtl = screen.getByLabelText('admin.ai.mcpImportValidationTtl')
    fireEvent.change(importTtl, { target: { value: '61' } })
    fireEvent.keyDown(importTtl, { key: 'Enter' })

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
        ),
      ).toHaveLength(12),
    )
    expect(
      fetchMock.mock.calls.some(([, init]) =>
        String(init?.body).includes(
          `"mcpImportMaxReservedBytes":${576 * 1024 * 1024}`,
        ),
      ),
    ).toBe(true)
    expect(screen.getAllByText('admin.saved').length).toBeGreaterThan(0)
    expect(
      screen
        .getAllByRole('status')
        .some(status => status.textContent === 'admin.saved'),
    ).toBe(true)
  })

  it('restores blank numeric drafts without saving', async () => {
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === '/api/admin/ai-settings') return Promise.resolve(okJson({}))
        if (url === '/api/admin/ai-safety-rules') {
          return Promise.resolve(okJson({ rules: [] }))
        }
        return Promise.reject(
          new Error(`Unexpected fetch ${String(init?.method)} ${url}`),
        )
      },
    )
    renderAdminPanel(<AiSettingsPanel />, { confirmModal: true })

    for (const label of [
      'admin.ai.safetyRuleCacheTtl',
      'admin.ai.mcpMaxRequestLimit',
      'admin.ai.mcpImportMaxActiveSessionsPerPrincipal',
      'admin.ai.mcpImportMaxActiveSessionsPerDestination',
      'admin.ai.mcpImportMaxCreationsPerWindow',
      'admin.ai.mcpImportMaxReservedBytes',
      'admin.ai.mcpImportMaxRows',
      'admin.ai.mcpImportValidationTtl',
    ]) {
      const input = await screen.findByLabelText(label)
      const original = (input as HTMLInputElement).value
      fireEvent.change(input, { target: { value: '' } })
      fireEvent.blur(input)
      expect(input).toHaveValue(Number(original))
    }
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
      ),
    ).toHaveLength(0)
  })

  it('recovers settings and safety-rule reads, then bounds save failures', async () => {
    let settingsReads = 0
    let rulesReads = 0
    let patchCount = 0
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (url === '/api/admin/ai-settings' && method === 'GET') {
          settingsReads += 1
          return settingsReads === 1
            ? Promise.resolve(errorJson('settings unavailable'))
            : Promise.resolve(okJson({}))
        }
        if (url === '/api/admin/ai-safety-rules' && method === 'GET') {
          rulesReads += 1
          return rulesReads === 1
            ? Promise.reject(new Error('topology hidden'))
            : Promise.resolve(okJson({ rules: [] }))
        }
        if (url === '/api/admin/ai-settings' && method === 'PATCH') {
          patchCount += 1
          return patchCount === 1
            ? Promise.resolve(errorJson('setting rejected'))
            : Promise.reject(new Error('topology hidden'))
        }
        return Promise.reject(new Error(`Unexpected fetch ${method} ${url}`))
      },
    )
    renderAdminPanel(<AiSettingsPanel />, { confirmModal: true })

    expect(await screen.findByText('settings unavailable')).toBeVisible()
    expect(
      await screen.findByText('admin.ai.safetyRulesLoadError'),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.ai.reloadSafetyRules' }),
    )
    await screen.findByText('admin.ai.noSafetyRules')

    const requirementToggle = screen.getByLabelText(
      'admin.ai.requirementGenerationEnabled',
    )
    fireEvent.click(requirementToggle)
    expect(await screen.findByText('setting rejected')).toBeVisible()
    const forensicToggle = screen.getByLabelText(
      'admin.ai.aiSafetyForensicLogging',
    )
    fireEvent.click(forensicToggle)
    expect(await screen.findByText('admin.ai.saveError')).toBeVisible()
  })

  it('adds, edits, selects, and removes safety terms', async () => {
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
        if (url === '/api/admin/ai-safety-rules' && method === 'POST') {
          return Promise.resolve(okJson({ term: { id: 20 } }))
        }
        if (url.endsWith('/terms/11') && method === 'PATCH') {
          return Promise.resolve(
            okJson({
              term: {
                ...safetyRulesResponse().rules[0].terms[0],
                direction: 'output',
                isActive: true,
              },
            }),
          )
        }
        if (url === '/api/admin/ai-safety-rules/terms/remove') {
          return Promise.resolve(okJson({ removedCount: 2 }))
        }
        return Promise.reject(new Error(`Unexpected fetch ${method} ${url}`))
      },
    )
    renderAdminPanel(<AiSettingsPanel />, { confirmModal: true })

    const ruleButton = await screen.findByRole('button', {
      name: /Säkerhetsregel/,
    })
    fireEvent.click(ruleButton)
    expect(screen.getByLabelText('admin.ai.termText')).toBeVisible()
    fireEvent.click(ruleButton)
    expect(screen.queryByLabelText('admin.ai.termText')).not.toBeInTheDocument()
    fireEvent.click(ruleButton)
    expect(screen.getByLabelText('admin.ai.termText')).toBeVisible()

    fireEvent.change(screen.getByLabelText('admin.ai.termType'), {
      target: { value: 'coding' },
    })
    fireEvent.change(screen.getByLabelText('admin.ai.termText'), {
      target: { value: '  new custom term  ' },
    })
    fireEvent.change(screen.getByLabelText('admin.ai.direction'), {
      target: { value: 'input' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'admin.ai.addTerm' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/ai-safety-rules',
        expect.objectContaining({ method: 'POST' }),
      ),
    )

    fireEvent.change(screen.getAllByLabelText('admin.ai.directionForTerm')[0], {
      target: { value: 'output' },
    })
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/ai-safety-rules/terms/11',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    )
    const standardTermRow = screen.getByRole('row', { name: /ignore/ })
    const activeToggle = within(standardTermRow).getByRole('checkbox', {
      name: 'admin.ai.active',
    })
    fireEvent.click(activeToggle)
    await waitFor(() => expect(activeToggle).toBeEnabled())

    const standardSelection = within(standardTermRow).getByRole('checkbox', {
      name: 'admin.ai.selectTermNamed',
    })
    const customSelection = within(
      screen.getByRole('row', { name: /custom target/ }),
    ).getByRole('checkbox', { name: 'admin.ai.selectTermNamed' })
    fireEvent.click(standardSelection)
    expect(standardSelection).toBeChecked()
    fireEvent.click(customSelection)
    expect(customSelection).toBeChecked()
    fireEvent.click(customSelection)
    expect(customSelection).not.toBeChecked()
    fireEvent.click(customSelection)
    expect(customSelection).toBeChecked()

    const remove = screen.getByRole('button', {
      name: 'admin.ai.removeSelectedTerms',
    })
    fireEvent.click(remove)
    await clickAdminConfirmationAction('common.cancel')
    fireEvent.click(remove)
    await clickAdminConfirmationAction('admin.ai.removeSelectedTerms')
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/ai-safety-rules/terms/remove',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })

  it('renders embedded, localized, fallback, and fractional-limit variants', async () => {
    intlState.locale = 'en'
    let settingsPayload: Record<string, unknown> = {
      constraints: {
        ...DEFAULT_ADMIN_AI_SETTINGS.constraints,
        mcpMaxRequestBytes: {
          max: 1536 * 1024,
          min: 1024 * 1024,
          step: 512 * 1024,
        },
      },
      mcpImportMaxRows: undefined,
      mcpImportValidationTtlMinutes: undefined,
      mcpMaxRequestBytes: 1536 * 1024,
    }
    let rulesPayload = safetyRulesResponse()
    rulesPayload.rules[0].terms[0].direction = 'input_output'
    rulesPayload.rules[0].terms[0].isActive = true
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/admin/ai-settings') {
        return Promise.resolve(okJson(settingsPayload))
      }
      if (url === '/api/admin/ai-safety-rules') {
        return Promise.resolve(okJson(rulesPayload))
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`))
    })

    const view = renderAdminPanel(<AiSettingsPanel embedded />, {
      confirmModal: true,
    })
    expect(await screen.findByText('Safety rule')).toBeVisible()
    expect(screen.getByText('English description')).toBeVisible()
    expect(screen.getByText('admin.ai.mcpMaxRequestLimitCurrent')).toBeVisible()
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-labelledby',
      'admin-settings-ai-title',
    )
    view.unmount()

    intlState.locale = 'sv'
    settingsPayload = { mcpMaxRequestBytes: 1024 * 1024 }
    rulesPayload = safetyRulesResponse()
    rulesPayload.rules[0].descriptionSv = null as unknown as string
    renderAdminPanel(<AiSettingsPanel />, { confirmModal: true })
    expect(await screen.findByText('Säkerhetsregel')).toBeVisible()
    expect(screen.queryByText('Svensk beskrivning')).not.toBeInTheDocument()
  })

  it('skips unchanged numeric settings and ignores non-Enter keys', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/admin/ai-settings') return Promise.resolve(okJson({}))
      if (url === '/api/admin/ai-safety-rules') {
        return Promise.resolve(okJson({ rules: [] }))
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`))
    })
    renderAdminPanel(<AiSettingsPanel />, { confirmModal: true })

    for (const label of [
      'admin.ai.safetyRuleCacheTtl',
      'admin.ai.mcpMaxRequestLimit',
      'admin.ai.mcpImportMaxRows',
      'admin.ai.mcpImportValidationTtl',
    ]) {
      const input = await screen.findByLabelText(label)
      fireEvent.keyDown(input, { key: 'Escape' })
      fireEvent.blur(input)
    }
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
      ),
    ).toHaveLength(0)
  })

  it('replaces MCP quota drafts with the normalized committed value', async () => {
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === '/api/admin/ai-settings' && !init?.method) {
          return Promise.resolve(okJson({}))
        }
        if (url === '/api/admin/ai-settings' && init?.method === 'PATCH') {
          return Promise.resolve(okJson(JSON.parse(String(init?.body))))
        }
        if (url === '/api/admin/ai-safety-rules') {
          return Promise.resolve(okJson({ rules: [] }))
        }
        return Promise.reject(new Error(`Unexpected fetch ${url}`))
      },
    )
    renderAdminPanel(<AiSettingsPanel />, { confirmModal: true })
    const input = await screen.findByLabelText(
      'admin.ai.mcpImportMaxActiveSessionsPerDestination',
    )

    fireEvent.change(input, { target: { value: '100.4' } })
    fireEvent.blur(input)
    expect(input).toHaveValue(100)
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
      ),
    ).toHaveLength(0)

    fireEvent.change(input, { target: { value: '1000.6' } })
    fireEvent.blur(input)
    expect(input).toHaveValue(1000)
    await waitFor(() => expect(input).toBeEnabled())
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
      ),
    ).toHaveLength(1)
  })

  it('uses an optimistic global ceiling only as the effective MCP display value', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/admin/ai-settings') {
        return Promise.resolve(okJson({ mcpImportMaxRows: 500 }))
      }
      if (url === '/api/admin/ai-safety-rules') {
        return Promise.resolve(okJson({ rules: [] }))
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`))
    })
    const panel = (ceiling: number, persistedCeiling: number) => (
      <ConfirmModalProvider>
        <AiSettingsPanel
          mcpImportMaxRowsCeiling={ceiling}
          persistedMcpImportMaxRowsCeiling={persistedCeiling}
        />
      </ConfirmModalProvider>
    )
    const view = renderAdminPanel(panel(500, 500))
    const input = await screen.findByLabelText('admin.ai.mcpImportMaxRows')
    expect(input).toHaveValue(500)

    view.rerender(panel(400, 500))
    await waitFor(() => expect(input).toHaveValue(400))
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
      ),
    ).toHaveLength(0)

    view.rerender(panel(500, 500))
    await waitFor(() => expect(input).toHaveValue(500))

    view.rerender(panel(400, 400))
    await waitFor(() => expect(input).toHaveValue(400))
  })

  it('bounds every safety-rule mutation failure and fallback message', async () => {
    const attempts = new Map<string, number>()
    let rulesReads = 0
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (url === '/api/admin/ai-settings' && method === 'GET') {
          return Promise.resolve(errorJson())
        }
        if (url === '/api/admin/ai-safety-rules' && method === 'GET') {
          rulesReads += 1
          return rulesReads === 1
            ? Promise.resolve(errorJson())
            : Promise.resolve(okJson(safetyRulesResponse()))
        }
        const key = `${method} ${url}`
        const attempt = (attempts.get(key) ?? 0) + 1
        attempts.set(key, attempt)
        return attempt === 1
          ? Promise.resolve(errorJson())
          : Promise.reject(new Error('topology hidden'))
      },
    )
    renderAdminPanel(<AiSettingsPanel />, { confirmModal: true })

    expect(await screen.findByText('admin.ai.loadError')).toBeVisible()
    expect(
      await screen.findByText('admin.ai.safetyRulesLoadError'),
    ).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.ai.reloadSafetyRules' }),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: /Säkerhetsregel/ }),
    )

    const direction = screen.getAllByLabelText('admin.ai.directionForTerm')[0]
    fireEvent.change(direction, { target: { value: 'output' } })
    expect(
      await screen.findByText('admin.ai.safetyTermSaveError'),
    ).toBeVisible()
    const standardTermRow = screen.getByRole('row', { name: /ignore/ })
    const activeToggle = within(standardTermRow).getByRole('checkbox', {
      name: 'admin.ai.inactive',
    })
    fireEvent.click(activeToggle)
    await waitFor(() => expect(activeToggle).toBeEnabled())
    expect(activeToggle).not.toBeChecked()

    const termText = screen.getByLabelText('admin.ai.termText')
    fireEvent.change(termText, { target: { value: 'new term' } })
    const add = screen.getByRole('button', { name: 'admin.ai.addTerm' })
    fireEvent.click(add)
    expect(await screen.findByText('admin.ai.safetyTermAddError')).toBeVisible()
    await waitFor(() => expect(add).toBeEnabled())
    fireEvent.click(add)
    await waitFor(() => expect(add).toBeEnabled())
    expect(screen.getByText('admin.ai.safetyTermAddError')).toBeVisible()

    fireEvent.click(
      within(standardTermRow).getByRole('checkbox', {
        name: 'admin.ai.selectTermNamed',
      }),
    )
    const remove = screen.getByRole('button', {
      name: 'admin.ai.removeSelectedTerms',
    })
    for (let attempt = 0; attempt < 2; attempt += 1) {
      fireEvent.click(remove)
      await clickAdminConfirmationAction('admin.ai.removeSelectedTerms')
      await waitFor(() => expect(remove).toBeEnabled())
    }
    expect(screen.getByText('admin.ai.safetyTermRemoveError')).toBeVisible()

    const restore = screen.getByRole('button', {
      name: 'admin.ai.restoreRuleDefaults',
    })
    for (let attempt = 0; attempt < 2; attempt += 1) {
      fireEvent.click(restore)
      await clickAdminConfirmationAction('admin.ai.restoreRuleDefaults')
      await waitFor(() => expect(restore).toBeEnabled())
    }
    expect(screen.getByText('admin.ai.safetyRuleRestoreError')).toBeVisible()
  })
})
