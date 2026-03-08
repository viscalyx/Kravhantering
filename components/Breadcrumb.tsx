'use client'

import { ChevronRight, Home } from 'lucide-react'
import { Link } from '@/i18n/routing'

interface BreadcrumbItem {
  href?: string
  label: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Brödsmulor" className="mb-6">
      <ol className="flex items-center gap-1.5 text-sm text-secondary-600 dark:text-secondary-400">
        <li>
          <Link
            className="flex items-center hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
            href="/"
          >
            <Home aria-hidden="true" className="h-4 w-4" />
            <span className="sr-only">Hem</span>
          </Link>
        </li>
        {items.map((item, index) => (
          <li className="flex items-center gap-1" key={item.label}>
            <ChevronRight aria-hidden="true" className="h-3 w-3" />
            {item.href && index < items.length - 1 ? (
              <Link
                className="hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                href={item.href as '/kravkatalog'}
              >
                {item.label}
              </Link>
            ) : (
              <span
                aria-current={index === items.length - 1 ? 'page' : undefined}
                className="text-secondary-900 dark:text-secondary-100 font-medium"
              >
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
