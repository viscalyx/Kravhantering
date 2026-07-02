import { type APIRequestContext, expect, test } from '@playwright/test'
import { expectApiResponseOk } from '../api-response-assertions'
import { expectApiResponseOkWithRetry } from '../api-retry-helpers'

const DRF_ANSWER_TEXT_ORDER = [
  'Egen drift/on-premises',
  'Molndrift',
  'Hybrid drift',
  'Inte beslutad',
] as const

const DRF_QUESTION_CODE_ORDER = [
  'DRF-KUF001',
  'DRF-KUF002',
  'DRF-KUF003',
  'DRF-KUF004',
] as const

interface RequirementSelectionQuestionResponse {
  answers: Array<{
    id: number
    text: string
  }>
  id: number
  questionCode: string
}

async function getRequirementSelectionQuestions(request: APIRequestContext) {
  const response = await expectApiResponseOkWithRetry(
    'Load requirement-selection questions',
    () =>
      request.get('/api/requirement-selection-questions?includeArchived=true', {
        timeout: 30_000,
      }),
  )
  const body = (await response.json()) as {
    questions?: RequirementSelectionQuestionResponse[]
  }
  return body.questions ?? []
}

async function getDriftQuestion(request: APIRequestContext) {
  const questions = await getRequirementSelectionQuestions(request)
  const question = questions.find(item => item.questionCode === 'DRF-KUF001')
  expect(question).toBeTruthy()
  return question as RequirementSelectionQuestionResponse
}

async function resetDriftQuestionOrder(request: APIRequestContext) {
  const questions = await getRequirementSelectionQuestions(request)
  const questionIdsByCode = new Map(
    questions.map(question => [question.questionCode, question.id] as const),
  )

  for (const [sortOrder, questionCode] of DRF_QUESTION_CODE_ORDER.entries()) {
    const questionId = questionIdsByCode.get(questionCode)
    expect(questionId).toBeTruthy()
    await expectApiResponseOkWithRetry(
      `Reset sort order for question ${questionCode}`,
      () =>
        request.put(`/api/requirement-selection-questions/${questionId}`, {
          data: { sortOrder },
          timeout: 30_000,
        }),
    )
  }
}

async function resetDriftAnswerOrder(request: APIRequestContext) {
  const question = await getDriftQuestion(request)
  const answerIdsByText = new Map(
    question.answers.map(answer => [answer.text, answer.id] as const),
  )

  for (const [sortOrder, answerText] of DRF_ANSWER_TEXT_ORDER.entries()) {
    const answerId = answerIdsByText.get(answerText)
    expect(answerId).toBeTruthy()
    await expectApiResponseOkWithRetry(
      `Reset sort order for answer ${answerText}`,
      () =>
        request.put(
          `/api/requirement-selection-questions/${question.id}/answers/${answerId}`,
          { data: { sortOrder }, timeout: 30_000 },
        ),
    )
  }
}

