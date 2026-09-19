import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpecDetailWorkflowContext } from './requirements-specification-detail-client.suite'
import { registerPanelResizeTests } from './requirements-specification-detail-resize.suite'

export function registerPanelLayoutTests(context: SpecDetailWorkflowContext) {
  registerPanelResizeTests(context)
  describe('panel layouts', () => {
    beforeEach(() => window.localStorage.clear())
    afterEach(() => vi.restoreAllMocks())
    const key = 'specification-panel-layout-v1'
    const widthKey = 'specification-panel-width-v1'
    const left = 'specification.itemsInSpecification'
    const right = 'specification.libraryPanel'
    const toggle = (action: 'expand' | 'collapse', label: string) =>
      screen.getByRole('button', {
        name: `specification.${action}Panel ${label}`,
      })
    const save = (layout: string, specificationId = 8) =>
      localStorage.setItem(key, JSON.stringify({ specificationId, layout }))

    it('identifies panel tabs and their contextual actions in Developer Mode', async () => {
      save('both')
      context.renderRequirementsSpecificationDetailClient()
      await context.settleInitialEditorEffects()
      for (const side of ['left', 'right']) {
        expect(
          screen.getByRole('tablist', {
            name: `specification.${side}PanelTabs`,
          }),
        ).toHaveAttribute('data-developer-mode-value', `${side} panel tabs`)
      }
      fireEvent.click(
        screen.getByRole('tab', { name: /specification.needsReferences/ }),
      )
      const createReference = screen.getByRole('button', {
        name: 'specification.newNeedsReference',
      })
      expect(
        createReference.closest('[data-developer-mode-name="panel toolbar"]'),
      ).toHaveAttribute('data-developer-mode-value', 'filters and tab actions')
      fireEvent.click(createReference)
      expect(screen.getByRole('dialog')).toBeVisible()
    })

    it.each([
      [
        'valid preference',
        JSON.stringify({ specificationId: 8, leftRatio: 0.6 }),
        0.6,
      ],
      [
        'another specification',
        JSON.stringify({ specificationId: 9, leftRatio: 0.6 }),
        0.5,
      ],
      ['invalid JSON', '{invalid', 0.5],
      ['missing ratio', JSON.stringify({ specificationId: 8 }), 0.5],
      ['zero ratio', JSON.stringify({ specificationId: 8, leftRatio: 0 }), 0.5],
      ['full width', JSON.stringify({ specificationId: 8, leftRatio: 1 }), 0.5],
      [
        'out of range',
        JSON.stringify({ specificationId: 8, leftRatio: -2 }),
        0.5,
      ],
      [
        'string ratio',
        JSON.stringify({ specificationId: 8, leftRatio: '0.6' }),
        0.5,
      ],
    ])(
      'normalizes the current specification width record: %s',
      async (_name, value, expected) => {
        localStorage.setItem(widthKey, value as string)
        context.renderRequirementsSpecificationDetailClient()
        await context.settleInitialEditorEffects()
        expect(
          screen.queryByRole('separator', {
            name: 'specification.resizePanels',
          }),
        ).not.toBeInTheDocument()
        fireEvent.click(toggle('expand', right))
        expect(
          screen.getByRole('separator', { name: 'specification.resizePanels' }),
        ).toHaveAttribute('data-developer-mode-value', 'panel widths')
        expect(JSON.parse(localStorage.getItem(widthKey) ?? 'null')).toEqual({
          specificationId: 8,
          leftRatio: expected,
        })
      },
    )

    it('places the collapse control beside the tabs using navigation panel icons', async () => {
      save('both')
      const { container } =
        context.renderRequirementsSpecificationDetailClient()
      await context.settleInitialEditorEffects()
      for (const side of ['left', 'right']) {
        const header = container.querySelector(
          `[data-developer-mode-name="panel header"][data-developer-mode-value="${side} panel"]`,
        )
        expect(header).not.toBeNull()
        const controls = within(header as HTMLElement)
        expect(
          controls.getByRole('button', { name: /specification.collapsePanel/ }),
        ).toBeVisible()
        expect(controls.getByRole('tablist')).toBeVisible()
      }
      expect(
        toggle('collapse', left).querySelector('.lucide-panel-left-close'),
      ).not.toBeNull()
      fireEvent.click(toggle('collapse', left))
      expect(
        toggle('expand', left).querySelector('.lucide-panel-left-open'),
      ).not.toBeNull()
    })

    it('keeps focus visible through all transitions without closing both panels', async () => {
      context.renderRequirementsSpecificationDetailClient()
      await context.settleInitialEditorEffects()
      const rightToggle = toggle('expand', right)
      expect(rightToggle).toHaveAttribute(
        'data-developer-mode-value',
        'right panel',
      )
      fireEvent.click(rightToggle)
      expect(toggle('collapse', right)).toHaveFocus()
      expect(toggle('collapse', right)).toHaveAttribute('aria-expanded', 'true')
      fireEvent.click(toggle('collapse', left))
      expect(toggle('expand', left)).toHaveFocus()
      fireEvent.click(toggle('collapse', right))
      expect(toggle('expand', right)).toHaveFocus()
      expect(screen.getByRole('tab', { name: left })).toBeVisible()
      fireEvent.click(toggle('collapse', left))
      expect(toggle('expand', left)).toHaveFocus()
      expect(
        screen.getByRole('tab', {
          name: 'specification.availableRequirements',
        }),
      ).toBeVisible()
      fireEvent.click(toggle('expand', left))
      expect(toggle('collapse', left)).toHaveFocus()
      expect(
        screen.getByRole('tab', {
          name: 'specification.availableRequirements',
        }),
      ).toBeVisible()
      expect(JSON.parse(localStorage.getItem(key) ?? 'null')).toEqual({
        specificationId: 8,
        layout: 'both',
      })
    })

    it.each(['library', 'specificationLocal'] as const)(
      'counts %s requirements in the opening snapshot',
      async kind => {
        const data = context.createInitialData()
        data.specificationItems.items[0] = {
          ...context.initialSpecificationItem,
          kind,
        }
        context.renderRequirementsSpecificationDetailClient(data)
        await context.settleInitialEditorEffects()
        expect(toggle('expand', right)).toBeVisible()
      },
    )

    it('keeps an empty opening layout when requirements later load', async () => {
      const data = context.createInitialData()
      data.specificationItems = context.createSpecificationItemsPage([])
      context.renderRequirementsSpecificationDetailClient(data)
      await context.settleInitialEditorEffects()
      expect(toggle('collapse', left)).toBeVisible()
      expect(toggle('collapse', right)).toBeVisible()
    })

    it.each(['both', 'left', 'right'])(
      'restores %s before applying content defaults',
      async layout => {
        save(layout)
        context.renderRequirementsSpecificationDetailClient()
        await context.settleInitialEditorEffects()
        expect(
          toggle(layout === 'right' ? 'expand' : 'collapse', left),
        ).toBeVisible()
        expect(
          toggle(layout === 'left' ? 'expand' : 'collapse', right),
        ).toBeVisible()
      },
    )

    it.each([
      'not JSON',
      'null',
      '{}',
      '{"specificationId":"8","layout":"right"}',
      '{"specificationId":8,"layout":"closed"}',
    ])('ignores invalid saved state %s', async value => {
      localStorage.setItem(key, value)
      context.renderRequirementsSpecificationDetailClient()
      await context.settleInitialEditorEffects()
      fireEvent.click(toggle('expand', right))
      expect(toggle('collapse', right)).toBeVisible()
    })

    it.each(['getItem', 'setItem'] as const)(
      'supports toggles when storage %s is denied',
      async method => {
        vi.spyOn(Storage.prototype, method).mockImplementation(() => {
          throw new DOMException('Denied', 'SecurityError')
        })
        context.renderRequirementsSpecificationDetailClient()
        await context.settleInitialEditorEffects()
        fireEvent.click(toggle('expand', right))
        expect(toggle('collapse', right)).toBeVisible()
      },
    )

    it('remembers only the latest specification and restores a manual choice on reload', async () => {
      let view = context.renderRequirementsSpecificationDetailClient()
      await context.settleInitialEditorEffects()
      fireEvent.click(toggle('collapse', left))
      view.unmount()
      view = context.renderRequirementsSpecificationDetailClient()
      await context.settleInitialEditorEffects()
      expect(toggle('expand', left)).toBeVisible()
      view.unmount()
      view = context.renderRequirementsSpecificationDetailClient(
        context.createInitialData(),
        9,
      )
      await context.settleInitialEditorEffects()
      expect(toggle('expand', right)).toBeVisible()
      view.unmount()
      context.renderRequirementsSpecificationDetailClient()
      await context.settleInitialEditorEffects()
      expect(toggle('expand', right)).toBeVisible()
    })

    it('forgets the previous specification even if the next preload fails', async () => {
      save('right')
      const data = context.createInitialData()
      data.specificationItems = context.createSpecificationItemsPage([])
      data.errors = [{ key: 'requirement applications', message: 'failed' }]
      const view = context.renderRequirementsSpecificationDetailClient(data, 9)
      await context.settleInitialEditorEffects()
      view.unmount()
      context.renderRequirementsSpecificationDetailClient()
      await context.settleInitialEditorEffects()
      expect(toggle('expand', right)).toBeVisible()
    })

    it('does not persist an empty default from failed loading, but saves manual choices', async () => {
      const data = context.createInitialData()
      data.specificationItems = context.createSpecificationItemsPage([])
      data.errors = [{ key: 'requirement applications', message: 'failed' }]
      context.renderRequirementsSpecificationDetailClient(data)
      await context.settleInitialEditorEffects()
      expect(localStorage.getItem(key)).toBeNull()
      fireEvent.click(toggle('collapse', right))
      expect(JSON.parse(localStorage.getItem(key) ?? 'null')).toEqual({
        specificationId: 8,
        layout: 'left',
      })
    })

    it.each([
      ['specification.needsReferences', left],
      ['specification.rfiList', left],
      ['specification.requirementSelectionQuestions', right],
    ])(
      'retains the active %s tab and includes it in the collapsed name',
      async (tab, base) => {
        save('both')
        context.renderRequirementsSpecificationDetailClient()
        await context.settleInitialEditorEffects()
        fireEvent.click(screen.getByRole('tab', { name: new RegExp(tab) }))
        const label = `${base} – ${tab === 'specification.rfiList' ? 'specification.rfiPanelTab' : tab}`
        fireEvent.click(toggle('collapse', label))
        expect(toggle('expand', label)).toHaveTextContent(label)
        fireEvent.click(toggle('expand', label))
        expect(
          screen.getByRole('tab', { name: new RegExp(tab) }),
        ).toHaveAttribute('aria-selected', 'true')
        await context.settleInitialEditorEffects()
      },
    )

    it('preserves selection, expanded rows, sort and filter input without saving data', async () => {
      save('both')
      context.renderRequirementsSpecificationDetailClient()
      await context.settleInitialEditorEffects()
      fireEvent.click(context.requirementRowCheckbox('available', 'IAM0202'))
      fireEvent.click(context.requirementSortButton('available', 'uniqueId'))
      fireEvent.click(
        within(context.requirementRow('available', 'IAM0202')).getByText(
          'IAM0202',
        ),
      )
      const search = context.requirementSearchInput('available')
      fireEvent.change(search, { target: { value: 'IAM' } })
      fireEvent.click(toggle('collapse', right))
      fireEvent.click(toggle('expand', right))
      expect(search).toHaveValue('IAM')
      expect(
        context.requirementRowCheckbox('available', 'IAM0202'),
      ).toBeChecked()
      expect(
        context.requirementSortButton('available', 'uniqueId').closest('th'),
      ).toHaveAttribute('aria-sort', 'descending')
      expect(screen.getByText('Requirement detail 202')).toBeVisible()
      expect(
        context.fetchMock.mock.calls.filter(
          ([, init]) => init?.method && init.method !== 'GET',
        ),
      ).toHaveLength(0)
      await context.settleInitialEditorEffects()
    })

    it('opens a populated specification with only its items panel visible', async () => {
      context.renderRequirementsSpecificationDetailClient()
      await context.settleInitialEditorEffects()
      expect(
        screen.getByRole('tab', { name: 'specification.itemsInSpecification' }),
      ).toBeVisible()
      expect(
        screen.queryByRole('tab', {
          name: 'specification.availableRequirements',
        }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', {
          name: 'specification.expandPanel specification.libraryPanel',
        }),
      ).toHaveAttribute('aria-expanded', 'false')
    })
  })
}
