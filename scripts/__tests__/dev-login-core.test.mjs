import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CookieJar,
  decodeHtmlEntities,
  followRedirects,
  hostMatches,
  isJarStillValid,
  login,
  main,
  parseArgs,
  step,
  USAGE,
} from '../lib/dev-login-core.mjs'

const tempDirs = []

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'dev-login-core-'))
  tempDirs.push(dir)
  return dir
}

function response({
  cookies = [],
  jsonBody = {},
  location,
  ok,
  status = 200,
  statusText = 'OK',
  textBody = '',
} = {}) {
  return {
    headers: {
      get: name =>
        name.toLowerCase() === 'location' ? (location ?? null) : null,
      getSetCookie: () => cookies,
    },
    json: vi.fn(async () => jsonBody),
    ok: ok ?? (status >= 200 && status < 300),
    status,
    statusText,
    text: vi.fn(async () => textBody),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true })
  }
})

describe('parseArgs', () => {
  it('uses the documented defaults', () => {
    expect(parseArgs([], { env: {} })).toEqual({
      base: 'http://localhost:3000',
      force: false,
      jar: '.auth/ada.admin.cookies',
      password: 'devpass',
      printJar: false,
      user: 'ada.admin',
    })
  })

  it('parses long flags and trims one trailing base slash', () => {
    expect(
      parseArgs(
        [
          '--user',
          'rita.reviewer',
          '--password',
          'secret',
          '--base',
          'http://localhost:3000/',
          '--jar',
          '.auth/reviewer.cookies',
          '--force',
          '--print-jar',
        ],
        { env: {} },
      ),
    ).toEqual({
      base: 'http://localhost:3000',
      force: true,
      jar: '.auth/reviewer.cookies',
      password: 'secret',
      printJar: true,
      user: 'rita.reviewer',
    })
  })

  it('parses short flags and keeps one slash when two trailing slashes are supplied', () => {
    expect(
      parseArgs(
        [
          '-u',
          'only.admin',
          '-p',
          'secret',
          '-b',
          'http://localhost:3000//',
          '-j',
          '.auth/admin.cookies',
          '-f',
        ],
        { env: {} },
      ),
    ).toEqual({
      base: 'http://localhost:3000/',
      force: true,
      jar: '.auth/admin.cookies',
      password: 'secret',
      printJar: false,
      user: 'only.admin',
    })
  })

  it('honors the env base and falls back to devpass for unknown users', () => {
    expect(
      parseArgs(['--user', 'custom.user'], {
        env: { DEV_LOGIN_BASE_URL: 'http://dev.example.test' },
      }),
    ).toMatchObject({
      base: 'http://dev.example.test',
      jar: '.auth/custom.user.cookies',
      password: 'devpass',
      user: 'custom.user',
    })
  })

  it('writes usage and exits for help', () => {
    const stdout = { write: vi.fn() }
    const exit = vi.fn(() => {
      throw new Error('exit')
    })

    expect(() => parseArgs(['--help'], { env: {}, exit, stdout })).toThrow(
      'exit',
    )
    expect(stdout.write).toHaveBeenCalledWith(USAGE)
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('throws on unknown arguments', () => {
    expect(() => parseArgs(['--wat'], { env: {} })).toThrow(
      'Unknown argument: --wat',
    )
  })

  it.each([
    ['--user'],
    ['--password'],
    ['--base'],
    ['--jar'],
    ['--user', '--force'],
    ['--password', '--print-jar'],
    ['--base', '--force'],
    ['--jar', '--force'],
    ['-u'],
    ['-p'],
    ['-b'],
    ['-j'],
  ])('throws a clear error when %s is missing its value', (...argv) => {
    expect(() => parseArgs(argv, { env: {} })).toThrow(
      `Missing value for ${argv[0]}`,
    )
  })
})

describe('decodeHtmlEntities', () => {
  it('decodes supported entities and leaves unknown entities intact', () => {
    expect(
      decodeHtmlEntities(
        '&quot;x&quot; &#x2F;y &#39;z&#39; &lt;t&gt; &amp; &copy;',
      ),
    ).toBe('"x" /y \'z\' <t> & &copy;')
  })

  it('decodes a typical Keycloak form action', () => {
    expect(
      decodeHtmlEntities(
        'https://kc.example/auth?session_code=abc&amp;execution=def&amp;tab_id=ghi',
      ),
    ).toBe('https://kc.example/auth?session_code=abc&execution=def&tab_id=ghi')
  })

  it('does not double-unescape encoded entities', () => {
    expect(decodeHtmlEntities('&amp;quot; &amp;lt;div&amp;gt;')).toBe(
      '&quot; &lt;div&gt;',
    )
  })
})

describe('CookieJar', () => {
  it('matches exact hosts, subdomains, and host-only cookies correctly', () => {
    expect(hostMatches('example.test', 'example.test')).toBe(true)
    expect(hostMatches('sub.example.test', 'example.test')).toBe(true)
    expect(hostMatches('sub.example.test', 'example.test', true)).toBe(false)
    expect(hostMatches('badexample.test', 'example.test')).toBe(false)
  })

  it('ingests cookies, filters by host-only domain/path/expiry, and serializes Netscape output', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const jar = new CookieJar()

    jar.ingest(
      response({
        cookies: [
          'root=1; Domain=.example.test; Path=/; Max-Age=60; Secure; HttpOnly',
          'pathScoped=2; Path=/app; Expires=Tue, 01 Jan 2030 00:00:00 GMT',
          'hostOnly=3; Max-Age=60',
          'invalid-cookie-line',
          'expired=gone; Path=/; Expires=Wed, 01 Jan 2020 00:00:00 GMT',
          'purged=first; Path=/app; Max-Age=60',
          'purged=; Path=/app; Max-Age=0',
        ],
      }),
      'http://example.test/app/login',
    )

    expect(jar.header('http://example.test/app/page')).toBe(
      'root=1; pathScoped=2; hostOnly=3',
    )
    expect(jar.header('http://example.test/app')).toBe(
      'root=1; pathScoped=2; hostOnly=3',
    )
    expect(jar.header('http://example.test/application')).toBe(
      'root=1; hostOnly=3',
    )
    expect(jar.header('http://sub.example.test/app/page')).toBe('root=1')
    expect(jar.header('http://example.test/other')).toBe('root=1; hostOnly=3')
    expect(jar.header('http://other.test/app/page')).toBe('')

    const output = jar.toNetscape()
    expect(output).toContain('# Netscape HTTP Cookie File\n')
    expect(output).toContain('example.test\tTRUE\t/\tTRUE\t1767225660\troot\t1')
    expect(output).toContain('example.test\tFALSE\t/app\tFALSE\t')
    expect(output).toContain(
      'example.test\tFALSE\t/\tFALSE\t1767225660\thostOnly\t3',
    )
    expect(output).not.toContain('expired')
    expect(output).not.toContain('purged')
  })
})

describe('step', () => {
  it('merges headers, forces manual redirects, sends cookies, and ingests response cookies', async () => {
    const jar = new CookieJar()
    jar.ingest(response({ cookies: ['sid=abc; Path=/'] }), 'http://app.test/')
    const fetchImpl = vi.fn(async () =>
      response({
        cookies: ['fresh=1; Path=/api'],
        location: '/after',
        status: 302,
      }),
    )
    const stderr = { write: vi.fn() }

    const res = await step(
      jar,
      'http://app.test/api/items',
      { headers: { 'x-test': 'yes' }, redirect: 'follow' },
      { env: { DEV_LOGIN_DEBUG: '1' }, fetchImpl, stderr },
    )

    expect(res.status).toBe(302)
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://app.test/api/items',
      expect.objectContaining({ redirect: 'manual' }),
    )
    const init = fetchImpl.mock.calls[0][1]
    expect(init.headers.get('x-test')).toBe('yes')
    expect(init.headers.get('cookie')).toBe('sid=abc')
    expect(jar.header('http://app.test/api/items')).toBe('sid=abc; fresh=1')
    expect(stderr.write.mock.calls.join('\n')).toContain(
      '[dev-login] -> GET http://app.test/api/items cookies=sid=abc',
    )
  })
})

