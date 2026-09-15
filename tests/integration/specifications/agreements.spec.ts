import { readFile } from 'node:fs/promises'
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from '@playwright/test'
import { requireTestValue } from '@/tests/helpers/require-test-value'
import {
  expectOk,
  newRoleContext,
  ROLE_STORAGE_STATE,
  withPlaywrightSqlServerDataSource,
} from '../authorization/authorization-test-helpers'

test.use({ storageState: ROLE_STORAGE_STATE.specificationResponsible })

const today = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(
    new Date(),
  )
const futureDate = () => `${new Date().getUTCFullYear() + 2}-01-01`
const card = (page: Page) =>
  page.locator('[data-developer-mode-value="agreement selector"]')

async function fixture(owner: APIRequestContext) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const created = await owner.post('/api/requirements-specifications', {
    data: {
      name: `Agreement workflow ${suffix}`,
      specificationCode: `AG-${suffix.toUpperCase()}`,
      specificationLifecycleStatusId: 4,
    },
  })
  await expectOk(created, 'create agreement specification')
  const specification = (await created.json()) as { id: number }
  const response = await owner.post(
    `/api/requirements-specifications/${specification.id}/local-requirements`,
    {
      data: {
        description: 'Original agreed service',
        acceptanceCriteria: 'Original service criterion',
        verifiable: false,
      },
    },
  )
  await expectOk(response, 'create original local content')
  const { localRequirement } = (await response.json()) as {
    localRequirement: { id: number; uniqueId: string }
  }
  return {
    id: specification.id,
    local: localRequirement,
    endpoint: `/api/requirements-specifications/${specification.id}/agreement`,
  }
}

async function register(page: Page, reference: string, date: string) {
  await page
    .getByRole('button', { name: 'Register agreement', exact: true })
    .click()
  const dialog = page.getByRole('dialog', {
    name: 'Register agreement',
    exact: true,
  })
  await dialog.getByLabel(/^Agreement reference/).fill(reference)
  await dialog.getByLabel(/^Agreement effective date/).fill(date)
  await dialog
    .getByRole('button', { name: 'Confirm agreement', exact: true })
    .click()
  await expect(dialog).toBeHidden()
  await expect(card(page)).toContainText(reference)
}

async function draft(page: Page, reference: string, date: string) {
  await page.getByRole('button', { name: 'New agreement', exact: true }).click()
  const dialog = page.getByRole('dialog', {
    name: 'New agreement',
    exact: true,
  })
  await dialog.getByLabel(/^Agreement reference/).fill(reference)
  await dialog.getByLabel(/^Agreement effective date/).fill(date)
  await dialog
    .getByRole('button', { name: 'Create draft', exact: true })
    .click()
  await expect(dialog).toBeHidden()
  await expect(card(page)).toContainText(reference)
  await expect(card(page)).toContainText('Draft')
}

async function select(page: Page, reference: string, historical = false) {
  await page
    .getByRole('button', { name: 'Select agreement', exact: true })
    .click()
  const selector = page.getByRole('dialog', {
    name: 'Select agreement',
    exact: true,
  })
  if (historical) {
    const details = selector.locator('details')
    if (!(await details.getAttribute('open')))
      await selector.getByText('Previous agreements', { exact: true }).click()
  }
  await selector
    .getByRole('button', { name: new RegExp(`^${reference} ·`) })
    .click()
  await expect(selector).toBeHidden()
  await expect(card(page)).toContainText(reference)
}

async function expand(page: Page, uniqueId: string) {
  const button = page
    .locator('[data-specification-detail-list-panel="items"]')
    .getByRole('button', { name: new RegExp(`^${uniqueId}\\b`) })
  if ((await button.getAttribute('aria-expanded')) !== 'true')
    await button.click()
  await expect(button).toHaveAttribute('aria-expanded', 'true')
}

async function confirmDraft(page: Page) {
  await page
    .getByRole('button', { name: 'Agreement details', exact: true })
    .click()
  const dialog = page.getByRole('dialog', {
    name: 'Agreement details',
    exact: true,
  })
  await dialog
    .getByRole('button', { name: 'Confirm agreement', exact: true })
    .click()
  await expect(dialog).toBeHidden()
}

