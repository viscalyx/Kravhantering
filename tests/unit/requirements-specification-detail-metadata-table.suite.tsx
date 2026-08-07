import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SPECIFICATION_PRELOAD_ERROR_KEYS } from '@/lib/specifications/preload-types'
import type { SpecDetailWorkflowContext } from './requirements-specification-detail-client.suite'

export function registerMetadataTableTests(context: SpecDetailWorkflowContext) {
  const {
    createInitialData,
    createRequirementPackageCatalogPage,
    createSpecificationItemsPage,
    fetchMock,
    initialSpec,
    initialSpecificationItem,
    intlState,
    okJson,
    renderRequirementsSpecificationDetailClient,
    requirementRowNames,
    searchParamsFromPath,
    specificationApiPath,
    waitForInitialAvailableRequirementsRefresh,
  } = context
  const includedStatus = {
    color: '#22c55e',
    descriptionEn: null,
    descriptionSv: null,
    iconName: null,
    id: 2,
    nameEn: 'Included',
    nameSv: 'Inkluderad',
    sortOrder: 2,
  }

  describe('metadata, layout, filters, and item status', () => {
    it('opens and closes the specification edit dialog from the title action', async () => {
      const { container } = renderRequirementsSpecificationDetailClient()

      await waitFor(() => {
        expect(
          screen.getByRole('heading', {
            level: 1,
            name: 'Authorization and IAM',
          }),
        ).toBeInTheDocument()
      })

      const headerSummary = container.querySelector(
        '[data-specification-detail-header-summary="true"]',
      )
      const headerMetadata = container.querySelector(
        '[data-specification-detail-header-metadata="true"]',
      )
      const pageShell = container.querySelector(
        '[data-specification-detail-page-shell="true"]',
      ) as HTMLDivElement | null
      const splitPanel = container.querySelector(
        '[data-specification-detail-split-panel="true"]',
      ) as HTMLDivElement | null
      const titleRow = container.querySelector(
        '[data-specification-detail-title-row="true"]',
      )
      expect(headerSummary).toBeTruthy()
      expect(headerMetadata).toBeTruthy()
      expect(pageShell).toBeTruthy()
      expect(splitPanel).toBeTruthy()
      expect(titleRow).toBeTruthy()
      expect(pageShell?.className).toContain('xl:h-[calc(100dvh-4rem)]')
      expect(splitPanel?.className).toContain('xl:-mx-8')
      expect(splitPanel?.className).toContain('xl:flex-1')
      expect(
        screen.queryByRole('link', { name: 'nav.specifications' }),
      ).not.toBeInTheDocument()
      expect(headerSummary).toHaveTextContent('Platform')
      expect(headerSummary).toHaveTextContent('Ada Admin')
      expect(headerSummary).toHaveTextContent('SE5560000001-ada1')
      expect(headerSummary).toHaveTextContent('Program')
      expect(headerSummary).toHaveTextContent('Shared IAM business case')
      expect(headerSummary).not.toHaveTextContent(
        'specification.businessNeedsReference',
      )
      expect(headerSummary).toHaveClass('xl:grid')
      expect(headerSummary).toHaveClass(
        'xl:grid-cols-[minmax(40vw,1fr)_minmax(0,1fr)]',
      )
      expect(headerMetadata).not.toHaveTextContent('Shared IAM business case')
      expect(headerMetadata).toHaveClass('grid-flow-col')
      expect(headerMetadata).toHaveClass('auto-cols-[minmax(12rem,1fr)]')
      expect(headerMetadata).toHaveClass('overflow-x-auto')
      expect(headerMetadata).toHaveClass('xl:auto-cols-fr')
      expect(headerMetadata).not.toHaveClass('xl:grid-cols-3')

      const editButton = screen.getByRole('button', {
        name: /specification\.editSpecification/i,
      })
      expect(editButton).toHaveAttribute('aria-expanded', 'false')
      expect(editButton).toHaveAttribute(
        'data-developer-mode-name',
        'detail action',
      )
      expect(editButton).toHaveAttribute(
        'data-developer-mode-context',
        'requirements specification detail',
      )
      expect(editButton).toHaveAttribute(
        'data-developer-mode-value',
        'edit specification',
      )
      expect(titleRow).toContainElement(
        screen.getByRole('heading', {
          level: 1,
          name: 'Authorization and IAM',
        }),
      )
      expect(titleRow).toContainElement(editButton)

      fireEvent.click(editButton)

      expect(editButton).toHaveAttribute('aria-expanded', 'true')
      const dialog = screen.getByRole('dialog', {
        name: /specification\.editSpecification/i,
      })
      expect(
        within(dialog).getByRole('textbox', { name: /specification\.name/ }),
      ).toHaveValue('Authorization and IAM')

      const form = document.body.querySelector(
        '[data-developer-mode-name="crud form"][data-developer-mode-context="requirements specification detail"]',
      )
      expect(form).toHaveAttribute('data-developer-mode-value', 'edit')

      fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))

      await waitFor(() => {
        expect(
          screen.queryByRole('textbox', { name: /specification\.name/ }),
        ).not.toBeInTheDocument()
      })
      expect(editButton).toHaveAttribute('aria-expanded', 'false')
    })

    it('saves specification metadata from the title edit action and refreshes it', async () => {
      renderRequirementsSpecificationDetailClient()
      const initialMetadataGetCount = fetchMock.mock.calls.filter(
        ([url, init]) =>
          url === specificationApiPath() &&
          (init as RequestInit | undefined)?.method !== 'PUT',
      ).length

      fireEvent.click(
        screen.getByRole('button', { name: 'specification.editSpecification' }),
      )
      const dialog = await screen.findByRole('dialog', {
        name: 'specification.editSpecification',
      })
      fireEvent.change(
        within(dialog).getByRole('textbox', { name: /specification\.name/ }),
        { target: { value: 'Updated specification name' } },
      )
      fireEvent.click(
        within(dialog).getByRole('button', { name: /common\.save/i }),
      )

      await waitFor(() => {
        const putCall = fetchMock.mock.calls.find(
          ([url, init]) =>
            url === specificationApiPath() &&
            (init as RequestInit | undefined)?.method === 'PUT',
        )
        expect(
          JSON.parse(String((putCall?.[1] as RequestInit | undefined)?.body)),
        ).toEqual(
          expect.objectContaining({ name: 'Updated specification name' }),
        )
      })
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', {
            name: 'specification.editSpecification',
          }),
        ).toBeNull(),
      )
      await waitFor(() => {
        const metadataGetCount = fetchMock.mock.calls.filter(
          ([url, init]) =>
            url === specificationApiPath() &&
            (init as RequestInit | undefined)?.method !== 'PUT',
        ).length
        expect(metadataGetCount).toBeGreaterThan(initialMetadataGetCount)
        expect(
          screen.getByRole('heading', {
            level: 1,
            name: 'Updated specification name',
          }),
        ).toBeInTheDocument()
      })
    })

    it('moves to the not-found state when metadata disappears during an edit refresh', async () => {
      context.specificationMetaReturnsNotFound = true
      renderRequirementsSpecificationDetailClient()
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.editSpecification' }),
      )
      const dialog = await screen.findByRole('dialog', {
        name: 'specification.editSpecification',
      })
      fireEvent.change(
        within(dialog).getByRole('textbox', { name: /specification\.name/ }),
        { target: { value: 'Specification awaiting removal' } },
      )
      fireEvent.click(
        within(dialog).getByRole('button', { name: /common\.save/i }),
      )

      expect(
        await screen.findByText('specification.specificationNotFound'),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('link', {
          name: /specification\.backToSpecifications/,
        }),
      ).toHaveAttribute('href', '/specifications')
    })

    it('does not fail open when specification permissions are missing', async () => {
      const { permissions: omittedPermissions, ...specWithoutPermissions } =
        initialSpec
      void omittedPermissions

      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        spec: specWithoutPermissions,
      })

      await waitFor(() => {
        expect(
          screen.getByRole('heading', {
            level: 1,
            name: 'Authorization and IAM',
          }),
        ).toBeInTheDocument()
      })

      expect(
        screen.queryByRole('button', {
          name: /specification\.editSpecification/i,
        }),
      ).not.toBeInTheDocument()
    })

    it('renders a minimal Swedish read-only specification without optional metadata', async () => {
      intlState.locale = 'sv'
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        availableNeedsRefs: [
          {
            createdAt: '',
            description: 'Beskrivning',
            id: 81,
            libraryItemCount: 0,
            linkedItemCount: undefined,
            specificationLocalRequirementCount: 0,
            text: 'Behov',
            updatedAt: '',
          },
        ],
        spec: {
          ...initialSpec,
          businessNeedsReference: null,
          governanceObjectType: null,
          implementationType: null,
          lifecycleStatus: null,
          permissions: {
            canEditContent: false,
            canManageAssignments: false,
            canReviewDecisions: false,
            canUseAi: false,
          },
          responsibleDisplayName: 'Readonly Owner',
          responsibleHsaId: '',
        },
      })

      expect(
        screen.queryByRole('button', {
          name: 'specification.editSpecification',
        }),
      ).toBeNull()
      expect(screen.queryByText('Shared IAM business case')).toBeNull()
      expect(screen.getByText('Readonly Owner')).toBeInTheDocument()
      expect(screen.queryByText('SE5560000001-ada1')).toBeNull()
      fireEvent.click(
        screen.getByRole('tab', { name: /specification\.needsReferences/ }),
      )
      expect(screen.getByText('Beskrivning')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', {
          name: 'specification.newNeedsReference',
        }),
      ).toBeNull()
      await waitForInitialAvailableRequirementsRefresh()
    })

    it('shows the not-found state with a partial-data warning when specification metadata is absent', async () => {
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        errors: [{ key: 'specification', message: 'Metadata unavailable' }],
        spec: null,
      })

      expect(
        screen.getByText('specification.partialDataLoadWarning'),
      ).toHaveAttribute('role', 'status')
      expect(
        screen.getByText('specification.specificationNotFound'),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('link', {
          name: /specification\.backToSpecifications/,
        }),
      ).toHaveAttribute('href', '/specifications')
      await waitForInitialAvailableRequirementsRefresh()
    })

    it('does not show a read-only notice for assignment-only managers', async () => {
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        spec: {
          ...initialSpec,
          permissions: {
            canEditContent: false,
            canManageAssignments: true,
            canReviewDecisions: false,
            canUseAi: false,
          },
        },
      })

      await waitFor(() => {
        expect(
          screen.getByRole('heading', {
            level: 1,
            name: 'Authorization and IAM',
          }),
        ).toBeInTheDocument()
      })

      expect(
        screen.getByRole('button', {
          name: /specification\.editSpecification/i,
        }),
      ).toBeInTheDocument()
      expect(screen.queryByText('specification.readOnlyNotice')).toBeNull()
    })

    it('hides create actions but keeps output actions for read-only kravunderlag detail users', async () => {
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        spec: {
          ...initialSpec,
          permissions: {
            canEditContent: false,
            canManageAssignments: false,
            canReviewDecisions: false,
            canUseAi: false,
          },
        },
      })
      await waitForInitialAvailableRequirementsRefresh()

      expect(
        within(context.requirementRow('items', 'BEH0001')).queryByRole(
          'checkbox',
          { name: 'common.selectRow' },
        ),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'common.moreActions' }),
      ).toBeInTheDocument()
      const outputMenu = context.openTableActionMenu('common.moreActions')
      expect(within(outputMenu).getAllByRole('menuitem')).toHaveLength(3)
      expect(within(outputMenu).getAllByRole('separator')).toHaveLength(1)
      expect(
        within(outputMenu).queryByRole('menuitem', {
          name: 'specification.aiGenerate',
        }),
      ).not.toBeInTheDocument()
      expect(
        within(outputMenu).queryByRole('menuitem', {
          name: 'specification.importLocalRequirements',
        }),
      ).not.toBeInTheDocument()
    })

    it('shows direct create and more actions but no columns action in the editable empty state', async () => {
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        specificationItems: createSpecificationItemsPage([]),
      })

      await waitFor(() => {
        expect(
          screen.getByRole('button', {
            name: 'specification.newLocalRequirement',
          }),
        ).toBeInTheDocument()
      })

      expect(
        screen.getByRole('button', { name: 'common.moreActions' }),
      ).toBeInTheDocument()
      expect(
        context.queryRequirementColumnButton('items'),
      ).not.toBeInTheDocument()

      const menu = context.openTableActionMenu('common.moreActions')

      expect(
        within(menu).getByRole('menuitem', {
          name: 'specification.aiGenerate',
        }),
      ).toBeInTheDocument()
      expect(
        within(menu).getByRole('menuitem', {
          name: 'specification.importLocalRequirements',
        }),
      ).toBeInTheDocument()
      expect(screen.queryByRole('separator')).not.toBeInTheDocument()
    })

    it('shows no empty-state actions to a read-only user', async () => {
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        spec: {
          ...initialSpec,
          permissions: {
            canEditContent: false,
            canManageAssignments: false,
            canReviewDecisions: false,
            canUseAi: false,
          },
        },
        specificationItems: createSpecificationItemsPage([]),
      })

      expect(screen.getByText('specification.noItems')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', {
          name: 'specification.newLocalRequirement',
        }),
      ).toBeNull()
      expect(
        screen.queryByRole('button', { name: 'common.moreActions' }),
      ).toBeNull()
      await waitForInitialAvailableRequirementsRefresh()
    })

    it('ignores stale and invalid stored detail column ids', async () => {
      window.localStorage.setItem(
        'requirements-specifications.visibleColumns.left.v2',
        JSON.stringify(['uniqueId']),
      )
      window.localStorage.setItem(
        'requirements-specifications.visibleColumns.left.v3',
        JSON.stringify(['uniqueId', 'unknownSpecificationColumn']),
      )

      renderRequirementsSpecificationDetailClient()
      await waitForInitialAvailableRequirementsRefresh()

      context.changeRequirementColumns('items')
      await waitFor(() => {
        const stored = window.localStorage.getItem(
          'requirement-specifications.visibleColumns.left.v1',
        )
        expect(stored).not.toBeNull()
        expect(stored).not.toContain('unknownSpecificationColumn')
      })
      expect(context.requirementsTable('items')).toHaveTextContent('BEH0001')
    })

    it('passes context-specific reset defaults to the detail tables', async () => {
      renderRequirementsSpecificationDetailClient()
      await waitForInitialAvailableRequirementsRefresh()

      context.changeRequirementColumns('items')
      context.changeRequirementColumns('available')
      await waitFor(() => {
        expect(
          window.localStorage.getItem(
            'requirement-specifications.visibleColumns.left.v1',
          ),
        ).not.toBeNull()
        expect(
          window.localStorage.getItem(
            'requirement-specifications.visibleColumns.right.v1',
          ),
        ).not.toBeNull()
      })
    })

    it('expands both tables, refreshes details, updates status, and persists columns', async () => {
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        specificationItemStatuses: [
          {
            color: '#22c55e',
            descriptionEn: null,
            descriptionSv: null,
            iconName: null,
            id: 2,
            nameEn: 'Included',
            nameSv: 'Inkluderad',
            sortOrder: 2,
          },
        ],
      })
      await waitForInitialAvailableRequirementsRefresh()

      fireEvent.click(context.requirementRow('items', 'BEH0001'))
      expect(
        await screen.findByText('Requirement detail 101'),
      ).toBeInTheDocument()
      const itemsFetchCountBeforeRefresh = fetchMock.mock.calls.filter(
        ([input]) => String(input).startsWith(specificationApiPath('/items?')),
      ).length
      fireEvent.click(
        screen.getByRole('button', { name: 'refresh requirement detail' }),
      )
      await waitFor(() => {
        expect(
          fetchMock.mock.calls.filter(([input]) =>
            String(input).startsWith(specificationApiPath('/items?')),
          ).length,
        ).toBeGreaterThan(itemsFetchCountBeforeRefresh)
      })
      context.toggleRequirementColumn('items', 'specificationItemStatus')
      fireEvent.change(context.requirementStatusSelect('BEH0001'), {
        target: { value: '2' },
      })
      context.changeRequirementColumns('items')

      fireEvent.click(context.requirementRow('available', 'IAM0202'))
      expect(
        await screen.findByText('Requirement detail 202'),
      ).toBeInTheDocument()
      context.changeRequirementColumns('available')
      fireEvent.click(context.requirementRow('available', 'IAM0202'))
      expect(
        screen.queryByText('Requirement detail 202'),
      ).not.toBeInTheDocument()

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/requirements-specifications/8/items/lib%3A31',
          expect.objectContaining({ method: 'PATCH' }),
        )
      })
      await waitFor(() => {
        expect(
          window.localStorage.getItem(
            'requirement-specifications.visibleColumns.left.v1',
          ),
        ).not.toBeNull()
        expect(
          window.localStorage.getItem(
            'requirement-specifications.visibleColumns.right.v1',
          ),
        ).not.toBeNull()
      })
    })

    it('restores the original item when a usage-status update fails', async () => {
      context.itemStatusPatchOk = false
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        specificationItemStatuses: [
          {
            color: '#22c55e',
            descriptionEn: null,
            descriptionSv: null,
            iconName: null,
            id: 2,
            nameEn: 'Included',
            nameSv: 'Inkluderad',
            sortOrder: 2,
          },
        ],
      })

      context.toggleRequirementColumn('items', 'specificationItemStatus')
      fireEvent.change(context.requirementStatusSelect('BEH0001'), {
        target: { value: '2' },
      })

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/requirements-specifications/8/items/lib%3A31',
          expect.objectContaining({ method: 'PATCH' }),
        )
      })
      expect(context.requirementsTable('items')).toHaveTextContent('BEH0001')
    })

    it('ignores a usage-status choice that is not in the specification catalog', async () => {
      renderRequirementsSpecificationDetailClient()
      await waitForInitialAvailableRequirementsRefresh()
      context.toggleRequirementColumn('items', 'specificationItemStatus')
      const statusSelect = within(
        context.requirementRow('items', 'BEH0001'),
      ).getByRole('combobox', {
        name: 'requirement.specificationItemStatus',
      })
      expect(statusSelect).toHaveProperty('selectedIndex', -1)
      expect(within(statusSelect).queryAllByRole('option')).toHaveLength(0)

      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).includes('/items/lib%3A31') &&
            (init as RequestInit | undefined)?.method === 'PATCH',
        ),
      ).toBe(false)
      expect(context.requirementsTable('items')).toHaveTextContent('BEH0001')
    })

    it('submits an explicit needs-reference clear even for an unknown item', async () => {
      const missingItem = {
        ...initialSpecificationItem,
        itemRef: 'lib:missing',
        needsReference: 'Stale reference',
        needsReferenceId: 40,
        uniqueId: 'MISSING001',
      }
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        specificationItems: createSpecificationItemsPage([missingItem]),
      })
      fireEvent.change(
        context.requirementNeedsReferenceSelect('items', 'MISSING001'),
        { target: { value: '' } },
      )

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          `/api/requirements-specifications/8/items/${encodeURIComponent('lib:missing')}`,
          expect.objectContaining({
            body: JSON.stringify({ needsReferenceId: null }),
            method: 'PATCH',
          }),
        )
      })
      expect(context.requirementsTable('items')).toHaveTextContent('MISSING001')
    })

    it('expands and refreshes a specification-local requirement detail', async () => {
      const localItem = {
        ...initialSpecificationItem,
        id: 401,
        isSpecificationLocal: true,
        itemRef: 'local:401',
        kind: 'specificationLocal' as const,
        specificationItemId: undefined,
        specificationLocalRequirementId: 401,
        uniqueId: 'KRAV0001',
      }
      context.specificationItemsGetItems = [localItem]
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        specificationItems: createSpecificationItemsPage([localItem]),
      })

      fireEvent.click(context.requirementRow('items', 'KRAV0001'))
      const localDetail = await screen.findByRole('button', {
        name: 'Local requirement detail 401',
      })
      const itemsFetchCountBeforeRefresh = fetchMock.mock.calls.filter(
        ([input]) => String(input).startsWith(specificationApiPath('/items?')),
      ).length
      fireEvent.click(localDetail)

      await waitFor(() => {
        expect(
          fetchMock.mock.calls.filter(([input]) =>
            String(input).startsWith(specificationApiPath('/items?')),
          ).length,
        ).toBeGreaterThan(itemsFetchCountBeforeRefresh)
      })
    })

    it('shows generic requirement detail when an application has no persisted membership id', async () => {
      const unresolvedItem = {
        ...initialSpecificationItem,
        itemRef: 'external:101',
        specificationItemId: undefined,
      }
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        specificationItems: createSpecificationItemsPage([unresolvedItem]),
      })

      fireEvent.click(context.requirementRow('items', 'BEH0001'))
      expect(screen.getByText('Requirement detail 101')).toBeInTheDocument()
      fireEvent.click(context.requirementRow('items', 'BEH0001'))
      expect(
        screen.queryByText('Requirement detail 101'),
      ).not.toBeInTheDocument()
      await waitForInitialAvailableRequirementsRefresh()
    })

    it('loads persisted detail columns after the hydration-safe default render', async () => {
      const storedLeftColumns = [
        'uniqueId',
        'description',
        'area',
        'needsReference',
        'status',
      ]
      const storedRightColumns = [
        'uniqueId',
        'description',
        'area',
        'status',
        'type',
      ]
      window.localStorage.setItem(
        'requirement-specifications.visibleColumns.left.v1',
        JSON.stringify(storedLeftColumns),
      )
      window.localStorage.setItem(
        'requirement-specifications.visibleColumns.right.v1',
        JSON.stringify(storedRightColumns),
      )

      renderRequirementsSpecificationDetailClient()
      await waitForInitialAvailableRequirementsRefresh()
      expect(context.requirementsTable('items')).toHaveTextContent('BEH0001')
      expect(context.requirementsTable('available')).toHaveTextContent(
        'IAM0202',
      )
      expect(
        window.localStorage.getItem(
          'requirement-specifications.visibleColumns.left.v1',
        ),
      ).toBe(JSON.stringify(storedLeftColumns))
      expect(
        window.localStorage.getItem(
          'requirement-specifications.visibleColumns.right.v1',
        ),
      ).toBe(JSON.stringify(storedRightColumns))
    })

    it('uses inline top rails and embeds the split panel tabs in sticky headers', async () => {
      renderRequirementsSpecificationDetailClient()

      await waitForInitialAvailableRequirementsRefresh()

      expect(
        screen.queryByRole('heading', {
          name: 'specification.itemsInSpecification',
        }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('heading', {
          name: 'specification.availableRequirements',
        }),
      ).not.toBeInTheDocument()
      const leftTabs = screen.getByRole('tablist', {
        name: 'specification.leftPanelTabs',
      })
      const rightTabs = screen.getByRole('tablist', {
        name: 'specification.rightPanelTabs',
      })

      expect(leftTabs).toBeInTheDocument()
      expect(
        within(leftTabs).getByRole('tab', {
          name: /specification\.needsReferences/,
        }),
      ).toBeInTheDocument()
      expect(
        within(rightTabs).getByRole('tab', {
          name: /specification\.availableRequirements/,
        }),
      ).toHaveAttribute('aria-controls', 'right-panel-available')
      const questionsTab = within(rightTabs).getByRole('tab', {
        name: /specification\.requirementSelectionQuestions/,
      })
      expect(questionsTab).toHaveAttribute(
        'aria-controls',
        'right-panel-questions',
      )

      fireEvent.click(questionsTab)

      await waitFor(() => {
        expect(
          screen.getByText('specificationRequirementSelection.noQuestions'),
        ).toBeInTheDocument()
      })
      const questionsPanel = screen.getByRole('tabpanel', {
        name: /specification\.requirementSelectionQuestions/,
      })

      expect(
        within(questionsPanel).getByRole('tablist', {
          name: 'specification.rightPanelTabs',
        }),
      ).toBeInTheDocument()
      expect(
        within(questionsPanel).queryByRole('heading', {
          name: 'specificationRequirementSelection.title',
        }),
      ).not.toBeInTheDocument()
      expect(context.requirementsTable('items')).toBeInTheDocument()
    })

    it('filters requirement applications when a requirement package chip is selected', async () => {
      const requirementPackages = [
        { id: 1, name: 'Mobile use' },
        { id: 2, name: 'Operations' },
      ]
      const firstItem = {
        ...initialSpecificationItem,
        requirementPackageIds: [1],
      }
      const secondItem = {
        ...initialSpecificationItem,
        id: 102,
        itemRef: 'lib:32',
        requirementPackageIds: [2],
        specificationItemId: 32,
        uniqueId: 'BEH0002',
        version: {
          ...initialSpecificationItem.version,
          description: 'Operational monitoring should be in place.',
        },
      }
      context.specificationItemsGetItems = [firstItem, secondItem]

      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        leftRequirementPackageCatalog:
          createRequirementPackageCatalogPage(requirementPackages),
        requirementPackages,
        specificationItems: createSpecificationItemsPage([
          firstItem,
          secondItem,
        ]),
      })

      await waitFor(() => {
        expect(requirementRowNames('items')).toEqual(['BEH0001', 'BEH0002'])
      })

      fireEvent.click(context.requirementPackageButton('items', 'Mobile use'))

      await waitFor(() => {
        expect(
          context.requirementPackageButton('items', 'Mobile use'),
        ).toHaveAttribute('aria-pressed', 'true')
        expect(requirementRowNames('items')).toEqual(['BEH0001'])
      })
      expect(context.requirementsTable('items')).toHaveTextContent('BEH0001')
      expect(context.requirementsTable('items')).not.toHaveTextContent(
        'BEH0002',
      )
    })

    it('refreshes requirement applications when usage-status filters change', async () => {
      const requestedStatuses: string[][] = []
      context.specificationItemsGetHandler = async url => {
        requestedStatuses.push(
          searchParamsFromPath(url).getAll('specificationItemStatusIds'),
        )
        return okJson({
          items: context.specificationItemsGetItems,
          pagination: {
            count: context.specificationItemsGetItems.length,
            hasMore: false,
            limit: 50,
            nextCursor: null,
          },
        })
      }
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        specificationItemStatuses: [includedStatus],
      })
      await waitForInitialAvailableRequirementsRefresh()
      context.toggleSpecificationItemStatusFilter('items', 'Included')

      await waitFor(() => {
        expect(requestedStatuses).toContainEqual(['2'])
      })
      context.toggleSpecificationItemStatusFilter('items', 'Included')
      await waitFor(() => {
        expect(requestedStatuses).toContainEqual([])
      })
    })

    it('keeps the item list usable when a usage-status refresh fails', async () => {
      context.specificationItemsGetHandler = async () => {
        throw 'Items unavailable'
      }
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        specificationItemStatuses: [includedStatus],
      })
      await waitForInitialAvailableRequirementsRefresh()
      context.toggleSpecificationItemStatusFilter('items', 'Included')

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'specification.loadSpecificationItemsFailed',
      )
      expect(context.requirementsTable('items')).toHaveTextContent('BEH0001')
    })

    it('uses independent compact package filters with distinct server catalogs', async () => {
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        leftRequirementPackageCatalog: createRequirementPackageCatalogPage([
          { id: 2, name: 'Specification package' },
        ]),
        requirementPackages: [
          { id: 1, name: 'Library package' },
          { id: 2, name: 'Specification package' },
        ],
      })
      await waitForInitialAvailableRequirementsRefresh()

      expect(
        context.requirementPackageButton('items', 'Specification package'),
      ).toHaveTextContent('Specification package')
      expect(
        context.queryRequirementPackageButton('items', 'Library package'),
      ).not.toBeInTheDocument()
      expect(
        context.requirementPackageButton('available', 'Library package'),
      ).toHaveTextContent('Library package')
      expect(
        context.requirementPackageButton('available', 'Specification package'),
      ).toHaveTextContent('Specification package')

      fireEvent.click(
        context.requirementPackageButton('items', 'Specification package'),
      )
      fireEvent.click(
        context.requirementPackageButton('available', 'Library package'),
      )

      await waitFor(() => {
        expect(
          context.requirementPackageButton('items', 'Specification package'),
        ).toHaveAttribute('aria-pressed', 'true')
        expect(
          context.requirementPackageButton('available', 'Library package'),
        ).toHaveAttribute('aria-pressed', 'true')
      })
    })

    it('keeps the item list usable while traversing every catalog page independently', async () => {
      let resolveSecondPage: ((value: unknown) => void) | undefined
      context.specificationRequirementPackagesGetHandler = async url => {
        expect(searchParamsFromPath(url).get('cursor')).toBe('package-page-2')
        return new Promise(resolve => {
          resolveSecondPage = resolve
        })
      }

      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        leftRequirementPackageCatalog: createRequirementPackageCatalogPage(
          [{ id: 1, name: 'First package' }],
          { hasMore: true, nextCursor: 'package-page-2' },
        ),
      })

      expect(context.requirementsTable('items')).toHaveTextContent('BEH0001')

      await act(async () => {
        resolveSecondPage?.(
          okJson({
            pagination: {
              count: 1,
              hasMore: false,
              limit: 50,
              nextCursor: null,
            },
            requirementPackages: [{ id: 51, name: 'Later package' }],
            selectedRequirementPackages: [],
          }),
        )
      })

      await waitFor(() => {
        expect(
          context.requirementPackageButton('items', 'First package'),
        ).toHaveTextContent('First package')
        expect(
          context.requirementPackageButton('items', 'Later package'),
        ).toHaveTextContent('Later package')
      })
    })

    it('distinguishes failed package catalogs from successful empty catalogs', async () => {
      const initialData = createInitialData()
      initialData.errors = [
        {
          key: SPECIFICATION_PRELOAD_ERROR_KEYS.requirementPackages,
          message: 'right failed',
        },
        {
          key: SPECIFICATION_PRELOAD_ERROR_KEYS.specificationRequirementPackages,
          message: 'left failed',
        },
      ]

      renderRequirementsSpecificationDetailClient(initialData)
      await waitForInitialAvailableRequirementsRefresh()

      expect(
        screen.getByText('specification.partialDataLoadWarning'),
      ).toHaveAttribute('role', 'status')
      expect(
        context.queryRequirementPackageButton('items'),
      ).not.toBeInTheDocument()
      expect(
        context.queryRequirementPackageButton('available'),
      ).not.toBeInTheDocument()
    })

    it('fails a malformed preloaded package continuation without issuing an ambiguous request', async () => {
      const initialData = createInitialData()
      initialData.leftRequirementPackageCatalog =
        createRequirementPackageCatalogPage([], {
          hasMore: true,
          nextCursor: null,
        })
      renderRequirementsSpecificationDetailClient(initialData)

      await waitFor(() => {
        expect(
          screen.getByText('specification.loadRequirementPackagesFailed'),
        ).toBeInTheDocument()
      })
      expect(
        fetchMock.mock.calls.some(([input]) =>
          (typeof input === 'string' ? input : input.url).startsWith(
            specificationApiPath('/requirement-packages'),
          ),
        ),
      ).toBe(false)
    })

    it('fails a package catalog page whose continuation cursor is missing', async () => {
      const initialData = createInitialData()
      initialData.leftRequirementPackageCatalog =
        createRequirementPackageCatalogPage([], {
          hasMore: true,
          nextCursor: 'catalog-page-2',
        })
      context.specificationRequirementPackagesGetHandler = async () =>
        okJson({
          pagination: { hasMore: true, nextCursor: null },
          requirementPackages: [],
          selectedRequirementPackages: [],
        })
      renderRequirementsSpecificationDetailClient(initialData)

      await waitFor(() => {
        expect(
          screen.getByText('specification.loadRequirementPackagesFailed'),
        ).toBeInTheDocument()
      })
    })

    it('fails a package catalog whose continuation cursor repeats', async () => {
      const initialData = createInitialData()
      initialData.leftRequirementPackageCatalog =
        createRequirementPackageCatalogPage([], {
          hasMore: true,
          nextCursor: 'catalog-repeat',
        })
      let requestCount = 0
      context.specificationRequirementPackagesGetHandler = async () => {
        requestCount += 1
        return okJson({
          pagination: { hasMore: true, nextCursor: 'catalog-repeat' },
          requirementPackages: [],
          selectedRequirementPackages: [],
        })
      }
      renderRequirementsSpecificationDetailClient(initialData)

      await waitFor(() => {
        expect(
          screen.getByText('specification.loadRequirementPackagesFailed'),
        ).toBeInTheDocument()
      })
      expect(requestCount).toBe(2)
    })

    it('prunes a resolved package while preserving a selection made during refresh', async () => {
      const packageOption = { id: 9, name: 'Current package' }
      const replacementPackageOption = { id: 10, name: 'Replacement package' }
      const item = {
        ...initialSpecificationItem,
        requirementPackageIds: [9],
      }
      const remainingItem = {
        ...initialSpecificationItem,
        id: 102,
        itemRef: 'library:32',
        requirementPackageIds: [10],
        uniqueId: 'REQ-002',
      }
      context.specificationItemsGetItems = [item, remainingItem]
      let resolveCatalogRefresh: (() => void) | undefined
      context.specificationItemsGetHandler = async url => {
        const packageIds = searchParamsFromPath(url)
          .getAll('requirementPackageIds')
          .map(Number)
        const items =
          packageIds.length > 0
            ? context.specificationItemsGetItems.filter(candidate =>
                candidate.requirementPackageIds?.some(id =>
                  packageIds.includes(id),
                ),
              )
            : context.specificationItemsGetItems
        return okJson({
          items,
          pagination: {
            count: items.length,
            hasMore: false,
            limit: 50,
            nextCursor: null,
          },
        })
      }
      context.specificationRequirementPackagesGetHandler = async url => {
        return new Promise(resolve => {
          expect(searchParamsFromPath(url).getAll('includeIds')).toEqual([
            '9',
            '10',
          ])
          const response = okJson({
            pagination: {
              count: 1,
              hasMore: false,
              limit: 50,
              nextCursor: null,
            },
            requirementPackages: [replacementPackageOption],
            selectedRequirementPackages: [replacementPackageOption],
          })
          resolveCatalogRefresh = () => resolve(response)
        })
      }

      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        leftRequirementPackageCatalog: createRequirementPackageCatalogPage([
          packageOption,
          replacementPackageOption,
        ]),
        requirementPackages: [packageOption],
        specificationItems: createSpecificationItemsPage([item, remainingItem]),
      })
      await waitForInitialAvailableRequirementsRefresh()

      fireEvent.click(
        context.requirementPackageButton('items', packageOption.name),
      )
      await waitFor(() => {
        expect(
          context.requirementPackageButton('items', packageOption.name),
        ).toHaveAttribute('aria-pressed', 'true')
      })
      fireEvent.click(
        context.requirementPackageButton(
          'items',
          replacementPackageOption.name,
        ),
      )
      await waitFor(() => {
        expect(
          context.requirementPackageButton(
            'items',
            replacementPackageOption.name,
          ),
        ).toHaveAttribute('aria-pressed', 'true')
      })

      fireEvent.click(context.requirementRowCheckbox('items', 'BEH0001'))
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.removeSelected' }),
      )
      fireEvent.click(
        await screen.findByRole('button', { name: 'common.delete' }),
      )

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/requirements-specifications/8/items',
          expect.objectContaining({ method: 'DELETE' }),
        )
        expect(resolveCatalogRefresh).toBeTypeOf('function')
      })
      act(() => resolveCatalogRefresh?.())
      await waitFor(() => {
        expect(
          context.queryRequirementPackageButton('items', packageOption.name),
        ).not.toBeInTheDocument()
        expect(
          context.requirementPackageButton(
            'items',
            replacementPackageOption.name,
          ),
        ).toHaveAttribute('aria-pressed', 'true')
        expect(
          fetchMock.mock.calls.some(([input]) => {
            const url = typeof input === 'string' ? input : input.url
            if (!url.startsWith(specificationApiPath('/items?'))) return false
            return (
              searchParamsFromPath(url)
                .getAll('requirementPackageIds')
                .join(',') === '10'
            )
          }),
        ).toBe(true)
        expect(requirementRowNames('items')).toEqual(['REQ-002'])
      })
      expect(
        context.requirementPackageButton('available', packageOption.name),
      ).toHaveTextContent(packageOption.name)
    })

    it('marks a failed package catalog refresh as failed without treating stale options as loaded', async () => {
      const packageOption = { id: 9, name: 'Stale package' }
      const item = {
        ...initialSpecificationItem,
        requirementPackageIds: [9],
      }
      const remainingItem = {
        ...initialSpecificationItem,
        id: 102,
        itemRef: 'lib:32',
        requirementPackageIds: [],
        specificationItemId: 32,
        uniqueId: 'BEH0002',
      }
      context.specificationItemsGetItems = [item, remainingItem]
      context.specificationItemsGetHandler = async () =>
        okJson({
          items: context.specificationItemsGetItems,
          pagination: {
            count: context.specificationItemsGetItems.length,
            hasMore: false,
            limit: 50,
            nextCursor: null,
          },
        })
      context.specificationRequirementPackagesGetHandler = async () => ({
        json: async () => ({ error: 'facet unavailable' }),
        ok: false,
      })

      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        leftRequirementPackageCatalog: createRequirementPackageCatalogPage([
          packageOption,
        ]),
        requirementPackages: [packageOption],
        specificationItems: createSpecificationItemsPage([item, remainingItem]),
      })
      await waitForInitialAvailableRequirementsRefresh()

      fireEvent.click(context.requirementRowCheckbox('items', 'BEH0001'))
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.removeSelected' }),
      )
      fireEvent.click(
        await screen.findByRole('button', { name: 'common.delete' }),
      )

      await waitFor(() => {
        expect(
          context.queryRequirementPackageButton('items', packageOption.name),
        ).not.toBeInTheDocument()
        expect(
          screen.getByText('specification.loadRequirementPackagesFailed'),
        ).toBeInTheDocument()
      })
    })

    it('sorts the complete requirement application list in both directions', async () => {
      const firstItem = {
        ...initialSpecificationItem,
        version: {
          ...initialSpecificationItem.version,
          description: 'Zulu requirement',
        },
      }
      const secondItem = {
        ...initialSpecificationItem,
        id: 102,
        itemRef: 'lib:32',
        specificationItemId: 32,
        uniqueId: 'BEH0002',
        version: {
          ...initialSpecificationItem.version,
          description: 'Alpha requirement',
        },
      }
      context.specificationItemsGetItems = [firstItem, secondItem]

      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        specificationItems: createSpecificationItemsPage([
          firstItem,
          secondItem,
        ]),
      })

      await waitFor(() => {
        expect(requirementRowNames('items')).toEqual(['BEH0001', 'BEH0002'])
      })

      fireEvent.click(context.requirementSortButton('items', 'description'))
      await waitFor(() => {
        expect(requirementRowNames('items')).toEqual(['BEH0002', 'BEH0001'])
      })

      fireEvent.click(context.requirementSortButton('items', 'description'))
      await waitFor(() => {
        expect(requirementRowNames('items')).toEqual(['BEH0001', 'BEH0002'])
      })
    })
  })
}
