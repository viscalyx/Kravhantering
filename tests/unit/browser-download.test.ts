import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadBlob } from '@/lib/browser-download'

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

describe('downloadBlob', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectURL,
    })
  })

  it('removes the temporary link and revokes the URL when clicking throws', () => {
    const clickError = new Error('click failed')
    const createObjectURLMock = vi.fn(() => 'blob:throwing-download')
    const revokeObjectURLMock = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURLMock,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURLMock,
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw clickError
    })

    expect(() => {
      downloadBlob(new Blob(['export']), 'export.json')
    }).toThrow(clickError)

    expect(document.querySelector('a[download="export.json"]')).toBeNull()
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:throwing-download')
  })
})
