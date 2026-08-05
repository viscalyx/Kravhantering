import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NormReferencesPage, {
  generateMetadata as normMetadata,
} from '@/app/[locale]/norm-references/page'
import RequirementAreasPage, {
  generateMetadata as areaMetadata,
} from '@/app/[locale]/requirement-areas/page'
import RequirementPackagesPage, {
  generateMetadata as packageMetadata,
} from '@/app/[locale]/requirement-packages/page'
import NormReferenceFormFields from '@/components/NormReferenceFormFields'
import NormReferenceModal, {
  type NormReferenceFormData,
} from '@/components/NormReferenceModal'
import RequirementPackagePurposeTooltip from '@/components/RequirementPackagePurposeTooltip'

const pageState = vi.hoisted(() => ({ redirect: vi.fn() }))
const modalState = vi.hoisted(() => ({ confirmDiscard: vi.fn() }))

vi.mock('next/navigation', async importOriginal => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: pageState.redirect,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(
    async (namespace: string) => (key: string) => `${namespace}.${key}`,
  ),
}))

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const translate = (key: string) => `${namespace}.${key}`
    translate.rich = (key: string, _tags: unknown) => `${namespace}.${key}`
    return translate
  },
}))

vi.mock('@/hooks/useDiscardChangesConfirmation', () => ({
  useDiscardChangesConfirmation: () => modalState.confirmDiscard,
}))

vi.mock('@/app/[locale]/requirement-areas/requirement-areas-client', () => ({
  default: () => <h1>Requirement areas page client</h1>,
}))

const emptyForm: NormReferenceFormData = {
  issuer: '',
  name: '',
  normReferenceId: '',
  reference: '',
  type: '',
  uri: '',
  version: '',
}

describe('Issue 891 server pages', () => {
  beforeEach(() => vi.clearAllMocks())

  it('builds translated metadata and renders the requirement-area client', async () => {
    await expect(areaMetadata()).resolves.toEqual({ title: 'nav.areas' })
    render(<RequirementAreasPage />)
    expect(
      screen.getByRole('heading', { name: 'Requirement areas page client' }),
    ).toBeInTheDocument()
  })

  it('redirects legacy package and norm pages to stewardship tabs', async () => {
    await expect(packageMetadata()).resolves.toEqual({
      title: 'nav.requirementPackages',
    })
    await expect(normMetadata()).resolves.toEqual({ title: 'nav.normLibrary' })

    await RequirementPackagesPage({ params: Promise.resolve({ locale: 'sv' }) })
    await NormReferencesPage({ params: Promise.resolve({ locale: 'en' }) })

    expect(pageState.redirect).toHaveBeenNthCalledWith(
      1,
      '/sv/requirements/stewardship?tab=packages',
    )
    expect(pageState.redirect).toHaveBeenNthCalledWith(
      2,
      '/en/requirements/stewardship?tab=norms',
    )
  })
})

describe('Issue 891 norm-reference form fields', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders both layouts, edits every field, toggles help, and exposes safe URI links', async () => {
    const user = userEvent.setup()
    const onSetField = vi.fn()
    const form = {
      ...emptyForm,
      issuer: 'ISO',
      name: 'Security standard',
      normReferenceId: 'ISO-1',
      reference: 'ISO 1:2026',
      type: 'Standard',
      uri: 'https://example.test/standard',
      version: '2026',
    }
    const { rerender } = render(
      <NormReferenceFormFields
        form={form}
        idPrefix="issue891"
        layout="create"
        normReferenceIdHelperText="Generated when blank"
        onSetField={onSetField}
      />,
    )

    const fields = [
      ['issue891-name', 'name'],
      ['issue891-type', 'type'],
      ['issue891-reference', 'reference'],
      ['issue891-version', 'version'],
      ['issue891-issuer', 'issuer'],
      ['issue891-uri', 'uri'],
      ['issue891-id', 'normReferenceId'],
    ] as const
    for (const [id, field] of fields) {
      const input = document.getElementById(id)
      expect(input).toBeInstanceOf(HTMLInputElement)
      await user.type(input as HTMLInputElement, 'x')
      expect(onSetField).toHaveBeenCalledWith(field, expect.any(String))
    }
    expect(
      screen.getByRole('link', { name: 'normReference.openUri' }),
    ).toHaveAttribute('href', 'https://example.test/standard')
    const help = screen.getByRole('button', {
      name: 'common.help: normReference.name',
    })
    await user.click(help)
    expect(help).toHaveAttribute('aria-expanded', 'true')
    await user.click(help)
    expect(help).toHaveAttribute('aria-expanded', 'false')

    rerender(
      <NormReferenceFormFields
        form={{ ...form, uri: 'javascript:alert(1)' }}
        idPrefix="issue891-stacked"
        onSetField={onSetField}
      />,
    )
    expect(
      screen.queryByRole('link', { name: 'normReference.openUri' }),
    ).toBeNull()
  })
})

