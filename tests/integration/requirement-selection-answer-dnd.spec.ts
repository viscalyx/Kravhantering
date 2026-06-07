import { type APIRequestContext, expect, test } from '@playwright/test'

const DRF_ANSWER_TEXT_ORDER = [
  'Egen drift/on-premises',
  'Molndrift',
  'Hybrid drift',
  'Inte beslutad',
] as const

interface RequirementSelectionQuestionResponse {
  answers: Array<{
    id: number
    text: string
  }>
  id: number
  questionCode: string
}

async function getDriftQuestion(request: APIRequestContext) {
  const response = await request.get(
    '/api/requirement-selection-questions?includeArchived=true',
  )
  expect(response.ok()).toBeTruthy()
  const body = (await response.json()) as {
    questions?: RequirementSelectionQuestionResponse[]
  }
  const question = body.questions?.find(
    item => item.questionCode === 'DRF-KUF001',
  )
  expect(question).toBeTruthy()
  return question as RequirementSelectionQuestionResponse
}

async function resetDriftAnswerOrder(request: APIRequestContext) {
  const question = await getDriftQuestion(request)
  const answerIdsByText = new Map(
    question.answers.map(answer => [answer.text, answer.id] as const),
  )

  for (const [sortOrder, answerText] of DRF_ANSWER_TEXT_ORDER.entries()) {
    const answerId = answerIdsByText.get(answerText)
    expect(answerId).toBeTruthy()
    const response = await request.put(
      `/api/requirement-selection-questions/${question.id}/answers/${answerId}`,
      { data: { sortOrder } },
    )
    expect(response.ok()).toBeTruthy()
  }
}

test.describe('Requirement selection answer drag and drop', () => {
  test.use({ viewport: { height: 900, width: 1280 } })

  test('reorders expanded requirement-selection answers by dragging the answer handle', async ({
    page,
  }) => {
    try {
      await page.goto('/sv/requirements/stewardship?tab=questions')
      await expect(
        page.getByRole('heading', { level: 1, name: 'Kravurvalsfrågor' }),
      ).toBeVisible()
      await resetDriftAnswerOrder(page.request)
      await page.reload()
      await expect(
        page.getByRole('heading', { level: 1, name: 'Kravurvalsfrågor' }),
      ).toBeVisible()
      await page
        .getByRole('button', {
          name: /Visa detaljer för kravurvalsfråga DRF-KUF001/,
        })
        .click()

      const answerList = page
        .getByText('Egen drift/on-premises', { exact: true })
        .locator('xpath=ancestor::ul[1]')
      const answerRows = answerList.getByRole('listitem')
      const sourceRow = answerRows.nth(0)
      const targetRow = answerRows.nth(1)

      await expect(answerRows.nth(0)).toContainText('Egen drift/on-premises')
      await expect(answerRows.nth(1)).toContainText('Molndrift')

      const sourceHandle = sourceRow.getByRole('button', {
        name: 'Ändra svarsordning',
      })
      const sourceBox = await sourceHandle.boundingBox()
      const targetBox = await targetRow.boundingBox()
      if (!sourceBox || !targetBox) {
        throw new Error('Missing answer drag source or target box')
      }

      const sourceX = sourceBox.x + sourceBox.width / 2
      const sourceY = sourceBox.y + sourceBox.height / 2
      const targetX = targetBox.x + targetBox.width / 2
      const targetY = targetBox.y + targetBox.height / 2

      await page.mouse.move(sourceX, sourceY)
      await page.mouse.down()
      await page.mouse.move(sourceX, sourceY + 12)
      await page.mouse.move(targetX, targetY, { steps: 8 })
      await page.mouse.up()

      await expect(answerRows.nth(0)).toContainText('Molndrift')
      await expect(answerRows.nth(1)).toContainText('Egen drift/on-premises')
    } finally {
      await resetDriftAnswerOrder(page.request)
    }
  })
})
