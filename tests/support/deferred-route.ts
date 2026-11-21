import type { Page, Route } from '@playwright/test'

type DeferredRouteDecision = 'abort' | 'fulfill'

export async function deferRoute(
  page: Page,
  url: string,
  fulfill: (route: Route) => Promise<void>,
) {
  let decideRoute: (decision: DeferredRouteDecision) => void = () => undefined
  let decisionSettled = false
  const routeTasks: Promise<void>[] = []
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

  const handleRoute = (route: Route) => {
    signalRequestStarted()
    const routeTask = decision.then(async routeDecision => {
      if (routeDecision === 'fulfill') {
        await fulfill(route)
        return
      }
      await route.abort('aborted').catch(() => undefined)
    })
    routeTasks.push(routeTask)
    return routeTask
  }
  await page.route(url, handleRoute)

  return {
    fulfill: () => settle('fulfill'),
    requestStarted,
    async cleanup() {
      settle('abort')
      // Include matching requests that arrive while an earlier one is draining.
      for (const task of routeTasks) await task
      await page.unroute(url, handleRoute)
    },
  }
}
