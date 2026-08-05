import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SpecDetailWorkflowContext } from './requirements-specification-detail-client.suite'

export function registerNeedsReferenceTests(
  context: SpecDetailWorkflowContext,
) {
  describe('needs-reference register and application links', () => {
    it('opens the needs references tab, persists the URL parameter, and shows usage details', async () => {
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
      context.renderRequirementsSpecificationDetailClient({
        ...context.createInitialData(),
        availableNeedsRefs: [
          {
            createdAt: '2026-04-20T10:00:00.000Z',
            description: null,
            id: 81,
            libraryItemCount: 1,
            linkedItemCount: 1,
            specificationLocalRequirementCount: 0,
            text: 'IAM-42',
            updatedAt: '2026-04-20T10:00:00.000Z',
          },
        ],
        specificationItems: context.createSpecificationItemsPage([
          {
            ...context.initialSpecificationItem,
            needsReference: 'IAM-42',
            needsReferenceId: 81,
            specificationItemStatusNameEn: 'Included',
          },
        ]),
      })

      expect(
        screen.getByRole('button', { name: 'common.moreActions' }),
      ).toBeInTheDocument()

      fireEvent.click(
        screen.getByRole('tab', { name: /specification\.needsReferences/ }),
      )

      expect(replaceStateSpy).toHaveBeenCalled()
      expect(
        screen.getByRole('button', { name: 'specification.newNeedsReference' }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'common.moreActions' }),
      ).not.toBeInTheDocument()
      expect(screen.getByText('IAM-42')).toBeInTheDocument()
      expect(
        screen.getByText('specification.missingNeedsReferenceDescription'),
      ).toBeInTheDocument()

      fireEvent.click(
        screen.getByRole('button', {
          name: /specification\.toggleNeedsReferenceUsage/,
        }),
      )

      expect(await screen.findByText('BEH0001')).toBeInTheDocument()
      expect(screen.getByText('RBAC should be enforced.')).toBeInTheDocument()
      await context.waitForInitialAvailableRequirementsRefresh()
    })

    it('navigates all split-panel tabs and closes the needs-reference form by button and Escape', async () => {
      context.renderRequirementsSpecificationDetailClient()

      fireEvent.click(
        screen.getByRole('tab', { name: 'specification.rfiList' }),
      )
      expect(screen.getByText('RFI list panel')).toBeInTheDocument()
      fireEvent.click(
        screen.getByRole('tab', { name: 'specification.itemsInSpecification' }),
      )
      expect(
        context.requirementsTable('items'),
      ).toHaveTextContent('BEH0001')
      fireEvent.click(
        screen.getByRole('tab', {
          name: 'specification.requirementSelectionQuestions',
        }),
      )
      expect(
        screen.getByText('specificationRequirementSelection.noQuestions'),
      ).toBeInTheDocument()
      const availableFetchesBeforeQuestionChange =
        context.fetchMock.mock.calls.filter(([input]) =>
          String(input).startsWith(
            context.specificationApiPath('/available-requirements'),
          ),
        ).length
      fireEvent.click(
        screen.getByRole('button', {
          name: 'notify selection questions changed',
        }),
      )
      await waitFor(() => {
        expect(
          context.fetchMock.mock.calls.filter(([input]) =>
            String(input).startsWith(
              context.specificationApiPath('/available-requirements'),
            ),
          ).length,
        ).toBeGreaterThan(availableFetchesBeforeQuestionChange)
      })
      fireEvent.click(
        screen.getByRole('tab', {
          name: 'specification.availableRequirements',
        }),
      )
      expect(
        context.requirementsTable('available'),
      ).toHaveTextContent('IAM0202')
      fireEvent.click(
        screen.getByRole('tab', { name: /specification\.needsReferences/ }),
      )
      expect(
        screen.getByText('specification.noNeedsReferences'),
      ).toBeInTheDocument()
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.newNeedsReference' }),
      )
      let dialog = screen.getByRole('dialog')
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'common.close' }),
      )
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

      fireEvent.click(
        screen.getByRole('button', { name: 'specification.newNeedsReference' }),
      )
      dialog = screen.getByRole('dialog')
      fireEvent.keyDown(dialog, { key: 'Enter' })
      expect(dialog).toBeInTheDocument()
      fireEvent.keyDown(dialog, { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

      fireEvent.click(
        screen.getByRole('tab', { name: 'specification.itemsInSpecification' }),
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.newLocalRequirement',
        }),
      )
      dialog = await screen.findByRole('dialog')
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'common.close' }),
      )
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.newLocalRequirement',
        }),
      )
      dialog = await screen.findByRole('dialog')
      fireEvent.keyDown(dialog, { key: 'Enter' })
      expect(dialog).toBeInTheDocument()
      fireEvent.keyDown(dialog, { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      await context.waitForInitialAvailableRequirementsRefresh()
    })

    it('honors an area and left-panel tab selected in the page URL', async () => {
      context.navigationState.searchParams = new URLSearchParams({
        areaId: '17',
        leftTab: 'rfi',
      })
      const { unmount } = context.renderRequirementsSpecificationDetailClient()

      expect(screen.getByText('RFI list panel')).toBeInTheDocument()
      await waitFor(() => {
        const itemRequest = context.fetchMock.mock.calls.find(([url]) => {
          if (
            !String(url).startsWith(
              `${context.specificationApiPath('/items')}?`,
            )
          ) {
            return false
          }
          return context
            .searchParamsFromPath(String(url))
            .getAll('areaIds')
            .includes('17')
        })
        expect(itemRequest).toBeDefined()
      })

      unmount()
      context.navigationState.searchParams = new URLSearchParams({
        leftTab: 'needs-references',
      })
      context.renderRequirementsSpecificationDetailClient()

      expect(
        screen.getByText('specification.noNeedsReferences'),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('tab', { name: /specification\.needsReferences/ }),
      ).toHaveAttribute('aria-selected', 'true')
      await context.waitForInitialAvailableRequirementsRefresh()
    })

    it('loads every needs-reference usage page independently of the visible item page', async () => {
      const usageItems = Array.from({ length: 101 }, (_, index) => ({
        ...context.initialSpecificationItem,
        id: 1_000 + index,
        itemRef: `lib:${1_000 + index}`,
        needsReferenceId: 81,
        specificationItemId: 1_000 + index,
        uniqueId: `USAGE-${String(index + 1).padStart(3, '0')}`,
      }))
      context.specificationItemsGetHandler = async url => {
        const params = context.searchParamsFromPath(url)
        expect(params.getAll('needsReferenceIds')).toEqual(['81'])
        const cursor = params.get('cursor')
        const items = cursor ? usageItems.slice(100) : usageItems.slice(0, 100)
        return context.okJson({
          items,
          pagination: {
            count: items.length,
            hasMore: cursor == null,
            limit: 100,
            nextCursor: cursor == null ? 'usage-page-2' : null,
          },
        })
      }
      context.renderRequirementsSpecificationDetailClient({
        ...context.createInitialData(),
        availableNeedsRefs: [
          {
            createdAt: '2026-04-20T10:00:00.000Z',
            description: 'Complete usage',
            id: 81,
            libraryItemCount: 101,
            linkedItemCount: 101,
            specificationLocalRequirementCount: 0,
            text: 'IAM-42',
            updatedAt: '2026-04-20T10:00:00.000Z',
          },
        ],
        specificationItems: context.createSpecificationItemsPage([
          {
            ...context.initialSpecificationItem,
            needsReferenceId: 81,
          },
        ]),
      })
      fireEvent.click(
        screen.getByRole('tab', { name: /specification\.needsReferences/ }),
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: /specification\.toggleNeedsReferenceUsage/,
        }),
      )

      expect(await screen.findByText('USAGE-101')).toBeInTheDocument()
      expect(screen.getByText('USAGE-001')).toBeInTheDocument()
      expect(
        context.fetchMock.mock.calls.filter(([input]) =>
          String(input).includes('needsReferenceIds=81'),
        ),
      ).toHaveLength(2)
    })

    it('renders Swedish needs-reference usage fallbacks for incomplete application metadata', async () => {
      context.intlState.locale = 'sv'
      context.specificationItemsGetHandler = async () =>
        context.okJson({
          items: [
            {
              ...context.initialSpecificationItem,
              itemRef: 'lib:fallback',
              specificationItemStatusNameEn: undefined,
              specificationItemStatusNameSv: undefined,
              uniqueId: 'USAGE-FALLBACK',
              version: undefined,
            },
          ],
        })
      context.renderRequirementsSpecificationDetailClient({
        ...context.createInitialData(),
        availableNeedsRefs: [
          {
            createdAt: '',
            description: 'Ofullständig användning',
            id: 81,
            libraryItemCount: 1,
            linkedItemCount: undefined,
            specificationLocalRequirementCount: 0,
            text: 'BEHOV-81',
            updatedAt: '',
          },
        ],
      })
      fireEvent.click(
        screen.getByRole('tab', { name: /specification\.needsReferences/ }),
      )
      const toggle = screen.getByRole('button', {
        name: /specification\.toggleNeedsReferenceUsage/,
      })
      fireEvent.click(toggle)

      expect(await screen.findByText('USAGE-FALLBACK')).toBeInTheDocument()
      expect(screen.getAllByText('—')).toHaveLength(3)
      expect(toggle).toHaveAttribute('aria-expanded', 'true')
      fireEvent.click(toggle)
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByText('USAGE-FALLBACK')).toBeNull()
    })

    it('shows a needs-reference usage error without collapsing the row', async () => {
      context.specificationItemsGetHandler = async () => ({
        json: async () => ({ error: 'Usage unavailable' }),
        ok: false,
      })
      context.renderRequirementsSpecificationDetailClient({
        ...context.createInitialData(),
        availableNeedsRefs: [
          {
            createdAt: '',
            description: 'Usage error case',
            id: 81,
            libraryItemCount: 1,
            linkedItemCount: 1,
            specificationLocalRequirementCount: 0,
            text: 'IAM-42',
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

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'specification.loadSpecificationItemsFailed',
      )
      expect(screen.getByText('IAM-42')).toBeInTheDocument()
    })

    it('creates a needs reference with a description from the register tab', async () => {
      context.renderRequirementsSpecificationDetailClient()

      fireEvent.click(
        screen.getByRole('tab', { name: /specification\.needsReferences/ }),
      )
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.newNeedsReference' }),
      )

      fireEvent.change(screen.getByLabelText('specification.needsReference'), {
        target: { value: 'IAM-42' },
      })
      fireEvent.change(
        screen.getByLabelText('specification.needsReferenceDescription'),
        {
          target: { value: 'Access management work' },
        },
      )
      fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

      await waitFor(() => {
        expect(context.fetchMock).toHaveBeenCalledWith(
          '/api/requirements-specifications/8/needs-references',
          expect.objectContaining({ method: 'POST' }),
        )
      })

      const postCall = context.fetchMock.mock.calls.find(
        ([url, init]) =>
          url === '/api/requirements-specifications/8/needs-references' &&
          (init as RequestInit | undefined)?.method === 'POST',
      )
      expect(
        JSON.parse(String((postCall?.[1] as RequestInit | undefined)?.body)),
      ).toEqual({
        description: 'Access management work',
        text: 'IAM-42',
      })
    })

    it('reports a translated error when the needs-reference register cannot refresh after save', async () => {
      context.needsReferencesGetHandler = async () => {
        throw 'Register refresh unavailable'
      }
      context.renderRequirementsSpecificationDetailClient()
      fireEvent.click(
        screen.getByRole('tab', { name: /specification\.needsReferences/ }),
      )
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.newNeedsReference' }),
      )
      const dialog = screen.getByRole('dialog')
      fireEvent.change(
        within(dialog).getByLabelText('specification.needsReference'),
        { target: { value: 'IAM-REFRESH' } },
      )
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'common.save' }),
      )

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'specification.failedToLoadNeedsReferences',
      )
      expect(
        screen.getByText('specification.noNeedsReferences'),
      ).toBeInTheDocument()
    })

    it('updates an existing needs reference from the register tab', async () => {
      context.renderRequirementsSpecificationDetailClient({
        ...context.createInitialData(),
        availableNeedsRefs: [
          {
            createdAt: '2026-04-20T10:00:00.000Z',
            description: 'Original context',
            id: 81,
            libraryItemCount: 0,
            linkedItemCount: 0,
            specificationLocalRequirementCount: 0,
            text: 'IAM-42',
            updatedAt: '2026-04-20T10:00:00.000Z',
          },
        ],
      })

      fireEvent.click(
        screen.getByRole('tab', { name: /specification\.needsReferences/ }),
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.editNeedsReference',
        }),
      )
      fireEvent.change(screen.getByLabelText('specification.needsReference'), {
        target: { value: ' IAM-43 ' },
      })
      fireEvent.change(
        screen.getByLabelText('specification.needsReferenceDescription'),
        { target: { value: ' Updated context ' } },
      )
      fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

      await waitFor(() => {
        expect(context.fetchMock).toHaveBeenCalledWith(
          '/api/requirements-specifications/8/needs-references',
          expect.objectContaining({ method: 'PATCH' }),
        )
      })
      const patchCall = context.fetchMock.mock.calls.find(
        ([url, init]) =>
          url === '/api/requirements-specifications/8/needs-references' &&
          (init as RequestInit | undefined)?.method === 'PATCH',
      )
      expect(
        JSON.parse(String((patchCall?.[1] as RequestInit | undefined)?.body)),
      ).toEqual({ description: 'Updated context', id: 81, text: 'IAM-43' })
    })

    it('keeps a needs reference draft open when the server rejects it', async () => {
      context.needsReferenceMutationHandler = async method => {
        expect(method).toBe('POST')
        return {
          json: async () => ({ error: 'Needs reference is not valid' }),
          ok: false,
        }
      }
      context.renderRequirementsSpecificationDetailClient()
      fireEvent.click(
        screen.getByRole('tab', { name: /specification\.needsReferences/ }),
      )
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.newNeedsReference' }),
      )
      const dialog = screen.getByRole('dialog')
      fireEvent.change(
        within(dialog).getByLabelText('specification.needsReference'),
        { target: { value: 'IAM-INVALID' } },
      )
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'common.save' }),
      )

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Needs reference is not valid',
      )
      expect(
        within(dialog).getByLabelText('specification.needsReference'),
      ).toHaveValue('IAM-INVALID')
    })

    it('keeps an edited needs reference open after a network failure', async () => {
      context.needsReferenceMutationHandler = async method => {
        expect(method).toBe('PATCH')
        throw new Error('Needs reference network unavailable')
      }
      context.renderRequirementsSpecificationDetailClient({
        ...context.createInitialData(),
        availableNeedsRefs: [
          {
            createdAt: '',
            description: 'Original context',
            id: 81,
            libraryItemCount: 0,
            linkedItemCount: 0,
            specificationLocalRequirementCount: 0,
            text: 'IAM-42',
            updatedAt: '',
          },
        ],
      })
      fireEvent.click(
        screen.getByRole('tab', { name: /specification\.needsReferences/ }),
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.editNeedsReference',
        }),
      )
      const dialog = screen.getByRole('dialog')
      fireEvent.change(
        within(dialog).getByLabelText(
          'specification.needsReferenceDescription',
        ),
        { target: { value: 'Updated context' } },
      )
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'common.save' }),
      )

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Needs reference network unavailable',
      )
      expect(
        within(dialog).getByLabelText(
          'specification.needsReferenceDescription',
        ),
      ).toHaveValue('Updated context')
    })

    it('deletes an unused needs reference after confirmation', async () => {
      context.renderRequirementsSpecificationDetailClient({
        ...context.createInitialData(),
        availableNeedsRefs: [
          {
            createdAt: '2026-04-20T10:00:00.000Z',
            description: null,
            id: 81,
            libraryItemCount: 0,
            linkedItemCount: 0,
            specificationLocalRequirementCount: 0,
            text: 'IAM-42',
            updatedAt: '2026-04-20T10:00:00.000Z',
          },
        ],
      })

      fireEvent.click(
        screen.getByRole('tab', { name: /specification\.needsReferences/ }),
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.deleteNeedsReference',
        }),
      )
      const confirmation = await screen.findByRole('alertdialog')
      fireEvent.click(
        within(confirmation).getByRole('button', { name: 'common.delete' }),
      )

      await waitFor(() => {
        expect(context.fetchMock).toHaveBeenCalledWith(
          '/api/requirements-specifications/8/needs-references',
          expect.objectContaining({ method: 'DELETE' }),
        )
      })
    })

    it('keeps a needs reference visible when deletion is rejected', async () => {
      context.needsReferenceMutationHandler = async method => {
        expect(method).toBe('DELETE')
        return {
          json: async () => ({ error: 'Needs reference is protected' }),
          ok: false,
        }
      }
      context.renderRequirementsSpecificationDetailClient({
        ...context.createInitialData(),
        availableNeedsRefs: [
          {
            createdAt: '',
            description: 'Decision context',
            id: 81,
            libraryItemCount: 0,
            linkedItemCount: 0,
            specificationLocalRequirementCount: 0,
            text: 'IAM-42',
            updatedAt: '',
          },
        ],
      })
      fireEvent.click(
        screen.getByRole('tab', { name: /specification\.needsReferences/ }),
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.deleteNeedsReference',
        }),
      )
      const confirmation = await screen.findByRole('alertdialog')
      fireEvent.click(
        within(confirmation).getByRole('button', { name: 'common.delete' }),
      )

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Needs reference is protected',
      )
      expect(screen.getByText('IAM-42')).toBeInTheDocument()
    })

    it('passes reduced-motion preferences to the needs reference form modal', async () => {
      vi.mocked(context.useReducedMotion).mockReturnValue(true)
      context.renderRequirementsSpecificationDetailClient()

      fireEvent.click(
        screen.getByRole('tab', { name: /specification\.needsReferences/ }),
      )
      fireEvent.click(
        screen.getByRole('button', { name: 'specification.newNeedsReference' }),
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(context.fadeMotion).toHaveBeenCalledWith(true)
      expect(context.dialogPanelMotion).toHaveBeenCalledWith(true)
      await context.waitForInitialAvailableRequirementsRefresh()
    })

    it('updates a single item needs reference inline from the requirements table', async () => {
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

      fireEvent.change(
        context.requirementNeedsReferenceSelect('items', 'BEH0001'),
        { target: { value: '81' } },
      )

      await waitFor(() => {
        expect(context.fetchMock).toHaveBeenCalledWith(
          '/api/requirements-specifications/8/items/lib%3A31',
          expect.objectContaining({
            body: JSON.stringify({ needsReferenceId: 81 }),
            method: 'PATCH',
          }),
        )
      })
    })

    it('restores an inline needs reference after server and network failures', async () => {
      const originalItem = {
        ...context.initialSpecificationItem,
        needsReference: 'ORIGINAL-REF',
        needsReferenceId: 40,
      }
      context.renderRequirementsSpecificationDetailClient({
        ...context.createInitialData(),
        availableNeedsRefs: [
          { description: null, id: 40, text: 'ORIGINAL-REF' },
          { description: null, id: 81, text: 'IAM-42' },
        ],
        specificationItems: context.createSpecificationItemsPage([
          originalItem,
        ]),
      })
      context.specificationItemMutationHandler = async () => ({
        json: async () => ({ error: 'Assignment rejected' }),
        ok: false,
      })
      fireEvent.change(
        context.requirementNeedsReferenceSelect('items', 'BEH0001'),
        { target: { value: '81' } },
      )
      await waitFor(() => {
        expect(
          context.requirementNeedsReferenceSelect('items', 'BEH0001'),
        ).toHaveValue('40')
      })

      context.specificationItemMutationHandler = async () => {
        throw new Error('Assignment network unavailable')
      }
      fireEvent.change(
        context.requirementNeedsReferenceSelect('items', 'BEH0001'),
        { target: { value: '81' } },
      )
      await waitFor(() => {
        expect(
          context.requirementNeedsReferenceSelect('items', 'BEH0001'),
        ).toHaveValue('40')
        expect(
          context.fetchMock.mock.calls.filter(
            ([url, init]) =>
              String(url).endsWith('/items/lib%3A31') &&
              (init as RequestInit | undefined)?.method === 'PATCH',
          ),
        ).toHaveLength(2)
      })
    })
  })
}
