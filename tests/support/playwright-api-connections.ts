import { channel } from 'node:diagnostics_channel'
import type { ClientRequest } from 'node:http'

/**
 * Close connections from Playwright's Node client to the integration app.
 * An API context can sit idle while the browser works. Removing idle sockets
 * prevents a reset at the server's timeout boundary without repeating writes.
 */
export function closeIntegrationApiConnections(baseUrl: string): () => void {
  const { host, protocol } = new URL(baseUrl)
  const requests = channel('http.client.request.created')

  function closeConnection(message: unknown) {
    const { request } = message as { request: ClientRequest }
    if (request.protocol === protocol && request.getHeader('host') === host) {
      request.setHeader('Connection', 'close')
    }
  }

  requests.subscribe(closeConnection)
  return () => {
    requests.unsubscribe(closeConnection)
  }
}
