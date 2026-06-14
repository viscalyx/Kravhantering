import { readFile } from 'node:fs/promises'
import path from 'node:path'

const swaggerIndexPath = path.join(
  process.cwd(),
  'public',
  'api-docs',
  'hsa-person-lookup',
  'index.html',
)

export async function GET() {
  try {
    const html = await readFile(swaggerIndexPath, 'utf8')

    return new Response(html, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
      },
    })
  } catch {
    return new Response(
      'HSA person lookup Swagger UI has not been generated.',
      {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/plain; charset=utf-8',
        },
        status: 404,
      },
    )
  }
}
