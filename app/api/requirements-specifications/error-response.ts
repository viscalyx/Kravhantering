import { NextResponse } from 'next/server'
import { isSpecificationCodeTakenConflict } from '@/lib/requirements/specification-mutations'

export function toSpecificationMutationErrorResponse(
  error: unknown,
): NextResponse | null {
  if (!isSpecificationCodeTakenConflict(error)) return null

  return NextResponse.json(
    { error: 'specification_code_taken' },
    { status: 409 },
  )
}