test.describe('Requirement selection answer drag and drop', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(180_000)
  test.use({ viewport: { height: 900, width: 1280 } })

  test('REQ-14b: reorders collapsed requirement-selection questions by dragging the question handle', async ({
    page,
  }) => {
    try {
      await page.goto('/sv/requirements/stewardship?tab=questions')
      await expect(
        page.getByRole('heading', { level: 1, name: 'Kravurvalsfrågor' }),
      ).toBeVisible()
      await resetDriftQuestionOrder(page.request)
      await page.reload()
      await expect(
        page.getByRole('heading', { level: 1, name: 'Kravurvalsfrågor' }),
      ).toBeVisible()

      const sourceCard = page
        .getByRole('button', {
          name: /Visa detaljer för kravurvalsfråga DRF-KUF001/,
        })
        .locator('xpath=ancestor::li[1]')
      const targetCard = page
        .getByRole('button', {
          name: /Visa detaljer för kravurvalsfråga DRF-KUF002/,
        })
        .locator('xpath=ancestor::li[1]')
      await sourceCard.scrollIntoViewIfNeeded()
      const questionAreaId = await sourceCard.getAttribute(
        'data-question-area-id',
      )
      expect(questionAreaId).toBeTruthy()
      const questionRows = page.locator(
        `[data-question-drop-target="true"][data-question-area-id="${questionAreaId}"]`,
      )

      await expect(questionRows.nth(0)).toContainText('DRF-KUF001')
      await expect(questionRows.nth(1)).toContainText('DRF-KUF002')

      const sourceHandle = sourceCard.getByRole('button', {
        name: 'Ändra frågeordning',
      })
      const sourceBox = await sourceHandle.boundingBox()
      const targetBox = await targetCard.boundingBox()
      if (!sourceBox || !targetBox) {
        throw new Error('Missing question drag source or target box')
      }

      const sourceX = sourceBox.x + sourceBox.width / 2
      const sourceY = sourceBox.y + sourceBox.height / 2
      const targetX = targetBox.x + targetBox.width / 2
      const targetY = targetBox.y + targetBox.height / 2

      await page.mouse.move(sourceX, sourceY)
      await page.mouse.down()
      await page.mouse.move(sourceX, sourceY + 12)
      const questionDragPreview = page.locator(
        '[data-question-drag-preview="true"]',
      )
      const questionDropMarker = page.locator(
        '[data-question-drop-marker="true"]',
      )
      await expect(questionDragPreview).toBeVisible()
      await expect(questionDragPreview).toContainText('DRF-KUF001')
      await page.mouse.move(targetX, targetY, { steps: 8 })
      await expect(questionDropMarker).toBeVisible()
      await expect(questionRows.nth(0)).toContainText('DRF-KUF001')
      await expect(questionRows.nth(1)).toContainText('DRF-KUF002')
      await expect(questionRows.nth(1)).toHaveCSS(
        'transform',
        /matrix\(1, 0, 0, 1, 0, -/,
      )
      await page.mouse.up()

      await expect(questionDragPreview).toHaveCount(0)
      await expect(questionDropMarker).toHaveCount(0)
      await expect(questionRows.nth(0)).toContainText('DRF-KUF002')
      await expect(questionRows.nth(1)).toContainText('DRF-KUF001')
    } finally {
      await resetDriftQuestionOrder(page.request)
    }
  })

  test('REQ-14b: reorders expanded requirement-selection answers by dragging the answer handle', async ({
    page,
  }) => {
    try {
      await page.goto('/sv/requirements/stewardship?tab=questions')
      await expect(
        page.getByRole('heading', { level: 1, name: 'Kravurvalsfrågor' }),
      ).toBeVisible()
      await resetDriftAnswerOrder(page.request)
      const driftQuestion = await getDriftQuestion(page.request)
      const answerIdsByText = new Map(
        driftQuestion.answers.map(answer => [answer.text, answer.id] as const),
      )
      const firstAnswerId = answerIdsByText.get('Egen drift/on-premises')
      const secondAnswerId = answerIdsByText.get('Molndrift')
      expect(firstAnswerId).toBeTruthy()
      expect(secondAnswerId).toBeTruthy()
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
      const sourceRowHandle = await sourceRow.elementHandle()
      if (!sourceRowHandle) {
        throw new Error('Missing answer drag source row')
      }
      const dataTransfer = await page.evaluateHandle(() => new DataTransfer())
      await sourceHandle.dispatchEvent('pointerdown', {
        button: 0,
        isPrimary: true,
        pointerId: 1,
        pointerType: 'mouse',
      })
      await sourceRow.dispatchEvent('dragstart', { dataTransfer })
      await targetRow.dispatchEvent('dragover', { dataTransfer })
      const persistedAnswerOrder = Promise.all([
        page.waitForResponse(
          response =>
            response.request().method() === 'PUT' &&
            response
              .url()
              .includes(
                `/api/requirement-selection-questions/${driftQuestion.id}/answers/${firstAnswerId}`,
              ),
        ),
        page.waitForResponse(
          response =>
            response.request().method() === 'PUT' &&
            response
              .url()
              .includes(
                `/api/requirement-selection-questions/${driftQuestion.id}/answers/${secondAnswerId}`,
              ),
        ),
      ])
      await targetRow.dispatchEvent('drop', { dataTransfer })
      await sourceRowHandle.dispatchEvent('dragend', { dataTransfer })
      const answerOrderResponses = await persistedAnswerOrder
      for (const response of answerOrderResponses) {
        await expectApiResponseOk(response, 'Persist answer order')
      }

      await expect(answerRows.nth(0)).toContainText('Molndrift')
      await expect(answerRows.nth(1)).toContainText('Egen drift/on-premises')
    } finally {
      await resetDriftAnswerOrder(page.request)
    }
  })
})