describe('Issue 891 norm-reference modal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    modalState.confirmDiscard.mockResolvedValue(true)
  })

  it('announces errors, validates required fields, saves, and restores focus', async () => {
    const user = userEvent.setup()
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const onSave = vi.fn()
    const onCancel = vi.fn()
    const { unmount } = render(
      <NormReferenceModal
        normRefError="Duplicate reference"
        normRefForm={{
          ...emptyForm,
          issuer: 'ISO',
          name: 'Standard',
          reference: 'ISO 1',
          type: 'Standard',
        }}
        normRefFormDirty
        normRefSubmitting={false}
        onCancel={onCancel}
        onSave={onSave}
        onSetField={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Duplicate reference')
    const save = screen.getByRole('button', { name: 'common.save' })
    expect(save).toBeEnabled()
    await user.click(save)
    expect(onSave).toHaveBeenCalledOnce()
    await user.click(
      screen.getAllByRole('button', { name: 'common.cancel' })[0],
    )
    expect(modalState.confirmDiscard).toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledOnce()
    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('keeps dirty forms open on rejection, traps focus, and blocks actions while submitting', async () => {
    const user = userEvent.setup()
    modalState.confirmDiscard.mockResolvedValue(false)
    const onCancel = vi.fn()
    const { rerender } = render(
      <NormReferenceModal
        normRefError={null}
        normRefForm={emptyForm}
        normRefFormDirty
        normRefSubmitting={false}
        onCancel={onCancel}
        onSave={vi.fn()}
        onSetField={vi.fn()}
      />,
    )
    const dialog = screen.getByRole('dialog')
    const close = screen.getAllByRole('button', { name: 'common.cancel' })[0]
    await user.click(close)
    expect(onCancel).not.toHaveBeenCalled()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(modalState.confirmDiscard).toHaveBeenCalledTimes(2)
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })

    rerender(
      <NormReferenceModal
        normRefError={null}
        normRefForm={emptyForm}
        normRefFormDirty={false}
        normRefSubmitting
        onCancel={onCancel}
        onSave={vi.fn()}
        onSetField={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'common.saving' })).toBeDisabled()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it.each([
    { issuer: '', name: 'Name', reference: 'Ref', type: 'Type' },
    { issuer: 'Issuer', name: '', reference: 'Ref', type: 'Type' },
    { issuer: 'Issuer', name: 'Name', reference: '', type: 'Type' },
    { issuer: 'Issuer', name: 'Name', reference: 'Ref', type: '' },
  ])('disables dirty saves when a required value is blank: $form', form => {
    render(
      <NormReferenceModal
        normRefError={null}
        normRefForm={{ ...emptyForm, ...form }}
        normRefFormDirty
        normRefSubmitting={false}
        onCancel={vi.fn()}
        onSave={vi.fn()}
        onSetField={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled()
  })

  it('cancels clean forms from Escape without confirmation and wraps Tab focus', () => {
    const onCancel = vi.fn()
    render(
      <NormReferenceModal
        normRefError={null}
        normRefForm={emptyForm}
        normRefFormDirty={false}
        normRefSubmitting={false}
        onCancel={onCancel}
        onSave={vi.fn()}
        onSetField={vi.fn()}
      />,
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled])',
    )
    focusable[0]?.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    focusable[focusable.length - 1]?.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(focusable[0]).toHaveFocus()
    focusable[focusable.length - 1]?.focus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
  })

  it('allows unchanged complete forms to save and cancels from the footer', () => {
    const onCancel = vi.fn()
    render(
      <NormReferenceModal
        normRefError={null}
        normRefForm={{
          ...emptyForm,
          issuer: 'Issuer',
          name: 'Name',
          reference: 'Reference',
          type: 'Type',
        }}
        normRefFormDirty={false}
        normRefSubmitting={false}
        onCancel={onCancel}
        onSave={vi.fn()}
        onSetField={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'common.save' })).toHaveAttribute(
      'title',
      'common.noChangesToSave',
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'common.cancel' })[1])
    expect(onCancel).toHaveBeenCalledOnce()
    expect(modalState.confirmDiscard).not.toHaveBeenCalled()
  })
})

