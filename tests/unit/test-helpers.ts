export function okResponse(body: unknown): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body)

  return {
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
    blob: async () => new Blob([text], { type: 'application/json' }),
    body: null,
    bodyUsed: false,
    clone: () => okResponse(body),
    formData: async () => new FormData(),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    ok: true,
    redirected: false,
    status: 200,
    statusText: 'OK',
    text: async () => text,
    type: 'basic',
    url: '',
  } as Response
}
