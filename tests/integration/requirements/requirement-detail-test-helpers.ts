import type { Locator, Page } from '@playwright/test'
import { escapeRegExp } from '@/tests/helpers/common'

export { escapeRegExp }

export function getRequirementRowButton(page: Page, uniqueId: string): Locator {
  return page.getByRole('button', {
    name: new RegExp(`^${escapeRegExp(uniqueId)}\\b`, 'u'),
  })
}

export async function resolveRequirementDetailPane(
  page: Page,
  rowButton: Locator,
  uniqueId: string,
): Promise<Locator> {
  const detailPaneId = await rowButton.getAttribute('aria-controls')
  if (!detailPaneId) {
    throw new Error(`Requirement row ${uniqueId} has no detail pane target.`)
  }

  return page.locator(`#${detailPaneId}`)
}
