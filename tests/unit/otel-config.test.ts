import { describe, expect, it } from 'vitest'
import {
  getOpenTelemetryServiceName,
  isOpenTelemetryEnabled,
} from '@/lib/observability/otel-config'

describe('OpenTelemetry config', () => {
  it('is disabled by default even when an OTLP endpoint is configured', () => {
    expect(
      isOpenTelemetryEnabled({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
      }),
    ).toBe(false)
  })

  it('requires OTEL_SDK_ENABLED=true and an OTLP endpoint', () => {
    expect(
      isOpenTelemetryEnabled({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
        OTEL_SDK_ENABLED: 'true',
      }),
    ).toBe(true)
    expect(isOpenTelemetryEnabled({ OTEL_SDK_ENABLED: 'true' })).toBe(false)
  })

  it('defaults the service name to kravhantering', () => {
    expect(getOpenTelemetryServiceName({})).toBe('kravhantering')
    expect(
      getOpenTelemetryServiceName({ OTEL_SERVICE_NAME: ' krav-dev ' }),
    ).toBe('krav-dev')
  })
})
