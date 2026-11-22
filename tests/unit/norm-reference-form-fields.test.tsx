import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import NormReferenceFormFields from '@/components/NormReferenceFormFields'
import en from '@/messages/en.json'

function NormReferenceForm({ layout }: { layout: 'create' | 'stacked' }) {
  const [form, setForm] = useState({
    issuer: '',
    name: '',
    normReferenceId: '',
    reference: '',
    type: '',
    uri: '',
    version: '',
  })

  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <NormReferenceFormFields
        form={form}
        idPrefix="norm"
        layout={layout}
        onSetField={(field, value) =>
          setForm(current => ({ ...current, [field]: value }))
        }
      />
    </NextIntlClientProvider>
  )
}

describe('NormReferenceFormFields', () => {
  it.each(['create', 'stacked'] as const)(
    'preserves typed and pasted identifiers with field-specific input hints in the %s layout',
    async layout => {
      const user = userEvent.setup()
      render(<NormReferenceForm layout={layout} />)

      for (const [label, value] of [
        [en.normReference.normReferenceId, 'nOrM-42_a.B'],
        [`${en.normReference.reference}*`, 'ISO/IEC 27001:2022'],
        [en.normReference.version, 'v2.1-RC.a'],
      ]) {
        const input = screen.getByRole('textbox', { name: label })
        expect(input).toHaveAttribute('autocapitalize', 'none')
        expect(input).toHaveAttribute('autocorrect', 'off')
        expect(input).toHaveAttribute('spellcheck', 'false')

        await user.type(input, value)
        expect(input).toHaveValue(value)
        await user.clear(input)
        await user.paste(value)
        expect(input).toHaveValue(value)
      }

      for (const [role, label] of [
        ['textbox', en.normReference.name],
        ['combobox', en.normReference.type],
        ['textbox', en.normReference.issuer],
      ]) {
        const input = screen.getByRole(role, { name: `${label}*` })
        expect(input).not.toHaveAttribute('autocapitalize')
        expect(input).not.toHaveAttribute('autocorrect')
        expect(input).not.toHaveAttribute('spellcheck')
      }
    },
  )
})
