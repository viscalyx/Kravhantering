import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from '@playwright/test'
import type { RequirementDetailResponse } from '@/lib/requirements/types'
import { DESKTOP_VIEWPORT } from '@/tests/helpers/desktop-viewport'
import { expectApiResponseOk } from '@/tests/integration/api-response-assertions'

const initialToken = '11111111-1111-4111-8111-111111111111'
const latestToken = '22222222-2222-4222-8222-222222222222'

async function openConcurrentEdit(
  page: Page,
  request: APIRequestContext,
  throughDetail = false,
  beforeEdit?: () => Promise<void>,
) {
  const response = await request.get('/api/requirements/INT0001')
  await expectApiResponseOk(response, 'load requirement edit fixture')
  const server = (await response.json()) as RequirementDetailResponse
  server.isArchived = false
  server.permissions.canEdit = true
  server.versions = [
    {
      ...server.versions[0],
      description: 'Ursprunglig kravtext',
      acceptanceCriteria: 'Ursprungligt kriterium',
      status: 1,
      revisionToken: initialToken,
      versionNormReferences: [],
      versionRequirementPackages: [],
    },
  ]
  await page.route('**/api/norm-references**', route =>
    route.fulfill({
      json: {
        normReferences: [1, 2].map(id => ({
          id,
          name: `Norm ${id}`,
          normReferenceId: `NR-${id}`,
        })),
      },
    }),
  )
  await page.route('**/api/requirement-packages**', route =>
    route.fulfill({
      json: {
        requirementPackages: [1, 2].map(id => ({ id, name: `Paket ${id}` })),
      },
    }),
  )
  const saved: Record<string, unknown>[] = []
  await page.route('**/api/requirements/INT0001', async route => {
    if (route.request().method() !== 'PUT') {
      await route.fulfill({ json: server })
      return
    }
    const body = route.request().postDataJSON() as Record<string, unknown>
    if (body.baseRevisionToken !== server.versions[0].revisionToken) {
      await route.fulfill({
        status: 409,
        json: {
          code: 'conflict',
          details: {
            reason: 'stale_requirement_edit',
            latest: {
              uniqueId: 'INT0001',
              versionNumber: server.versions[0].versionNumber,
            },
          },
        },
      })
      return
    }
    saved.push(body)
    await route.fulfill({ json: { uniqueId: 'INT0001' } })
  })
  if (throughDetail) {
    await page.goto(
      `/sv/requirements/INT0001/${server.versions[0].versionNumber}`,
    )
    await expect
      .poll(() => page.evaluate(() => Boolean(window.history.state?.__NA)))
      .toBe(true)
    await page.evaluate(() => {
      window.history.pushState(
        window.history.state,
        '',
        `${window.location.pathname}?history=intermediate`,
      )
    })
    await page.getByRole('link', { name: 'Redigera', exact: true }).click()
  } else {
    await page.goto('/sv/requirements/INT0001/edit')
  }
  await beforeEdit?.()
  await page
    .getByRole('textbox', { name: /^Kravtext/ })
    .fill('Min osparade kravtext')
  server.versions[0].revisionToken = latestToken
  return { server, saved }
}

async function compare(page: Page) {
  await page.getByRole('button', { name: 'Spara', exact: true }).click()
  await page.getByRole('button', { name: 'Jämför med senaste' }).click()
  return page.getByRole('dialog', { name: 'Sammanjämka ändringar' })
}

