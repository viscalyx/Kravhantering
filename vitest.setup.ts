// vitest.setup.ts
// Setup file for Vitest tests
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Mock framer-motion globally — all motion.* elements are handled via Proxy.
// Individual test files should NOT re-mock framer-motion.
vi.mock('framer-motion', () => {
  const { createElement, forwardRef } = require('react')

  // Complete set of framer-motion props that must not reach the DOM
  const motionPropNames = new Set([
    'layoutId',
    'initial',
    'animate',
    'exit',
    'transition',
    'whileHover',
    'whileTap',
    'whileInView',
    'whileFocus',
    'whileDrag',
    'viewport',
    'variants',
    'layout',
    'drag',
    'dragConstraints',
    'dragElastic',
    'dragMomentum',
    'dragSnapToOrigin',
    'dragTransition',
    'onDragStart',
    'onDrag',
    'onDragEnd',
    'onAnimationStart',
    'onAnimationComplete',
    'onLayoutAnimationStart',
    'onLayoutAnimationComplete',
    'custom',
    'inherit',
    'onUpdate',
    'onBeforeLayoutMeasure',
    'transformTemplate',
    'onViewportEnter',
    'onViewportLeave',
    'layoutScroll',
    'layoutDependency',
    'layoutRoot',
    'onHoverStart',
    'onHoverEnd',
    'onTapStart',
    'onTap',
    'onTapCancel',
    'onPanStart',
    'onPan',
    'onPanEnd',
    'dragPropagation',
    'dragListener',
  ])

  /**
   * Creates a ref-forwarding component that renders the given HTML tag,
   * stripping all framer-motion specific props to avoid React DOM warnings.
   */
  const forward = (tag: string) => {
    const Component = forwardRef(
      (props: Record<string, unknown>, ref: unknown) => {
        const filtered: Record<string, unknown> = { ref }
        for (const [key, value] of Object.entries(props)) {
          if (key !== 'children' && !motionPropNames.has(key)) {
            filtered[key] = value
          }
        }
        return createElement(tag, filtered, props.children as React.ReactNode)
      },
    )
    Component.displayName = `Motion${tag.charAt(0).toUpperCase() + tag.slice(1)}`
    return Component
  }

  const cache = new Map<string, ReturnType<typeof forward>>()

  // Proxy dynamically generates a forwarding component for any motion.* element
  const motionProxy = new Proxy(
    { create: (Component: unknown) => Component },
    {
      get: (target, prop: string | symbol) => {
        if (typeof prop !== 'string') return Reflect.get(target, prop)
        if (prop in target) return target[prop as keyof typeof target]
        if (!cache.has(prop)) cache.set(prop, forward(prop))
        return cache.get(prop)
      },
    },
  )

  return {
    motion: motionProxy,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useInView: () => true,
    useAnimation: () => ({ start: vi.fn(), stop: vi.fn() }),
    useMotionValue: <T>(initial: T) => ({
      get: () => initial as T,
      set: vi.fn(),
      onChange: vi.fn(),
    }),
  }
})

// Mock next/image to render simple img for tests
vi.mock('next/image', () => {
  const React = require('react')

  interface ImageProps {
    alt: string
    blurDataURL?: string
    fill?: boolean
    height?: number
    loading?: 'lazy' | 'eager'
    placeholder?: string
    priority?: boolean
    quality?: number
    src: string
    unoptimized?: boolean
    width?: number
    [key: string]: unknown
  }

  const Image = ({
    src,
    alt,
    // Next.js specific props that should not be passed to native img
    fill,
    priority,
    quality,
    placeholder,
    blurDataURL,
    unoptimized,
    loading,
    ...rest
  }: ImageProps) => {
    // Suppress unused variable warnings for Next.js-specific props
    void fill
    void priority
    void quality
    void placeholder
    void blurDataURL
    void unoptimized

    // Only pass loading if it's a valid HTML attribute value
    const imgProps: React.ImgHTMLAttributes<HTMLImageElement> = {
      src,
      alt,
      ...rest,
    }

    if (loading) {
      imgProps.loading = loading
    }

    return React.createElement('img', imgProps)
  }

  Image.displayName = 'MockedImage'

  return {
    __esModule: true,
    default: Image,
  }
})

// Mock CSS modules
vi.mock('**/*.css', () => ({}))

// Mock static assets
vi.mock('**/*.(png|jpg|jpeg|gif|svg)', () => 'test-file-stub')

// Mock next/navigation globally — provides sensible defaults.
// Individual test files can override with their own vi.mock('next/navigation', ...)
// or use vi.mocked() to customize per-test.
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/en',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}))

// jsdom does not provide these browser observers, but multiple components
// rely on them during effects. Define stable no-op implementations once so
// per-test global cleanup restores to these defaults instead of `undefined`.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
  }
}

if (typeof globalThis.MutationObserver === 'undefined') {
  globalThis.MutationObserver = class MutationObserver {
    disconnect() {}
    observe() {}
    takeRecords() {
      return []
    }
  }
}
