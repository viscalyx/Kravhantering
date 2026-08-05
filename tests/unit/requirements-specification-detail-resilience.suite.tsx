import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SPECIFICATION_PRELOAD_ERROR_KEYS } from '@/lib/specifications/preload-types'
import type { SpecDetailWorkflowContext } from './requirements-specification-detail-client.suite'

export function registerResilienceTests(context: SpecDetailWorkflowContext) {
  const {
    availableRequirementsFetchUrls,
    createInitialData,
    createSpecificationItemsPage,
    fetchMock,
    initialAvailableRequirement,
    initialSpec,
    initialSpecificationItem,
    okJson,
    pdfDownloadState,
    renderRequirementsSpecificationDetailClient,
    searchParamsFromPath,
    specificationApiPath,
    waitForInitialAvailableRequirementsRefresh,
  } = context

  describe('refresh failures and focused regression coverage', () => {
    it('clears an active available selection when selection answers change', async () => {
      context.availableRequirementsSelectionFilter = {
        applied: false,
        hasCurrentAnswers: true,
        hasRequirementSelection: true,
        hasNoRequirementSelection: false,
        requirementIds: [202],
      }
      renderRequirementsSpecificationDetailClient()
      const toggle = await screen.findByRole('switch', {
        name: 'specification.filterWithRequirementSelectionQuestions',
      })
      fireEvent.click(toggle)
      await waitFor(() => expect(toggle).toBeChecked())
      fireEvent.click(context.requirementRowCheckbox('available', 'IAM0202'))
      expect(
        screen.getByRole('button', {
          name: 'specification.addSelectedToSpecification',
        }),
      ).toBeInTheDocument()

      fireEvent.click(
        screen.getByRole('tab', {
          name: 'specification.requirementSelectionQuestions',
        }),
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: 'notify selection questions changed',
        }),
      )
      fireEvent.click(
        screen.getByRole('tab', {
          name: 'specification.availableRequirements',
        }),
      )

      await waitFor(() => {
        expect(
          screen.queryByRole('button', {
            name: 'specification.addSelectedToSpecification',
          }),
        ).toBeNull()
      })
    })

    it('keeps list rows usable when refresh resources reject with Error values', async () => {
      context.availableRequirementsGetHandler = async () => {
        throw new Error('Available requirements offline')
      }
      context.normReferencesGetHandler = async () => {
        throw new Error('Norm references offline')
      }
      context.specificationItemsGetHandler = async () => {
        throw 'Items offline'
      }
      renderRequirementsSpecificationDetailClient()

      expect(
        await screen.findByText('Available requirements offline'),
      ).toHaveAttribute('role', 'status')
      context.toggleRequirementStatusFilter('items')
      await waitFor(() => {
        expect(
          fetchMock.mock.calls.some(([input]) =>
            String(input).startsWith('/api/norm-references'),
          ),
        ).toBe(true)
      })
      fireEvent.click(
        context.requirementSortButton('items', 'description'),
      )
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'specification.loadSpecificationItemsFailed',
        )
      })
      expect(
        context.requirementsTable('items'),
      ).toHaveTextContent('BEH0001')
    })

    it('shows the original specification after a non-Error metadata refresh failure', async () => {
      context.specificationMetaGetHandler = async () => {
        throw 'Metadata offline'
      }
      renderRequirementsSpecificationDetailClient()
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.editSpecification' }),
      )
      const dialog = await screen.findByRole('dialog', {
        name: 'specification.editSpecification',
      })
      fireEvent.change(
        within(dialog).getByRole('textbox', { name: /specification\.name/ }),
        { target: { value: 'Specification awaiting refresh' } },
      )
      fireEvent.click(
        within(dialog).getByRole('button', { name: /common\.save/i }),
      )

      expect(
        await screen.findByText('specification.loadSpecificationFailed'),
      ).toHaveAttribute('role', 'status')
      expect(
        screen.getByRole('heading', { level: 1, name: initialSpec.name }),
      ).toBeInTheDocument()
    })

    it('loads needs references after an Error-valued preload failure', async () => {
      context.needsReferencesGetHandler = async () => {
        throw new Error('Needs register offline')
      }
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        errors: [
          {
            key: SPECIFICATION_PRELOAD_ERROR_KEYS.needsReferences,
            message: 'Needs references missing from preload',
          },
        ],
      })
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.newLocalRequirement',
        }),
      )

      await waitFor(() => {
        expect(
          fetchMock.mock.calls.some(
            ([input]) =>
              String(input) === specificationApiPath('/needs-references'),
          ),
        ).toBe(true)
      })
      expect(
        screen.getByText('specification.partialDataLoadWarning'),
      ).toHaveAttribute('role', 'status')
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('keeps an item without a stable reference visible but unselected', async () => {
      const itemWithoutRef = {
        ...initialSpecificationItem,
        itemRef: undefined,
      }
      context.specificationItemsGetItems = [itemWithoutRef]
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        specificationItems: createSpecificationItemsPage([itemWithoutRef]),
      })

      expect(
        context.requirementsTable('items'),
      ).toHaveTextContent('BEH0001')
      fireEvent.click(context.requirementRowCheckbox('items', 'BEH0001'))
      expect(
        screen.queryByRole('button', {
          name: 'specification.removeSelectedFromSpecification',
        }),
      ).toBeNull()
      await waitForInitialAvailableRequirementsRefresh()
    })

    it('renders English needs-reference fallbacks for sparse usage metadata', async () => {
      context.specificationItemsGetHandler = async () =>
        okJson({
          items: [
            {
              ...initialSpecificationItem,
              itemRef: 'lib:english-fallback',
              specificationItemStatusNameEn: undefined,
              uniqueId: 'USAGE-ENGLISH-FALLBACK',
              version: {
                ...initialSpecificationItem.version,
                description: undefined,
                typeNameEn: undefined,
              },
            },
          ],
        })
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        availableNeedsRefs: [
          {
            createdAt: '',
            description: 'Sparse usage',
            id: 82,
            libraryItemCount: 1,
            linkedItemCount: 1,
            specificationLocalRequirementCount: 0,
            text: 'NEED-82',
            updatedAt: '',
          },
        ],
      })
      fireEvent.click(
        screen.getByRole('tab', { name: /specification\.needsReferences/ }),
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: /specification\.toggleNeedsReferenceUsage/,
        }),
      )

      expect(
        await screen.findByText('USAGE-ENGLISH-FALLBACK'),
      ).toBeInTheDocument()
      expect(screen.getAllByText('—')).toHaveLength(3)
    })

    it('offers the management report for a specification in management', async () => {
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        spec: {
          ...initialSpec,
          lifecycleStatus: {
            id: 4,
            nameEn: 'Management',
            nameSv: 'Förvaltning',
          },
          specificationLifecycleStatusId: 4,
        },
      })
      await waitForInitialAvailableRequirementsRefresh()
      const menu = context.openTableActionMenu('common.moreActions')
      const managementReport = within(menu).getByRole('menuitem', {
        name: 'specification.downloadProfileReportPdf.specification.reportProfiles.management',
      })
      fireEvent.click(managementReport)

      expect(pdfDownloadState.download).toHaveBeenCalledWith(
        expect.objectContaining({
          restoreFocusTo: screen.getByRole('button', {
            name: 'common.moreActions',
          }),
          url: '/en/specifications/8/reports/pdf/management',
        }),
      )
    })

    it.each([
      ['Error', new Error('Available continuation offline')],
      ['non-Error', 'Available continuation offline'],
    ])(
      'keeps available rows after an %s load-more failure',
      async (_kind, failure) => {
        context.availableRequirementsGetHandler = async url => {
          if (searchParamsFromPath(url).has('cursor')) throw failure
          return okJson({
            pagination: { hasMore: true, nextCursor: 'cursor-2' },
            requirements: [initialAvailableRequirement],
          })
        }
        renderRequirementsSpecificationDetailClient({
          ...createInitialData(),
          availableRequirements: {
            hasMore: true,
            nextCursor: 'cursor-2',
            rows: [initialAvailableRequirement],
          },
        })
        context.triggerRequirementLoadMore('available')

        expect(
          await screen.findByText(
            failure instanceof Error
              ? failure.message
              : 'specification.loadAvailableRequirementsFailed',
          ),
        ).toHaveAttribute('role', 'status')
        expect(
          context.requirementsTable('available'),
        ).toHaveTextContent('IAM0202')
      },
    )

    it('keeps selection filtering on while an empty continuation finishes the list', async () => {
      context.availableRequirementsSelectionFilter = {
        applied: false,
        hasCurrentAnswers: true,
        hasRequirementSelection: true,
        hasNoRequirementSelection: false,
        requirementIds: [202],
      }
      context.availableRequirementsGetHandler = async url => {
        if (searchParamsFromPath(url).has('cursor')) return okJson({})
        return okJson({
          pagination: { hasMore: true, nextCursor: 'filtered-cursor' },
          requirements: [initialAvailableRequirement],
          selectionFilter: {
            ...context.availableRequirementsSelectionFilter,
            applied: url.includes('applyRequirementSelectionFilter=true'),
          },
        })
      }
      renderRequirementsSpecificationDetailClient()
      const toggle = await screen.findByRole('switch', {
        name: 'specification.filterWithRequirementSelectionQuestions',
      })
      fireEvent.click(toggle)
      context.triggerRequirementLoadMore('available')

      await waitFor(() => {
        expect(
          availableRequirementsFetchUrls().some(url => {
            const params = searchParamsFromPath(url)
            return (
              params.get('cursor') === 'filtered-cursor' &&
              params.get('applyRequirementSelectionFilter') === 'true'
            )
          }),
        ).toBe(true)
      })
      expect(
        context.requirementsTable('available'),
      ).toHaveTextContent('IAM0202')
    })
  })
}
