export const DELETED_USER_INTERNAL_NAME = 'no-user'

export function isDeletedUserInternalName(
  value: string | null | undefined,
): boolean {
  return value?.trim().toLowerCase() === DELETED_USER_INTERNAL_NAME
}

export function getAnonymousActorLabel(locale: string): string {
  return locale === 'en' ? 'Anonymous' : 'Anonym'
}

export function formatActorDisplayName(
  value: string | null | undefined,
  anonymousActorLabel: string,
): string | null {
  if (value == null) return null
  return isDeletedUserInternalName(value) ? anonymousActorLabel : value
}

export function formatActorDisplayNameForLocale(
  value: string | null | undefined,
  locale: string,
): string | null {
  return formatActorDisplayName(value, getAnonymousActorLabel(locale))
}
