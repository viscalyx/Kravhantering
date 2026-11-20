import { expect, type Page } from '@playwright/test'

type ScrollRecordingWindow = Window & { completedScroll?: number[] }

export function recordVerticalScroll(selector?: string) {
  const target = selector ? document.querySelector(selector) : document
  if (!target) throw new Error(`Scroll container not found: ${selector}`)

  const readPosition = () =>
    target instanceof Element ? target.scrollTop : window.scrollY
  let lastPosition = readPosition()
  let positions: number[] = []

  target.addEventListener('scroll', () => {
    const position = readPosition()
    if (position === lastPosition) return
    positions.push(position)
    lastPosition = position
  })
  target.addEventListener('scrollend', () => {
    if (positions.length === 0) return
    const state = window as ScrollRecordingWindow
    state.completedScroll = positions
    positions = []
  })
}

export async function expectVerticalScroll(
  page: Page,
  behavior: 'instant' | 'smooth',
) {
  await page.waitForFunction(
    () => (window as ScrollRecordingWindow).completedScroll,
  )
  const positions = await page.evaluate(() => {
    const state = window as ScrollRecordingWindow
    const completed = state.completedScroll
    delete state.completedScroll
    return completed ?? []
  })
  const distinctPositions = new Set(positions).size
  if (behavior === 'instant') {
    expect(distinctPositions).toBe(1)
  } else {
    expect(distinctPositions).toBeGreaterThan(1)
  }
}
