import { describe, expect, it } from 'vitest'
import { escapeCsvField, exportToCsv } from '@/lib/export-csv'

describe('exportToCsv', () => {
  const headers = ['Namn', 'Beskrivning', 'Antal']

  it('produces header row + data rows with semicolons', () => {
    const data = [{ Namn: 'Test', Beskrivning: 'En beskrivning', Antal: '5' }]
    const csv = exportToCsv(headers, data)

    expect(csv).not.toContain('\uFEFF')
    expect(csv).toContain('Namn;Beskrivning;Antal')
    expect(csv).toContain('Test;En beskrivning;5')
  })

  it('escapes fields with semicolons by wrapping in quotes', () => {
    const data = [{ Namn: 'Namn;med;semikolon', Beskrivning: 'Ok', Antal: '1' }]
    const csv = exportToCsv(headers, data)

    expect(csv).toContain('"Namn;med;semikolon"')
  })

  it('quotes the active delimiter while retaining the semicolon default', () => {
    expect(escapeCsvField('comma,value', { delimiter: ',' })).toBe(
      '"comma,value"',
    )
    expect(escapeCsvField('comma,value')).toBe('comma,value')
  })

  it('force-quotes fields when the caller contract requires it', () => {
    const options = { delimiter: ',', quoteAll: true }

    expect(escapeCsvField('ordinary', options)).toBe('"ordinary"')
    expect(escapeCsvField('', options)).toBe('""')
  })

  it('escapes fields with quotes by doubling them', () => {
    const data = [{ Namn: 'Namn med "citat"', Beskrivning: 'Ok', Antal: '1' }]
    const csv = exportToCsv(headers, data)

    expect(csv).toContain('"Namn med ""citat"""')
  })

  it('escapes fields with newlines', () => {
    const data = [{ Namn: 'Rad1\nRad2', Beskrivning: 'Ok', Antal: '1' }]
    const csv = exportToCsv(headers, data)

    expect(csv).toContain('"Rad1\nRad2"')
  })

  it('escapes fields with tabs', () => {
    const data = [{ Namn: 'Namn\tmed tabb', Beskrivning: 'Ok', Antal: '1' }]
    const csv = exportToCsv(headers, data)

    expect(csv).toContain('"Namn\tmed tabb"')
  })

  it('prefixes and quotes formula-leading fields', () => {
    const data = [
      { Namn: '=SUM(A1:A2)', Beskrivning: '+cmd', Antal: '-1' },
      { Namn: '@user', Beskrivning: '\tTabbed', Antal: '\rCarriage' },
    ]
    const csv = exportToCsv(headers, data)

    expect(csv).toContain('"\'=SUM(A1:A2)";"\'+cmd";"\'-1"')
    expect(csv).toContain('"\'@user";"\'\tTabbed";"\'\rCarriage"')
  })

  it('forces quotes around prefixed formula-leading fields', () => {
    const csv = exportToCsv(headers, [
      { Namn: '=PlainFormula', Beskrivning: 'Ok', Antal: '1' },
    ])

    expect(csv).toContain(`"'=PlainFormula";Ok;1`)
  })

  it.each([
    [' =space', `"' =space"`],
    [' +space', `"' +space"`],
    [' -space', `"' -space"`],
    [' @space', `"' @space"`],
    ['\t=tab', `"'\t=tab"`],
    ['\t+tab', `"'\t+tab"`],
    ['\t-tab', `"'\t-tab"`],
    ['\t@tab', `"'\t@tab"`],
    ['\r=carriage', `"'\r=carriage"`],
    ['\r+carriage', `"'\r+carriage"`],
    ['\r-carriage', `"'\r-carriage"`],
    ['\r@carriage', `"'\r@carriage"`],
    [' \t\r=combined', `"' \t\r=combined"`],
    [' \t\r+combined', `"' \t\r+combined"`],
    [' \t\r-combined', `"' \t\r-combined"`],
    [' \t\r@combined', `"' \t\r@combined"`],
  ])(
    'neutralizes a formula marker after supported leading whitespace: %j',
    (field, expected) => {
      expect(escapeCsvField(field)).toBe(expected)
    },
  )

  it('returns only header when data is empty', () => {
    const csv = exportToCsv(headers, [])
    const lines = csv.trim().split('\n')

    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe('Namn;Beskrivning;Antal')
  })
})
