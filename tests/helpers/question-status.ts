import { expect, type Locator } from '@playwright/test'

// Original active badge appearance selected in issue #1357, in Chromium.
export async function expectActiveQuestionBadge(badge: Locator, theme: string) {
  await expect(badge).toHaveText('Aktiv')
  await expect(badge.locator('svg.lucide-circle-check')).toHaveAttribute(
    'aria-hidden',
    'true',
  )
  await expect(badge).toHaveCSS(
    'background-color',
    theme === 'dark'
      ? 'oklab(0.261998 -0.0505683 0.00661589 / 0.4)'
      : 'lab(94.9004 -17.0769 5.63836)',
  )
  await expect(badge).toHaveCSS(
    'color',
    theme === 'dark'
      ? 'lab(90.2247 -31.039 9.47084)'
      : 'lab(35.3675 -33.1188 8.04002)',
  )
  await expect(badge).toHaveCSS('padding', '4px 8px')
  await expect(badge).toHaveCSS('border-radius', '6px')
  await expect(badge).toHaveCSS('font-size', '12px')
  await expect(badge).toHaveCSS('font-weight', '500')
}
