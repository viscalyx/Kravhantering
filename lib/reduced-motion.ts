import type { TargetAndTransition, Transition } from 'framer-motion'

export interface ReducedMotionProps {
  animate?: TargetAndTransition
  exit?: TargetAndTransition
  initial?: TargetAndTransition | false
  transition?: Transition
}

interface DurationOptions {
  duration?: number
}

interface DialogPanelOptions extends DurationOptions {
  hiddenScale?: number
  transition?: Transition
}

interface OffsetPanelOptions extends DurationOptions {
  exitOffset?: number
  offset?: number
}

const instantTransition: Transition = { duration: 0 }

export const shouldReduceMotion = (
  reducedMotionPreference: boolean | null,
): boolean => reducedMotionPreference === true

export const fadeMotion = (
  reducedMotionPreference: boolean | null,
  { duration = 0.15 }: DurationOptions = {},
): ReducedMotionProps => {
  if (shouldReduceMotion(reducedMotionPreference)) {
    return {
      animate: { opacity: 1 },
      initial: false,
      transition: instantTransition,
    }
  }

  return {
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    initial: { opacity: 0 },
    transition: { duration },
  }
}

export const dialogPanelMotion = (
  reducedMotionPreference: boolean | null,
  { duration = 0.15, hiddenScale = 0.95, transition }: DialogPanelOptions = {},
): ReducedMotionProps => {
  if (shouldReduceMotion(reducedMotionPreference)) {
    return {
      animate: { opacity: 1 },
      initial: false,
      transition: instantTransition,
    }
  }

  return {
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: hiddenScale },
    initial: { opacity: 0, scale: hiddenScale },
    transition: transition ?? { duration },
  }
}

export const offsetPanelMotion = (
  reducedMotionPreference: boolean | null,
  { duration = 0.15, exitOffset, offset = 8 }: OffsetPanelOptions = {},
): ReducedMotionProps => {
  if (shouldReduceMotion(reducedMotionPreference)) {
    return {
      animate: { opacity: 1 },
      initial: false,
      transition: instantTransition,
    }
  }

  return {
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: exitOffset ?? offset },
    initial: { opacity: 0, y: offset },
    transition: { duration },
  }
}

export const drawerPanelMotion = (
  reducedMotionPreference: boolean | null,
  transition: Transition = { damping: 30, stiffness: 300, type: 'spring' },
): ReducedMotionProps => {
  if (shouldReduceMotion(reducedMotionPreference)) {
    return {
      initial: false,
      transition: instantTransition,
    }
  }

  return {
    animate: { x: 0 },
    exit: { x: '100%' },
    initial: { x: '100%' },
    transition,
  }
}

export const collapsiblePanelMotion = (
  reducedMotionPreference: boolean | null,
  { duration = 0.15 }: DurationOptions = {},
): ReducedMotionProps => {
  if (shouldReduceMotion(reducedMotionPreference)) {
    return {
      animate: { opacity: 1 },
      initial: false,
      transition: instantTransition,
    }
  }

  return {
    animate: { height: 'auto', opacity: 1 },
    exit: { height: 0, opacity: 0 },
    initial: { height: 0, opacity: 0 },
    transition: { duration },
  }
}

export const scrollCueMotion = (
  reducedMotionPreference: boolean | null,
): ReducedMotionProps => {
  if (shouldReduceMotion(reducedMotionPreference)) {
    return {
      animate: { opacity: 1 },
      initial: false,
      transition: instantTransition,
    }
  }

  return {
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 6 },
    initial: { opacity: 0, y: 6 },
    transition: { duration: 0.18, ease: 'easeOut' },
  }
}

export const repeatingScrollCueMotion = (
  reducedMotionPreference: boolean | null,
): ReducedMotionProps => {
  if (shouldReduceMotion(reducedMotionPreference)) {
    return {}
  }

  return {
    animate: { y: [0, 3, 0] },
    transition: {
      duration: 1.4,
      ease: 'easeInOut',
      repeat: Number.POSITIVE_INFINITY,
    },
  }
}
