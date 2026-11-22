import { NextIntlClientProvider } from 'next-intl'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import MultiSelectFilterPopover from '@/components/_requirements-table/FilterPopovers'
import FormModal from '@/components/FormModal'
import sv from '@/messages/sv.json'

function SelectionFilterDialog() {
  const [open, setOpen] = useState(false)
  const [showOptions, setShowOptions] = useState(true)
  const [value, setValue] = useState<number[]>([])
  const group = { id: 1, name: 'Prestanda', parent: null }
  const option = { id: 2, name: 'Svarstid', parent: 1 }

  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Öppna dialog
      </button>
      <FormModal
        onClose={() => setOpen(false)}
        open={open}
        title="Kolumnfilter"
        titleId="filter-dialog-title"
      >
        <button onClick={() => setShowOptions(!showOptions)} type="button">
          {showOptions ? 'Dölj alternativ' : 'Visa alternativ'}
        </button>
        <MultiSelectFilterPopover
          developerModeValue="quality characteristic"
          getLabel={entry => entry.name}
          getParentId={entry => entry.parent}
          label="Kvalitetsegenskap"
          onChange={setValue}
          options={showOptions ? [group, option] : [group]}
          value={value}
        />
      </FormModal>
    </>
  )
}

createRoot(document.body.appendChild(document.createElement('main'))).render(
  <NextIntlClientProvider
    locale="sv"
    messages={{ common: sv.common, requirementsTable: sv.requirementsTable }}
    timeZone="UTC"
  >
    <SelectionFilterDialog />
  </NextIntlClientProvider>,
)
