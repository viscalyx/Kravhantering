import { readFile } from 'node:fs/promises'
import path from 'node:path'

const swaggerIndexPath = path.join(
  process.cwd(),
  'public',
  'api-docs',
  'hsa-person-lookup',
  'index.html',
)

const textHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'text/plain; charset=utf-8',
}

type ErrorWithCode = Error & { code?: unknown }

function isFileNotFoundError(error: unknown): boolean {
  return error instanceof Error && (error as ErrorWithCode).code === 'ENOENT'
}

export async function GET() {
  try {
    const html = await readFile(swaggerIndexPath, 'utf8')

    return new Response(html, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
      },
    })
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return new Response(
        'HSA person lookup Swagger UI has not been generated.',
        {
          headers: textHeaders,
          status: 404,
        },
      )
    }

    return new Response('Unable to read HSA person lookup Swagger UI.', {
      headers: textHeaders,
      status: 500,
    })
  }
}
