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
          screen.getByRole('table', { name: 'items requirements' }),
        ).toHaveTextContent('lib:31')
      })
      const moreActions = screen.getByRole('menu', {
        name: 'more-actions menu',
      })
      expect(within(moreActions).getAllByRole('menuitem')).toHaveLength(5)
      expect(within(moreActions).getAllByRole('separator')).toHaveLength(2)

      const progressReport = screen.getByRole('menuitem', {
        name: 'specification.downloadProfileReportPdf.specification.reportProfiles.progress',
      })
      const traceabilityReport = screen.getByRole('menuitem', {
        name: 'specification.downloadProfileReportPdf.specification.reportProfiles.traceability',
      })
      fireEvent.click(progressReport)
      fireEvent.click(traceabilityReport)

      expect(context.pdfDownloadState.download).toHaveBeenCalledWith({
        fallbackFilename:
          'specification.reportProfiles.progress Authorization and IAM ETJANST-UPP-2026.pdf',
        restoreFocusTo: progressReport,
        url: '/en/specifications/8/reports/pdf/progress',
      })
      expect(context.pdfDownloadState.download).toHaveBeenCalledWith({
        fallbackFilename:
          'specification.reportProfiles.traceability Authorization and IAM ETJANST-UPP-2026.pdf',
        restoreFocusTo: traceabilityReport,
        url: '/en/specifications/8/reports/pdf/traceability?locale=en&sortBy=uniqueId&sortDirection=asc',
      })
    })

    it('preserves menu triggers for direct import and AI-to-import handoff', async () => {
      context.renderRequirementsSpecificationDetailClient()
      await context.waitForInitialAvailableRequirementsRefresh()

      const importTrigger = screen.getByRole('menuitem', {
        name: 'specification.importLocalRequirements',
      })
      const aiTrigger = screen.getByRole('menuitem', {
        name: 'specification.aiGenerate',
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
      expect(importTrigger).toHaveFocus()
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
      expect(aiTrigger).toHaveFocus()
    })

    it('places kravunderlag create before columns and secondary actions after columns', async () => {
      context.renderRequirementsSpecificationDetailClient()
      await context.waitForInitialAvailableRequirementsRefresh()

      const itemsSurface = screen.getByRole('region', {
        name: 'items requirements surface',
      })
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
      const menu = within(itemsSurface).getByRole('menu', {
        name: 'more-actions menu',
      })
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
        const aiMenuItem = screen.getByRole('menuitem', {
          name: 'specification.aiGenerate',
        })
        expect(aiMenuItem).toBeDisabled()
        expect(aiMenuItem).toHaveAttribute('aria-description', expectedMessage)
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

      const progressReport = screen.getByRole('menuitem', {
        name: 'specification.downloadProfileReportPdf.specification.reportProfiles.progress',
      })
      fireEvent.click(progressReport)

      expect(context.pdfDownloadState.download).toHaveBeenCalledWith({
        fallbackFilename:
          'specification.reportProfiles.progress Authorization and IAM ETJANST-UPP-2026.pdf',
        restoreFocusTo: progressReport,
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
        screen.getByRole('button', { name: 'filter-package-items-9' }),
      )

      await waitFor(() => {
        expect(
          screen.getByRole('menuitem', {
            name: 'specification.downloadProfileReportPdf.specification.reportProfiles.traceability',
          }),
        ).toBeInTheDocument()
      })

      fireEvent.click(
        screen.getByRole('menuitem', {
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
      fireEvent.click(screen.getByRole('button', { name: 'load-more-items' }))
      expect(await screen.findByRole('row', { name: 'lib:200' })).toBeVisible()
      fireEvent.click(screen.getByRole('button', { name: 'load-more-items' }))
      expect(await screen.findByRole('row', { name: 'lib:201' })).toBeVisible()
      expect(
        screen.queryByRole('button', { name: 'load-more-items' }),
      ).not.toBeInTheDocument()

      expect(
        screen.getByRole('menuitem', {
          name: 'specification.downloadProfileReportPdf.specification.reportProfiles.progress',
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('menuitem', {
          name: 'specification.downloadProfileReportPdf.specification.reportProfiles.traceability',
        }),
      ).toBeInTheDocument()
    })

    it('routes full CSV through the generated-output controller with menu focus restoration', async () => {
      context.renderRequirementsSpecificationDetailClient()
      await context.waitForInitialAvailableRequirementsRefresh()

      const exportFull = screen.getByRole('menuitem', {
        name: 'specification.exportProfiles.full',
      })
      fireEvent.click(exportFull)

      expect(context.pdfDownloadState.download).toHaveBeenCalledWith({
        fallbackFilename:
          'specification.exportProfiles.full Authorization and IAM ETJANST-UPP-2026.csv',
        output: 'csv',
        restoreFocusTo: exportFull,
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

      expect(
        screen.getByRole('menuitem', {
          name: 'specification.exportProfiles.procurement',
        }),
      ).toBeDisabled()
      expect(
        screen.getByRole('menuitem', {
          name: 'specification.exportProfiles.full',
        }),
      ).toBeDisabled()
    })
  })
}
