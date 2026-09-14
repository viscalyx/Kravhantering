import { expect, test } from '@playwright/test'
import {
  expectOk,
  newRoleContext,
  ROLE_STORAGE_STATE,
  withPlaywrightSqlServerDataSource,
} from '../authorization/authorization-test-helpers'

test.use({ storageState: ROLE_STORAGE_STATE.specificationResponsible })

test('SPEC-22/SPEC-23: establish, change local content atomically, reassess and inspect the original agreement', async ({
  page,
}, testInfo) => {
  const owner = await newRoleContext(testInfo, 'specificationResponsible')
  try {
    const { specification, local } =
      await test.step('Set up the agreement and original local requirement', async () => {
        const created = await owner.post('/api/requirements-specifications', {
          data: {
            name: `Agreement workflow ${Date.now()}`,
            specificationCode: `AGREEMENT-${Date.now()}`,
            specificationLifecycleStatusId: 4,
          },
        })
        await expectOk(created, 'create agreement workflow specification')
        const specification = (await created.json()) as { id: number }
        const localResponse = await owner.post(
          `/api/requirements-specifications/${specification.id}/local-requirements`,
          {
            data: { description: 'Original agreed service', verifiable: false },
          },
        )
        await expectOk(localResponse, 'create original local content')
        const local = (await localResponse.json()) as {
          localRequirement: { id: number }
        }
        return { specification, local }
      })
    await page.goto(`/en/specifications/${specification.id}`)
    const panel = page.getByRole('region', {
      name: 'Agreement and version history',
    })
    await test.step('Establish the agreement and verify direct content is locked', async () => {
      await expect(panel).toBeVisible()
      await panel.getByLabel(/^Reason/).fill('Supplier agreement registered')
      await panel.getByLabel(/^Agreement reference/).fill('Agreement A')
      await panel.getByLabel(/^Effective date/).fill('2026-01-01')
      await panel
        .getByRole('button', { name: 'Establish agreement', exact: true })
        .click()
      await expect(
        panel.getByText('Established supplier agreement', { exact: false }),
      ).toBeVisible()
      await expect(
        page.getByRole('button', {
          name: 'New local requirement',
          exact: true,
        }),
      ).toHaveCount(0)
      await page.getByRole('tab', { name: /^Needs references/ }).click()
      await expect(
        page.getByRole('button', { name: 'New needs reference', exact: true }),
      ).toHaveCount(0)
    })
    await test.step('Prepare and decide the local content amendment', async () => {
      await panel.getByLabel(/^Reason/).fill('Agreed clearer service boundary')
      await panel.getByLabel(/^Agreement reference/).fill('Agreement A / T1')
      const today = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Stockholm',
      }).format(new Date())
      await panel.getByLabel(/^Effective date/).fill(today)
      await panel.getByLabel(/^Change type/).selectOption('change_local')
      await panel
        .getByLabel(/^Requirement application/)
        .selectOption(`local:${local.localRequirement.id}`)
      await panel
        .getByLabel(/^Local requirement text/)
        .fill('Changed agreed service')
      await panel
        .getByRole('button', { name: 'Add change', exact: true })
        .click()
      await panel
        .getByRole('button', { name: 'Prepare amendment', exact: true })
        .click()
      const amendment = panel.getByRole('article')
      await expect(amendment).toContainText('Changed agreed service')
      await expect(panel.locator('ul').first()).toContainText(
        'Original agreed service',
      )
      await amendment
        .getByRole('button', { name: 'Record agreement decision', exact: true })
        .click()
      await expect(panel.locator('ul').first()).toContainText(
        'Changed agreed service',
      )
      await expect(
        panel.getByText('Reassessment required', { exact: true }),
      ).toBeVisible()
    })
    await test.step('Reassess the changed requirement', async () => {
      await panel.getByLabel(/^Reason/).fill('Verified the changed service')
      await panel.getByLabel(/^Reassessed usage status/).selectOption('4')
      await panel.getByRole('button', { name: 'Confirm reassessment' }).click()
      await expect(
        panel.getByText('Reassessment required', { exact: true }),
      ).toHaveCount(0)
    })
    await test.step('Inspect the original agreement history', async () => {
      await panel
        .getByRole('button', { name: 'Original agreed content', exact: true })
        .click()
      await expect(panel.locator('ul').first()).toContainText(
        'Original agreed service',
      )
      await expect(panel.locator('ul').first()).not.toContainText(
        'Changed agreed service',
      )
    })
    await test.step('Export the selected original agreement view', async () => {
      const download = page.waitForEvent('download')
      await panel
        .getByRole('button', { name: 'Export selected view as JSON' })
        .click()
      expect((await download).suggestedFilename()).toContain('-original.json')
    })
  } finally {
    await owner.dispose()
  }
})

test('SPEC-23: compare a pinned version, keep it, then explicitly adopt with its original needs and note', async ({
  page,
}, testInfo) => {
  const owner = await newRoleContext(testInfo, 'specificationResponsible')
  try {
    const specification =
      await test.step('Set up an editable specification pinned to the older version', async () => {
        const response = await owner.post('/api/requirements-specifications', {
          data: {
            name: `Version adoption ${Date.now()}`,
            specificationCode: `ADOPTION-${Date.now()}`,
            specificationLifecycleStatusId: 4,
          },
        })
        await expectOk(response, 'create editable adoption fixture')
        const specification = (await response.json()) as { id: number }
        // Pin the old published seed version to exercise the visible upgrade path.
        await withPlaywrightSqlServerDataSource(db =>
          db.query(
            `INSERT INTO requirements_specification_items
      (requirements_specification_id, requirement_id, requirement_version_id, note, specification_item_status_id, created_at)
      SELECT @0, requirement_id, requirement_version_id, N'Preserved delivery note', 4, SYSUTCDATETIME()
      FROM requirements_specification_items WHERE id = 20`,
            [specification.id],
          ),
        )
        return specification
      })
    await page.goto(`/en/specifications/${specification.id}`)
    const panel = page.getByRole('region', {
      name: 'Agreement and version history',
    })
    await test.step('Compare versions and keep the current binding', async () => {
      await panel.getByRole('button', { name: 'Compare versions' }).click()
      await expect(panel.getByRole('table')).toContainText(
        'återställningsövning',
      )
      await panel.getByRole('button', { name: 'Keep current version' }).click()
      await expect(panel.locator('ul').first()).not.toContainText(
        'återställningsövning',
      )
    })
    await test.step('Adopt the published version and verify reassessment is required', async () => {
      await panel.getByRole('button', { name: 'Compare versions' }).click()
      await panel
        .getByLabel(/^Reason/)
        .fill('Adopt the clarified published delivery requirement')
      await panel
        .getByRole('button', { name: 'Adopt compared version' })
        .click()
      await expect(panel.locator('ul').first()).toContainText(
        'återställningsövning',
      )
      await expect(panel.locator('ul').first()).toContainText(
        'Preserved delivery note',
      )
      await expect(
        panel.getByText('Reassessment required', { exact: true }),
      ).toBeVisible()
    })
    await test.step('Inspect the previous binding history', async () => {
      await panel.getByRole('button', { name: 'Previous bindings' }).click()
      await expect(panel.locator('ul').first()).not.toContainText(
        'återställningsövning',
      )
    })
  } finally {
    await owner.dispose()
  }
})
