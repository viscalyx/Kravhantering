import type { Page, Route } from '@playwright/test'

type DeferredRouteDecision = 'abort' | 'fulfill'

export async function deferRoute(
  page: Page,
  url: string,
  fulfill: (route: Route) => Promise<void>,
) {
  let decideRoute: (decision: DeferredRouteDecision) => void = () => undefined
  let decisionSettled = false
  let routeTask: Promise<void> | undefined
  let signalRequestStarted: () => void = () => undefined
  const decision = new Promise<DeferredRouteDecision>(resolve => {
    decideRoute = resolve
  })
  const requestStarted = new Promise<void>(resolve => {
    signalRequestStarted = resolve
  })
  const settle = (nextDecision: DeferredRouteDecision) => {
    if (decisionSettled) return
    decisionSettled = true
    decideRoute(nextDecision)
  }

  await page.route(url, route => {
    signalRequestStarted()
    routeTask = (async () => {
      const routeDecision = await decision
      if (routeDecision === 'fulfill') {
        await fulfill(route)
        return
      }
      await route.abort('aborted').catch(() => undefined)
    })()
    return routeTask
  })

  return {
    fulfill: () => settle('fulfill'),
    requestStarted,
    async cleanup() {
      settle('abort')
      await routeTask
      await page.unroute(url)
    },
  }
}
