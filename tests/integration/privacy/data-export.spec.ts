import { existsSync, readFileSync } from 'node:fs'
import { expect, type Route, test } from '@playwright/test'
import type { DataSource } from 'typeorm'
import { sqlServerEntities } from '../../../lib/typeorm/entities'
import {
  createSqlServerDataSource,
  getSqlServerDatabaseUrl,
  type SqlServerRuntimeEnv,
} from '../../../lib/typeorm/sqlserver-config'

// cspell:ignore kalle linneab retentionorphan pwtprivacy

const PWT_PRIVACY_TARGET_HSA_ID = 'SE5560000001-pwtprivacy'
const PRIVACY_OFFICER_STORAGE_STATE = 'test-results/auth/privacy-officer.json'
let playwrightSqlServerDataSource: Promise<DataSource> | null = null

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}

  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const normalized = line.startsWith('export ')
          ? line.slice('export '.length).trim()
          : line
        const separatorIndex = normalized.indexOf('=')
        if (separatorIndex === -1) return null

        const key = normalized.slice(0, separatorIndex).trim()
        let value = normalized.slice(separatorIndex + 1).trim()
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1)
        }

        return [key, value] as const
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  )
}

function getPlaywrightSqlServerEnv(): SqlServerRuntimeEnv {
  return {
    ...readEnvFile('.env.prodlike'),
    ...readEnvFile('.env.sqlserver'),
    ...process.env,
  } as SqlServerRuntimeEnv
}

async function getPlaywrightSqlServerDataSource(): Promise<DataSource> {
  if (playwrightSqlServerDataSource) return playwrightSqlServerDataSource

  const env = getPlaywrightSqlServerEnv()
  const url = getSqlServerDatabaseUrl(env)
  const dataSource = createSqlServerDataSource({
    entities: sqlServerEntities,
    env,
    url,
  })

  playwrightSqlServerDataSource = dataSource
    .initialize()
    .then(() => dataSource)
    .catch(error => {
      playwrightSqlServerDataSource = null
      throw error
    })

  return playwrightSqlServerDataSource
}

async function resetPwtPrivacyTarget() {
  const db = await getPlaywrightSqlServerDataSource()
  await db.transaction(async manager => {
    await manager.query(
      `UPDATE improvement_suggestions
        SET created_by = @1,
            created_by_hsa_id = @2,
            updated_at = @3
        WHERE id = @0`,
      [920001, 'PWT Privacy Target', PWT_PRIVACY_TARGET_HSA_ID, new Date()],
    )
    await manager.query(
      `DELETE FROM action_audit_events
        WHERE action = @0
          AND target_kind = @1
          AND actor_hsa_id = @2`,
      ['privacy.erasure.execute', 'PrivacyErasure', 'SE5560000001-privacy1'],
    )
  })
}

test.afterAll(async () => {
  if (!playwrightSqlServerDataSource) return

  try {
    const dataSource = await playwrightSqlServerDataSource
    if (dataSource.isInitialized) {
      await dataSource.destroy()
    }
  } finally {
    playwrightSqlServerDataSource = null
  }
})

function exportPayload(hsaId: string) {
  return {
    generatedAt: '2026-05-12T12:00:00.000Z',
    generatedBy: {
      displayName: 'Ada Admin',
      hsaId: 'SE5560000001-admin1',
      roles: ['Admin', 'PrivacyOfficer'],
      source: 'oidc',
      sub: 'admin-sub',
    },
    limitations: [],
    schemaVersion: 'privacy-data-subject-export.v1',
    sources: [],
    subject: {
      hsaId,
      targetFingerprint: '0123456789abcdef0123456789abcdef',
    },
    summary: {
      itemCount: 2,
      limitationCount: 0,
      sourceCount: 1,
    },
  }
}

function privacyPreview(
  targetHsaId: string,
  groups: Array<Record<string, unknown>>,
  previewToken = 'privacy-preview-token',
) {
  return {
    groups,
    previewToken,
    targetFingerprint: `${targetHsaId}-fingerprint`
      .slice(0, 32)
      .padEnd(32, '0'),
    totalCount: groups.reduce(
      (sum, group) => sum + (typeof group.count === 'number' ? group.count : 0),
      0,
    ),
  }
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    contentType: 'application/json',
    json: body,
    status,
  })
}

