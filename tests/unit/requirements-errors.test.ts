import { describe, expect, it } from 'vitest'
import {
  conflictError,
  createRequirementsError,
  forbiddenError,
  internalError,
  isRequirementsServiceError,
  normalizeRequirementsError,
  notFoundError,
  RequirementsServiceError,
  unauthorizedError,
  validationError,
} from '@/lib/requirements/errors'

describe('requirements errors', () => {
  it('createRequirementsError creates error with correct code and status', () => {
    const err = createRequirementsError('not_found', 'Missing', {
      id: 42,
    })
    expect(err).toBeInstanceOf(RequirementsServiceError)
    expect(err.code).toBe('not_found')
    expect(err.status).toBe(404)
    expect(err.message).toBe('Missing')
    expect(err.details).toEqual({ id: 42 })
  })

  it('notFoundError returns 404', () => {
    const err = notFoundError('not here')
    expect(err.status).toBe(404)
    expect(err.code).toBe('not_found')
  })

  it('validationError returns 400', () => {
    const err = validationError('bad input')
    expect(err.status).toBe(400)
    expect(err.code).toBe('validation')
  })

  it('conflictError returns 409', () => {
    const err = conflictError('already exists')
    expect(err.status).toBe(409)
    expect(err.code).toBe('conflict')
  })

  it('unauthorizedError returns 401 with default message', () => {
    const err = unauthorizedError()
    expect(err.status).toBe(401)
    expect(err.message).toBe('Authentication is required')
  })

  it('forbiddenError returns 403 with default message', () => {
    const err = forbiddenError()
    expect(err.status).toBe(403)
    expect(err.message).toBe('You are not allowed to perform this action')
  })

  it('internalError returns 500 with default message', () => {
    const err = internalError()
    expect(err.status).toBe(500)
    expect(err.message).toBe('An internal error occurred')
  })

  it('isRequirementsServiceError detects correct instance', () => {
    const err = notFoundError('x')
    expect(isRequirementsServiceError(err)).toBe(true)
    expect(isRequirementsServiceError(new Error('x'))).toBe(false)
    expect(isRequirementsServiceError('string')).toBe(false)
  })

  it('normalizeRequirementsError passes through service errors', () => {
    const err = notFoundError('x')
    expect(normalizeRequirementsError(err)).toBe(err)
  })

  it('normalizeRequirementsError wraps plain Error', () => {
    const result = normalizeRequirementsError(new Error('oops'))
    expect(result).toBeInstanceOf(RequirementsServiceError)
    expect(result.code).toBe('internal')
    expect(result.message).toBe('oops')
  })

  it('normalizeRequirementsError wraps non-Error', () => {
    const result = normalizeRequirementsError('something')
    expect(result).toBeInstanceOf(RequirementsServiceError)
    expect(result.code).toBe('internal')
  })
})
