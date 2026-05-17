import {
  getOpenTelemetryServiceName,
  isOpenTelemetryEnabled,
} from './lib/observability/otel-config'

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'edge') return
  if (!isOpenTelemetryEnabled()) return

  const [
    { registerOTel },
    { OTLPLogExporter },
    { OTLPMetricExporter },
    { BatchLogRecordProcessor },
    { PeriodicExportingMetricReader },
  ] = await Promise.all([
    import('@vercel/otel'),
    import('@opentelemetry/exporter-logs-otlp-http'),
    import('@opentelemetry/exporter-metrics-otlp-http'),
    import('@opentelemetry/sdk-logs'),
    import('@opentelemetry/sdk-metrics'),
  ])

  registerOTel({
    logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter())],
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
      }),
    ],
    serviceName: getOpenTelemetryServiceName(),
  })
}
