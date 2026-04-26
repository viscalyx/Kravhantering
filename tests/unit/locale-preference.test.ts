import { describe, expect, it } from 'vitest'
import {
  isAppLocale,
  LOCALE_STORAGE_KEY,
  readStoredLocale,
  writeStoredLocale,
} from '@/lib/locale-preference'

function makeStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => {
      store.clear()
    },
    getItem: key => store.get(key) ?? null,
    key: index => Array.from(store.keys())[index] ?? null,
    removeItem: key => {
      store.delete(key)
    },
    setItem: (key, value) => {
      store.set(key, value)
    },
  }
}

describe('locale-preference', () => {
  it('uses the constant key "locale"', () => {
    expect(LOCALE_STORAGE_KEY).toBe('locale')
  })

  it('isAppLocale validates against routing.locales', () => {
    expect(isAppLocale('sv')).toBe(true)
    expect(isAppLocale('en')).toBe(true)
    expect(isAppLocale('de')).toBe(false)
    expect(isAppLocale(null)).toBe(false)
    expect(isAppLocale(undefined)).toBe(false)
  })

  it('readStoredLocale returns null when nothing is stored', () => {
    const storage = makeStorage()
    expect(readStoredLocale(storage)).toBeNull()
  })

  it('readStoredLocale returns valid locales and rejects invalid ones', () => {
    const storage = makeStorage()
    storage.setItem(LOCALE_STORAGE_KEY, 'en')
    expect(readStoredLocale(storage)).toBe('en')
    storage.setItem(LOCALE_STORAGE_KEY, 'fr')
    expect(readStoredLocale(storage)).toBeNull()
  })

  it('writeStoredLocale persists the locale', () => {
    const storage = makeStorage()
    writeStoredLocale('en', storage)
    expect(storage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
  })

  it('readStoredLocale tolerates a throwing storage', () => {
    const storage: Pick<Storage, 'getItem'> = {
      getItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readStoredLocale(storage)).toBeNull()
  })

  it('writeStoredLocale tolerates a throwing storage', () => {
    const storage: Pick<Storage, 'setItem'> = {
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(() => {
      writeStoredLocale('sv', storage)
    }).not.toThrow()
  })
})
