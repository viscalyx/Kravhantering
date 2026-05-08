'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { collapsiblePanelMotion } from '@/lib/reduced-motion'

interface AnimatedHelpPanelProps {
  children: ReactNode
  className?: string
  id: string
  isOpen: boolean
}

const defaultClassName =
  'mt-1 mb-2 text-xs text-secondary-500 dark:text-secondary-400 whitespace-pre-line bg-secondary-50 dark:bg-secondary-800/50 rounded-lg px-3 py-2 border border-secondary-200 dark:border-secondary-700'

export default function AnimatedHelpPanel({
  children,
  className = defaultClassName,
  id,
  isOpen,
}: AnimatedHelpPanelProps) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          key={id}
          style={{ overflow: 'hidden' }}
          {...collapsiblePanelMotion(shouldReduceMotion)}
        >
          <p className={className} id={id}>
            {children}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
