import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SPECIFICATION_PRELOAD_ERROR_KEYS } from '@/lib/specifications/preload-types'
import type { SpecDetailWorkflowContext } from './requirements-specification-detail-client.suite'

export function registerAvailabilityTests(context: SpecDetailWorkflowContext) {
  const {
    availableRequirementsFetchUrls,
    createInitialData,
    fetchMock,
    initialAvailableRequirement,
    okJson,
    renderRequirementsSpecificationDetailClient,
    searchParamsFromPath,
    specificationApiPath,
    waitForInitialAvailableRequirementsRefresh,
  } = context

  describe('available requirement pagination and selection filtering', () => {
    it('loads available requirements without sending the fixed status filter', async () => {
      renderRequirementsSpecificationDetailClient()

      await waitFor(() => {
        expect(availableRequirementsFetchUrls().length).toBeGreaterThan(0)
      })

      const initialUrl = availableRequirementsFetchUrls()[0] ?? ''
      const params = searchParamsFromPath(initialUrl)
      expect(params.get('locale')).toBe('en')
      expect(params.has('statuses')).toBe(false)
    })

    it('treats omitted optional list payload fields as an empty page', async () => {
      context.availableRequirementsGetHandler = async () => okJson({})
      context.specificationItemsGetHandler = async () => okJson({})
      context.needsReferencesGetBody = {}
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        errors: [
          {
            key: SPECIFICATION_PRELOAD_ERROR_KEYS.needsReferences,
            message: 'Needs references missing from preload',
          },
        ],
      })

      await waitFor(() => {
        expect(
          screen.getByRole('table', { name: 'available requirements' }),
        ).toHaveTextContent('')
      })
      fireEvent.click(
        screen.getByRole('button', { name: 'sort-description-items' }),
      )
      await waitFor(() => {
        expect(screen.getByText('specification.noItems')).toBeInTheDocument()
      })

      fireEvent.click(
        screen.getByRole('button', {
          name: 'specification.newLocalRequirement',
        }),
      )
      await screen.findByRole('dialog')
      await waitFor(() => {
        expect(
          fetchMock.mock.calls.some(
            ([input]) =>
              (typeof input === 'string' ? input : input.url) ===
              specificationApiPath('/needs-references'),
          ),
        ).toBe(true)
      })
    })

    it('keeps requirement-selection filtering opt-in for available requirements', async () => {
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
      expect(toggle).not.toBeChecked()
      expect(
        availableRequirementsFetchUrls().some(url =>
          url.includes('applyRequirementSelectionFilter=true'),
        ),
      ).toBe(false)

      fireEvent.click(toggle)

      await waitFor(() => {
        expect(
          availableRequirementsFetchUrls().some(url =>
            url.includes('applyRequirementSelectionFilter=true'),
          ),
        ).toBe(true)
      })
      expect(toggle).toBeChecked()
    })

    it('turns off requirement-selection filtering when refreshed answers no longer select requirements', async () => {
      context.availableRequirementsSelectionFilter = {
        applied: false,
        hasCurrentAnswers: true,
        hasRequirementSelection: true,
        hasNoRequirementSelection: false,
        requirementIds: [202],
      }
      context.availableRequirementsGetHandler = async url =>
        okJson({
          pagination: { hasMore: false },
          requirements: [initialAvailableRequirement],
          selectionFilter: url.includes('applyRequirementSelectionFilter=true')
            ? {
                applied: true,
                hasCurrentAnswers: true,
                hasRequirementSelection: false,
                hasNoRequirementSelection: true,
                requirementIds: [],
              }
            : context.availableRequirementsSelectionFilter,
        })
      renderRequirementsSpecificationDetailClient()
      const toggle = await screen.findByRole('switch', {
        name: 'specification.filterWithRequirementSelectionQuestions',
      })
      fireEvent.click(toggle)

      await waitFor(() => {
        expect(toggle).not.toBeChecked()
        expect(toggle).toBeDisabled()
      })
      expect(
        screen.getByText(
          'specification.requirementSelectionNoPublishedMatches',
        ),
      ).toBeInTheDocument()
    })

    it('disables the requirement-selection filter toggle when answers provide no requirement selection', async () => {
      context.availableRequirementsSelectionFilter = {
        applied: false,
        hasCurrentAnswers: true,
        hasRequirementSelection: false,
        hasNoRequirementSelection: true,
        requirementIds: [],
      }
      renderRequirementsSpecificationDetailClient()

      const toggle = await screen.findByRole('switch', {
        name: 'specification.filterWithRequirementSelectionQuestions',
      })
      expect(toggle).toBeDisabled()
      expect(toggle).not.toBeChecked()
      expect(toggle).toHaveAttribute(
        'title',
        'specification.requirementSelectionFilterDisabledTooltip',
      )
    })

    it('renders the requirement-selection toggle without a native input surface', async () => {
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
      const switchTrack = toggle.querySelector('span[aria-hidden="true"]')
      if (!(switchTrack instanceof HTMLElement)) {
        throw new Error('Expected requirement-selection toggle track')
      }

      expect(toggle.tagName).toBe('BUTTON')
      expect(toggle.className).not.toContain('focus-within:ring')
      expect(toggle.className).not.toContain('absolute')
      expect(toggle.className).not.toContain('inset-0')
      expect(toggle.className).not.toContain('w-full')
      expect(switchTrack.className).not.toContain('peer-focus-visible:ring')
    })

    it('keeps the requirement-selection toggle mounted while filtered requirements refresh', async () => {
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

      let resolveFetch:
        | ((value: { json: () => Promise<unknown>; ok: boolean }) => void)
        | undefined
      fetchMock.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveFetch = resolve
          }),
      )

      fireEvent.click(toggle)

      await waitFor(() => {
        expect(
          availableRequirementsFetchUrls().some(url =>
            url.includes('applyRequirementSelectionFilter=true'),
          ),
        ).toBe(true)
      })

      expect(
        screen.getByRole('switch', {
          name: 'specification.filterWithRequirementSelectionQuestions',
        }),
      ).toBeChecked()

      await act(async () => {
        resolveFetch?.(
          okJson({
            pagination: { hasMore: false },
            requirements: [initialAvailableRequirement],
            selectionFilter: {
              applied: true,
              hasCurrentAnswers: true,
              hasRequirementSelection: true,
              hasNoRequirementSelection: false,
              requirementIds: [202],
            },
          }),
        )
      })
    })

    it('loads more available requirements without sending the fixed status filter', async () => {
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        availableRequirements: {
          hasMore: true,
          nextCursor: 'cursor-1',
          rows: [initialAvailableRequirement],
        },
      })

      fireEvent.click(
        screen.getByRole('button', { name: 'load-more-available' }),
      )

      await waitFor(() => {
        expect(
          availableRequirementsFetchUrls().some(
            url => searchParamsFromPath(url).get('cursor') === 'cursor-1',
          ),
        ).toBe(true)
      })

      const params = searchParamsFromPath(
        availableRequirementsFetchUrls().find(
          url => searchParamsFromPath(url).get('cursor') === 'cursor-1',
        ) ?? '',
      )
      expect(params.has('statuses')).toBe(false)
    })

    it('reloads available requirements and announces an invalid cursor', async () => {
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        availableRequirements: {
          hasMore: true,
          nextCursor: 'cursor-1',
          rows: [initialAvailableRequirement],
        },
      })
      await waitForInitialAvailableRequirementsRefresh()
      const requestCountBeforeLoadMore = availableRequirementsFetchUrls().length
      fetchMock.mockImplementationOnce(() =>
        Promise.resolve({
          clone() {
            return this
          },
          json: async () => ({ code: 'invalid_cursor' }),
          ok: false,
          status: 400,
        } as Response),
      )

      fireEvent.click(
        screen.getByRole('button', { name: 'load-more-available' }),
      )

      expect(
        await screen.findByText('common.requirementListRefreshed'),
      ).toHaveAttribute('role', 'status')
      await waitFor(() => {
        expect(availableRequirementsFetchUrls()).toHaveLength(
          requestCountBeforeLoadMore + 2,
        )
      })
      expect(
        screen.getByRole('table', { name: 'available requirements' }),
      ).toHaveTextContent('202')
    })

    it('ignores stale invalid-cursor recovery after available filters change', async () => {
      context.availableRequirementsGetHandler = async url => {
        const filtered = searchParamsFromPath(url).has('requirementPackageIds')
        return okJson({
          pagination: {
            hasMore: !filtered,
            nextCursor: filtered ? null : 'cursor-1',
          },
          requirements: [initialAvailableRequirement],
        })
      }
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        availableRequirements: {
          hasMore: true,
          nextCursor: 'cursor-1',
          rows: [initialAvailableRequirement],
        },
        requirementPackages: [{ id: 1, name: 'Mobile use' }],
      })
      await waitForInitialAvailableRequirementsRefresh()
      let resolveStaleLoadMore: ((response: Response) => void) | undefined
      fetchMock.mockImplementationOnce(
        () =>
          new Promise<Response>(resolve => {
            resolveStaleLoadMore = resolve
          }),
      )

      fireEvent.click(
        screen.getByRole('button', { name: 'load-more-available' }),
      )
      await waitFor(() => {
        expect(
          availableRequirementsFetchUrls().some(
            url => searchParamsFromPath(url).get('cursor') === 'cursor-1',
          ),
        ).toBe(true)
      })

      fireEvent.click(
        screen.getByRole('button', { name: 'filter-package-available-1' }),
      )
      await waitFor(() => {
        expect(
          availableRequirementsFetchUrls().some(url =>
            url.includes('requirementPackageIds=1'),
          ),
        ).toBe(true)
      })
      const requestCountAfterFilter = availableRequirementsFetchUrls().length

      await act(async () => {
        resolveStaleLoadMore?.({
          clone() {
            return this
          },
          json: async () => ({ code: 'invalid_cursor' }),
          ok: false,
          status: 400,
        } as Response)
      })
      expect(availableRequirementsFetchUrls()).toHaveLength(
        requestCountAfterFilter,
      )
      expect(screen.queryByText('common.requirementListRefreshed')).toBeNull()
    })
  })
}
