import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StatusIcon from '@/components/StatusIcon'
import {
  collectStatusIconNames,
  getStatusIconNodes,
  isStatusIconName,
  loadStatusIconNodes,
  STATUS_ICON_NAMES,
} from '@/lib/icons/status-icon-allowlist'
import { getStatusIconComponent } from '@/lib/icons/status-icon-components'
import {
  nullableOptionalStatusIconNameSchema,
  statusIconNameSchema,
} from '@/lib/icons/status-icon-schema'

describe('status icon allowlist', () => {
  it('recognizes the installed Lucide icon catalog and configured defaults', () => {
    expect(STATUS_ICON_NAMES.length).toBeGreaterThan(1000)

    for (const iconName of [
      'AlertTriangle',
      'Camera',
      'PenLine',
      'Rocket',
      'ShieldCheck',
      'Wifi',
      'XCircle',
    ]) {
      expect(isStatusIconName(iconName)).toBe(true)
    }

    expect(isStatusIconName('MadeUpIcon')).toBe(false)
    expect(isStatusIconName(null)).toBe(false)
  })

  it('keeps icon names within the database column width', () => {
    expect(
      Math.max(...STATUS_ICON_NAMES.map(iconName => iconName.length)),
    ).toBeLessThanOrEqual(64)
  })

  it('maps every allowed icon to an installed Lucide component', () => {
    for (const iconName of STATUS_ICON_NAMES) {
      expect(getStatusIconComponent(iconName), iconName).toBeTruthy()
    }
  })

  it('validates installed icon names and optional empty values', () => {
    expect(statusIconNameSchema.parse('Wifi')).toBe('Wifi')
    expect(statusIconNameSchema.safeParse('MadeUpIcon').success).toBe(false)
    expect(nullableOptionalStatusIconNameSchema.parse(null)).toBeNull()
    expect(
      nullableOptionalStatusIconNameSchema.parse(undefined),
    ).toBeUndefined()
  })

  it('returns a component that renders the selected icon', () => {
    const WifiIcon = getStatusIconComponent('Wifi')
    if (!WifiIcon) throw new Error('Expected Wifi to resolve to an icon')

    const { container } = render(<WifiIcon aria-label="Wireless network" />)

    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-label',
      'Wireless network',
    )
  })

  it('loads report SVG data for allowed icons', async () => {
    const nodes = await loadStatusIconNodes('Wifi')

    expect(nodes?.length).toBeGreaterThan(0)
    expect(getStatusIconNodes('Wifi')).toBe(nodes)
    expect(await loadStatusIconNodes('MadeUpIcon')).toBeNull()
  })

  it('collects icon names from report models before PDF rendering', () => {
    expect(
      collectStatusIconNames({
        iconName: 'Camera',
        nested: [{ statusIconName: 'Wifi' }, { name: 'Archive' }],
      }),
    ).toEqual(['Camera', 'Wifi'])
  })
})

describe('StatusIcon', () => {
  it('renders allowed icons as decorative SVGs', () => {
    const { container } = render(<StatusIcon name="Wifi" />)

    const icon = container.querySelector('svg')
    expect(icon).toBeTruthy()
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders nothing for unknown or empty icon names', () => {
    const { container, rerender } = render(<StatusIcon name="MadeUpIcon" />)

    expect(container.querySelector('svg')).toBeNull()

    rerender(<StatusIcon name={null} />)

    expect(container.querySelector('svg')).toBeNull()
  })
})