describe('Issue 891 package-purpose tooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 120,
      height: 20,
      left: 20,
      right: 120,
      top: 100,
      width: 100,
      x: 20,
      y: 100,
      toJSON: () => ({}),
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('opens after hover delay, composes handlers, repositions, and closes', async () => {
    const existingEnter = vi.fn()
    render(
      <RequirementPackagePurposeTooltip purposeAndScope=" Full purpose ">
        <button
          aria-describedby="existing"
          onMouseEnter={existingEnter}
          type="button"
        >
          Package
        </button>
      </RequirementPackagePurposeTooltip>,
    )
    const trigger = screen.getByRole('button', { name: 'Package' })
    fireEvent.mouseEnter(trigger)
    expect(existingEnter).toHaveBeenCalledOnce()
    await act(async () => vi.advanceTimersByTime(1000))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Full purpose')
    expect(trigger.getAttribute('aria-describedby')).toContain('existing')
    fireEvent.resize(window)
    fireEvent.scroll(window)
    fireEvent.mouseLeave(trigger)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('opens above low triggers on keyboard focus and ignores blank/non-element content', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: window.innerHeight,
      height: 20,
      left: window.innerWidth,
      right: window.innerWidth,
      top: window.innerHeight - 20,
      width: 10,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    vi.spyOn(Element.prototype, 'matches').mockReturnValue(true)
    const { container, rerender } = render(
      <RequirementPackagePurposeTooltip
        maxWidth={999}
        purposeAndScope="Purpose"
      >
        <button type="button">Package</button>
      </RequirementPackagePurposeTooltip>,
    )
    const trigger = container.querySelector('button')
    expect(trigger).toBeInstanceOf(HTMLButtonElement)
    fireEvent.focus(trigger as HTMLButtonElement)
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip.style.bottom).not.toBe('')
    fireEvent.blur(trigger as HTMLButtonElement)

    rerender(
      <RequirementPackagePurposeTooltip purposeAndScope="   ">
        Plain text
      </RequirementPackagePurposeTooltip>,
    )
    await act(async () => vi.runAllTimers())
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('cancels pending hover, handles non-focus-visible focus, and uses popover APIs', async () => {
    const showPopover = vi.fn()
    const hidePopover = vi.fn()
    Object.defineProperties(HTMLElement.prototype, {
      hidePopover: { configurable: true, value: hidePopover },
      showPopover: { configurable: true, value: showPopover },
    })
    vi.spyOn(Element.prototype, 'matches').mockReturnValue(false)
    const { container, unmount } = render(
      <RequirementPackagePurposeTooltip purposeAndScope="Purpose">
        <button type="button">Package</button>
      </RequirementPackagePurposeTooltip>,
    )
    const trigger = container.querySelector('button') as HTMLButtonElement
    fireEvent.mouseEnter(trigger)
    fireEvent.mouseLeave(trigger)
    await act(async () => vi.advanceTimersByTime(1000))
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.focus(trigger)
    expect(screen.queryByRole('tooltip')).toBeNull()
    vi.mocked(Element.prototype.matches).mockReturnValue(true)
    fireEvent.focus(trigger)
    expect(document.querySelector('[role="tooltip"]')).toHaveAttribute(
      'popover',
      'manual',
    )
    expect(showPopover).toHaveBeenCalled()
    unmount()
    expect(hidePopover).toHaveBeenCalled()
    Reflect.deleteProperty(HTMLElement.prototype, 'showPopover')
    Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover')
  })
})
