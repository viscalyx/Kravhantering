import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SpecificationLibraryVersionUpdate from '@/components/SpecificationLibraryVersionUpdate'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

describe('explicit library version adoption', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('compares complete content and adopts only the published version explicitly shown in the selected draft', async () => {
    const user = userEvent.setup()
    const content = {
      category: 'Category',
      categoryEn: 'Category',
      type: 'Type',
      typeEn: 'Type',
      qualityCharacteristic: 'Quality',
      qualityCharacteristicEn: 'Quality',
      priority: 'P1',
      verifiable: true,
      normReferences: 'Norm A',
      requirementId: 3,
    }
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            pinned: {
              ...content,
              id: 5,
              versionNumber: 1,
              description: 'Pinned description',
              acceptanceCriteria: 'Pinned criteria',
              verificationMethod: 'Pinned method',
            },
            published: {
              ...content,
              id: 6,
              versionNumber: 2,
              description: 'Published description',
              acceptanceCriteria: 'Published criteria',
              verificationMethod: 'Published method',
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ itemRef: 'lib:10' })),
      )
    vi.stubGlobal('fetch', fetch)
    const onChange = vi.fn(async () => undefined)
    render(
      <SpecificationLibraryVersionUpdate
        agreementId={2}
        itemRef="lib:9"
        onChange={onChange}
        specificationId={1}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'updateFromLibrary' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'compareLibraryVersions',
    })
    for (const text of [
      'Pinned description',
      'Published description',
      'Pinned criteria',
      'Published criteria',
      'Pinned method',
      'Published method',
    ])
      expect(await within(dialog).findByText(text)).toBeVisible()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]?.[0]).toBe(
      '/api/requirements-specifications/1/agreement?itemRef=lib%3A9&agreementId=2',
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'adoptComparedVersion' }),
    )
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('lib:10'))
    expect(JSON.parse(fetch.mock.calls[1]?.[1]?.body)).toEqual({
      operation: 'adopt',
      agreementId: 2,
      itemRef: 'lib:9',
      targetVersionId: 6,
    })
  })
})
