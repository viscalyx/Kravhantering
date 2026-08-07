import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SpecDetailWorkflowContext } from './requirements-specification-detail-client.suite'

export function registerAddingLocalTests(context: SpecDetailWorkflowContext) {
  const {
    createInitialData,
    fetchMock,
    initialAvailableRequirement,
    initialSpecificationItem,
    okJson,
    renderRequirementsSpecificationDetailClient,
    requirementRowNames,
    searchParamsFromPath,
    specificationApiPath,
    waitForInitialAvailableRequirementsRefresh,
  } = context

  describe('adding, importing, and creating requirement applications', () => {
    it('keeps the add dialog open and shows inline errors when adding requirements fails', async () => {
      context.addRequirementsResponse = {
        body: {},
        ok: false,
      }

      renderRequirementsSpecificationDetailClient()

      await waitFor(() => {
        expect(
          screen.getByRole('heading', {
            level: 1,
            name: 'Authorization and IAM',
          }),
        ).toBeInTheDocument()
      })

      fireEvent.click(context.requirementRowCheckbox('available', 'IAM0202'))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.addSelectedToSpecification',
        }),
      )

      const dialog = await screen.findByRole('dialog')

      fireEvent.click(
        screen.getByRole('button', { name: 'specification.confirmAdd' }),
      )

      expect(await screen.findByRole('alert')).toHaveTextContent('common.error')
      expect(dialog).toBeInTheDocument()
    })

    it('adds selected requirements with an existing needs reference', async () => {
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        availableNeedsRefs: [
          {
            createdAt: '',
            description: 'Existing context',
            id: 81,
            libraryItemCount: 0,
            linkedItemCount: 0,
            specificationLocalRequirementCount: 0,
            text: 'IAM-42',
            updatedAt: '',
          },
        ],
      })
      fireEvent.click(context.requirementRowCheckbox('available', 'IAM0202'))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.addSelectedToSpecification',
        }),
      )
      fireEvent.change(screen.getByLabelText('specification.addNeedsRef'), {
        target: { value: '81' },
      })
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.confirmAdd' }),
      )

      await waitFor(() => {
        const postCall = fetchMock.mock.calls.find(
          ([url, init]) =>
            url === specificationApiPath('/items') &&
            (init as RequestInit | undefined)?.method === 'POST',
        )
        expect(
          JSON.parse(String((postCall?.[1] as RequestInit | undefined)?.body)),
        ).toEqual({ needsReferenceId: 81, requirementIds: [202] })
      })
    })

    it('adds selected requirements without a needs reference', async () => {
      renderRequirementsSpecificationDetailClient()
      fireEvent.click(context.requirementRowCheckbox('available', 'IAM0202'))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.addSelectedToSpecification',
        }),
      )
      const help = await screen.findByRole('button', {
        name: 'common.help: specification.addNeedsRef',
      })
      fireEvent.click(help)
      expect(
        screen.getByText('specification.addNeedsRefHelp'),
      ).toBeInTheDocument()
      fireEvent.click(help)
      expect(screen.queryByText('specification.addNeedsRefHelp')).toBeNull()
      const needsReferenceSelect = screen.getByLabelText(
        'specification.addNeedsRef',
      )
      fireEvent.change(needsReferenceSelect, { target: { value: 'new' } })
      expect(
        screen.getByLabelText('specification.addNeedsRefTextLabel'),
      ).toBeInTheDocument()
      fireEvent.change(needsReferenceSelect, { target: { value: 'none' } })
      expect(
        screen.queryByLabelText('specification.addNeedsRefTextLabel'),
      ).toBeNull()
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.confirmAdd' }),
      )

      await waitFor(() => {
        const postCall = fetchMock.mock.calls.find(
          ([url, init]) =>
            url === specificationApiPath('/items') &&
            (init as RequestInit | undefined)?.method === 'POST',
        )
        expect(
          JSON.parse(String((postCall?.[1] as RequestInit | undefined)?.body)),
        ).toEqual({ requirementIds: [202] })
      })
    })

    it('adds selected requirements with a newly described needs reference', async () => {
      renderRequirementsSpecificationDetailClient()
      fireEvent.click(context.requirementRowCheckbox('available', 'IAM0202'))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.addSelectedToSpecification',
        }),
      )
      fireEvent.change(screen.getByLabelText('specification.addNeedsRef'), {
        target: { value: 'new' },
      })
      fireEvent.change(
        screen.getByLabelText('specification.addNeedsRefTextLabel'),
        { target: { value: '  IAM-99  ' } },
      )
      fireEvent.change(
        screen.getByLabelText('specification.needsReferenceDescription'),
        { target: { value: '  Procurement decision  ' } },
      )
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.confirmAdd' }),
      )

      await waitFor(() => {
        const postCall = fetchMock.mock.calls.find(
          ([url, init]) =>
            url === specificationApiPath('/items') &&
            (init as RequestInit | undefined)?.method === 'POST',
        )
        expect(
          JSON.parse(String((postCall?.[1] as RequestInit | undefined)?.body)),
        ).toEqual({
          needsReferenceDescription: 'Procurement decision',
          needsReferenceText: 'IAM-99',
          requirementIds: [202],
        })
      })
    })

    it('closes the add dialog when Escape is pressed inside the panel', async () => {
      renderRequirementsSpecificationDetailClient()

      await waitFor(() => {
        expect(
          screen.getByRole('heading', {
            level: 1,
            name: 'Authorization and IAM',
          }),
        ).toBeInTheDocument()
      })

      fireEvent.click(context.requirementRowCheckbox('available', 'IAM0202'))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.addSelectedToSpecification',
        }),
      )

      await screen.findByRole('dialog')
      fireEvent.change(screen.getByLabelText('specification.addNeedsRef'), {
        target: { value: 'new' },
      })

      fireEvent.keyDown(
        screen.getByLabelText('specification.addNeedsRefTextLabel'),
        {
          key: 'Escape',
        },
      )

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })

    it('disables needs-reference inputs and help toggles while add is submitting', async () => {
      renderRequirementsSpecificationDetailClient()

      await waitFor(() => {
        expect(
          screen.getByRole('heading', {
            level: 1,
            name: 'Authorization and IAM',
          }),
        ).toBeInTheDocument()
      })

      fireEvent.click(context.requirementRowCheckbox('available', 'IAM0202'))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.addSelectedToSpecification',
        }),
      )

      await screen.findByRole('dialog')
      fireEvent.change(screen.getByLabelText('specification.addNeedsRef'), {
        target: { value: 'new' },
      })

      const select = screen.getByLabelText('specification.addNeedsRef')
      const textarea = screen.getByLabelText(
        'specification.addNeedsRefTextLabel',
      )
      const needsRefHelpButton = screen.getByRole('button', {
        name: 'common.help: specification.addNeedsRef',
      })
      const needsRefTextHelpButton = screen.getByRole('button', {
        name: 'common.help: specification.addNeedsRefTextLabel',
      })

      let resolvePost:
        | ((value: { json: () => Promise<unknown>; ok: boolean }) => void)
        | undefined
      fetchMock.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolvePost = resolve
          }),
      )

      fireEvent.click(
        screen.getByRole('button', { name: 'specification.confirmAdd' }),
      )

      await waitFor(() => {
        expect(select).toBeDisabled()
        expect(textarea).toBeDisabled()
        expect(needsRefHelpButton).toBeDisabled()
        expect(needsRefTextHelpButton).toBeDisabled()
      })
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      await act(async () => {
        resolvePost?.({
          json: async () => ({ ok: true }),
          ok: true,
        })
      })
    })

    it('keeps the add dialog open when a post-add refresh fails', async () => {
      renderRequirementsSpecificationDetailClient()

      await waitFor(() => {
        expect(
          screen.getByRole('heading', {
            level: 1,
            name: 'Authorization and IAM',
          }),
        ).toBeInTheDocument()
      })

      fireEvent.click(context.requirementRowCheckbox('available', 'IAM0202'))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.addSelectedToSpecification',
        }),
      )

      const dialog = await screen.findByRole('dialog')
      context.failNextSpecificationItemsFetch = true

      fireEvent.click(
        screen.getByRole('button', { name: 'specification.confirmAdd' }),
      )

      expect(await screen.findByText('common.error')).toHaveAttribute(
        'role',
        'alert',
      )
      expect(dialog).toBeInTheDocument()
    })

    it('updates the added-requirements notice when the left filters reveal the requirement', async () => {
      const addedItem = {
        ...initialSpecificationItem,
        id: initialAvailableRequirement.id,
        itemRef: 'lib:202',
        specificationItemId: 202,
        uniqueId: initialAvailableRequirement.uniqueId,
      }
      context.specificationItemsGetHandler = async url => {
        const matchesAddedRequirement =
          searchParamsFromPath(url).get('uniqueIdSearch') ===
          initialAvailableRequirement.uniqueId
        const items = matchesAddedRequirement ? [addedItem] : []
        return okJson({
          ...(items.length > 0 ? { items } : {}),
          pagination: {
            count: items.length,
            hasMore: false,
            limit: 50,
            nextCursor: null,
          },
        })
      }

      renderRequirementsSpecificationDetailClient()
      await waitForInitialAvailableRequirementsRefresh()

      fireEvent.change(context.requirementSearchInput('items'), {
        target: { value: 'DOES-NOT-MATCH' },
      })
      await waitFor(() => {
        expect(context.requirementSearchInput('items')).toHaveValue(
          'DOES-NOT-MATCH',
        )
      })

      fireEvent.click(context.requirementRowCheckbox('available', 'IAM0202'))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.addSelectedToSpecification',
        }),
      )
      await screen.findByRole('dialog')
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.confirmAdd' }),
      )

      await waitFor(() => {
        expect(context.itemsStatus()).toHaveTextContent(
          'specification.requirementsAddedHiddenByFilters',
        )
      })
      expect(context.requirementSearchInput('items')).toHaveValue(
        'DOES-NOT-MATCH',
      )

      fireEvent.change(context.requirementSearchInput('items'), {
        target: { value: initialAvailableRequirement.uniqueId },
      })

      await waitFor(() => {
        expect(context.itemsStatus()).toHaveTextContent(
          /^specification\.requirementsAdded$/,
        )
        expect(requirementRowNames('items')).toEqual(['IAM0202'])
      })
      expect(context.itemsStatus()).not.toHaveTextContent(
        'specification.requirementsAddedHiddenByFilters',
      )
    })

    it('does not announce a matching added requirement as hidden when it is on a later page', async () => {
      const firstMatchingItem = {
        ...initialSpecificationItem,
        id: 303,
        itemRef: 'lib:303',
        specificationItemId: 303,
        uniqueId: 'IAM0001',
      }
      const addedMatchingItem = {
        ...initialSpecificationItem,
        id: initialAvailableRequirement.id,
        itemRef: 'lib:202',
        specificationItemId: 202,
        uniqueId: initialAvailableRequirement.uniqueId,
      }
      context.specificationItemsGetHandler = async url => {
        const params = searchParamsFromPath(url)
        const isMatchProbe = params
          .getAll('probeRequirementIds')
          .includes(String(initialAvailableRequirement.id))
        const items = isMatchProbe ? [addedMatchingItem] : [firstMatchingItem]
        return okJson({
          items,
          pagination: {
            count: items.length,
            hasMore: !isMatchProbe,
            limit: Number(params.get('limit') ?? 50),
            nextCursor: isMatchProbe ? null : 'later-page',
          },
        })
      }

      renderRequirementsSpecificationDetailClient()
      await waitForInitialAvailableRequirementsRefresh()

      fireEvent.change(context.requirementSearchInput('items'), {
        target: { value: 'IAM' },
      })
      await waitFor(() => {
        expect(requirementRowNames('items')).toEqual(['IAM0001'])
      })

      fireEvent.click(context.requirementRowCheckbox('available', 'IAM0202'))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.addSelectedToSpecification',
        }),
      )
      await screen.findByRole('dialog')
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.confirmAdd' }),
      )

      await waitFor(() => {
        expect(context.itemsStatus()).toHaveTextContent(
          'specification.requirementsAdded',
        )
      })
      expect(context.itemsStatus()).not.toHaveTextContent(
        'specification.requirementsAddedHiddenByFilters',
      )
      expect(
        fetchMock.mock.calls.some(([input]) => {
          const url = typeof input === 'string' ? input : input.url
          return (
            url.startsWith(`${specificationApiPath('/items')}?`) &&
            searchParamsFromPath(url).getAll('probeRequirementIds')[0] ===
              String(initialAvailableRequirement.id)
          )
        }),
      ).toBe(true)
    })

    it('shows a warning when loading more available requirements fails', async () => {
      context.failNextAvailableRequirementsFetch = true

      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        availableRequirements: {
          hasMore: true,
          nextCursor: 'cursor-1',
          rows: [initialAvailableRequirement],
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

      context.triggerRequirementLoadMore('available')

      expect(
        await screen.findByText(
          'specification.loadAvailableRequirementsFailed',
        ),
      ).toHaveAttribute('role', 'status')
    })

    it('opens the specification-local requirement dialog directly from the left-panel create action', async () => {
      renderRequirementsSpecificationDetailClient()

      await waitFor(() => {
        expect(
          screen.getByRole('heading', {
            level: 1,
            name: 'Authorization and IAM',
          }),
        ).toBeInTheDocument()
      })

      const createLocalRequirementButton = screen.getByRole('button', {
        name: 'specification.newLocalRequirement',
      })
      expect(createLocalRequirementButton).toHaveAttribute(
        'data-developer-mode-name',
        'floating pill',
      )
      expect(createLocalRequirementButton).toHaveAttribute(
        'data-developer-mode-context',
        'requirements specification detail',
      )
      expect(createLocalRequirementButton).toHaveAttribute(
        'data-developer-mode-value',
        'new local requirement',
      )

      fireEvent.click(createLocalRequirementButton)

      await waitFor(() => {
        expect(
          screen.getByRole('heading', {
            level: 2,
            name: 'specification.newLocalRequirement',
          }),
        ).toBeInTheDocument()
      })
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).queryByLabelText('requirement.area')).toBeNull()
      expect(
        within(dialog).queryByText('requirement.requirementPackage'),
      ).toBeNull()

      const normReferenceFieldset = within(dialog)
        .getByText('requirement.normReferences')
        .closest('fieldset')
      const sidebarGrid = normReferenceFieldset?.parentElement
      expect(sidebarGrid).toHaveClass('lg:w-full')
      expect(sidebarGrid?.parentElement).toHaveClass(
        'lg:grid-cols-[minmax(0,1fr)_minmax(20rem,22rem)]',
      )
    })

    it('creates a specification-local requirement and refreshes the application list', async () => {
      renderRequirementsSpecificationDetailClient()
      const initialItemsGetCount = fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).startsWith(`${specificationApiPath('/items')}?`) &&
          (init as RequestInit | undefined)?.method !== 'POST',
      ).length

      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.newLocalRequirement',
        }),
      )
      const dialog = await screen.findByRole('dialog')
      fireEvent.change(
        within(dialog).getByRole('textbox', {
          name: /requirement\.description/,
        }),
        { target: { value: 'Local requirement' } },
      )
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'common.save' }),
      )

      await waitFor(() => {
        const postCall = fetchMock.mock.calls.find(
          ([url, init]) =>
            url === specificationApiPath('/local-requirements') &&
            (init as RequestInit | undefined)?.method === 'POST',
        )
        expect(
          JSON.parse(String((postCall?.[1] as RequestInit | undefined)?.body)),
        ).toEqual(expect.objectContaining({ description: 'Local requirement' }))
      })
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      await waitFor(() => {
        const itemsGetCount = fetchMock.mock.calls.filter(
          ([url, init]) =>
            String(url).startsWith(`${specificationApiPath('/items')}?`) &&
            (init as RequestInit | undefined)?.method !== 'POST',
        ).length
        expect(itemsGetCount).toBeGreaterThan(initialItemsGetCount)
      })
    })

    it('keeps the local-requirement dialog open when creation fails', async () => {
      context.localRequirementPostOk = false
      renderRequirementsSpecificationDetailClient()

      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.newLocalRequirement',
        }),
      )
      const dialog = await screen.findByRole('dialog')
      fireEvent.change(
        within(dialog).getByRole('textbox', {
          name: /requirement\.description/,
        }),
        { target: { value: 'Local requirement' } },
      )
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'common.save' }),
      )

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'common.error',
      )
    })

    it('keeps dirty local-requirement edits when discard is cancelled', async () => {
      renderRequirementsSpecificationDetailClient()

      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.newLocalRequirement',
        }),
      )
      const dialog = await screen.findByRole('dialog')
      fireEvent.change(
        within(dialog).getByRole('textbox', {
          name: /requirement\.description/,
        }),
        { target: { value: 'Unsaved local requirement' } },
      )
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'common.close' }),
      )

      const confirmation = await screen.findByRole('alertdialog')
      fireEvent.click(
        within(confirmation).getByRole('button', { name: 'common.cancel' }),
      )
      expect(dialog).toBeInTheDocument()
      expect(
        within(dialog).getByRole('textbox', {
          name: /requirement\.description/,
        }),
      ).toHaveValue('Unsaved local requirement')
    })
  })
}