describe('followRedirects', () => {
  it('follows relative locations and returns the final response URL', async () => {
    const jar = new CookieJar()
    const final = response({ textBody: 'done' })
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ location: 'final', status: 302 }))
      .mockResolvedValueOnce(final)

    const result = await followRedirects(
      jar,
      response({ location: '/next', status: 302 }),
      'http://app.test/start',
      12,
      { env: {}, fetchImpl },
    )

    expect(result).toEqual({ res: final, url: 'http://app.test/final' })
    expect(fetchImpl.mock.calls.map(call => call[0])).toEqual([
      'http://app.test/next',
      'http://app.test/final',
    ])
  })

  it('returns a redirect response when Location is missing', async () => {
    const redirectWithoutLocation = response({ status: 302 })

    await expect(
      followRedirects(
        new CookieJar(),
        redirectWithoutLocation,
        'http://app.test/start',
        12,
        { env: {}, fetchImpl: vi.fn() },
      ),
    ).resolves.toEqual({
      res: redirectWithoutLocation,
      url: 'http://app.test/start',
    })
  })

  it('throws when the redirect chain exceeds maxHops', async () => {
    const fetchImpl = vi.fn(async () =>
      response({ location: '/loop', status: 302 }),
    )

    await expect(
      followRedirects(
        new CookieJar(),
        response({ location: '/loop', status: 302 }),
        'http://app.test/start',
        1,
        { env: {}, fetchImpl },
      ),
    ).rejects.toThrow('Too many redirects starting from http://app.test/start')
  })
})

