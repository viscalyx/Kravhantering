import type { SVGProps } from 'react'
import { getStatusIconComponent } from '@/lib/icons/status-icon-components'

interface ComponentProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: string | null | undefined
}

export default function StatusIcon({ name, ...props }: ComponentProps) {
  const Icon = getStatusIconComponent(name)
  if (!Icon) return null

  return <Icon aria-hidden="true" focusable="false" {...props} />
}
