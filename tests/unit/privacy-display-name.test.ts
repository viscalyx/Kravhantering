import { describe, expect, it } from 'vitest'
import {
  DELETED_USER_INTERNAL_NAME,
  formatActorDisplayName,
  formatActorDisplayNameForLocale,
  getAnonymousActorLabel,
  isDeletedUserInternalName,
} from '@/lib/privacy/display-name'

describe('privacy display names', () => {
  it('keeps the internal no-user sentinel out of localized UI output', () => {
    expect(DELETED_USER_INTERNAL_NAME).toBe('no-user')
    expect(isDeletedUserInternalName(' no-user ')).toBe(true)
    expect(formatActorDisplayNameForLocale('no-user', 'sv')).toBe('Anonym')
    expect(formatActorDisplayNameForLocale('no-user', 'en')).toBe('Anonymous')
  })

  it('leaves normal display names unchanged', () => {
    expect(formatActorDisplayName('Ada Admin', 'Anonymous')).toBe('Ada Admin')
    expect(formatActorDisplayName(null, 'Anonymous')).toBeNull()
    expect(getAnonymousActorLabel('sv')).toBe('Anonym')
  })
})
