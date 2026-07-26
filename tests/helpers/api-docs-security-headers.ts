import {
  type APIResponse,
  type ConsoleMessage,
  expect,
  type Page,
} from '@playwright/test'

const API_DOCS_HEADING = 'Kravhantering HSA Person Lookup Facade'

const API_DOCS_SECURITY_HEADERS = {
  'content-security-policy':
    "default-src 'none'; script-src 'self'; script-src-attr 'none'; " +
    "style-src 'self'; style-src-attr 'none'; img-src 'self' data:; " +
    "font-src 'self'; connect-src 'self'; object-src 'none'; " +
    "frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'cross-origin-embedder-policy': 'credentialless',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy':
    'accelerometer=(), autoplay=(), camera=(), cross-origin-isolated=(), ' +
    'display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(), ' +
    'gyroscope=(), idle-detection=(), magnetometer=(), microphone=(), ' +
    'midi=(), payment=(), picture-in-picture=(), ' +
    'publickey-credentials-get=(), screen-wake-lock=(), serial=(), usb=(), ' +
    'web-share=(), xr-spatial-tracking=()',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
} as const

export function expectApiDocsSecurityHeaders(response: APIResponse): void {
  const headers = response.headers()
  const headerEntries = response.headersArray()

  for (const [name, value] of Object.entries(API_DOCS_SECURITY_HEADERS)) {
    expect(headers[name], `${response.url()} ${name}`).toBe(value)
    expect(
      headerEntries.filter(header => header.name.toLowerCase() === name),
      `${response.url()} should contain exactly one ${name} header`,
    ).toHaveLength(1)
  }
}

export async function expectApiDocsToRenderWithoutCspErrors(
  page: Page,
  path: string,
): Promise<void> {
  const cspConsoleErrors: string[] = []
  const collectCspError = (message: ConsoleMessage): void => {
    if (/content security policy/iu.test(message.text())) {
      cspConsoleErrors.push(message.text())
    }
  }

  page.on('console', collectCspError)
  try {
    await page.goto(path)
    await expect(
      page.getByRole('heading', {
        name: API_DOCS_HEADING,
      }),
    ).toContainText(API_DOCS_HEADING)
    expect(cspConsoleErrors).toEqual([])
  } finally {
    page.off('console', collectCspError)
  }
}
