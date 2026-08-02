import { type ParseError, parse, printParseErrorCode } from 'jsonc-parser'

export function parseJsonc(content: string): unknown {
  const errors: ParseError[] = []
  const parsed = parse(content, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  })
  if (errors.length > 0) {
    throw new Error(
      `Invalid JSONC: ${errors
        .map(
          error =>
            `${printParseErrorCode(error.error)} at offset ${error.offset}`,
        )
        .join(', ')}`,
    )
  }
  return parsed
}

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
