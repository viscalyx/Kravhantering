export interface OpenTelemetryEnv {
  OTEL_EXPORTER_OTLP_ENDPOINT?: string
  OTEL_EXPORTER_OTLP_LOGS_ENDPOINT?: string
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT?: string
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?: string
  OTEL_SDK_ENABLED?: string
  OTEL_SERVICE_NAME?: string
  [key: string]: string | undefined
}

export function hasOpenTelemetryEndpoint(
  env: OpenTelemetryEnv = process.env,
): boolean {
  return [
    env.OTEL_EXPORTER_OTLP_ENDPOINT,
    env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
    env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT,
  ].some(value => typeof value === 'string' && value.trim().length > 0)
}

export function isOpenTelemetryEnabled(
  env: OpenTelemetryEnv = process.env,
): boolean {
  return env.OTEL_SDK_ENABLED === 'true' && hasOpenTelemetryEndpoint(env)
}

export function getOpenTelemetryServiceName(
  env: OpenTelemetryEnv = process.env,
): string {
  const serviceName = env.OTEL_SERVICE_NAME?.trim()
  return serviceName && serviceName.length > 0 ? serviceName : 'kravhantering'
}
