/** Fail at the fixture boundary instead of allowing an absent test value through. */
export function requireTestValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Expected the test fixture value to be present')
  return value
}
