export const noStore = <T extends Response>(response: T): T => {
  response.headers.set('Cache-Control', 'no-store')
  return response
}
