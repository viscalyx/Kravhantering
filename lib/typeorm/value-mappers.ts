export function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

export function toNullableIsoString(
  value: Date | string | null | undefined,
): string | null {
  return value == null ? null : toIsoString(value)
}

export function toBoolean(value: boolean | number | string): boolean {
  return value === true || value === 1 || value === '1'
}
