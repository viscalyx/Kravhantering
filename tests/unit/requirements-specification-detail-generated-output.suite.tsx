import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { RequirementPackageOption } from '@/lib/requirements/list-view'
import type { SpecDetailWorkflowContext } from './requirements-specification-detail-client.suite'

export function registerGeneratedOutputTests(
  context: SpecDetailWorkflowContext,
) {
  describe('generated output, AI authoring, and imports', () => {
    it('shows lifecycle-matched report options and always keeps full CSV export', async () => {
      context.renderRequirementsSpecificationDetailClient()
      await context.waitForInitialAvailableRequirementsRefresh()

      await waitFor(() => {
        expect(
          context.requirementsTable('items'),
        ).toHaveTextContent('BEH0001')
      })
      let moreActions = context.openTableActionMenu('common.moreActions')
      expect(within(moreActions).getAllByRole('menuitem')).toHaveLength(5)
      expect(within(moreActions).getAllByRole('separator')).toHaveLength(2)

      const progressReport = within(moreActions).getByRole('menuitem', {
        name: 'specification.downloadProfileReportPdf.specification.reportProfiles.progress',
      })
      fireEvent.click(progressReport)
      moreActions = context.openTableActionMenu('common.moreActions')
      const traceabilityReport = within(moreActions).getByRole('menuitem', {
        name: 'specification.downloadProfileReportPdf.specification.reportProfiles.traceability',
      })
      fireEvent.click(traceabilityReport)

      const moreActionsTrigger = screen.getByRole('button', {
        name: 'common.moreActions',
      })
      expect(context.pdfDownloadState.download).toHaveBeenCalledWith({
        fallbackFilename:
          'specification.reportProfiles.progress Authorization and IAM ETJANST-UPP-2026.pdf',
        restoreFocusTo: moreActionsTrigger,
        url: '/en/specifications/8/reports/pdf/progress',
      })
      expect(context.pdfDownloadState.download).toHaveBeenCalledWith({
        fallbackFilename:
          'specification.reportProfiles.traceability Authorization and IAM ETJANST-UPP-2026.pdf',
        restoreFocusTo: moreActionsTrigger,
        url: '/en/specifications/8/reports/pdf/traceability?locale=en&sortBy=uniqueId&sortDirection=asc',
      })
    })

    it('preserves menu triggers for direct import and AI-to-import handoff', async () => {
      context.renderRequirementsSpecificationDetailClient()
      await context.waitForInitialAvailableRequirementsRefresh()

      const moreActionsTrigger = screen.getByRole('button', {
        name: 'common.moreActions',
      })
      let moreActions = context.openTableActionMenu('common.moreActions')
      const importTrigger = within(moreActions).getByRole('menuitem', {
        name: 'specification.importLocalRequirements',
      })

      fireEvent.click(importTrigger)
      expect(
        screen.getByRole('region', { name: 'Import review' }),
      ).toBeInTheDocument()
      fireEvent.click(
        screen.getByRole('button', { name: 'cancel import review' }),
      )
      await waitFor(() => {
        expect(
          screen.queryByRole('region', { name: 'Import review' }),
        ).not.toBeInTheDocument()
      })
      expect(moreActionsTrigger).toHaveFocus()
      moreActions = context.openTableActionMenu('common.moreActions')
      const aiTrigger = within(moreActions).getByRole('menuitem', {
        name: 'specification.aiGenerate',
      })
      fireEvent.click(aiTrigger)
      expect(
        screen.getByRole('region', { name: 'AI authoring' }),
      ).toBeInTheDocument()
      fireEvent.click(
        screen.getByRole('button', { name: 'review AI requirements' }),
      )
      expect(
        screen.getByRole('region', { name: 'Import review' }),
      ).toBeInTheDocument()
      fireEvent.click(
        screen.getByRole('button', { name: 'finish import review' }),
      )
      await waitFor(() => {
        expect(
          screen.queryByRole('region', { name: 'Import review' }),
        ).not.toBeInTheDocument()
      })
      expect(moreActionsTrigger).toHaveFocus()
    })

    it('places kravunderlag create before columns and secondary actions after columns', async () => {
      context.renderRequirementsSpecificationDetailClient()
      await context.waitForInitialAvailableRequirementsRefresh()

      const itemsSurface = context.requirementPanel('items')
      const createLocalAction = within(itemsSurface).getByRole('button', {
        name: 'specification.newLocalRequirement',
      })
      const columnsAction = within(itemsSurface).getByRole('button', {
        name: 'common.columns',
      })
      const moreActions = within(itemsSurface).getByRole('button', {
        name: 'common.moreActions',
      })

      expect(
        createLocalAction.compareDocumentPosition(columnsAction) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
      expect(
        columnsAction.compareDocumentPosition(moreActions) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
      const menu = context.openTableActionMenu('common.moreActions')
      expect(within(menu).getAllByRole('menuitem')).toHaveLength(5)
      expect(within(menu).getAllByRole('separator')).toHaveLength(2)
    })

    it('explains whether AI authoring is disabled by the environment or an administrator', async () => {
      for (const [disabledByEnvironment, expectedMessage] of [
        [true, 'specification.aiGenerateDisabledByEnvironment'],
        [false, 'specification.aiGenerateDisabledByAdmin'],
      ] as const) {
        const initialData = context.createInitialData()
        initialData.aiGenerationAvailability = {
          disabledByEnvironment,
          effectiveRequirementGenerationEnabled: false,
        }
        const view =
          context.renderRequirementsSpecificationDetailClient(initialData)
        await context.waitForInitialAvailableRequirementsRefresh()
        const menu = context.openTableActionMenu('common.moreActions')
        const aiMenuItem = within(menu).getByRole('menuitem', {
          name: /^specification\.aiGenerate/,
        })
        expect(aiMenuItem).toHaveAttribute('aria-disabled', 'true')
        expect(aiMenuItem).toHaveAttribute('title', expectedMessage)
        fireEvent.click(aiMenuItem)
        expect(
          screen.queryByRole('region', { name: 'AI authoring' }),
        ).not.toBeInTheDocument()
        view.unmount()
      }
    })

    it('keeps profile PDF report actions lifecycle-scoped', async () => {
      context.renderRequirementsSpecificationDetailClient(
        context.createInitialData(),
        8,
      )
      await context.waitForInitialAvailableRequirementsRefresh()

      const menu = context.openTableActionMenu('common.moreActions')
      const progressReport = within(menu).getByRole('menuitem', {
        name: 'specification.downloadProfileReportPdf.specification.reportProfiles.progress',
      })
      fireEvent.click(progressReport)

      expect(context.pdfDownloadState.download).toHaveBeenCalledWith({
        fallbackFilename:
          'specification.reportProfiles.progress Authorization and IAM ETJANST-UPP-2026.pdf',
        restoreFocusTo: screen.getByRole('button', {
          name: 'common.moreActions',
        }),
        url: '/en/specifications/8/reports/pdf/progress',
      })
    })

    it('builds traceability report query state from the complete-result filters', async () => {
      const initialData = context.createInitialData()
      initialData.specificationItems = context.createSpecificationItemsPage([
        {
          ...context.initialSpecificationItem,
          requirementPackageIds: [9],
        },
        {
          ...context.initialSpecificationItem,
          id: -41,
          itemRef: 'local:41',
          kind: 'specificationLocal',
          requirementPackageIds: [],
          specificationItemId: undefined,
          specificationLocalRequirementId: 41,
          uniqueId: 'KRAV0001',
          version: {
            ...context.initialSpecificationItem.version,
            description: 'Local-only application.',
            verifiable: false,
            status: 2,
            versionNumber: 1,
          },
        },
      ])
      initialData.requirementPackages = [
        { id: 9, name: 'Security package' },
      ] as RequirementPackageOption[]
      initialData.leftRequirementPackageCatalog =
        context.createRequirementPackageCatalogPage([
          { id: 9, name: 'Security package' },
        ])
      context.specificationItemsGetItems = initialData.specificationItems.items

      context.renderRequirementsSpecificationDetailClient(initialData)
      await context.waitForInitialAvailableRequirementsRefresh()

      fireEvent.click(
        context.requirementPackageButton('items', 9),
      )

      await waitFor(() => {
        const menu = context.openTableActionMenu('common.moreActions')
        expect(
          within(menu).getByRole('menuitem', {
            name: 'specification.downloadProfileReportPdf.specification.reportProfiles.traceability',
          }),
        ).toBeInTheDocument()
        fireEvent.keyDown(document, { key: 'Escape' })
      })

      const menu = context.openTableActionMenu('common.moreActions')
      fireEvent.click(
        within(menu).getByRole('menuitem', {
          name: 'specification.downloadProfileReportPdf.specification.reportProfiles.traceability',
        }),
      )

      expect(context.pdfDownloadState.download).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('requirementPackageIds=9'),
        }),
      )
    })

    it('keeps traceability report actions beyond the former item-ref limit', async () => {
      const items = Array.from({ length: 201 }, (_, index) => {
        const itemId = index + 1
        return {
          ...context.initialSpecificationItem,
          id: 1000 + itemId,
          itemRef: `lib:${itemId}`,
          specificationItemId: itemId,
          uniqueId: `BEH${String(itemId).padStart(4, '0')}`,
        }
      })
      const initialData = context.createInitialData()
      initialData.specificationItems = context.createSpecificationItemsPage(
        items.slice(0, 100),
        { hasMore: true, limit: 100, nextCursor: 'items-page-2' },
      )
      context.specificationItemsGetHandler = async url => {
        const cursor = context.searchParamsFromPath(url).get('cursor')
        const pageItems =
          cursor === 'items-page-2' ? items.slice(100, 200) : items.slice(200)
        return context.okJson({
          items: pageItems,
          pagination: {
            count: pageItems.length,
            hasMore: cursor === 'items-page-2',
            limit: 100,
            nextCursor: cursor === 'items-page-2' ? 'items-page-3' : null,
          },
        })
      }

      context.renderRequirementsSpecificationDetailClient(initialData)
      await context.waitForInitialAvailableRequirementsRefresh()
      context.triggerRequirementLoadMore('items')
      expect(
        await screen.findByRole('row', { name: /BEH0200/ }),
      ).toBeVisible()
      context.triggerRequirementLoadMore('items')
      expect(
        await screen.findByRole('row', { name: /BEH0201/ }),
      ).toBeVisible()

      expect(
        within(context.openTableActionMenu('common.moreActions')).getByRole('menuitem', {
          name: 'specification.downloadProfileReportPdf.specification.reportProfiles.progress',
        }),
      ).toBeInTheDocument()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(
        within(context.openTableActionMenu('common.moreActions')).getByRole('menuitem', {
          name: 'specification.downloadProfileReportPdf.specification.reportProfiles.traceability',
        }),
      ).toBeInTheDocument()
    }, 15_000)

    it('routes full CSV through the generated-output controller with menu focus restoration', async () => {
      context.renderRequirementsSpecificationDetailClient()
      await context.waitForInitialAvailableRequirementsRefresh()

      const menu = context.openTableActionMenu('common.moreActions')
      const exportFull = within(menu).getByRole('menuitem', {
        name: 'specification.exportProfiles.full',
      })
      fireEvent.click(exportFull)

      expect(context.pdfDownloadState.download).toHaveBeenCalledWith({
        fallbackFilename:
          'specification.exportProfiles.full Authorization and IAM ETJANST-UPP-2026.csv',
        output: 'csv',
        restoreFocusTo: screen.getByRole('button', {
          name: 'common.moreActions',
        }),
        url: '/api/requirements-specifications/8/exports?profile=full&locale=en',
      })
    })

    it('disables both CSV profiles while any generated output is active', async () => {
      context.pdfDownloadState.downloading = true
      const initialData = context.createInitialData()
      if (!initialData.spec) {
        throw new Error('Expected specification fixture')
      }
      initialData.spec = {
        ...initialData.spec,
        specificationLifecycleStatusId: 1,
      }
      context.renderRequirementsSpecificationDetailClient(initialData)
      await context.waitForInitialAvailableRequirementsRefresh()

      const menu = context.openTableActionMenu('common.moreActions')
      expect(
        within(menu).getByRole('menuitem', {
          name: 'specification.exportProfiles.procurement',
        }),
      ).toHaveAttribute('aria-disabled', 'true')
      expect(
        within(menu).getByRole('menuitem', {
          name: 'specification.exportProfiles.full',
        }),
      ).toHaveAttribute('aria-disabled', 'true')
    })
  })
}