test('SPEC-22/SPEC-23/SPEC-28: edit the complete agreement in the requirement list and retain historical content and output', async ({
  page,
}, testInfo) => {
  const owner = await newRoleContext(testInfo, 'specificationResponsible')
  try {
    const data = await fixture(owner)
    await page.goto(`/en/specifications/${data.id}`)
    await register(page, 'Agreement A', '2020-01-01')
    await expect(card(page)).toContainText('Current')
    await page
      .getByRole('button', { name: 'Agreement details', exact: true })
      .click()
    const details = page.getByRole('dialog', {
      name: 'Agreement details',
      exact: true,
    })
    await details.getByText('Registration information', { exact: true }).click()
    await expect(details).toContainText('Registered')
    await page.keyboard.press('Escape')
    await draft(page, 'Agreement B', today())
    await expand(page, data.local.uniqueId)
    await page
      .getByRole('button', { name: 'Edit requirement', exact: true })
      .click()
    const editor = page.getByRole('dialog', {
      name: 'Edit requirement',
      exact: true,
    })
    await editor.getByLabel(/^Requirement text/).fill('Changed agreed service')
    await editor
      .getByLabel(/^Acceptance criterion/)
      .fill('Changed service criterion')
    await editor.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(editor).toBeHidden()
    await expect(
      page
        .getByRole('button', {
          name: new RegExp(`^${data.local.uniqueId}\\b`),
        })
        .locator('xpath=ancestor::tr[1]'),
    ).toContainText('Changed agreed service')
    await confirmDraft(page)
    await expect(card(page)).toContainText('Current')
    await select(page, 'Agreement A', true)
    await expect(
      page
        .getByRole('button', {
          name: new RegExp(`^${data.local.uniqueId}\\b`),
        })
        .locator('xpath=ancestor::tr[1]'),
    ).toContainText('Original agreed service')
    await expand(page, data.local.uniqueId)
    await expect(
      page.getByText('Original service criterion', { exact: true }),
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'More actions', exact: true })
      .click()
    const downloadPromise = page.waitForEvent('download')
    await page
      .getByRole('menuitem', { name: 'Full CSV export', exact: true })
      .click()
    const download = await downloadPromise
    const csv = await readFile(requireTestValue(await download.path()), 'utf8')
    expect(csv).toContain('Agreement A')
    expect(csv).toContain('Original agreed service')
    expect(csv).toContain('Previous')
  } finally {
    await owner.dispose()
  }
})

test('SPEC-22/SPEC-25/SPEC-26: correct and cancel the first upcoming agreement, then resume independent working content', async ({
  page,
}, testInfo) => {
  const owner = await newRoleContext(testInfo, 'specificationResponsible')
  try {
    const data = await fixture(owner)
    await page.goto(`/en/specifications/${data.id}`)
    await register(page, 'Future A', futureDate())
    await expect(card(page)).toContainText('Upcoming')
    await expand(page, data.local.uniqueId)
    await expect(
      page.getByRole('button', { name: 'Request a deviation', exact: true }),
    ).toBeEnabled()
    await page
      .getByRole('button', { name: 'Agreement details', exact: true })
      .click()
    let dialog = page.getByRole('dialog', {
      name: 'Agreement details',
      exact: true,
    })
    await dialog
      .getByRole('button', { name: 'Correct agreement details', exact: true })
      .click()
    dialog = page.getByRole('dialog', {
      name: 'Correct agreement details',
      exact: true,
    })
    await dialog.getByLabel(/^Agreement reference/).fill('Corrected A')
    await dialog
      .getByRole('button', { name: 'Save correction', exact: true })
      .click()
    await expect(dialog).toBeHidden()
    await page
      .getByRole('button', { name: 'Agreement details', exact: true })
      .click()
    dialog = page.getByRole('dialog', {
      name: 'Agreement details',
      exact: true,
    })
    await dialog.getByText('Registration information', { exact: true }).click()
    await expect(dialog).toContainText('Future A')
    await expect(dialog).toContainText('Corrected A')
    await dialog
      .getByRole('button', { name: 'Cancel upcoming agreement', exact: true })
      .click()
    dialog = page.getByRole('dialog', {
      name: 'Cancel upcoming agreement',
      exact: true,
    })
    await dialog.getByLabel(/^Reason/).fill('Replacement agreement is required')
    await dialog
      .getByRole('button', { name: 'Cancel upcoming agreement', exact: true })
      .click()
    await expect(dialog).toBeHidden()
    await expect(card(page)).toContainText('None')
    await expect(
      page.getByRole('button', { name: 'New unique requirement', exact: true }),
    ).toBeEnabled()
    await select(page, 'Corrected A', true)
    await expect(card(page)).toContainText('Cancelled')
    await expect(
      page
        .getByRole('button', {
          name: new RegExp(`^${data.local.uniqueId}\\b`),
        })
        .locator('xpath=ancestor::tr[1]'),
    ).toContainText('Original agreed service')
  } finally {
    await owner.dispose()
  }
})

