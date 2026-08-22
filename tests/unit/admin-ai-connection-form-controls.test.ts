import { describe, expect, it } from 'vitest'
import { nullable } from '@/app/[locale]/admin/panels/settings/ai-connections/form-controls'

describe('AI connection form controls', () => {
  it('treats a non-string form value as absent', () => {
    expect(nullable(new File(['secret'], 'provider-secret.txt'))).toBeNull()
  })
})
