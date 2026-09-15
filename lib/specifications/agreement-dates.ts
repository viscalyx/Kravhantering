import { validationError } from '@/lib/requirements/errors'

export function stockholmDate(now: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function validateAgreementDate(value: string): void {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  ) {
    throw validationError('A valid calendar date is required', {
      reason: 'agreement_date_invalid',
    })
  }
}

export function agreementEffectiveAt(date: string, now: Date): Date {
  validateAgreementDate(date)
  const today = stockholmDate(now)
  if (date < today)
    throw validationError('Later agreements cannot be backdated', {
      reason: 'agreement_date_order',
    })
  if (date === today) return now
  const midnightUtc = new Date(`${date}T00:00:00Z`)
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Stockholm',
    timeZoneName: 'shortOffset',
  }).formatToParts(midnightUtc)
  const offset = parts.find(part => part.type === 'timeZoneName')?.value
  const hours = Number(offset?.replace('GMT', ''))
  if (!Number.isFinite(hours))
    throw new Error('Could not resolve Stockholm time zone')
  return new Date(midnightUtc.getTime() - hours * 3600000)
}
