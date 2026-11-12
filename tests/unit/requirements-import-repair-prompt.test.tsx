import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createTranslator, NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RequirementsImportRepairPrompt from '@/components/RequirementsImportRepairPrompt'
import { buildRequirementImportRepairPrompt } from '@/lib/ai/requirement-prompt'
import {
  formatRequirementImportJsonErrors,
  REQUIREMENT_IMPORT_REPAIR_PROMPT_ERROR_LIMIT,
} from '@/lib/requirements/import-json-errors'
import type { ImportJsonProblem } from '@/lib/requirements/import-json-input'
import { REQUIREMENTS_IMPORT_SCHEMA_VERSION } from '@/lib/requirements/import-schema'
import svMessages from '@/messages/sv.json'

const promptModuleState = vi.hoisted(() => ({ failLoad: false }))

// The component loads the prompt builder on demand. Failing the export access
// fails that load the way a missing chunk would.
vi.mock('@/lib/ai/requirement-prompt', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/ai/requirement-prompt')>()
  return {
    ...actual,
    get buildRequirementImportRepairPrompt() {
      if (promptModuleState.failLoad) {
        throw new Error('The prompt module could not be loaded.')
      }
      return actual.buildRequirementImportRepairPrompt
    },
  }
})

const translate = createTranslator({
  locale: 'sv',
  messages: svMessages,
  namespace: 'requirementsImportJson',
})
const t = (key: string, values?: Record<string, number | string>) =>
  translate(key as never, values as never)

const WRONG_VERSION: ImportJsonProblem = {
  expectedVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
  kind: 'wrong-version',
}

const SYNTAX_ERROR: ImportJsonProblem = {
  character: ']',
  kind: 'syntax',
  location: { column: 10, line: 1 },
  reason: 'unexpected-character',
}

const originalClipboard = Object.getOwnPropertyDescriptor(
  globalThis.navigator,
  'clipboard',
)

function mockClipboardWriteText() {
  const writeText = vi.fn<(text: string) => Promise<void>>()
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  return writeText
}

function expectedPrompt(problem: ImportJsonProblem): string {
  return buildRequirementImportRepairPrompt({
    errors: formatRequirementImportJsonErrors(problem, {
      limit: REQUIREMENT_IMPORT_REPAIR_PROMPT_ERROR_LIMIT,
      t,
    }),
    locale: 'sv',
  })
}

function repairPrompt(problem: ImportJsonProblem) {
  return (
    <NextIntlClientProvider locale="sv" messages={svMessages}>
      <RequirementsImportRepairPrompt locale="sv" problem={problem} />
    </NextIntlClientProvider>
  )
}

async function readyCopyButton() {
  const button = await screen.findByRole('button', {
    name: t('repairPrompt.copy'),
  })
  await waitFor(() => expect(button).toBeEnabled())
  return button
}

describe('RequirementsImportRepairPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    promptModuleState.failLoad = false
  })

  afterEach(() => {
    if (originalClipboard) {
      Object.defineProperty(
        globalThis.navigator,
        'clipboard',
        originalClipboard,
      )
    } else {
      Reflect.deleteProperty(globalThis.navigator, 'clipboard')
    }
  })

  it('shows a disabled loading button until the prompt builder has loaded', async () => {
    render(repairPrompt(WRONG_VERSION))

    const loading = screen.getByRole('button', {
      name: t('repairPrompt.loading'),
    })
    expect(loading).toBeDisabled()
    expect(loading).toHaveAccessibleDescription(t('repairPrompt.lead'))
    expect(loading).toHaveAttribute(
      'data-developer-mode-value',
      'repair prompt',
    )
    await readyCopyButton()
  })

  it('copies the repair prompt and acknowledges it until the errors change', async () => {
    const writeText = mockClipboardWriteText().mockResolvedValue()
    const { rerender } = render(repairPrompt(WRONG_VERSION))

    fireEvent.click(await readyCopyButton())

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expectedPrompt(WRONG_VERSION)),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      t('repairPrompt.copied'),
    )

    rerender(repairPrompt(SYNTAX_ERROR))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    fireEvent.click(await readyCopyButton())
    await waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith(expectedPrompt(SYNTAX_ERROR)),
    )
  })

  it('tells the user to copy from the preview when the clipboard fails', async () => {
    mockClipboardWriteText().mockRejectedValue(new Error('denied'))
    render(repairPrompt(WRONG_VERSION))

    fireEvent.click(await readyCopyButton())

    expect(await screen.findByRole('status')).toHaveTextContent(
      t('repairPrompt.copyFailed'),
    )
  })

  it('keeps the collapsed preview out of the accessibility tree and shows the prompt when expanded', async () => {
    render(repairPrompt(WRONG_VERSION))
    await readyCopyButton()
    const toggle = screen.getByRole('button', {
      name: t('repairPrompt.previewToggle'),
    })
    const region = document.getElementById(
      toggle.getAttribute('aria-controls') ?? '',
    )

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(region).toBeInTheDocument()
    expect(region).toBeEmptyDOMElement()
    expect(
      screen.queryByRole('textbox', { name: t('repairPrompt.previewLabel') }),
    ).not.toBeInTheDocument()
    expect(toggle.parentElement).toHaveAttribute(
      'data-developer-mode-value',
      'repair prompt preview',
    )

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const preview = screen.getByRole('textbox', {
      name: t('repairPrompt.previewLabel'),
    })
    expect(region).toContainElement(preview)
    expect(preview).toHaveValue(expectedPrompt(WRONG_VERSION))
    expect(preview).toHaveAttribute('readonly')

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(region).toBeEmptyDOMElement()
  })

  it('explains that the repair prompt is unavailable when the builder cannot load', async () => {
    promptModuleState.failLoad = true
    render(repairPrompt(WRONG_VERSION))

    expect(await screen.findByRole('status')).toHaveTextContent(
      t('repairPrompt.unavailable'),
    )
    const copyButton = screen.getByRole('button', {
      name: t('repairPrompt.copy'),
    })
    expect(copyButton).toBeDisabled()
    expect(copyButton).toHaveAttribute('title', t('repairPrompt.unavailable'))
    expect(
      screen.queryByRole('button', { name: t('repairPrompt.previewToggle') }),
    ).not.toBeInTheDocument()
  })
})
