import { expect, type Locator } from '@playwright/test'

export async function expectNormReferenceIdentifierHints(
  dialog: Locator,
  idPrefix: string,
) {
  for (const field of ['id', 'reference', 'version']) {
    const input = dialog.locator(`#${idPrefix}-${field}`)
    await expect(input).toHaveAttribute('autocapitalize', 'none')
    await expect(input).toHaveAttribute('autocorrect', 'off')
    await expect(input).toHaveAttribute('spellcheck', 'false')
  }
}