test('SPEC-26/SPEC-27: discard a pending draft, record agreement end and prepare an extension in the same specification', async ({
  page,
}, testInfo) => {
  const owner = await newRoleContext(testInfo, 'specificationResponsible')
  try {
    const data = await fixture(owner)
    await page.goto(`/en/specifications/${data.id}`)
    await register(page, 'Agreement A', '2020-01-01')
    await draft(page, 'Discard B', futureDate())
    await page
      .getByRole('button', { name: 'Agreement details', exact: true })
      .click()
    const details = page.getByRole('dialog', {
      name: 'Agreement details',
      exact: true,
    })
    await details
      .getByRole('button', { name: 'Discard draft', exact: true })
      .click()
    await page
      .getByRole('alertdialog', {
        name: 'Discard agreement draft',
        exact: true,
      })
      .getByRole('button', { name: 'Discard draft', exact: true })
      .click()
    await expect(details).toBeHidden()
    await expect(card(page)).toContainText('Agreement A')
    await page
      .getByRole('button', { name: 'Agreement details', exact: true })
      .click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Record agreement end', exact: true })
      .click()
    const end = page.getByRole('dialog', {
      name: 'Record agreement end',
      exact: true,
    })
    await end.getByLabel(/^Agreement ended/).fill(today())
    await end.getByLabel(/^Reason/).fill('The agreed delivery period ended')
    await end
      .getByRole('button', { name: 'Record agreement end', exact: true })
      .click()
    await expect(end).toBeHidden()
    await expect(card(page)).toContainText('Ended')
    await draft(page, 'Extension C', today())
    await expect(
      page
        .getByRole('button', {
          name: new RegExp(`^${data.local.uniqueId}\\b`),
        })
        .locator('xpath=ancestor::tr[1]'),
    ).toContainText('Original agreed service')
    await confirmDraft(page)
    await expect(card(page)).toContainText('Current')
    await select(page, 'Agreement A', true)
    await expect(card(page)).toContainText('Ended')
  } finally {
    await owner.dispose()
  }
})

