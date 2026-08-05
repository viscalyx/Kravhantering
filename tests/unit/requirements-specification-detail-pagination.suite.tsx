import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SpecificationListItem } from '@/lib/specifications/preload-types'
import type { SpecDetailWorkflowContext } from './requirements-specification-detail-client.suite'

export function registerPaginationTests(context: SpecDetailWorkflowContext) {
  describe('specification application pagination and stale requests', () => {
    it('automatically appends bounded specification pages and de-duplicates stable item refs', async () => {
      const secondItem = {
        ...context.initialSpecificationItem,
        id: 102,
        itemRef: 'lib:32',
        specificationItemId: 32,
        uniqueId: 'BEH0002',
      }
      const initialData = context.createInitialData()
      initialData.specificationItems = context.createSpecificationItemsPage(
        [context.initialSpecificationItem],
        { hasMore: true, nextCursor: 'cursor-1' },
      )
      context.specificationItemsGetHandler = async url => {
        expect(context.searchParamsFromPath(url).get('cursor')).toBe('cursor-1')
        return context.okJson({
          items: [context.initialSpecificationItem, secondItem],
          pagination: {
            count: 2,
            hasMore: false,
            limit: 50,
            nextCursor: null,
          },
        })
      }

      context.renderRequirementsSpecificationDetailClient(initialData)
      expect(
        screen.getByRole('button', {
          name: 'load-more-items',
        }),
      ).toBeInTheDocument()

      fireEvent.click(
        screen.getByRole('button', {
          name: 'load-more-items',
        }),
      )

      await waitFor(() => {
        expect(
          context
            .latestItemsTableProps()
            .rows.map((item: SpecificationListItem) => item.itemRef),
        ).toEqual(['lib:31', 'lib:32'])
      })
      expect(
        screen.queryByRole('button', {
          name: 'load-more-items',
        }),
      ).not.toBeInTheDocument()
    })

    it('treats an omitted continuation payload as an empty final page', async () => {
      context.specificationItemsGetHandler = async url => {
        expect(context.searchParamsFromPath(url).get('cursor')).toBe(
          'empty-page',
        )
        return context.okJson({})
      }
      context.renderRequirementsSpecificationDetailClient({
        ...context.createInitialData(),
        specificationItems: context.createSpecificationItemsPage(
          [context.initialSpecificationItem],
          { hasMore: true, nextCursor: 'empty-page' },
        ),
      })
      fireEvent.click(screen.getByRole('button', { name: 'load-more-items' }))

      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: 'load-more-items' }),
        ).toBeNull()
        expect(
          screen.getByRole('table', { name: 'items requirements' }),
        ).toHaveTextContent('lib:31')
      })
    })

    it('does not flash the empty specification message while sorting', async () => {
      let resolveSortedRequest: ((response: unknown) => void) | undefined
      const sortedRequest = new Promise<unknown>(resolve => {
        resolveSortedRequest = resolve
      })
      context.specificationItemsGetHandler = async () => sortedRequest

      context.renderRequirementsSpecificationDetailClient()
      expect(
        screen.queryByText('specification.noItems'),
      ).not.toBeInTheDocument()

      fireEvent.click(
        screen.getByRole('button', { name: 'sort-description-items' }),
      )

      await waitFor(() => {
        expect(
          context.fetchMock.mock.calls.some(([input]) =>
            String(input).includes('sortBy=description'),
          ),
        ).toBe(true)
      })
      expect(
        screen.queryByText('specification.noItems'),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('table', { name: 'items requirements' }),
      ).toHaveTextContent('lib:31')

      await act(async () => {
        resolveSortedRequest?.(
          context.okJson({
            items: [],
            pagination: {
              count: 0,
              hasMore: false,
              limit: 50,
              nextCursor: null,
            },
          }),
        )
      })

      expect(
        await screen.findByText('specification.noItems'),
      ).toBeInTheDocument()
    })

    it('keeps the unloaded selected count stable while sorting', async () => {
      const firstItem = {
        ...context.initialSpecificationItem,
        requirementPackageIds: [1],
      }
      const secondItem = {
        ...context.initialSpecificationItem,
        id: 102,
        itemRef: 'lib:32',
        requirementPackageIds: [2],
        specificationItemId: 32,
        uniqueId: 'BEH0002',
      }
      context.specificationItemsGetItems = [firstItem, secondItem]
      context.renderRequirementsSpecificationDetailClient({
        ...context.createInitialData(),
        leftRequirementPackageCatalog:
          context.createRequirementPackageCatalogPage([
            { id: 1, name: 'First package' },
            { id: 2, name: 'Second package' },
          ]),
        requirementPackages: [
          { id: 1, name: 'First package' },
          { id: 2, name: 'Second package' },
        ],
        specificationItems: context.createSpecificationItemsPage([
          firstItem,
          secondItem,
        ]),
      })

      context.selectRequirementRows([101, 102])
      fireEvent.click(
        screen.getByRole('button', { name: 'filter-package-items-1' }),
      )
      await waitFor(() => {
        expect(
          screen.getByRole('table', { name: 'items requirements' }),
        ).toHaveTextContent('lib:31')
        expect(context.intlState.selectionStatus).toHaveBeenLastCalledWith({
          hidden: 1,
          total: 2,
        })
      })

      let resolveSortedRequest: ((response: unknown) => void) | undefined
      const sortedRequest = new Promise<unknown>(resolve => {
        resolveSortedRequest = resolve
      })
      context.specificationItemsGetHandler = async () => sortedRequest
      fireEvent.click(
        screen.getByRole('button', { name: 'sort-description-items' }),
      )

      await waitFor(() => {
        expect(
          context.fetchMock.mock.calls.some(([input]) =>
            String(input).includes('sortBy=description'),
          ),
        ).toBe(true)
      })
      expect(
        screen.getByRole('table', { name: 'items requirements' }),
      ).toHaveTextContent('lib:31')
      expect(context.intlState.selectionStatus).toHaveBeenLastCalledWith({
        hidden: 1,
        total: 2,
      })

      await act(async () => {
        resolveSortedRequest?.(
          context.okJson({
            items: [firstItem],
            pagination: {
              count: 1,
              hasMore: false,
              limit: 50,
              nextCursor: null,
            },
          }),
        )
      })
    })

    it('restarts an invalid continuation from the first page and keeps selection', async () => {
      const restartedItem = {
        ...context.initialSpecificationItem,
        id: 102,
        itemRef: 'lib:32',
        specificationItemId: 32,
        uniqueId: 'BEH0002',
      }
      const initialData = context.createInitialData()
      initialData.specificationItems = context.createSpecificationItemsPage(
        [context.initialSpecificationItem],
        { hasMore: true, nextCursor: 'stale-cursor' },
      )
      context.specificationItemsGetHandler = async url => {
        if (context.searchParamsFromPath(url).has('cursor')) {
          return {
            clone: () => ({ json: async () => ({ code: 'invalid_cursor' }) }),
            json: async () => ({ code: 'invalid_cursor' }),
            ok: false,
            status: 400,
          }
        }
        return context.okJson({
          items: [restartedItem],
          pagination: {
            count: 1,
            hasMore: false,
            limit: 50,
            nextCursor: null,
          },
        })
      }

      context.renderRequirementsSpecificationDetailClient(initialData)
      fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'load-more-items',
        }),
      )

      expect(
        await screen.findByText('specification.paginationRestarted'),
      ).toHaveAttribute('role', 'status')
      expect(
        context
          .latestItemsTableProps()
          .rows.map((item: SpecificationListItem) => item.itemRef),
      ).toEqual(['lib:32'])
      expect(
        screen.getByRole('button', {
          name: 'specification.assignNeedsReferenceAction',
        }),
      ).toBeInTheDocument()
    })

    it('keeps rows visible and restores retry focus when cursor recovery fails', async () => {
      const initialData = context.createInitialData()
      initialData.specificationItems = context.createSpecificationItemsPage(
        [context.initialSpecificationItem],
        { hasMore: true, nextCursor: 'stale-cursor' },
      )
      context.specificationItemsGetHandler = async url => {
        if (context.searchParamsFromPath(url).has('cursor')) {
          return {
            clone: () => ({ json: async () => ({ code: 'invalid_cursor' }) }),
            json: async () => ({ code: 'invalid_cursor' }),
            ok: false,
            status: 400,
          }
        }
        return {
          json: async () => ({ error: 'Unavailable' }),
          ok: false,
          status: 503,
        }
      }

      context.renderRequirementsSpecificationDetailClient(initialData)
      fireEvent.click(
        screen.getByRole('button', {
          name: 'load-more-items',
        }),
      )

      const recoveryAlert = await screen.findByRole('alert')
      expect(recoveryAlert).toHaveTextContent(
        'specification.paginationRecoveryFailed',
      )
      expect(
        context
          .latestItemsTableProps()
          .rows.map((item: SpecificationListItem) => item.itemRef),
      ).toEqual(['lib:31'])

      const retry = within(recoveryAlert).getByRole('button', {
        name: 'common.retry',
      })
      fireEvent.click(retry)
      await waitFor(() => {
        expect(
          within(screen.getByRole('alert')).getByRole('button', {
            name: 'common.retry',
          }),
        ).toHaveFocus()
      })
    })

    it('ignores obsolete specification queries after filters change', async () => {
      const firstResult = {
        ...context.initialSpecificationItem,
        id: 102,
        itemRef: 'lib:32',
        specificationItemId: 32,
        uniqueId: 'FIRST',
      }
      const latestResult = {
        ...context.initialSpecificationItem,
        id: 103,
        itemRef: 'lib:33',
        specificationItemId: 33,
        uniqueId: 'LATEST',
      }
      let resolveObsoleteRequest: ((response: unknown) => void) | undefined
      const obsoleteRequest = new Promise<unknown>(resolve => {
        resolveObsoleteRequest = resolve
      })
      context.specificationItemsGetHandler = async url => {
        const search = context.searchParamsFromPath(url).get('uniqueIdSearch')
        if (search === 'first') return obsoleteRequest
        return context.okJson({
          items: [latestResult],
          pagination: {
            count: 1,
            hasMore: false,
            limit: 50,
            nextCursor: null,
          },
        })
      }

      context.renderRequirementsSpecificationDetailClient()
      fireEvent.change(
        screen.getByRole('textbox', { name: 'search-items-requirements' }),
        { target: { value: 'first' } },
      )
      await waitFor(() => {
        expect(
          context.fetchMock.mock.calls.some(([input]) =>
            String(input).includes('uniqueIdSearch=first'),
          ),
        ).toBe(true)
      })
      fireEvent.change(
        screen.getByRole('textbox', { name: 'search-items-requirements' }),
        { target: { value: 'latest' } },
      )
      await waitFor(() => {
        expect(
          context
            .latestItemsTableProps()
            .rows.map((item: SpecificationListItem) => item.itemRef),
        ).toEqual(['lib:33'])
      })

      await act(async () => {
        resolveObsoleteRequest?.(
          context.okJson({
            items: [firstResult],
            pagination: {
              count: 1,
              hasMore: false,
              limit: 50,
              nextCursor: null,
            },
          }),
        )
        await Promise.resolve()
      })
      expect(
        context
          .latestItemsTableProps()
          .rows.map((item: SpecificationListItem) => item.itemRef),
      ).toEqual(['lib:33'])
    })
  })
}
