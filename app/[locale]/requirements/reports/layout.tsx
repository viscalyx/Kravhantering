import type { Metadata } from 'next'
import '@/components/reports/print/print-styles.css'

export const metadata: Metadata = {
  title: 'Report',
}

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="force-light-mode min-h-screen">{children}</div>
}
