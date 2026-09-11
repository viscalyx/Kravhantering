import { render as renderReact, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import RfiAssessmentEditor from '@/components/rfi/RfiAssessmentEditor'
import type { RfiAssessment } from '@/lib/rfi/assessment'
import messages from '@/messages/en.json'

function render(ui: ReactElement) {
  return renderReact(ui, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        {children}
      </NextIntlClientProvider>
    ),
  })
}

const previous: RfiAssessment = {
  id: 1,
  questionId: 10,
  questionCode: 'SQL-RFI001',
  questionText: 'Hosting?',
  versionId: 20,
  versionNumber: 1,
  relevance: 'not_relevant',
  reason: 'Existing agreement',
  documentReference: 'Agreement 14',
  documentUrl: 'https://example.org/agreement',
  createdAt: '2026-09-11T10:00:00.000Z',
  createdByHsaId: null,
  createdByDisplayName: 'no-user',
}

describe('RFI assessment editor', () => {
  it('explains relevance and saves edited evidence without requiring documents', async () => {
    const save = vi.fn(async () => true)
    render(
      <RfiAssessmentEditor
        assessment={previous}
        canEdit
        onSave={save}
        previousAssessment={null}
        saving={false}
      />,
    )
    const help = screen.getByRole('button', { name: 'Help: Relevance' })
    await userEvent.click(help)
    expect(help).toHaveAttribute('aria-expanded', 'true')
    await userEvent.clear(screen.getByLabelText('Assessment reason (optional)'))
    await userEvent.type(
      screen.getByLabelText('Assessment reason (optional)'),
      '  Updated evidence  ',
    )
    await userEvent.clear(
      screen.getByLabelText('Document reference (optional)'),
    )
    await userEvent.clear(screen.getByLabelText('Document link (optional)'))
    await userEvent.click(
      screen.getByRole('button', { name: 'Save assessment' }),
    )
    expect(save).toHaveBeenCalledWith({
      relevance: 'not_relevant',
      reason: 'Updated evidence',
      documentReference: null,
      documentUrl: null,
    })
  })

  it.each(['relevant', 'notRelevant'])(
    'saves %s with independently optional evidence',
    async outcome => {
      const save = vi.fn(async () => true)
      render(
        <RfiAssessmentEditor
          assessment={null}
          canEdit
          onSave={save}
          previousAssessment={null}
          saving={false}
        />,
      )
      expect(
        screen.getByRole('button', { name: 'Save assessment' }),
      ).toBeDisabled()
      await userEvent.click(
        screen.getByRole('radio', {
          name: outcome === 'relevant' ? 'Relevant' : 'Not relevant',
        }),
      )
      await userEvent.type(
        screen.getByLabelText('Document reference (optional)'),
        '  Agreement 14  ',
      )
      await userEvent.type(
        screen.getByLabelText('Document link (optional)'),
        'https://example.org/14',
      )
      await userEvent.click(
        screen.getByRole('button', { name: 'Save assessment' }),
      )
      expect(save).toHaveBeenCalledWith({
        relevance: outcome === 'relevant' ? 'relevant' : 'not_relevant',
        reason: null,
        documentReference: 'Agreement 14',
        documentUrl: 'https://example.org/14',
      })
      expect(
        screen.getByRole('button', { name: 'Save assessment' }),
      ).toHaveAttribute('data-developer-mode-name', 'rfi assessment save')
    },
  )

  it('shows confirmed evidence to a reader and disables editing during save', () => {
    const save = vi.fn(async () => true)
    const { rerender } = render(
      <RfiAssessmentEditor
        assessment={previous}
        canEdit={false}
        onSave={save}
        previousAssessment={null}
        saving={false}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Confirmed assessment for this question version',
    )
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    rerender(
      <RfiAssessmentEditor
        assessment={previous}
        canEdit
        onSave={save}
        previousAssessment={null}
        saving
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Saving assessment…' }),
    ).toBeDisabled()
    expect(screen.getByLabelText('Assessment reason (optional)')).toBeDisabled()
  })

  it('shows earlier evidence as pending and confirms all fields without retyping', async () => {
    const save = vi.fn(async () => true)
    render(
      <RfiAssessmentEditor
        assessment={null}
        canEdit
        onSave={save}
        previousAssessment={previous}
        saving={false}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'The question has changed or the assessment needs renewal. Confirm or edit the previous assessment below.',
    )
    expect(screen.getByLabelText('Assessment reason (optional)')).toHaveValue(
      'Existing agreement',
    )
    expect(screen.getByText(/Anonymous/)).toBeVisible()
    expect(save).not.toHaveBeenCalled()
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Confirm assessment for this version',
      }),
    )
    expect(save).toHaveBeenCalledWith({
      relevance: 'not_relevant',
      reason: 'Existing agreement',
      documentReference: 'Agreement 14',
      documentUrl: 'https://example.org/agreement',
    })
  })
})
