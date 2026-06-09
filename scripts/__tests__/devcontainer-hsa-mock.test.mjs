import { describe, expect, it } from 'vitest'
import { isRunning, parseComposeJson } from '../devcontainer/hsa-mock.mjs'

describe('devcontainer HSA mock helper', () => {
  it('parses Docker Compose JSON array output', () => {
    expect(
      parseComposeJson(
        JSON.stringify([
          { ID: 'abc123', Service: 'app', State: 'running' },
          { ID: 'def456', Service: 'hsa-directory-mock', State: 'exited' },
        ]),
      ),
    ).toEqual([
      { ID: 'abc123', Service: 'app', State: 'running' },
      { ID: 'def456', Service: 'hsa-directory-mock', State: 'exited' },
    ])
  })

  it('parses Docker Compose line-delimited JSON output', () => {
    expect(
      parseComposeJson(
        [
          JSON.stringify({ ID: 'abc123', Service: 'app', State: 'running' }),
          JSON.stringify({
            ID: 'def456',
            Service: 'hsa-directory-mock',
            Status: 'Up 2s',
          }),
        ].join('\n'),
      ),
    ).toEqual([
      { ID: 'abc123', Service: 'app', State: 'running' },
      { ID: 'def456', Service: 'hsa-directory-mock', Status: 'Up 2s' },
    ])
  })

  it('detects running services from state or status fields', () => {
    expect(isRunning({ State: 'running' })).toBe(true)
    expect(isRunning({ Status: 'Up 5 seconds (healthy)' })).toBe(true)
    expect(isRunning({ State: 'exited', Status: 'Exited (0)' })).toBe(false)
    expect(isRunning(null)).toBe(false)
  })
})