test.describe('Requirement edit reconciliation', () => {
  test.use({ viewport: DESKTOP_VIEWPORT })

  test('COL-08: combines independent edits and saves the compared revision', async ({
    page,
    request,
  }) => {
    const { server, saved } =
      await test.step('open a draft before the other author saves', () =>
        openConcurrentEdit(page, request))
    server.versions[0].acceptanceCriteria = 'Den andra författarens kriterium'
    await test.step('compare and review both authors’ changes', async () => {
      const dialog = await compare(page)
      await expect(
        dialog.getByRole('region', { name: 'Kravtext' }),
      ).toContainText('Min osparade kravtext')
      await expect(
        dialog.getByRole('region', { name: 'Acceptanskriterium' }),
      ).toContainText('Den andra författarens kriterium')
      await expect(dialog).toHaveAttribute(
        'data-developer-mode-value',
        'requirement edit reconciliation',
      )
      await dialog
        .getByRole('button', { name: 'Kontrollera resultatet i formuläret' })
        .click()
      await expect(
        page.getByRole('textbox', { name: /^Kravtext/ }),
      ).toHaveValue('Min osparade kravtext')
      await expect(
        page.getByRole('textbox', { name: /^Acceptanskriterium/ }),
      ).toHaveValue('Den andra författarens kriterium')
    })
    const nextToken = '33333333-3333-4333-8333-333333333333'
    await test.step('compare again after a further intervening update', async () => {
      server.versions[0].revisionToken = nextToken
      server.versions[0].acceptanceCriteria =
        'Ytterligare förtydligat kriterium'
      const dialog = await compare(page)
      await expect(
        dialog.getByRole('region', { name: 'Acceptanskriterium' }),
      ).toContainText('Ytterligare förtydligat kriterium')
      await dialog
        .getByRole('button', { name: 'Kontrollera resultatet i formuläret' })
        .click()
    })
    await test.step('save using the compared revision', async () => {
      await page.getByRole('button', { name: 'Spara', exact: true }).click()
      await expect(page).toHaveURL(/\/sv\/requirements(?:\?|$)/)
      expect(saved).toEqual([
        expect.objectContaining({
          description: 'Min osparade kravtext',
          acceptanceCriteria: 'Ytterligare förtydligat kriterium',
          baseVersionId: server.versions[0].id,
          baseRevisionToken: nextToken,
        }),
      ])
    })
  })

  test('COL-09: retains competing values on cancel and requires a choice before review', async ({
    page,
    request,
  }) => {
    const { server, saved } = await openConcurrentEdit(page, request)
    await page.getByRole('checkbox', { name: /NR-1 Norm 1/ }).check()
    await page.getByRole('checkbox', { name: 'Paket 1' }).check()
    server.versions[0].description = 'Den andra författarens kravtext'
    server.versions[0].versionNormReferences = [
      {
        normReference: {
          id: 2,
          name: 'Norm 2',
          normReferenceId: 'NR-2',
          issuer: 'Issuer',
          reference: 'Reference',
          type: 'Standard',
          uri: null,
          version: null,
        },
      },
    ]
    server.versions[0].versionRequirementPackages = [
      {
        requirementPackage: {
          id: 2,
          name: 'Paket 2',
          ownerId: null,
          purposeAndScope: null,
        },
      },
    ]
    await test.step('cancel comparison without losing local work', async () => {
      const dialog = await compare(page)
      await expect(
        dialog.getByRole('button', {
          name: 'Kontrollera resultatet i formuläret',
        }),
      ).toBeDisabled()
      await expect(
        dialog.getByRole('button', { name: 'Avbryt jämförelsen' }),
      ).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await expect(
        page.getByRole('textbox', { name: /^Kravtext/ }),
      ).toHaveValue('Min osparade kravtext')
      await expect(
        page.getByRole('button', { name: 'Jämför med senaste' }),
      ).toBeFocused()
    })
    await test.step('choose, edit and save the result', async () => {
      await page.getByRole('button', { name: 'Jämför med senaste' }).click()
      const dialog = page.getByRole('dialog', { name: 'Sammanjämka ändringar' })
      const row = dialog.getByRole('region', { name: 'Kravtext' })
      for (const value of [
        'Ursprunglig kravtext',
        'Min osparade kravtext',
        'Den andra författarens kravtext',
      ])
        await expect(row).toContainText(value)
      await row.getByRole('button', { name: 'Behåll ditt värde' }).click()
      await expect(
        dialog.getByRole('button', {
          name: 'Kontrollera resultatet i formuläret',
        }),
      ).toBeDisabled()
      await dialog
        .getByRole('region', { name: 'Normreferenser' })
        .getByRole('button', { name: 'Behåll ditt värde' })
        .click()
      await dialog
        .getByRole('region', { name: 'Kravpaket' })
        .getByRole('button', { name: 'Behåll senaste värdet' })
        .click()
      await dialog
        .getByRole('button', { name: 'Kontrollera resultatet i formuläret' })
        .click()
      await page
        .getByRole('textbox', { name: /^Kravtext/ })
        .fill('Mitt sammanjämkade resultat')
      await page.getByRole('button', { name: 'Spara', exact: true }).click()
      await expect(page).toHaveURL(/\/sv\/requirements(?:\?|$)/)
      expect(saved).toEqual([
        expect.objectContaining({
          description: 'Mitt sammanjämkade resultat',
          normReferenceIds: [1],
          requirementPackageIds: [2],
          baseRevisionToken: latestToken,
        }),
      ])
    })
  })

  for (const [restriction, expected] of [
    ['review', 'status Granskning'],
    ['archived', 'Arkiverat'],
    ['permission', 'behörighet'],
  ] as const) {
    test(`COL-10: ${restriction} blocks saving while unsaved values can be copied and retained`, async ({
      page,
      request,
      context,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
      const { server, saved } = await openConcurrentEdit(page, request)
      await page.getByRole('checkbox', { name: /NR-1 Norm 1/ }).check()
      await page.getByRole('checkbox', { name: 'Paket 2', exact: true }).check()
      server.versions[0].status =
        restriction === 'archived' ? 4 : restriction === 'review' ? 2 : 1
      server.permissions.canEdit = restriction !== 'permission'
      await test.step('recover a rejected save after entry into review', async () => {
        await compare(page)
        await expect(
          page.getByRole('alert').filter({ hasText: 'Kravet ändrades' }),
        ).toContainText(expected)
        await expect(
          page.getByRole('button', { name: 'Spara', exact: true }),
        ).toBeDisabled()
        await expect(
          page.getByRole('textbox', { name: /^Kravtext/ }),
        ).toHaveValue('Min osparade kravtext')
      })
      await test.step('copy the work and decline discarding it', async () => {
        await page.evaluate(() => {
          const writeText = navigator.clipboard.writeText.bind(
            navigator.clipboard,
          )
          let attempted = false
          navigator.clipboard.writeText = async value => {
            if (!attempted) {
              attempted = true
              throw new Error('Clipboard unavailable')
            }
            await writeText(value)
          }
        })
        await page
          .getByRole('button', { name: 'Kopiera osparat arbete' })
          .click()
        await expect(page.getByRole('status')).toContainText(
          'Kopieringen misslyckades',
        )
        await page
          .getByRole('button', { name: 'Kopiera osparat arbete' })
          .click()
        await expect(page.getByRole('status')).toHaveText(
          'Osparat arbete har kopierats.',
        )
        const copied = await page.evaluate(() => navigator.clipboard.readText())
        expect(copied).toContain('Kravtext: Min osparade kravtext')
        expect(copied).toContain('Norm 1 (#1)')
        expect(copied).toContain('Paket 2 (#2)')
        await page.getByRole('button', { name: 'Visa senaste' }).click()
        await page
          .getByRole('alertdialog')
          .getByRole('button', { name: 'Avbryt', exact: true })
          .click()
        await expect(
          page.getByRole('textbox', { name: /^Kravtext/ }),
        ).toHaveValue('Min osparade kravtext')
        expect(saved).toEqual([])
      })
    })
  }

  test('COL-11: an editor at the first history entry keeps unsaved work when Back has no destination', async ({
    page,
    request,
    context,
  }) => {
    await openConcurrentEdit(page, request, false, async () => {
      const session = await context.newCDPSession(page)
      await session.send('Page.resetNavigationHistory')
      await session.detach()
    })
    expect(await page.evaluate(() => window.history.length)).toBe(1)
    await page.evaluate(() => window.history.back())
    await expect(page.getByRole('textbox', { name: /^Kravtext/ })).toHaveValue(
      'Min osparade kravtext',
    )
    await page.getByRole('button', { name: 'Avbryt', exact: true }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Bekräfta', exact: true })
      .click()
    await expect(page).toHaveURL(/INT0001\/edit$/)
    await expect(page.getByRole('textbox', { name: /^Kravtext/ })).toHaveValue(
      'Min osparade kravtext',
    )
    expect(await page.evaluate(() => window.history.length)).toBe(1)
  })

  test('COL-11: declined navigation, browser Back and reload preserve the live editor', async ({
    page,
    request,
  }) => {
    await openConcurrentEdit(page, request, true)
    const selectEarlierEntry = () =>
      page.evaluate(() => {
        const destination = window.navigation.entries()[0]
        const traversal = window.navigation.traverseTo(destination.key)
        void Promise.all([traversal.committed, traversal.finished]).catch(
          () => undefined,
        )
      })
    const decline = async () => {
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Avbryt', exact: true })
        .click()
      await expect(
        page.getByRole('textbox', { name: /^Kravtext/ }),
      ).toHaveValue('Min osparade kravtext')
    }
    await test.step('decline global navigation', async () => {
      await page
        .getByRole('navigation', { name: 'Huvudnavigation' })
        .getByRole('link', { name: 'Kravunderlag', exact: true })
        .click()
      await decline()
    })
    await test.step('decline language switching', async () => {
      await page.getByRole('button', { name: 'Byt språk' }).click()
      await decline()
      await expect(page).toHaveURL(/\/sv\/requirements\/INT0001\/edit$/)
    })
    await test.step('decline browser Back', async () => {
      await page.evaluate(() => window.history.back())
      await decline()
      await expect(page).toHaveURL(/INT0001\/edit$/)
    })
    await test.step('decline a history-menu jump over an intermediate detail entry', async () => {
      await selectEarlierEntry()
      await decline()
      await expect(page).toHaveURL(/INT0001\/edit$/)
    })
    await test.step('decline browser reload', async () => {
      const dialogPromise = page.waitForEvent('dialog')
      const reload = page.reload().catch(() => null)
      const dialog = await dialogPromise
      expect(dialog.type()).toBe('beforeunload')
      await dialog.dismiss()
      await reload
      await expect(
        page.getByRole('textbox', { name: /^Kravtext/ }),
      ).toHaveValue('Min osparade kravtext')
    })
    await test.step('explicitly discard and reach the selected history destination', async () => {
      await selectEarlierEntry()
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Bekräfta', exact: true })
        .click()
      await expect(page).toHaveURL(/\/sv\/requirements\/INT0001\/\d+$/)
      await page.getByRole('link', { name: 'Redigera', exact: true }).click()
      await page
        .getByRole('textbox', { name: /^Kravtext/ })
        .fill('Ytterligare osparat arbete')
      await page.getByRole('button', { name: 'Avbryt', exact: true }).click()
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Bekräfta', exact: true })
        .click()
      await expect(page).toHaveURL(/\/sv\/requirements\/INT0001\/\d+$/)
    })
  })
})