describe('isJarStillValid', () => {
  it('returns false for missing or empty jars without fetching', async () => {
    const dir = tempDir()
    const commentsOnly = join(dir, 'comments.cookies')
    writeFileSync(commentsOnly, '# Netscape HTTP Cookie File\n')
    const fetchImpl = vi.fn()

    await expect(
      isJarStillValid(join(dir, 'missing.cookies'), 'http://app.test', {
        fetchImpl,
      }),
    ).resolves.toBe(false)
    await expect(
      isJarStillValid(commentsOnly, 'http://app.test', { fetchImpl }),
    ).resolves.toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('checks /api/auth/me with the parsed Netscape cookie header', async () => {
    const dir = tempDir()
    const jarPath = join(dir, 'valid.cookies')
    writeFileSync(
      jarPath,
      '# Netscape HTTP Cookie File\napp.test\tFALSE\t/\tFALSE\t0\tsid\tabc\n',
    )
    const fetchImpl = vi.fn(async () =>
      response({ jsonBody: { authenticated: true } }),
    )

    await expect(
      isJarStillValid(jarPath, 'http://app.test', { fetchImpl }),
    ).resolves.toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith('http://app.test/api/auth/me', {
      headers: { cookie: 'sid=abc' },
      redirect: 'manual',
    })
  })

  it('returns false for unauthenticated, non-ok, or throwing validation requests', async () => {
    const dir = tempDir()
    const jarPath = join(dir, 'valid.cookies')
    writeFileSync(
      jarPath,
      '# Netscape HTTP Cookie File\napp.test\tFALSE\t/\tFALSE\t0\tsid\tabc\n',
    )

    await expect(
      isJarStillValid(jarPath, 'http://app.test', {
        fetchImpl: vi.fn(async () =>
          response({ jsonBody: { authenticated: false } }),
        ),
      }),
    ).resolves.toBe(false)
    await expect(
      isJarStillValid(jarPath, 'http://app.test', {
        fetchImpl: vi.fn(async () => response({ status: 500 })),
      }),
    ).resolves.toBe(false)
    await expect(
      isJarStillValid(jarPath, 'http://app.test', {
        fetchImpl: vi.fn(async () => {
          throw new Error('network down')
        }),
      }),
    ).resolves.toBe(false)
  })
})

describe('login', () => {
  it('walks the OIDC flow, resolves relative form actions, and returns cookies', async () => {
    const fetchImpl = vi.fn(async (url, init = {}) => {
      if (url === 'http://app.test/api/auth/login') {
        return response({
          cookies: ['appStart=1; Path=/'],
          location: 'http://idp.test/login',
          status: 302,
        })
      }
      if (url === 'http://idp.test/login') {
        return response({
          cookies: ['kc=2; Domain=idp.test; Path=/'],
          textBody:
            '<form id="kc-form-login" action="/realms/r/login-actions/authenticate?session_code=abc&amp;execution=def"></form>',
        })
      }
      if (
        url ===
        'http://idp.test/realms/r/login-actions/authenticate?session_code=abc&execution=def'
      ) {
        expect(init.method).toBe('POST')
        expect(init.body.toString()).toBe(
          'username=ada.admin&password=devpass&credentialId=',
        )
        return response({
          cookies: ['kcAuth=3; Domain=idp.test; Path=/'],
          location: 'http://app.test/api/auth/callback?code=123',
          status: 302,
        })
      }
      if (url === 'http://app.test/api/auth/callback?code=123') {
        return response({
          cookies: ['session=sealed; Path=/'],
          location: '/sv/requirements',
          status: 302,
        })
      }
      if (url === 'http://app.test/sv/requirements') {
        return response()
      }
      if (url === 'http://app.test/api/auth/me') {
        return response({ jsonBody: { authenticated: true } })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    const jar = await login(
      { base: 'http://app.test', password: 'devpass', user: 'ada.admin' },
      { env: {}, fetchImpl },
    )

    expect(fetchImpl.mock.calls.map(call => call[0])).toEqual([
      'http://app.test/api/auth/login',
      'http://idp.test/login',
      'http://idp.test/realms/r/login-actions/authenticate?session_code=abc&execution=def',
      'http://app.test/api/auth/callback?code=123',
      'http://app.test/sv/requirements',
      'http://app.test/api/auth/me',
    ])
    expect(jar.header('http://app.test/api/auth/me')).toBe(
      'appStart=1; session=sealed',
    )
    expect(jar.header('http://idp.test/realms/r')).toBe('kc=2; kcAuth=3')
  })

  it('falls back to a generic form action for themed Keycloak login pages', async () => {
    const fetchImpl = vi.fn(async (url, init = {}) => {
      if (url === 'http://app.test/api/auth/login') {
        return response({
          location: 'http://idp.test/login',
          status: 302,
        })
      }
      if (url === 'http://idp.test/login') {
        return response({
          textBody:
            '<form class="realm-theme-login" action="/realms/r/login-actions/authenticate?session_code=abc&amp;execution=def"></form>',
        })
      }
      if (
        url ===
        'http://idp.test/realms/r/login-actions/authenticate?session_code=abc&execution=def'
      ) {
        expect(init.method).toBe('POST')
        return response({
          location: 'http://app.test/api/auth/callback?code=123',
          status: 302,
        })
      }
      if (url === 'http://app.test/api/auth/callback?code=123') {
        return response({
          cookies: ['session=sealed; Path=/'],
          location: '/',
          status: 302,
        })
      }
      if (url === 'http://app.test/') return response()
      if (url === 'http://app.test/api/auth/me') {
        return response({ jsonBody: { authenticated: true } })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    const jar = await login(
      { base: 'http://app.test', password: 'devpass', user: 'ada.admin' },
      { env: {}, fetchImpl },
    )

    expect(fetchImpl.mock.calls.map(call => call[0])).toContain(
      'http://idp.test/realms/r/login-actions/authenticate?session_code=abc&execution=def',
    )
    expect(jar.header('http://app.test/api/auth/me')).toBe('session=sealed')
  })

  it('throws when the login form is missing', async () => {
    const fetchImpl = vi.fn(async () => response({ textBody: '<main />' }))

    await expect(
      login(
        { base: 'http://app.test', password: 'devpass', user: 'ada.admin' },
        { env: {}, fetchImpl },
      ),
    ).rejects.toThrow('Expected the default Keycloak form id "kc-form-login"')
  })

  it('throws when the credential redirect chain fails', async () => {
    const fetchImpl = vi.fn(async url => {
      if (url === 'http://app.test/api/auth/login') {
        return response({
          textBody:
            '<form id="kc-form-login" action="http://idp.test/post"></form>',
        })
      }
      if (url === 'http://idp.test/post') {
        return response({ status: 500, statusText: 'Server Error' })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    await expect(
      login(
        { base: 'http://app.test', password: 'devpass', user: 'ada.admin' },
        { env: {}, fetchImpl },
      ),
    ).rejects.toThrow(
      'Login chain ended with 500 Server Error at http://idp.test/post',
    )
  })

  it('throws when /api/auth/me reports authenticated=false', async () => {
    const fetchImpl = vi.fn(async url => {
      if (url === 'http://app.test/api/auth/login') {
        return response({
          textBody:
            '<form id="kc-form-login" action="http://idp.test/post"></form>',
        })
      }
      if (url === 'http://idp.test/post') return response()
      if (url === 'http://app.test/api/auth/me') {
        return response({ jsonBody: { authenticated: false } })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    await expect(
      login(
        { base: 'http://app.test', password: 'devpass', user: 'ada.admin' },
        { env: {}, fetchImpl },
      ),
    ).rejects.toThrow(
      'Login finished but /api/auth/me reported authenticated=false for ada.admin',
    )
  })
})

describe('main', () => {
  it('prints the resolved jar path without logging in for --print-jar', async () => {
    const dir = tempDir()
    const stdout = { write: vi.fn() }
    const stderr = { write: vi.fn() }

    await main(['--jar', 'relative.cookies', '--print-jar'], {
      cwd: dir,
      env: {},
      stderr,
      stdout,
    })

    expect(stdout.write).toHaveBeenCalledWith(
      `${resolve(dir, 'relative.cookies')}\n`,
    )
    expect(stderr.write).not.toHaveBeenCalled()
  })

  it('reuses an existing valid jar unless forced', async () => {
    const dir = tempDir()
    const stdout = { write: vi.fn() }
    const stderr = { write: vi.fn() }
    const isJarStillValidImpl = vi.fn(async () => true)
    const loginImpl = vi.fn()

    await main([], {
      cwd: dir,
      env: {},
      isJarStillValidImpl,
      loginImpl,
      stderr,
      stdout,
    })

    const jarPath = resolve(dir, '.auth/ada.admin.cookies')
    expect(isJarStillValidImpl).toHaveBeenCalledWith(
      jarPath,
      'http://localhost:3000',
      expect.any(Object),
    )
    expect(loginImpl).not.toHaveBeenCalled()
    expect(stderr.write).toHaveBeenCalledWith(
      `[dev-login] Reusing valid session at ${jarPath}\n`,
    )
    expect(stdout.write).toHaveBeenCalledWith(`${jarPath}\n`)
  })

  it('writes a newly logged-in cookie jar when forced', async () => {
    const dir = tempDir()
    const stdout = { write: vi.fn() }
    const stderr = { write: vi.fn() }
    const isJarStillValidImpl = vi.fn()
    const loginImpl = vi.fn(async () => ({
      toNetscape: () =>
        '# Netscape HTTP Cookie File\napp.test\tFALSE\t/\tFALSE\t0\tsid\tabc\n',
    }))

    await main(['--force'], {
      cwd: dir,
      env: {},
      isJarStillValidImpl,
      loginImpl,
      stderr,
      stdout,
    })

    const jarPath = resolve(dir, '.auth/ada.admin.cookies')
    expect(isJarStillValidImpl).not.toHaveBeenCalled()
    expect(loginImpl).toHaveBeenCalledWith(
      {
        base: 'http://localhost:3000',
        password: 'devpass',
        user: 'ada.admin',
      },
      expect.any(Object),
    )
    expect(existsSync(jarPath)).toBe(true)
    expect(readFileSync(jarPath, 'utf8')).toContain('sid\tabc')
    expect(stdout.write).toHaveBeenCalledWith(`${jarPath}\n`)
  })
})