test('SPEC-23: compare and adopt a newer library version before the first agreement', async ({
  page,
}, testInfo) => {
  const owner = await newRoleContext(testInfo, 'specificationResponsible')
  try {
    const data = await fixture(owner)
    const source = await withPlaywrightSqlServerDataSource(async db => {
      const [source] =
        (await db.query(`SELECT TOP (1) requirement.id AS requirementId, requirement.unique_id AS uniqueId, older.id AS oldVersionId, older.description AS oldDescription, published.description AS newDescription
        FROM requirements requirement INNER JOIN requirement_versions older ON older.requirement_id = requirement.id AND older.requirement_status_id = 4
        INNER JOIN requirement_versions published ON published.requirement_id = requirement.id AND published.requirement_status_id = 3 AND published.version_number > older.version_number
        ORDER BY requirement.id, older.version_number`)) as Array<{
          requirementId: number
          uniqueId: string
          oldVersionId: number
          oldDescription: string
          newDescription: string
        }>
      if (!source)
        throw new Error('Demo data needs a newer published library version')
      await db.query(
        `INSERT INTO requirements_specification_items (requirements_specification_id, requirement_id, requirement_version_id, note, specification_item_status_id, created_at)
        VALUES (@0, @1, @2, N'Preserved delivery note', 1, SYSUTCDATETIME())`,
        [data.id, source.requirementId, source.oldVersionId],
      )
      return source
    })
    await page.goto(`/en/specifications/${data.id}`)
    await expect(
      page.getByRole('button', { name: 'Register agreement', exact: true }),
    ).toBeEnabled()
    await expand(page, source.uniqueId)
    await expect(
      page.getByRole('button', { name: new RegExp(`^${source.uniqueId}\\b`) }),
    ).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('[id^="requirement-row-detail-"]')).toContainText(
      source.oldDescription,
    )
    await page
      .getByRole('button', {
        name: 'Update from requirement library',
        exact: true,
      })
      .click()
    const comparison = page.getByRole('dialog', {
      name: 'Compare library versions',
      exact: true,
    })
    await expect(
      comparison.getByRole('region', {
        name: 'Newer published version',
        exact: true,
      }),
    ).toContainText(source.newDescription)
    await expect(
      comparison.getByText('Changed field:', { exact: true }).first(),
    ).toBeAttached()
    await comparison.getByRole('button', { name: 'Close', exact: true }).click()
    await page
      .getByRole('button', {
        name: 'Update from requirement library',
        exact: true,
      })
      .click()
    await comparison
      .getByRole('button', { name: 'Use the compared version', exact: true })
      .click()
    await expect(comparison).toBeHidden()
    await expect(
      page
        .getByRole('button', { name: new RegExp(`^${source.uniqueId}\\b`) })
        .locator('xpath=ancestor::tr[1]'),
    ).toContainText(source.newDescription)
    const applicationPage = await (
      await owner.get(`/api/requirements-specifications/${data.id}/items`)
    ).json()
    const application = applicationPage.items.find(
      (item: { uniqueId: string }) => item.uniqueId === source.uniqueId,
    )
    const updated = await (
      await owner.get(`${data.endpoint}?itemRefs=${application.itemRef}`)
    ).json()
    expect(
      updated.items.find(
        (item: { uniqueId: string }) => item.uniqueId === source.uniqueId,
      ),
    ).toMatchObject({
      note: 'Preserved delivery note',
      description: source.newDescription,
    })
    await register(page, 'Agreement A', '2020-01-01')
    await draft(page, 'Agreement B', futureDate())
    await expand(page, source.uniqueId)
    await page
      .getByRole('button', { name: 'Edit requirement', exact: true })
      .click()
    const editor = page.getByRole('dialog', {
      name: 'Edit requirement',
      exact: true,
    })
    await expect(editor).toContainText('new requirement ID')
    await editor
      .getByLabel(/^Requirement text/)
      .fill('Locally negotiated library content')
    await editor.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(editor).toBeHidden()
    const selectedPage = await (
      await owner.get(
        `/api/requirements-specifications/${data.id}/items?agreementId=${(await (await owner.get(data.endpoint)).json()).agreements.find((agreement: { state: string }) => agreement.state === 'draft').id}`,
      )
    ).json()
    const converted = selectedPage.items.find(
      (item: { version: { description: string } }) =>
        item.version.description === 'Locally negotiated library content',
    )
    expect(converted.uniqueId).not.toBe(source.uniqueId)
    await expand(page, converted.uniqueId)
    await page
      .getByRole('button', { name: 'Request a deviation', exact: true })
      .click()
    const deviation = page.getByRole('dialog', {
      name: 'Request a deviation',
      exact: true,
    })
    await deviation
      .getByLabel(/^Motivation/)
      .fill('Draft content requires an exception')
    await deviation
      .getByRole('button', { name: 'Register deviation', exact: true })
      .click()
    await expect(deviation).toBeHidden()
    await expect(
      page.getByRole('button', { name: 'Edit requirement', exact: true }),
    ).toBeDisabled()
    await page
      .getByRole('button', { name: 'Cancel deviation', exact: true })
      .click()
    const cancel = page.getByRole('dialog', {
      name: 'Cancel deviation',
      exact: true,
    })
    await cancel.getByLabel(/^Reason/).fill('Restore the library requirement')
    await cancel
      .getByRole('button', { name: 'Cancel deviation', exact: true })
      .click()
    await expect(cancel).toBeHidden()
    await page
      .locator('summary')
      .filter({ hasText: /^Actions$/ })
      .click()
    await page.getByRole('button', { name: 'Undo change', exact: true }).click()
    await expand(page, source.uniqueId)
    await page
      .locator('summary')
      .filter({ hasText: /^History$/ })
      .click()
    await expect(
      page.getByText('Locally negotiated library content', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText('Draft content requires an exception', { exact: true }),
    ).toBeVisible()
  } finally {
    await owner.dispose()
  }
})

