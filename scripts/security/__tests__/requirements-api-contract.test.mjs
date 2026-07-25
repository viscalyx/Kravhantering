import fs from 'node:fs'
import { load as loadYaml } from 'js-yaml'
import { describe, expect, it } from 'vitest'

const contract = loadYaml(
  fs.readFileSync('openapi/requirements-api.yaml', 'utf8'),
)

describe('requirements REST API contract', () => {
  it('documents the HTTP runtime limit for oversized export requests', () => {
    expect(
      contract.paths['/api/requirements/export'].get.responses['431'],
    ).toEqual({
      $ref: '#/components/responses/RequestHeaderFieldsTooLarge',
    })
    expect(
      contract.components.responses.RequestHeaderFieldsTooLarge,
    ).toMatchObject({
      description: expect.stringContaining(
        'response can be generated before application routing',
      ),
    })
  })
})
