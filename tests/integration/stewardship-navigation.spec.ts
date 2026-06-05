import { expect, test } from '@playwright/test'

test.describe('Stewardship navigation memory', () => {
  test.use({ viewport: { height: 720, width: 1280 } })

  test('returns directly to the remembered question tab from specifications', async ({
    page,
  }) => {
    await test.step('browse to the question stewardship tab', async () => {
      await page.goto('/sv/requirements')
      await page.evaluate(() =>
        localStorage.removeItem('requirements.stewardship.tab'),
      )

      await page
        .getByRole('button', { name: 'Kravbiblioteksförvaltning' })
        .click()
      await page.getByRole('link', { name: 'Kravurvalsfrågor' }).click()

      await expect(
        page.getByRole('heading', { level: 1, name: 'Kravurvalsfrågor' }),
      ).toBeVisible()
      await expect
        .poll(() =>
          page.evaluate(() =>
            localStorage.getItem('requirements.stewardship.tab'),
          ),
        )
        .toBe('questions')
    })

    await test.step('leave stewardship for requirements specifications', async () => {
      await page.getByRole('link', { name: 'Kravunderlag' }).click()

      await expect(
        page.getByRole('heading', { level: 1, name: 'Kravunderlag' }),
      ).toBeVisible()
    })

    await test.step('return through the stewardship parent without a package flash', async () => {
      await page.evaluate(() => {
        const win = window as typeof window & {
          __stewardshipHeadingLog?: string[]
          __stewardshipHeadingObserver?: MutationObserver
        }
        win.__stewardshipHeadingLog = []
        const recordHeadings = () => {
          const headings = Array.from(document.querySelectorAll('h1'))
            .map(heading => heading.textContent?.trim())
            .filter((text): text is string => Boolean(text))
          win.__stewardshipHeadingLog?.push(...headings)
        }
        recordHeadings()
        win.__stewardshipHeadingObserver = new MutationObserver(recordHeadings)
        win.__stewardshipHeadingObserver.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        })
      })

      await page
        .getByRole('button', { name: 'Kravbiblioteksförvaltning' })
        .click()
      await expect(page.getByRole('status')).toBeHidden({ timeout: 500 })
      await expect(
        page.locator(
          '[data-developer-mode-name="transition mask"][data-developer-mode-value="stewardship"]',
        ),
      ).toBeHidden({ timeout: 500 })

      await expect(page).toHaveURL(
        /\/sv\/requirements\/stewardship\?tab=questions/,
      )
      await expect(
        page.getByRole('heading', { level: 1, name: 'Kravurvalsfrågor' }),
      ).toBeVisible()

      const headingLog = await page.evaluate(() => {
        const win = window as typeof window & {
          __stewardshipHeadingLog?: string[]
          __stewardshipHeadingObserver?: MutationObserver
        }
        win.__stewardshipHeadingObserver?.disconnect()
        return win.__stewardshipHeadingLog ?? []
      })

      expect(headingLog).not.toContain('Kravpaket')
    })
  })
})
