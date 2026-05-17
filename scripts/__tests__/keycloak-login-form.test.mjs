import { describe, expect, it } from 'vitest'

import {
  describeKeycloakLoginFormActionError,
  extractKeycloakLoginFormAction,
} from '../lib/keycloak-login-form.mjs'

describe('extractKeycloakLoginFormAction', () => {
  it('extracts the default Keycloak form action when id appears before action', () => {
    expect(
      extractKeycloakLoginFormAction(
        '<form id="kc-form-login" action="https://idp.test/login"></form>',
      ),
    ).toBe('https://idp.test/login')
  })

  it('extracts the default Keycloak form action when action appears before id', () => {
    expect(
      extractKeycloakLoginFormAction(
        '<form action="/realms/r/login-actions/authenticate" id="kc-form-login"></form>',
      ),
    ).toBe('/realms/r/login-actions/authenticate')
  })

  it('prefers the default Keycloak form over an earlier generic form', () => {
    expect(
      extractKeycloakLoginFormAction(
        [
          '<form action="https://idp.test/unrelated"></form>',
          '<form id="kc-form-login" action="https://idp.test/login"></form>',
        ].join(''),
      ),
    ).toBe('https://idp.test/login')
  })

  it('falls back to a generic form action for custom themes', () => {
    expect(
      extractKeycloakLoginFormAction(
        '<form class="custom-login" action="https://idp.test/custom-login"></form>',
      ),
    ).toBe('https://idp.test/custom-login')
  })

  it('decodes HTML entities in fallback form actions', () => {
    expect(
      extractKeycloakLoginFormAction(
        '<form action="/realms/r/login-actions/authenticate?session_code=abc&amp;execution=def"></form>',
      ),
    ).toBe(
      '/realms/r/login-actions/authenticate?session_code=abc&execution=def',
    )
  })

  it('returns undefined when no form action is present', () => {
    expect(extractKeycloakLoginFormAction('<main>No login here</main>')).toBe(
      undefined,
    )
    expect(
      extractKeycloakLoginFormAction('<form id="kc-form-login"></form>'),
    ).toBe(undefined)
  })
})

describe('describeKeycloakLoginFormActionError', () => {
  it('names the URL, expected default form id, and likely custom theme cause', () => {
    const message = describeKeycloakLoginFormActionError(
      'https://idp.test/realms/r/login',
    )

    expect(message).toContain('https://idp.test/realms/r/login')
    expect(message).toContain('kc-form-login')
    expect(message).toContain('custom Keycloak realm theme')
  })
})
