import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
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
          context
            .latestItemsTableProps()
            .rows.map((row: { itemRef?: string }) => row.itemRef),
        ).toEqual(['lib:31'])
      })
      const itemsTable = context.latestItemsTableProps()
      const floatingActions = (itemsTable.floatingActions ?? []) as Array<{
        hidden?: boolean
        id: string
        menuItems?: Array<{
          href?: string
          id: string
          onClick?: (target?: HTMLButtonElement | null) => void
        }>
      }>
      const moreActions = floatingActions.find(
        action => action.id === 'more-actions',
      )

      expect(moreActions?.hidden).toBe(false)
      expect(moreActions?.menuItems?.map(item => item.id)).toEqual([
        'ai-assist-local',
        'import-local',
        'separator-report-actions',
        'pdf-progress',
        'pdf-traceability',
        'separator-export-actions',
        'export-full',
      ])
      expect(moreActions?.menuItems).toEqual([
        expect.objectContaining({ id: 'ai-assist-local' }),
        expect.objectContaining({ id: 'import-local' }),
        expect.objectContaining({ id: 'separator-report-actions' }),
        expect.objectContaining({ id: 'pdf-progress' }),
        expect.objectContaining({ id: 'pdf-traceability' }),
        expect.objectContaining({ id: 'separator-export-actions' }),
        expect.objectContaining({ id: 'export-full' }),
      ])

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
      let importProps = context.lazyFeatureState.importRenderSpy.mock.calls.at(
        -1,
      )?.[0] as {
        open: boolean
        returnFocusTarget?: HTMLElement | null
      }
      expect(importProps.open).toBe(true)
      expect(importProps.returnFocusTarget).toBe(importTrigger)

      fireEvent.click(
        screen.getByRole('button', { name: 'cancel import review' }),
      )
      fireEvent.click(aiTrigger)
      expect(
        screen.getByRole('region', { name: 'AI authoring' }),
      ).toBeInTheDocument()
      const aiProps = context.lazyFeatureState.aiRenderSpy.mock.calls.at(
        -1,
      )?.[0] as {
        open: boolean
        returnFocusTarget?: HTMLElement | null
      }
      expect(aiProps.open).toBe(true)
      expect(aiProps.returnFocusTarget).toBe(aiTrigger)

      fireEvent.click(
        screen.getByRole('button', { name: 'review AI requirements' }),
      )
      importProps = context.lazyFeatureState.importRenderSpy.mock.calls.at(
        -1,
      )?.[0] as {
        open: boolean
        returnFocusTarget?: HTMLElement | null
      }
      expect(importProps.open).toBe(true)
      expect(importProps.returnFocusTarget).toBe(aiTrigger)
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
    })

    it('places kravunderlag create before columns and secondary actions after columns', async () => {
      context.renderRequirementsSpecificationDetailClient()
      await context.waitForInitialAvailableRequirementsRefresh()

      const itemsTable = context.latestItemsTableProps()
      const floatingActions = (itemsTable.floatingActions ?? []) as Array<{
        id: string
        menuItems?: Array<{
          disabled?: boolean
          icon?: ReactNode
          id: string
          kind?: string
          label: string
        }>
        onClick?: () => void
        position?: string
        variant?: string
      }>
      const createLocalAction = floatingActions.find(
        action => action.id === 'create-local',
      )
      const moreActions = floatingActions.find(
        action => action.id === 'more-actions',
      )

      expect(itemsTable.columnPickerPlacement).toBe('betweenActions')
      expect(floatingActions.map(action => action.id)).toEqual([
        'create-local',
        'more-actions',
      ])
      expect(
        floatingActions.map(action => action.position ?? 'afterColumns'),
      ).toEqual(['beforeColumns', 'afterColumns'])
      expect(createLocalAction?.variant).toBe('primary')
      expect(createLocalAction?.menuItems).toBeUndefined()
      expect(createLocalAction?.onClick).toEqual(expect.any(Function))
      expect(moreActions?.menuItems).toEqual([
        expect.objectContaining({ disabled: false, id: 'ai-assist-local' }),
        expect.objectContaining({ id: 'import-local' }),
        expect.objectContaining({
          id: 'separator-report-actions',
          kind: 'separator',
        }),
        expect.objectContaining({ id: 'pdf-progress' }),
        expect.objectContaining({ id: 'pdf-traceability' }),
        expect.objectContaining({
          id: 'separator-export-actions',
          kind: 'separator',
        }),
        expect.objectContaining({ id: 'export-full' }),
      ])
      expect(
        moreActions?.menuItems
          ?.filter(item => item.kind !== 'separator')
          .every(item => item.icon != null),
      ).toBe(true)
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
        const moreActions = (
          context.latestItemsTableProps().floatingActions as Array<{
            id: string
            menuItems?: Array<{
              description?: string
              disabled?: boolean
              id: string
              onClick?: () => void
              tooltip?: string
            }>
          }>
        ).find(action => action.id === 'more-actions')
        const aiAction = moreActions?.menuItems?.find(
          action => action.id === 'ai-assist-local',
        )

        expect(aiAction).toEqual(
          expect.objectContaining({
            description: expectedMessage,
            disabled: true,
            tooltip: expectedMessage,
          }),
        )
        const aiMenuItem = screen.getByRole('menuitem', {
          name: 'specification.aiGenerate',
        })
        expect(aiMenuItem).toBeDisabled()
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

      const itemsTable = context.latestItemsTableProps()
      const floatingActions = (itemsTable.floatingActions ?? []) as Array<{
        hidden?: boolean
        id: string
        menuItems?: Array<{
          href?: string
          id: string
          onClick?: (target?: HTMLButtonElement | null) => void
        }>
      }>
      const moreActions = floatingActions.find(
        action => action.id === 'more-actions',
      )

      expect(moreActions?.menuItems?.map(item => item.id)).toContain(
        'pdf-progress',
      )
      expect(moreActions?.menuItems?.map(item => item.id)).toContain(
        'pdf-traceability',
      )

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
        const floatingActions = (context.latestItemsTableProps()
          .floatingActions ?? []) as Array<{
          hidden?: boolean
          id: string
          menuItems?: Array<{ href?: string; id: string }>
        }>
        expect(
          floatingActions
            .find(action => action.id === 'more-actions')
            ?.menuItems?.map(item => item.id),
        ).toContain('pdf-traceability')
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

      const itemsTable = context.latestItemsTableProps()
      const floatingActions = (itemsTable.floatingActions ?? []) as Array<{
        hidden?: boolean
        id: string
        menuItems?: Array<{ href?: string; id: string; onClick?: () => void }>
      }>
      const moreActions = floatingActions.find(
        action => action.id === 'more-actions',
      )

      expect(moreActions?.hidden).toBe(false)
      expect(moreActions?.menuItems?.map(item => item.id)).toContain(
        'pdf-progress',
      )
      expect(moreActions?.menuItems?.map(item => item.id)).toContain(
        'pdf-traceability',
      )
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

      const moreActions = (
        context.latestItemsTableProps().floatingActions as Array<{
          id: string
          menuItems?: Array<{ disabled?: boolean; id: string }>
        }>
      ).find(action => action.id === 'more-actions')

      expect(moreActions?.menuItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            disabled: true,
            id: 'export-procurement',
          }),
          expect.objectContaining({ disabled: true, id: 'export-full' }),
        ]),
      )
    })
  })
}
