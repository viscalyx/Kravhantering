export interface RequirementsLogger {
  error(
    event: string,
    fields?: Record<string, string | number | boolean | null | undefined>,
  ): void
  info(
    event: string,
    fields?: Record<string, string | number | boolean | null | undefined>,
  ): void
}

function write(
  level: 'info' | 'error',
  event: string,
  fields?: Record<string, string | number | boolean | null | undefined>,
) {
  const payload = {
    level,
    event,
    ...(fields ?? {}),
    timestamp: new Date().toISOString(),
  }

  if (level === 'error') {
    console.error(JSON.stringify(payload))
    return
  }

  console.info(JSON.stringify(payload))
}

export function createRequirementsLogger(): RequirementsLogger {
  return {
    info(event, fields) {
      write('info', event, fields)
    },
    error(event, fields) {
      write('error', event, fields)
    },
  }
}