for (const locale of ['sv', 'en'] as const) {
  test(`SPEC-22/SPEC-25: keyboard agreement selection and localized duplicate validation at 320px (${locale})`, async ({
    page,
  }, testInfo) => {
    const owner = await newRoleContext(testInfo, 'specificationResponsible')
    const labels =
      locale === 'sv'
        ? {
            register: 'Registrera avtal',
            reference: 'Avtalsreferens',
            date: 'Avtalsdatum',
            confirm: 'Bekräfta avtal',
            create: 'Nytt avtal',
            save: 'Skapa utkast',
            select: 'Välj avtal',
            duplicate: 'Avtalsreferensen eller avtalsdatumet används redan',
          }
        : {
            register: 'Register agreement',
            reference: 'Agreement reference',
            date: 'Agreement effective date',
            confirm: 'Confirm agreement',
            create: 'New agreement',
            save: 'Create draft',
            select: 'Select agreement',
            duplicate:
              'The agreement reference or effective date is already used',
          }
    try {
      const data = await fixture(owner)
      await page.setViewportSize({ width: 320, height: 740 })
      await page.goto(`/${locale}/specifications/${data.id}`)
      const registerButton = page.getByRole('button', {
        name: labels.register,
        exact: true,
      })
      await registerButton.focus()
      await registerButton.press('Enter')
      const registration = page.getByRole('dialog', {
        name: labels.register,
        exact: true,
      })
      await registration
        .getByLabel(new RegExp(`^${labels.reference}`))
        .fill('Mobile A')
      await registration
        .getByLabel(new RegExp(`^${labels.date}`))
        .fill('2020-01-01')
      await registration
        .getByRole('button', { name: labels.confirm, exact: true })
        .click()
      await expect(registration).toBeHidden()
      await page
        .getByRole('button', { name: labels.create, exact: true })
        .click()
      const create = page.getByRole('dialog', {
        name: labels.create,
        exact: true,
      })
      await create
        .getByLabel(new RegExp(`^${labels.reference}`))
        .fill('Mobile A')
      await create.getByLabel(new RegExp(`^${labels.date}`)).fill(futureDate())
      await create
        .getByRole('button', { name: labels.save, exact: true })
        .click()
      await expect(create.getByRole('alert')).toContainText(labels.duplicate)
      await create
        .getByLabel(new RegExp(`^${labels.reference}`))
        .fill('Mobile B')
      await create
        .getByRole('button', { name: labels.save, exact: true })
        .click()
      await expect(create).toBeHidden()
      const selectButton = page.getByRole('button', {
        name: labels.select,
        exact: true,
      })
      await selectButton.focus()
      await selectButton.press('Enter')
      const selector = page.getByRole('dialog', {
        name: labels.select,
        exact: true,
      })
      const bounds = await selector.boundingBox()
      expect(bounds?.x).toBeGreaterThanOrEqual(0)
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(320)
      await page.keyboard.press('Escape')
      await expect(selector).toBeHidden()
      await expect(selectButton).toBeFocused()
      const target = await selectButton.boundingBox()
      expect(target?.width).toBeGreaterThanOrEqual(24)
      expect(target?.height).toBeGreaterThanOrEqual(24)
    } finally {
      await owner.dispose()
    }
  })
}