test('PRIV-02/PRIV-03: admin privacy preview can export JSON and PDF for the preview target', async ({
  page,
}) => {
  const exportRequests: unknown[] = []

  await test.step('set up the export route mock', async () => {
    await page.route('**/api/privacy/data-subject-export', async route => {
      const body = route.request().postDataJSON()
      exportRequests.push(body)
      const hsaId =
        typeof body === 'object' &&
        body !== null &&
        'target' in body &&
        typeof body.target === 'object' &&
        body.target !== null &&
        'hsaId' in body.target &&
        typeof body.target.hsaId === 'string'
          ? body.target.hsaId
          : 'SE5560000001-admin1'
      await route.fulfill({
        contentType: 'application/json',
        json: exportPayload(hsaId),
      })
    })
  })

  await test.step('navigate to privacy preview and search the target', async () => {
    await page.goto('/sv/admin?tab=privacy')
    await page
      .getByRole('textbox', { name: 'HSA-id att söka efter' })
      .fill('SE5560000001-linneab')
    await page.getByRole('button', { name: 'Förhandsgranska' }).click()

    await expect(
      page.getByRole('button', { name: 'Exportera JSON' }),
    ).toBeVisible()
  })

  await test.step('export JSON for the preview target', async () => {
    await page.getByRole('button', { name: 'Exportera JSON' }).click()

    await expect.poll(() => exportRequests.length).toBe(1)
    expect(exportRequests[0]).toMatchObject({
      delivery: 'json',
      target: { hsaId: 'SE5560000001-linneab' },
    })
  })

  await test.step('export PDF for the preview target', async () => {
    await page.getByRole('button', { name: 'Exportera PDF' }).click()
    await expect.poll(() => exportRequests.length).toBe(2)
    expect(exportRequests[1]).toMatchObject({
      delivery: 'pdf',
      locale: 'sv',
      target: { hsaId: 'SE5560000001-linneab' },
    })
  })
})

test('PRIV-04: duplicate names are previewed by exact HSA-id target only', async ({
  page,
}) => {
  const previewTargets: string[] = []

  await test.step('set up exact-target preview routing', async () => {
    await page.route('**/api/privacy/erasure-preview', async route => {
      const body = route.request().postDataJSON() as {
        target?: { hsaId?: string }
      }
      const hsaId = body.target?.hsaId ?? 'missing-target'
      previewTargets.push(hsaId)
      await fulfillJson(
        route,
        privacyPreview(hsaId, [
          {
            affectedReferences: [`${hsaId} / suggestion`],
            allowedActions: ['anonymize', 'skip'],
            count: 1,
            currentDisplayValue: 'Kalle Svensson',
            fieldKey: 'resolvedBy',
            key: `improvement_suggestions.resolved_by:${hsaId}`,
            objectKey: 'improvementSuggestions',
            recommendedAction: 'anonymize',
            warningKey: 'decisionSwitch',
          },
        ]),
      )
    })
  })

  await test.step('preview the first duplicate display name target', async () => {
    await page.goto('/sv/admin?tab=privacy')
    const targetInput = page.getByRole('textbox', {
      name: 'HSA-id att söka efter',
    })

    await targetInput.fill('SE5560000001-kalle.one')
    await page.getByRole('button', { name: 'Förhandsgranska' }).click()
    await expect(
      page.getByText('SE5560000001-kalle.one / suggestion'),
    ).toHaveCount(1)
  })

  await test.step('preview the second duplicate display name target', async () => {
    const targetInput = page.getByRole('textbox', {
      name: 'HSA-id att söka efter',
    })

    await targetInput.fill('SE5560000001-kalle.two')
    await page.getByRole('button', { name: 'Förhandsgranska' }).click()
    await expect(
      page.getByText('SE5560000001-kalle.two / suggestion'),
    ).toHaveCount(1)
    await expect(
      page.getByText('SE5560000001-kalle.one / suggestion'),
    ).toHaveCount(0)
  })

  expect(previewTargets).toEqual([
    'SE5560000001-kalle.one',
    'SE5560000001-kalle.two',
  ])
})

