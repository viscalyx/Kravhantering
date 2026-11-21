import { expect, it } from 'vitest'
import {
  getLocaleChangeHref,
  registerLocaleChangeQuery,
} from '@/lib/locale-change-href'

it('only includes context supplied by the currently mounted destination page', () => {
  window.history.replaceState(null, '', '/sv/requirements?tag=one&tag=two#row')
  const leaveFirst = registerLocaleChangeQuery('/requirements', params => {
    params.set('selected', '1')
  })
  const leaveSecond = registerLocaleChangeQuery('/requirements', params => {
    params.set('selected', '2')
  })
  try {
    leaveFirst()
    expect(getLocaleChangeHref('/requirements')).toBe(
      '/requirements?tag=one&tag=two&selected=2#row',
    )
    expect(getLocaleChangeHref('/specifications')).toBe(
      '/specifications?tag=one&tag=two#row',
    )
  } finally {
    leaveSecond()
  }
  expect(getLocaleChangeHref('/requirements')).toBe(
    '/requirements?tag=one&tag=two#row',
  )
})
