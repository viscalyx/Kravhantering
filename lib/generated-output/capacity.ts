import {
  GeneratedOutputError,
  type GeneratedOutputKind,
} from '@/lib/generated-output/errors'

const activeGeneration: Record<GeneratedOutputKind, number> = { csv: 0, pdf: 0 }

export interface GeneratedOutputCapacityOptions {
  concurrencyLimit: number
  output: GeneratedOutputKind
}

export interface GeneratedOutputCapacity {
  isActive: () => boolean
  output: GeneratedOutputKind
  release: () => void
}

export function acquireGeneratedOutputCapacity(
  options: GeneratedOutputCapacityOptions,
): GeneratedOutputCapacity {
  if (activeGeneration[options.output] >= options.concurrencyLimit) {
    throw new GeneratedOutputError('capacity_busy', 'concurrency_limit', {
      output: options.output,
      retryAfterSeconds: 5,
    })
  }

  activeGeneration[options.output] += 1
  let active = true
  return {
    isActive: () => active,
    output: options.output,
    release: () => {
      if (!active) return
      active = false
      activeGeneration[options.output] = Math.max(
        0,
        activeGeneration[options.output] - 1,
      )
    },
  }
}

export async function runWithGeneratedOutputCapacity<T>(
  options: GeneratedOutputCapacityOptions,
  work: (capacity: GeneratedOutputCapacity) => Promise<T>,
): Promise<T> {
  const capacity = acquireGeneratedOutputCapacity(options)
  try {
    return await work(capacity)
  } finally {
    capacity.release()
  }
}

export function generatedOutputCapacitySnapshot(): {
  activeCsv: number
  activePdf: number
} {
  return {
    activeCsv: activeGeneration.csv,
    activePdf: activeGeneration.pdf,
  }
}
