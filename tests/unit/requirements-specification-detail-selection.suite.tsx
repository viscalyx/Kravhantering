import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import RequirementsSpecificationDetailClient from '@/app/[locale]/specifications/[specificationId]/requirements-specification-detail-client'
import { ConfirmModalProvider } from '@/components/ConfirmModal'
import type { RequirementPackageOption } from '@/lib/requirements/list-view'
import type { SpecDetailWorkflowContext } from './requirements-specification-detail-client.suite'

export function registerSelectionTests(context: SpecDetailWorkflowContext) {
  describe('selection, removal, deviations, and bulk actions', () => {
    it('keeps stable item-ref selection through filtering and deselects exactly the hidden set', async () => {
      const hiddenItem = {
        ...context.initialSpecificationItem,
        id: -41,
        itemRef: 'local:41',
        kind: 'specificationLocal' as const,
        requirementPackageIds: [9],
        specificationItemId: undefined,
        specificationLocalRequirementId: 41,
        uniqueId: 'KRAV0001',
      }
      const initialData = {
        ...context.createInitialData(),
        leftRequirementPackageCatalog:
          context.createRequirementPackageCatalogPage([
            { id: 9, name: 'Security package' },
          ]),
        requirementPackages: [
          { id: 9, name: 'Security package' },
        ] as RequirementPackageOption[],
        specificationItems: context.createSpecificationItemsPage([
          context.initialSpecificationItem,
          hiddenItem,
        ]),
      }
      context.specificationItemsGetItems = initialData.specificationItems.items
      context.specificationRequirementPackagesGetHandler = async () =>
        context.okJson({
          pagination: {
            count: 1,
            hasMore: false,
            limit: 50,
            nextCursor: null,
          },
          requirementPackages: [{ id: 9, name: 'Security package' }],
          selectedRequirementPackages: [],
        })
      context.renderRequirementsSpecificationDetailClient(initialData)
      await context.waitForInitialAvailableRequirementsRefresh()

      fireEvent.click(context.requirementRowCheckbox('items', 'BEH0001'))
      await act(async () => {
        fireEvent.click(
          context.requirementSortButton('items', 'description'),
        )
      })
      expect(
        screen.getByRole('button', {
          name: 'specification.assignNeedsReferenceAction',
        }),
      ).toBeInTheDocument()
      await act(async () => {
        fireEvent.click(
          context.requirementPackageButton('items', 9),
        )
      })

      await waitFor(() => {
        expect(
          context.itemsStatus(),
        ).toHaveTextContent('specification.selectionStatus')
      })
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.deselectHidden' }),
      )
      expect(
        screen.queryByRole('button', {
          name: 'specification.assignNeedsReferenceAction',
        }),
      ).not.toBeInTheDocument()
    })

    it('renders selected-item actions as icon buttons with translated tooltips', async () => {
      context.renderRequirementsSpecificationDetailClient()
      await context.waitForInitialAvailableRequirementsRefresh()
      fireEvent.click(context.requirementRowCheckbox('items', 'BEH0001'))

      for (const name of [
        'specification.assignNeedsReferenceAction',
        'specification.clearNeedsReferenceAction',
        'deviation.requestDeviationSelected',
        'specification.removeSelected',
      ]) {
        const button = screen.getByRole('button', { name })
        expect(button).toHaveAttribute('title', name)
        expect(button).not.toHaveTextContent(/\S/)
        expect(button).toHaveProperty('childElementCount', 1)
        expect(button.querySelector('svg')).toBeInTheDocument()
      }

      expect(
        screen.getByRole('button', { name: 'specification.removeSelected' }),
      ).toHaveClass('px-0', 'py-0')
    })

    it('limits shared selected-item actions without changing the selection', async () => {
      const items = Array.from({ length: 201 }, (_, index) => ({
        ...context.initialSpecificationItem,
        id: index + 1,
        itemRef: `lib:${index + 1}`,
        requirementPackageIds: [index < 200 ? 1 : 2],
        specificationItemId: index + 1,
        uniqueId: `BEH${String(index + 1).padStart(4, '0')}`,
      }))
      const initialData = {
        ...context.createInitialData(),
        leftRequirementPackageCatalog:
          context.createRequirementPackageCatalogPage([
            { id: 1, name: 'Shown package' },
            { id: 2, name: 'Hidden package' },
          ]),
        requirementPackages: [
          { id: 1, name: 'Shown package' },
          { id: 2, name: 'Hidden package' },
        ],
        specificationItems: context.createSpecificationItemsPage(items),
      }
      context.specificationItemsGetItems = items
      context.specificationRequirementPackagesGetHandler = async () =>
        context.okJson({
          pagination: {
            count: 2,
            hasMore: false,
            limit: 50,
            nextCursor: null,
          },
          requirementPackages: initialData.requirementPackages,
          selectedRequirementPackages: [],
        })
      context.renderRequirementsSpecificationDetailClient(initialData)
      await context.waitForInitialAvailableRequirementsRefresh()

      fireEvent.click(
        context.requirementPackageButton('items', 1),
      )
      await waitFor(() => {
        expect(
          context.requirementPackageButton('items', 1),
        ).toHaveAttribute('aria-pressed', 'true')
      })
      context.selectRequirementRows(items.slice(0, 200).map(item => item.id))

      const sharedActionNames = [
        'specification.assignNeedsReferenceAction',
        'specification.clearNeedsReferenceAction',
        'deviation.requestDeviationSelected',
        'specification.removeSelected',
      ]
      for (const name of sharedActionNames) {
        expect(screen.getByRole('button', { name })).toBeEnabled()
      }

      fireEvent.click(
        context.requirementPackageButton('items', 1),
      )
      await screen.findByRole('row', { name: /BEH0201/ })
      fireEvent.click(context.requirementRowCheckbox('items', 'BEH0201'))

      expect(
        context.intlState.selectionActionLimitExceeded,
      ).toHaveBeenLastCalledWith({
        excess: 1,
        hidden: 0,
        limit: 200,
        total: 201,
      })
      for (const name of sharedActionNames) {
        const button = screen.getByRole('button', { name })
        expect(button).toBeDisabled()
        expect(button).toHaveClass('disabled:opacity-40')
        expect(button).toHaveAttribute(
          'title',
          'specification.selectionActionLimitExceeded',
        )
      }
      expect(
        context.requirementRowCheckbox('items', 'BEH0201'),
      ).toBeChecked()

      fireEvent.click(
        context.requirementRow('items', 'BEH0001'),
      )
      expect(
        await screen.findByRole('button', {
          name: 'remove requirement from specification',
        }),
      ).toBeEnabled()

      fireEvent.click(
        context.requirementPackageButton('items', 1),
      )
      await waitFor(() => {
        expect(
          context.intlState.selectionActionLimitExceeded,
        ).toHaveBeenLastCalledWith({
          excess: 1,
          hidden: 1,
          limit: 200,
          total: 201,
        })
      })

      const deselectNotShown = screen.getByRole('button', {
        name: 'specification.deselectHidden',
      })
      expect(deselectNotShown).toBeEnabled()
      fireEvent.click(deselectNotShown)

      await waitFor(() => {
        expect(context.intlState.selectionStatus).toHaveBeenLastCalledWith({
          hidden: 0,
          total: 200,
        })
      })
      for (const name of sharedActionNames) {
        expect(screen.getByRole('button', { name })).toBeEnabled()
      }
      expect(
        context.itemsStatus(),
      ).not.toHaveTextContent('specification.selectionActionLimitExceeded')
    }, 30_000)

    it('preserves selection across an authoritative item refresh and clears it on locale change', async () => {
      const initialData = context.createInitialData()
      const view =
        context.renderRequirementsSpecificationDetailClient(initialData)
      fireEvent.click(context.requirementRowCheckbox('items', 'BEH0001'))
      fireEvent.click(context.requirementRow('items', 'BEH0001'))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'refresh requirement detail',
        }),
      )

      await waitFor(() => {
        expect(
          screen.getByRole('button', {
            name: 'specification.assignNeedsReferenceAction',
          }),
        ).toBeInTheDocument()
      })

      context.intlState.locale = 'sv'
      view.rerender(
        <ConfirmModalProvider>
          <RequirementsSpecificationDetailClient
            initialData={initialData}
            specificationId={context.defaultSpecificationId}
          />
        </ConfirmModalProvider>,
      )
      await waitFor(() => {
        expect(
          screen.queryByRole('button', {
            name: 'specification.assignNeedsReferenceAction',
          }),
        ).not.toBeInTheDocument()
      })
    })

    it('announces and deselects selected items that disappear during authoritative resolution', async () => {
      context.renderRequirementsSpecificationDetailClient()
      fireEvent.click(context.requirementRowCheckbox('items', 'BEH0001'))
      context.specificationItemsGetItems = []
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.assignNeedsReferenceAction',
        }),
      )

      await waitFor(() => {
        expect(
          context.itemsStatus(),
        ).toHaveTextContent('specification.selectionDisappeared')
      })
      expect(
        screen.queryByRole('button', {
          name: 'specification.assignNeedsReferenceAction',
        }),
      ).not.toBeInTheDocument()
    })

    it('clears needs-reference links as a distinct confirmed action and deselects successful targets', async () => {
      const item = { ...context.initialSpecificationItem, needsReferenceId: 81 }
      const initialData = {
        ...context.createInitialData(),
        specificationItems: context.createSpecificationItemsPage([item]),
      }
      context.specificationItemsGetItems = [item]
      context.renderRequirementsSpecificationDetailClient(initialData)
      fireEvent.click(context.requirementRowCheckbox('items', 'BEH0001'))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.clearNeedsReferenceAction',
        }),
      )

      const confirmation = await screen.findByRole('alertdialog', {
        name: 'specification.clearNeedsReferenceTitle',
      })
      fireEvent.click(
        within(confirmation).getByRole('button', {
          name: 'specification.clearNeedsReferenceAction',
        }),
      )

      await waitFor(() => {
        expect(context.fetchMock).toHaveBeenCalledWith(
          '/api/requirements-specifications/8/items',
          expect.objectContaining({
            body: JSON.stringify({
              itemRefs: ['lib:31'],
              needsReferenceId: null,
            }),
            method: 'PATCH',
          }),
        )
      })
      expect(
        screen.queryByRole('button', {
          name: 'specification.assignNeedsReferenceAction',
        }),
      ).not.toBeInTheDocument()
    })

    it('keeps needs-reference links when clearing is cancelled', async () => {
      const item = { ...context.initialSpecificationItem, needsReferenceId: 81 }
      context.specificationItemsGetItems = [item]
      context.renderRequirementsSpecificationDetailClient({
        ...context.createInitialData(),
        specificationItems: context.createSpecificationItemsPage([item]),
      })
      fireEvent.click(context.requirementRowCheckbox('items', 'BEH0001'))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.clearNeedsReferenceAction',
        }),
      )
      const confirmation = await screen.findByRole('alertdialog')
      fireEvent.click(
        within(confirmation).getByRole('button', { name: 'common.cancel' }),
      )

      expect(
        screen.getByRole('button', {
          name: 'specification.clearNeedsReferenceAction',
        }),
      ).toBeInTheDocument()
      expect(
        context.fetchMock.mock.calls.some(
          ([url, init]) =>
            url === context.specificationApiPath('/items') &&
            (init as RequestInit | undefined)?.method === 'PATCH',
        ),
      ).toBe(false)
      await context.waitForInitialAvailableRequirementsRefresh()
    })

    it('reports a selected-item resolution failure before bulk assignment', async () => {
      context.specificationItemResolutionHandler = async () => {
        throw new Error('Could not resolve selected applications')
      }
      context.renderRequirementsSpecificationDetailClient()
      fireEvent.click(context.requirementRowCheckbox('items', 'BEH0001'))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.assignNeedsReferenceAction',
        }),
      )

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not resolve selected applications',
      )
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('closes bulk assignment if selected applications disappear before save', async () => {
      context.renderRequirementsSpecificationDetailClient({
        ...context.createInitialData(),
        availableNeedsRefs: [{ description: null, id: 81, text: 'IAM-42' }],
      })
      fireEvent.click(context.requirementRowCheckbox('items', 'BEH0001'))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.assignNeedsReferenceAction',
        }),
      )
      const dialog = await screen.findByRole('dialog')
      context.specificationItemResolutionHandler = async () =>
        context.okJson({ items: [] })
      fireEvent.change(
        within(dialog).getByLabelText('specification.needsReference'),
        { target: { value: '81' } },
      )
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'common.confirm' }),
      )

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(
        context.fetchMock.mock.calls.some(
          ([url, init]) =>
            url === context.specificationApiPath('/items') &&
            (init as RequestInit | undefined)?.method === 'PATCH',
        ),
      ).toBe(false)
    })

    it('distinguishes mixed removal and resolves all selected item refs before deletion', async () => {
      const libraryItems = Array.from({ length: 51 }, (_, index) => ({
        ...context.initialSpecificationItem,
        id: 101 + index,
        itemRef: `lib:${31 + index}`,
        specificationItemId: 31 + index,
        uniqueId: `BEH${String(index + 1).padStart(4, '0')}`,
      }))
      const localItem = {
        ...context.initialSpecificationItem,
        id: -41,
        isSpecificationLocal: true,
        itemRef: 'local:41',
        kind: 'specificationLocal' as const,
        specificationItemId: undefined,
        specificationLocalRequirementId: 41,
        uniqueId: 'KRAV0001',
      }
      const initialData = {
        ...context.createInitialData(),
        specificationItems: context.createSpecificationItemsPage([
          ...libraryItems,
          localItem,
        ]),
      }
      context.specificationItemsGetItems = initialData.specificationItems.items
      context.renderRequirementsSpecificationDetailClient(initialData)
      await context.waitForInitialAvailableRequirementsRefresh()
      context.selectRequirementRows(
        initialData.specificationItems.items.map(item => item.id),
      )
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.removeSelected' }),
      )

      const confirmation = await screen.findByRole('alertdialog', {
        name: 'specification.removeMixedConfirmTitle',
      })
      fireEvent.click(
        within(confirmation).getByRole('button', { name: 'common.delete' }),
      )
      await waitFor(() => {
        const resolutionCalls = context.fetchMock.mock.calls.filter(([input]) =>
          String(input).startsWith('/api/specification-item-resolutions/8?'),
        )
        expect(resolutionCalls).toHaveLength(2)
        expect(
          resolutionCalls.map(
            ([input]) =>
              context.searchParamsFromPath(String(input)).getAll('refs').length,
          ),
        ).toEqual([50, 2])
      })
      await waitFor(() => {
        expect(context.fetchMock).toHaveBeenCalledWith(
          '/api/requirements-specifications/8/items',
          expect.objectContaining({
            body: JSON.stringify({
              itemRefs: [...libraryItems.map(item => item.itemRef), 'local:41'],
            }),
            method: 'DELETE',
          }),
        )
      })
    })

    it('cancels a library-only removal without sending a delete request', async () => {
      context.renderRequirementsSpecificationDetailClient()
      fireEvent.click(context.requirementRowCheckbox('items', 'BEH0001'))
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.removeSelected' }),
      )
      const confirmation = await screen.findByRole('alertdialog', {
        name: 'specification.removeSelected',
      })
      expect(confirmation).toHaveTextContent('specification.removeConfirm')
      fireEvent.click(
        within(confirmation).getByRole('button', { name: 'common.cancel' }),
      )

      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
      expect(
        context.fetchMock.mock.calls.some(
          ([url, init]) =>
            url === context.specificationApiPath('/items') &&
            (init as RequestInit | undefined)?.method === 'DELETE',
        ),
      ).toBe(false)
    })

    it('removes a specification-local application after the local-only warning', async () => {
      const localItem = {
        ...context.initialSpecificationItem,
        id: -41,
        isSpecificationLocal: true,
        itemRef: 'local:41',
        kind: 'specificationLocal' as const,
        specificationItemId: undefined,
        specificationLocalRequirementId: 41,
        uniqueId: 'KRAV0001',
      }
      context.specificationItemsGetItems = [localItem]
      context.renderRequirementsSpecificationDetailClient({
        ...context.createInitialData(),
        specificationItems: context.createSpecificationItemsPage([localItem]),
      })
      fireEvent.click(context.requirementRowCheckbox('items', 'KRAV0001'))
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.removeSelected' }),
      )
      const confirmation = await screen.findByRole('alertdialog', {
        name: 'specification.removeSpecificationLocalConfirmTitle',
      })
      expect(confirmation).toHaveTextContent(
        'specification.removeSpecificationLocalConfirm',
      )
      fireEvent.click(
        within(confirmation).getByRole('button', { name: 'common.delete' }),
      )

      await waitFor(() => {
        const deleteCall = context.fetchMock.mock.calls.find(
          ([url, init]) =>
            url === context.specificationApiPath('/items') &&
            (init as RequestInit | undefined)?.method === 'DELETE',
        )
        expect(
          JSON.parse(
            String((deleteCall?.[1] as RequestInit | undefined)?.body),
          ),
        ).toEqual({ itemRefs: ['local:41'] })
        expect(
          screen.queryByRole('button', {
            name: 'specification.removeSelected',
          }),
        ).toBeNull()
        expect(
          screen.getByRole('button', {
            name: 'specification.newLocalRequirement',
          }),
        ).toBeInTheDocument()
      })
    })

    it('reports a server rejection while keeping a library application selected', async () => {
      context.deleteItemsHandler = async () => ({
        json: async () => ({ error: 'Application cannot be removed' }),
        ok: false,
      })
      context.renderRequirementsSpecificationDetailClient()
      fireEvent.click(context.requirementRowCheckbox('items', 'BEH0001'))
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.removeSelected' }),
      )
      const confirmation = await screen.findByRole('alertdialog')
      fireEvent.click(
        within(confirmation).getByRole('button', { name: 'common.delete' }),
      )

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Application cannot be removed',
      )
      expect(
        screen.getByRole('button', { name: 'specification.removeSelected' }),
      ).toBeInTheDocument()
    })

    it('reports a removal network failure without dropping the selection', async () => {
      context.deleteItemsHandler = async () => {
        throw new Error('Removal network unavailable')
      }
      context.renderRequirementsSpecificationDetailClient()
      fireEvent.click(context.requirementRowCheckbox('items', 'BEH0001'))
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.removeSelected' }),
      )
      const confirmation = await screen.findByRole('alertdialog')
      fireEvent.click(
        within(confirmation).getByRole('button', { name: 'common.delete' }),
      )

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Removal network unavailable',
      )
      expect(
        context.requirementRowCheckbox('items', 'BEH0001'),
      ).toBeChecked()
    })

    it('reports partial mixed removal and keeps only the failed application selected', async () => {
      const localItem = {
        ...context.initialSpecificationItem,
        id: -41,
        isSpecificationLocal: true,
        itemRef: 'local:41',
        kind: 'specificationLocal' as const,
        specificationItemId: undefined,
        specificationLocalRequirementId: 41,
        uniqueId: 'KRAV0001',
      }
      const items = [context.initialSpecificationItem, localItem]
      context.specificationItemsGetItems = items
      let resolutionCount = 0
      context.specificationItemResolutionHandler = async () => {
        resolutionCount += 1
        return context.okJson({
          items: resolutionCount === 1 ? items : [localItem],
        })
      }
      context.deleteItemsHandler = async () =>
        context.okJson({ ok: true, removedCount: 1 })
      context.renderRequirementsSpecificationDetailClient({
        ...context.createInitialData(),
        specificationItems: context.createSpecificationItemsPage(items),
      })
      context.selectRequirementRows([101, -41])
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.removeSelected' }),
      )
      const confirmation = await screen.findByRole('alertdialog')
      fireEvent.click(
        within(confirmation).getByRole('button', { name: 'common.delete' }),
      )

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'specification.removePartialFail',
      )
      expect(
        context.requirementRowCheckbox('items', 'KRAV0001'),
      ).toBeChecked()
      expect(
        context.requirementRowCheckbox('items', 'BEH0001'),
      ).not.toBeChecked()
    })

    it('reports a removal resolution failure before asking for confirmation', async () => {
      context.specificationItemResolutionHandler = async () => {
        throw new Error('Application resolution unavailable')
      }
      context.renderRequirementsSpecificationDetailClient()
      fireEvent.click(context.requirementRowCheckbox('items', 'BEH0001'))
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.removeSelected' }),
      )

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Application resolution unavailable',
      )
      expect(screen.queryByRole('alertdialog')).toBeNull()
    })

    it('disables detail unlink while a confirmed removal request is pending', async () => {
      let completeDelete: ((response: unknown) => void) | undefined
      context.deleteItemsHandler = () =>
        new Promise(resolve => {
          completeDelete = resolve
        })
      context.renderRequirementsSpecificationDetailClient()
      fireEvent.click(
        context.requirementRow('items', 'BEH0001'),
      )
      expect(
        await screen.findByText('Requirement detail 101'),
      ).toBeInTheDocument()
      context.selectRequirementRows([101])
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.removeSelected' }),
      )
      const confirmation = await screen.findByRole('alertdialog')
      fireEvent.click(
        within(confirmation).getByRole('button', { name: 'common.delete' }),
      )

      await waitFor(() => {
        expect(completeDelete).toBeDefined()
      })
      expect(
        screen.getByRole('button', {
          name: 'remove requirement from specification',
        }),
      ).toBeDisabled()

      await act(async () => {
        completeDelete?.(context.okJson({ ok: true, removedCount: 1 }))
      })
      await waitFor(() => {
        expect(
          screen.queryByRole('button', {
            name: 'remove requirement from specification',
          }),
        ).not.toBeInTheDocument()
      })
    })

    it('shows Swedish bulk deviation priorities with localized fallbacks in configured sort order', async () => {
      context.intlState.locale = 'sv'
      const highPriorityItem = {
        ...context.initialSpecificationItem,
        version: {
          ...context.initialSpecificationItem.version,
          priorityLevelCode: 'P4',
          priorityLevelColor: '#f97316',
          priorityLevelIconName: 'ArrowUpRight',
          priorityLevelId: 4,
          priorityLevelNameEn: null,
          priorityLevelNameSv: 'Hög',
          priorityLevelSortOrder: 4,
        },
      }
      const lowPriorityItem = {
        ...context.initialSpecificationItem,
        id: 102,
        itemRef: 'lib:32',
        specificationItemId: 32,
        uniqueId: 'BEH0002',
        version: {
          ...context.initialSpecificationItem.version,
          priorityLevelCode: 'P2',
          priorityLevelColor: '#22c55e',
          priorityLevelIconName: null,
          priorityLevelId: 2,
          priorityLevelNameEn: 'Low fallback',
          priorityLevelNameSv: null,
          priorityLevelSortOrder: null,
        },
      }
      const sameOrderPriorityItem = {
        ...context.initialSpecificationItem,
        id: 104,
        itemRef: 'lib:34',
        specificationItemId: 34,
        uniqueId: 'BEH0004',
        version: {
          ...context.initialSpecificationItem.version,
          priorityLevelCode: 'P1',
          priorityLevelColor: null,
          priorityLevelIconName: null,
          priorityLevelId: 1,
          priorityLevelNameEn: 'Low',
          priorityLevelNameSv: 'Låg',
          priorityLevelSortOrder: 4,
        },
      }
      const incompletePriorityItem = {
        ...context.initialSpecificationItem,
        id: 105,
        itemRef: 'lib:35',
        specificationItemId: 35,
        uniqueId: 'BEH0005',
        version: {
          ...context.initialSpecificationItem.version,
          priorityLevelCode: null,
          priorityLevelId: 5,
        },
      }
      const duplicateHighPriorityItem = {
        ...highPriorityItem,
        id: 103,
        itemRef: 'lib:33',
        specificationItemId: 33,
        uniqueId: 'BEH0003',
      }
      const items = [
        highPriorityItem,
        lowPriorityItem,
        sameOrderPriorityItem,
        incompletePriorityItem,
        duplicateHighPriorityItem,
      ]
      context.specificationItemsGetItems = items
      context.renderRequirementsSpecificationDetailClient({
        ...context.createInitialData(),
        specificationItems: context.createSpecificationItemsPage(items),
      })
      context.selectRequirementRows([101, 102, 103, 104, 105])
      fireEvent.click(
        screen.getByRole('button', {
          name: 'deviation.requestDeviationSelected',
        }),
      )

      const dialog = await screen.findByRole('dialog', {
        name: 'deviation.requestDeviation',
      })
      expect(
        within(dialog).getByText('deviation.priorityLevels'),
      ).toBeInTheDocument()
      const priorityBadges = dialog.querySelectorAll('.status-badge')
      expect([...priorityBadges].map(badge => badge.textContent)).toEqual([
        'P1 – Låg',
        'P4 – Hög',
        'P2 – Low fallback',
      ])
      expect(priorityBadges[0]?.querySelector('svg')).toBeNull()
      expect(priorityBadges[1]?.querySelector('svg')).toBeTruthy()
    })

    it('creates one deviation per application and retains failed Requirement IDs in selection', async () => {
      const localItem = {
        ...context.initialSpecificationItem,
        id: -41,
        isSpecificationLocal: true,
        itemRef: 'local:41',
        kind: 'specificationLocal' as const,
        specificationItemId: undefined,
        specificationLocalRequirementId: 41,
        uniqueId: 'KRAV0001',
      }
      const initialData = {
        ...context.createInitialData(),
        specificationItems: context.createSpecificationItemsPage([
          context.initialSpecificationItem,
          localItem,
        ]),
      }
      context.specificationItemsGetItems = initialData.specificationItems.items
      context.failedDeviationItemRefs.add('local:41')
      context.renderRequirementsSpecificationDetailClient(initialData)
      context.selectRequirementRows([101, -41])
      fireEvent.click(
        screen.getByRole('button', {
          name: 'deviation.requestDeviationSelected',
        }),
      )

      const dialog = await screen.findByRole('dialog', {
        name: 'deviation.requestDeviation',
      })
      expect(within(dialog).getByText('BEH0001')).toBeInTheDocument()
      expect(within(dialog).getByText('KRAV0001')).toBeInTheDocument()
      fireEvent.change(
        within(dialog).getByLabelText(/deviation\.motivation/, {
          selector: 'textarea',
        }),
        { target: { value: 'Shared motivation' } },
      )
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'deviation.newDeviation' }),
      )

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'deviation.bulkDeviationPartialFail',
      )
      expect(
        context.requirementRowCheckbox('items', 'KRAV0001'),
      ).toBeChecked()
      expect(
        context.requirementRowCheckbox('items', 'BEH0001'),
      ).not.toBeChecked()
      const deviationPosts = context.fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).startsWith('/api/specification-item-deviations/') &&
          (init as RequestInit | undefined)?.method === 'POST',
      )
      expect(deviationPosts).toHaveLength(2)
      expect(
        deviationPosts.map(([, init]) =>
          JSON.parse(String((init as RequestInit).body)),
        ),
      ).toEqual([
        { motivation: 'Shared motivation' },
        { motivation: 'Shared motivation' },
      ])
    })

    it('bounds concurrent bulk deviation requests while settling every item', async () => {
      const items = Array.from({ length: 5 }, (_, index) => ({
        ...context.initialSpecificationItem,
        id: 101 + index,
        itemRef: `lib:${31 + index}`,
        specificationItemId: 31 + index,
        uniqueId: `BEH${String(index + 1).padStart(4, '0')}`,
      }))
      context.specificationItemsGetItems = items
      let inFlight = 0
      let maxInFlight = 0
      const completeRequests: Array<() => void> = []
      context.deviationPostHandler = () =>
        new Promise(resolve => {
          inFlight += 1
          maxInFlight = Math.max(maxInFlight, inFlight)
          completeRequests.push(() => {
            inFlight -= 1
            resolve(context.okJson({ deviation: { id: 1 }, ok: true }))
          })
        })
      context.renderRequirementsSpecificationDetailClient({
        ...context.createInitialData(),
        specificationItems: context.createSpecificationItemsPage(items),
      })
      context.selectRequirementRows(items.map(item => item.id))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'deviation.requestDeviationSelected',
        }),
      )
      const dialog = await screen.findByRole('dialog', {
        name: 'deviation.requestDeviation',
      })
      fireEvent.change(
        within(dialog).getByLabelText(/deviation\.motivation/, {
          selector: 'textarea',
        }),
        { target: { value: 'Bounded motivation' } },
      )
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'deviation.newDeviation' }),
      )

      await waitFor(() => {
        expect(completeRequests).toHaveLength(4)
      })
      expect(maxInFlight).toBe(4)
      act(() => {
        for (const complete of completeRequests.splice(0, 4)) complete()
      })
      await waitFor(() => {
        expect(completeRequests).toHaveLength(1)
      })
      act(() => {
        completeRequests.shift()?.()
      })
      await waitFor(() => {
        expect(
          context.requirementRowCheckbox('items', 'BEH0001'),
      ).not.toBeChecked()
      })
      expect(maxInFlight).toBe(4)
    })

    it('bulk-updates needs references for selected requirement applications', async () => {
      context.renderRequirementsSpecificationDetailClient({
        ...context.createInitialData(),
        availableNeedsRefs: [
          {
            createdAt: '2026-04-20T10:00:00.000Z',
            description: 'Access management work',
            id: 81,
            libraryItemCount: 0,
            linkedItemCount: 0,
            specificationLocalRequirementCount: 0,
            text: 'IAM-42',
            updatedAt: '2026-04-20T10:00:00.000Z',
          },
        ],
      })

      fireEvent.click(context.requirementRowCheckbox('items', 'BEH0001'))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.assignNeedsReferenceAction',
        }),
      )
      const dialog = await screen.findByRole('dialog', {
        name: 'specification.assignNeedsReferenceTitle',
      })
      expect(within(dialog).getByText('BEH0001')).toBeInTheDocument()
      fireEvent.change(
        within(dialog).getByLabelText('specification.needsReference'),
        { target: { value: '81' } },
      )
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'common.confirm' }),
      )

      await waitFor(() => {
        expect(context.fetchMock).toHaveBeenCalledWith(
          '/api/requirements-specifications/8/items',
          expect.objectContaining({
            body: JSON.stringify({
              itemRefs: ['lib:31'],
              needsReferenceId: 81,
            }),
            method: 'PATCH',
          }),
        )
      })
    })

    it('opens contextual help in the bulk needs reference dialog', async () => {
      context.renderRequirementsSpecificationDetailClient({
        ...context.createInitialData(),
        availableNeedsRefs: [
          {
            createdAt: '2026-04-20T10:00:00.000Z',
            description: 'Access management work',
            id: 81,
            libraryItemCount: 0,
            linkedItemCount: 0,
            specificationLocalRequirementCount: 0,
            text: 'IAM-42',
            updatedAt: '2026-04-20T10:00:00.000Z',
          },
        ],
      })

      fireEvent.click(context.requirementRowCheckbox('items', 'BEH0001'))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.assignNeedsReferenceAction',
        }),
      )
      const dialog = await screen.findByRole('dialog')
      fireEvent.click(
        within(dialog).getByRole('button', {
          name: 'common.help: specification.needsReference',
        }),
      )

      expect(
        within(dialog).getByText('specification.assignNeedsReferenceHelp'),
      ).toBeInTheDocument()
      await context.waitForInitialAvailableRequirementsRefresh()
    })

    it('shows bulk needs reference response failures next to the bulk controls', async () => {
      context.bulkNeedsReferencePatchResponse = {
        body: { error: 'Could not update selected requirements' },
        ok: false,
      }
      context.renderRequirementsSpecificationDetailClient({
        ...context.createInitialData(),
        availableNeedsRefs: [
          {
            createdAt: '2026-04-20T10:00:00.000Z',
            description: 'Access management work',
            id: 81,
            libraryItemCount: 0,
            linkedItemCount: 0,
            specificationLocalRequirementCount: 0,
            text: 'IAM-42',
            updatedAt: '2026-04-20T10:00:00.000Z',
          },
        ],
      })

      fireEvent.click(context.requirementRowCheckbox('items', 'BEH0001'))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.assignNeedsReferenceAction',
        }),
      )
      const dialog = await screen.findByRole('dialog')
      fireEvent.change(
        within(dialog).getByLabelText('specification.needsReference'),
        { target: { value: '81' } },
      )
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'common.confirm' }),
      )

      await waitFor(() => {
        expect(within(dialog).getByRole('alert')).toHaveTextContent(
          'Could not update selected requirements',
        )
      })

      fireEvent.click(
        within(dialog).getByRole('button', { name: 'common.cancel' }),
      )
      expect(
        screen.getByRole('button', {
          name: 'specification.assignNeedsReferenceAction',
        }),
      ).toBeInTheDocument()
    })

    it('catches thrown bulk needs reference request errors', async () => {
      context.bulkNeedsReferencePatchError = new Error('Network unavailable')
      context.renderRequirementsSpecificationDetailClient({
        ...context.createInitialData(),
        availableNeedsRefs: [
          {
            description: null,
            id: 81,
            text: 'IAM-42',
          },
        ],
      })

      fireEvent.click(context.requirementRowCheckbox('items', 'BEH0001'))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.assignNeedsReferenceAction',
        }),
      )
      const dialog = await screen.findByRole('dialog')
      fireEvent.change(
        within(dialog).getByLabelText('specification.needsReference'),
        { target: { value: '81' } },
      )
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'common.confirm' }),
      )

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Network unavailable',
        )
      })
    })
  })
}