test('PRIV-05: replacement-person action sends switch execution with replacement data', async ({
  page,
}) => {
  const executeRequests: unknown[] = []

  await test.step('set up switch preview and execution routes', async () => {
    await page.route('**/api/privacy/erasure-preview', async route => {
      await fulfillJson(
        route,
        privacyPreview(
          'SE5560000001-kalle.one',
          [
            {
              affectedReferences: ['INT Integration'],
              allowedActions: ['switch', 'skip'],
              count: 1,
              currentDisplayValue: 'SE5560000001-kalle.one',
              fieldKey: 'owner',
              key: 'requirement_areas.owner',
              objectKey: 'requirementAreas',
              recommendedAction: 'switch',
              warningKey: 'liveAssignment',
            },
          ],
          'switch-preview-token',
        ),
      )
    })
    await page.route('**/api/privacy/erasure-requests', async route => {
      executeRequests.push(route.request().postDataJSON())
      await fulfillJson(route, {
        actions: { anonymize: 0, delete: 0, skip: 0, switch: 1 },
        groups: [],
        requestId: 'switch-request',
        targetFingerprint: 'switch-fingerprint',
        totalCount: 1,
      })
    })
  })

  await test.step('preview replacement-person switch data', async () => {
    await page.goto('/sv/admin?tab=privacy')
    await page
      .getByRole('textbox', { name: 'HSA-id att söka efter' })
      .fill('SE5560000001-kalle.one')
    await page
      .getByRole('textbox', { name: 'Ersättande HSA-id' })
      .fill('SE5560000001-linneab')
    await page
      .getByRole('textbox', { name: 'Ersättande namn' })
      .fill('Linnea B')
    await page.getByRole('textbox', { name: 'Förnamn' }).fill('Linnea')
    await page.getByRole('textbox', { name: 'Efternamn' }).fill('B')
    await page
      .getByRole('textbox', { name: 'E-post' })
      .fill('linnea@example.test')
    await page.getByRole('button', { name: 'Förhandsgranska' }).click()

    await expect(page.getByText('INT Integration')).toHaveCount(1)
  })

  await test.step('execute the switch erasure request', async () => {
    await page.getByRole('button', { name: 'Kör radering' }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Kör radering' })
      .click()

    await expect.poll(() => executeRequests.length).toBe(1)
    expect(executeRequests[0]).toMatchObject({
      actions: { 'requirement_areas.owner': 'switch' },
      previewToken: 'switch-preview-token',
      replacement: {
        displayName: 'Linnea B',
        email: 'linnea@example.test',
        firstName: 'Linnea',
        hsaId: 'SE5560000001-linneab',
        lastName: 'B',
      },
      target: { hsaId: 'SE5560000001-kalle.one' },
    })
    await expect(page.getByText('Dataskyddsradering slutförd.')).toHaveCount(1)
  })
})

test('PRIV-06: anonymize and skip actions execute separately from one preview', async ({
  page,
}) => {
  const executeRequests: unknown[] = []

  await test.step('set up mixed-action privacy routes', async () => {
    await page.route('**/api/privacy/erasure-preview', async route => {
      await fulfillJson(
        route,
        privacyPreview(
          'SE5560000001-kalle.one',
          [
            {
              affectedReferences: ['INT0001 v1'],
              allowedActions: ['anonymize', 'skip'],
              count: 1,
              currentDisplayValue: 'Kalle Svensson',
              fieldKey: 'createdBy',
              key: 'requirement_versions.created_by',
              objectKey: 'requirementVersions',
              recommendedAction: 'anonymize',
              warningKey: 'historySwitch',
            },
            {
              affectedReferences: ['INT0001 v1 / suggestion'],
              allowedActions: ['anonymize', 'skip'],
              count: 1,
              currentDisplayValue: 'Kalle Svensson',
              fieldKey: 'resolvedBy',
              key: 'improvement_suggestions.resolved_by',
              objectKey: 'improvementSuggestions',
              recommendedAction: 'anonymize',
              warningKey: 'decisionSwitch',
            },
          ],
          'mixed-actions-preview-token',
        ),
      )
    })
    await page.route('**/api/privacy/erasure-requests', async route => {
      executeRequests.push(route.request().postDataJSON())
      await fulfillJson(route, {
        actions: { anonymize: 1, delete: 0, skip: 1, switch: 0 },
        groups: [],
        requestId: 'mixed-actions-request',
        targetFingerprint: 'mixed-actions-fingerprint',
        totalCount: 2,
      })
    })
  })

  await test.step('preview and choose separate actions', async () => {
    await page.goto('/sv/admin?tab=privacy')
    await page
      .getByRole('textbox', { name: 'HSA-id att söka efter' })
      .fill('SE5560000001-kalle.one')
    await page.getByRole('button', { name: 'Förhandsgranska' }).click()

    const suggestionRow = page
      .getByText('Förbättringsförslag')
      .locator('xpath=ancestor::tr')
    await suggestionRow.getByRole('combobox').selectOption('skip')
  })

  await test.step('execute anonymize and skip actions', async () => {
    await page.getByRole('button', { name: 'Kör radering' }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Kör radering' })
      .click()

    await expect.poll(() => executeRequests.length).toBe(1)
    expect(executeRequests[0]).toMatchObject({
      actions: {
        'improvement_suggestions.resolved_by': 'skip',
        'requirement_versions.created_by': 'anonymize',
      },
      previewToken: 'mixed-actions-preview-token',
    })
  })
})

test('PRIV-07: stale privacy preview is rejected and keeps the preview editable', async ({
  page,
}) => {
  await test.step('set up stale preview routes', async () => {
    await page.route('**/api/privacy/erasure-preview', async route => {
      await fulfillJson(
        route,
        privacyPreview(
          'SE5560000001-kalle.one',
          [
            {
              affectedReferences: ['INT0001 v1'],
              allowedActions: ['anonymize', 'skip'],
              count: 1,
              currentDisplayValue: 'Kalle Svensson',
              fieldKey: 'createdBy',
              key: 'requirement_versions.created_by',
              objectKey: 'requirementVersions',
              recommendedAction: 'anonymize',
              warningKey: 'historySwitch',
            },
          ],
          'stale-preview-token',
        ),
      )
    })
    await page.route('**/api/privacy/erasure-requests', async route => {
      await fulfillJson(
        route,
        { code: 'conflict', error: 'Privacy erasure preview is stale' },
        409,
      )
    })
  })

  await test.step('create a preview from the stale token', async () => {
    await page.goto('/sv/admin?tab=privacy')
    await page
      .getByRole('textbox', { name: 'HSA-id att söka efter' })
      .fill('SE5560000001-kalle.one')
    await page.getByRole('button', { name: 'Förhandsgranska' }).click()
    await expect(page.getByText('Kravversioner')).toHaveCount(1)
  })

  await test.step('reject stale execution and keep the preview editable', async () => {
    await page.getByRole('button', { name: 'Kör radering' }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Kör radering' })
      .click()

    await expect(
      page.getByText(
        'Förhandsgranskningen är inaktuell. Kör en ny förhandsgranskning innan radering.',
      ),
    ).toHaveCount(1)
    await expect(
      page
        .getByLabel('Dataskydd', { exact: true })
        .getByRole('button', { name: 'Kör radering' }),
    ).toBeEnabled()
  })
})

test('PRIV-08: privacy erasure anonymizes a disposable row and records the action log', async ({
  browser,
  page,
}) => {
  await test.step('reset the disposable privacy target', async () => {
    await resetPwtPrivacyTarget()
  })

  const privacyContext = await browser.newContext({
    storageState: PRIVACY_OFFICER_STORAGE_STATE,
    viewport: { height: 720, width: 1280 },
  })
  const privacyPage = await privacyContext.newPage()
  try {
    await test.step('execute erasure as privacy officer', async () => {
      await privacyPage.goto('/sv/admin?tab=privacy')
      await privacyPage
        .getByRole('textbox', { name: 'HSA-id att söka efter' })
        .fill(PWT_PRIVACY_TARGET_HSA_ID)
      await privacyPage.getByRole('button', { name: 'Förhandsgranska' }).click()

      await expect(privacyPage.getByText('Förbättringsförslag')).toHaveCount(1)
      await expect(privacyPage.getByText('PWT-SPEC-EDIT-SOURCE')).toHaveCount(1)

      await privacyPage.getByRole('button', { name: 'Kör radering' }).click()
      await privacyPage
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Kör radering' })
        .click()

      await expect(
        privacyPage.getByText('Dataskyddsradering slutförd.'),
      ).toHaveCount(1)
      await expect(privacyPage.getByText('Utfört')).toHaveCount(1)
    })
  } finally {
    await privacyContext.close()
  }

  await test.step('verify the disposable row was anonymized', async () => {
    const db = await getPlaywrightSqlServerDataSource()
    const rows = (await db.query(
      `SELECT created_by AS createdBy,
            created_by_hsa_id AS createdByHsaId
       FROM improvement_suggestions
       WHERE id = @0`,
      [920001],
    )) as Array<{ createdBy: string | null; createdByHsaId: string | null }>
    expect(rows).toEqual([{ createdBy: 'no-user', createdByHsaId: null }])
  })

  await test.step('verify the action log entry is visible', async () => {
    await page.goto(
      '/sv/admin?tab=actionAuditLog&action=privacy.erasure.execute&target_kind=PrivacyErasure&actor_hsa_id=SE5560000001-privacy1',
    )
    await expect(
      page.getByRole('heading', { name: 'Åtgärdslogg' }),
    ).toHaveCount(1)
    await expect(page.getByText('privacy.erasure.execute')).toHaveCount(1)
    await expect(page.getByText('PrivacyErasure')).toHaveCount(1)
    await expect(page.getByText('SE5560000001-privacy1')).toHaveCount(1)
  })
})

test('PRIV-09: export includes the orphaned responsibility person target only', async ({
  page,
}) => {
  const exportRequests: unknown[] = []
  let exportedPayload: unknown = null

  await test.step('set up orphan preview and export routes', async () => {
    await page.route('**/api/privacy/erasure-preview', async route => {
      await fulfillJson(
        route,
        privacyPreview('SE5560000001-retentionorphan', [], 'orphan-preview'),
      )
    })
    await page.route('**/api/privacy/data-subject-export', async route => {
      const body = route.request().postDataJSON()
      exportRequests.push(body)
      exportedPayload = {
        ...exportPayload('SE5560000001-retentionorphan'),
        sources: [
          {
            items: [
              {
                fields: [
                  {
                    label: 'HSA-id',
                    value: 'SE5560000001-retentionorphan',
                  },
                ],
                title: 'Lokal kravansvarsperson utan tilldelning',
              },
            ],
            source: 'requirement_responsibility_people',
          },
        ],
      }
      await fulfillJson(route, exportedPayload)
    })
  })

  await test.step('preview and export the orphaned target', async () => {
    await page.goto('/sv/admin?tab=privacy')
    await page
      .getByRole('textbox', { name: 'HSA-id att söka efter' })
      .fill('SE5560000001-retentionorphan')
    await page.getByRole('button', { name: 'Förhandsgranska' }).click()
    await page.getByRole('button', { name: 'Exportera JSON' }).click()
  })

  await test.step('verify only the orphaned target was exported', async () => {
    await expect.poll(() => exportRequests.length).toBe(1)
    expect(exportRequests[0]).toMatchObject({
      delivery: 'json',
      target: { hsaId: 'SE5560000001-retentionorphan' },
    })
    expect(exportedPayload).toMatchObject({
      subject: { hsaId: 'SE5560000001-retentionorphan' },
      sources: [
        expect.objectContaining({
          items: [
            expect.objectContaining({
              fields: expect.arrayContaining([
                {
                  label: 'HSA-id',
                  value: 'SE5560000001-retentionorphan',
                },
              ]),
            }),
          ],
          source: 'requirement_responsibility_people',
        }),
      ],
    })
    expect(JSON.stringify(exportedPayload)).toContain(
      'SE5560000001-retentionorphan',
    )
    const unrelatedOrphanIdentity = 'SE5560000001-unused' + 'orphan'
    expect(JSON.stringify(exportedPayload)).not.toContain(
      unrelatedOrphanIdentity,
    )
  })
})

test('PRIV-01: self-service privacy page exports the signed-in user without target override', async ({
  page,
}) => {
  const exportRequests: unknown[] = []

  await test.step('set up self-service export route', async () => {
    await page.route('**/api/privacy/data-subject-export', async route => {
      const body = route.request().postDataJSON()
      exportRequests.push(body)
      await route.fulfill({
        contentType: 'application/json',
        json: exportPayload('SE5560000001-admin1'),
      })
    })
  })

  await test.step('export the signed-in user from self-service privacy', async () => {
    await page.goto('/sv/privacy')
    await expect(
      page.getByRole('heading', { name: 'Export av personuppgifter' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Exportera JSON' }).click()
  })

  await test.step('verify no target override was sent', async () => {
    await expect.poll(() => exportRequests.length).toBe(1)
    expect(exportRequests[0]).toEqual({ delivery: 'json' })
  })
})
