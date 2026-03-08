import { describe, expect, it } from 'vitest'
import { exportToCsv } from '@/lib/export-csv'

describe('exportToCsv', () => {
  const headers = ['Namn', 'Beskrivning', 'Antal']

  it('produces UTF-8 BOM + header row + data rows with semicolons', () => {
    const data = [{ Namn: 'Test', Beskrivning: 'En beskrivning', Antal: '5' }]
    const csv = exportToCsv(headers, data)

    expect(csv).toContain('\uFEFF')
    expect(csv).toContain('Namn;Beskrivning;Antal')
    expect(csv).toContain('Test;En beskrivning;5')
  })

  it('escapes fields with semicolons by wrapping in quotes', () => {
    const data = [{ Namn: 'Namn;med;semikolon', Beskrivning: 'Ok', Antal: '1' }]
    const csv = exportToCsv(headers, data)

    expect(csv).toContain('"Namn;med;semikolon"')
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

  it('returns only BOM + header when data is empty', () => {
    const csv = exportToCsv(headers, [])
    const lines = csv.replace('\uFEFF', '').trim().split('\n')

    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe('Namn;Beskrivning;Antal')
  })
})
