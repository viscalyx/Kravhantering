import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as createSafetyTermRoute } from '@/app/api/admin/ai-safety-rules/route'
import {
  DELETE as deleteSafetyTermRoute,
  PATCH as updateSafetyTermRoute,
} from '@/app/api/admin/ai-safety-rules/terms/[id]/route'
import { PATCH as updateSettingsRoute } from '@/app/api/admin/application-settings/route'
import { PUT as updatePrefixesRoute } from '@/app/api/admin/hsa-id-prefixes/route'
import { POST as decideDeviationRoute } from '@/app/api/deviations/[id]/decision/route'
import {
  DELETE as deleteAreaRoute,
  PUT as updateAreaRoute,
} from '@/app/api/requirement-areas/[id]/route'
import { POST as createAreaRoute } from '@/app/api/requirement-areas/route'
import { POST as createQuestionRoute } from '@/app/api/rfi-questions/route'
import { POST as createImplementationTypeRoute } from '@/app/api/specification-implementation-types/route'
import { createAiConnectionAdministrationRuntime } from '@/lib/ai/admin-runtime'
import { resetAuthConfigForTests } from '@/lib/auth/config'
import { getApplicationSettings } from '@/lib/dal/application-settings'
import { createDeviation, requestReview } from '@/lib/dal/deviations'
import {
  createSpecificationLocalRequirement,
  linkRequirementsToSpecificationAtomically,
} from '@/lib/dal/requirements-specifications'
import { listHsaIdPrefixesForAdmin } from '@/lib/dal/ui-settings'
import type { SqlServerDatabase } from '@/lib/db'
import { attachVerifiedActor } from '@/lib/requirements/auth'
import {
  REQUIREMENTS_IMPORT_SCHEMA_VERSION,
  requirementsImportPayloadSchema,
} from '@/lib/requirements/import-schema'
import { createRequirementResponsibilityPersonVerificationEvidence } from '@/lib/requirements/responsibility-person-verification'
import { createRequirementsService } from '@/lib/requirements/service'
import { parseSecurityAuditEvents } from '@/tests/helpers/security-audit-events'
import {
  createArea,
  createPublishedRequirement,
  createSpecificationFixture,
  makeRequestContext,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

const routeDatabase = vi.hoisted(() => ({ get: vi.fn(), roles: ['Admin'] }))
vi.mock('@/lib/db', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/db')>()),
  getRequestSqlServerDataSource: routeDatabase.get,
}))
vi.mock('@/lib/auth/session', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/auth/session')>()),
  getSessionFromRequest: async () => ({
    accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    familyName: 'Actor',
    givenName: 'SQL',
    name: 'SQL Integration Actor',
    hsaId: 'SE5560000001-sqltest1',
    roles: routeDatabase.roles,
    sub: 'sql-integration-actor',
  }),
}))

async function failActionHistory(db: SqlServerDatabase): Promise<void> {
  await db.query(`CREATE TRIGGER fail_mutation_action_history ON action_audit_events AFTER INSERT AS
    BEGIN SET NOCOUNT ON; THROW 51000, 'Injected required history failure', 1; END`)
}

async function successRows(db: SqlServerDatabase): Promise<unknown[]> {
  return db.query(
    "SELECT action FROM action_audit_events WHERE decision = 'allowed'",
  )
}

function failRead(db: SqlServerDatabase, matches: (sql: string) => boolean) {
  const reached = vi.fn()
  const createRunner = db.createQueryRunner.bind(db)
  vi.spyOn(db, 'createQueryRunner').mockImplementation(mode => {
    const runner = createRunner(mode)
    const query = runner.query.bind(runner)
    vi.spyOn(runner, 'query').mockImplementation(async (...args) => {
      if (reached.mock.calls.length === 0 && matches(args[0])) {
        reached(runner.isTransactionActive)
        throw new Error('Injected saved-state read failure')
      }
      return query(...args)
    })
    return runner
  })
  return reached
}

describe('Business mutations and required audit history', () => {
  const appDb = useSqlIntegrationDatabase()

  beforeEach(() => {
    routeDatabase.get.mockImplementation(() => appDb())
    routeDatabase.roles = ['Admin']
    resetAuthConfigForTests()
    vi.stubEnv('AUTH_OIDC_CLIENT_ID', 'sql-integration-client')
    vi.stubEnv('AUTH_OIDC_CLIENT_SECRET', 'sql-integration-client-secret')
    vi.stubEnv('AUTH_OIDC_ISSUER_URL', 'https://idp.example.test')
    vi.stubEnv('AUTH_OIDC_POST_LOGOUT_REDIRECT_URI', 'https://example.test/')
    vi.stubEnv(
      'AUTH_OIDC_REDIRECT_URI',
      'https://example.test/api/auth/callback',
    )
    vi.stubEnv(
      'AUTH_SESSION_COOKIE_PASSWORD',
      'sql-integration-session-secret-at-least-32-characters',
    )
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await appDb().query('DROP TRIGGER IF EXISTS fail_mutation_action_history')
    await appDb().query('DROP TRIGGER IF EXISTS fail_import_receipt')
    vi.unstubAllEnvs()
    resetAuthConfigForTests()
  })

  it('does not announce requirement creation when commit fails', async () => {
    const db = appDb()
    const area = await createArea(db)
    const context = await makeRequestContext()
    const output = vi.spyOn(console, 'info').mockImplementation(() => {})
    const createRunner = db.createQueryRunner.bind(db)
    vi.spyOn(db, 'createQueryRunner').mockImplementation(mode => {
      const runner = createRunner(mode)
      vi.spyOn(runner, 'commitTransaction').mockRejectedValue(
        new Error('Injected commit failure'),
      )
      return runner
    })

    await expect(
      createRequirementsService(db).manageRequirement(context, {
        operation: 'create',
        requirement: { areaId: area.id, description: 'Atomic requirement' },
      }),
    ).rejects.toThrow()

    expect(
      parseSecurityAuditEvents(output).filter(
        event => event.outcome === 'success',
      ),
    ).toEqual([])
    await expect(db.query('SELECT id FROM requirements')).resolves.toEqual([])
    await expect(
      db.query("SELECT id FROM action_audit_events WHERE decision = 'allowed'"),
    ).resolves.toEqual([])
  })

  it.each(['audit', 'later_write', 'rollback'] as const)(
    'rolls back creation and history after %s failure and leaves the pool usable',
    async failure => {
      const db = appDb()
      const area = await createArea(db)
      const context = await makeRequestContext()
      const output = vi.spyOn(console, 'info').mockImplementation(() => {})
      if (failure === 'audit') await failActionHistory(db)
      else {
        const createRunner = db.createQueryRunner.bind(db)
        vi.spyOn(db, 'createQueryRunner').mockImplementation(mode => {
          const runner = createRunner(mode)
          const query = runner.query.bind(runner)
          vi.spyOn(runner, 'query').mockImplementation(async (...args) => {
            const result = await query(...args)
            if (String(args[0]).includes('INSERT INTO action_audit_events'))
              throw new Error('Later write failure')
            return result
          })
          if (failure === 'rollback') {
            const rollback = runner.rollbackTransaction.bind(runner)
            vi.spyOn(runner, 'rollbackTransaction').mockImplementation(
              async () => {
                await rollback()
                throw new Error('Secondary rollback failure')
              },
            )
          }
          return runner
        })
      }
      await expect(
        createRequirementsService(db).manageRequirement(context, {
          operation: 'create',
          requirement: { areaId: area.id, description: 'Must roll back' },
        }),
      ).rejects.toThrow(
        failure === 'audit'
          ? 'Injected required history failure'
          : 'Later write failure',
      )
      expect(
        parseSecurityAuditEvents(output).filter(
          event => event.outcome === 'success',
        ),
      ).toEqual([])
      expect(await db.query('SELECT id FROM requirements')).toEqual([])
      expect(await successRows(db)).toEqual([])
      expect(await db.query('SELECT 1 AS usable')).toEqual([{ usable: 1 }])
    },
  )

  it.each([false, true])(
    'commits business data and history before external success (sink fails: %s)',
    async sinkFails => {
      const db = appDb()
      const area = await createArea(db)
      let committed = false
      const createRunner = db.createQueryRunner.bind(db)
      vi.spyOn(db, 'createQueryRunner').mockImplementation(mode => {
        const runner = createRunner(mode)
        const commit = runner.commitTransaction.bind(runner)
        vi.spyOn(runner, 'commitTransaction').mockImplementation(async () => {
          await commit()
          committed = true
        })
        return runner
      })
      const observed: boolean[] = []
      vi.spyOn(console, 'info').mockImplementation(message => {
        const event = JSON.parse(String(message))
        if (event.channel === 'security-audit' && event.outcome === 'success') {
          observed.push(committed)
          if (sinkFails) throw new Error('External sink unavailable')
        }
      })
      const result = await createRequirementsService(db).manageRequirement(
        await makeRequestContext(),
        {
          operation: 'create',
          requirement: { areaId: area.id, description: 'Committed creation' },
        },
      )
      expect(result.detail?.versions[0]?.description).toBe('Committed creation')
      expect(await successRows(db)).toEqual([{ action: 'requirement.create' }])
      expect(observed).toEqual([true])
    },
  )

  it('does not retry or announce success when acknowledgement fails after commit', async () => {
    const db = appDb()
    const area = await createArea(db)
    const output = vi.spyOn(console, 'info').mockImplementation(() => {})
    const createRunner = db.createQueryRunner.bind(db)
    vi.spyOn(db, 'createQueryRunner').mockImplementation(mode => {
      const runner = createRunner(mode)
      const commit = runner.commitTransaction.bind(runner)
      vi.spyOn(runner, 'commitTransaction').mockImplementation(async () => {
        await commit()
        throw new Error('Commit acknowledgement lost')
      })
      return runner
    })
    await expect(
      createRequirementsService(db).manageRequirement(
        await makeRequestContext(),
        {
          operation: 'create',
          requirement: { areaId: area.id, description: 'Uncertain outcome' },
        },
      ),
    ).rejects.toThrow('Commit acknowledgement lost')
    expect(
      await db.query('SELECT COUNT(*) AS count FROM requirements'),
    ).toEqual([{ count: 1 }])
    expect(await successRows(db)).toEqual([{ action: 'requirement.create' }])
    expect(
      parseSecurityAuditEvents(output).filter(
        event => event.outcome === 'success',
      ),
    ).toEqual([])
  })

  it('rolls back RFI creation and its sequence through the authorized route', async () => {
    const db = appDb()
    const area = await createArea(db)
    const context = await makeRequestContext()
    await failActionHistory(db)
    const request = new Request('https://example.test/api/rfi-questions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://example.test',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        areaId: area.id,
        questionText: 'Required history',
      }),
    })
    attachVerifiedActor(request, context.actor)
    const response = await createQuestionRoute(request)
    expect(response.status).toBe(500)
    expect(await db.query('SELECT id FROM rfi_questions')).toEqual([])
    expect(await db.query('SELECT id FROM rfi_question_versions')).toEqual([])
    expect(
      await db.query('SELECT area_id FROM rfi_question_sequences'),
    ).toEqual([])
    expect(await successRows(db)).toEqual([])
  })

  it('rolls back requirement-area creation and the verified owner through the admin route', async () => {
    const db = appDb()
    const context = await makeRequestContext()
    const person = {
      email: null,
      givenName: 'Owner',
      middleName: null,
      surname: 'Test',
      hsaId: 'SE5560000001-owner2',
      hasProtectedPersonalData: false,
    }
    const { evidence } =
      createRequirementResponsibilityPersonVerificationEvidence({
        actor: context.actor,
        person,
        purpose: 'requirement_area_owner',
      })
    await failActionHistory(db)
    const response = await createAreaRoute(
      new Request('https://example.test/api/requirement-areas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://example.test',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          name: 'Atomic area',
          prefix: 'ATM',
          ownerHsaId: person.hsaId,
          verificationEvidence: evidence,
        }),
      }),
    )
    expect(response.status).toBe(500)
    expect(
      await db.query("SELECT id FROM requirement_areas WHERE prefix = 'ATM'"),
    ).toEqual([])
    expect(
      await db.query(
        'SELECT hsa_id FROM requirement_responsibility_people WHERE hsa_id = @0',
        [person.hsaId],
      ),
    ).toEqual([])
    expect(await successRows(db)).toEqual([])
  })

  it('rolls back area owner replacement, person cleanup and deletion through their routes', async () => {
    const db = appDb()
    const context = await makeRequestContext()
    const area = await createArea(db)
    const person = {
      email: null,
      givenName: 'Replacement',
      middleName: null,
      surname: 'Owner',
      hsaId: 'SE5560000001-replacement',
      hasProtectedPersonalData: false,
    }
    const { evidence } =
      createRequirementResponsibilityPersonVerificationEvidence({
        actor: context.actor,
        person,
        purpose: 'requirement_area_owner',
        scopeId: area.id,
      })
    const request = (method: string, body?: unknown) => {
      const result = new Request(
        `https://example.test/api/requirement-areas/${area.id}`,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://example.test',
            'X-Requested-With': 'XMLHttpRequest',
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      )
      attachVerifiedActor(result, context.actor)
      return result
    }
    const params = { params: Promise.resolve({ id: String(area.id) }) }
    const input = {
      name: 'Replacement area',
      ownerHsaId: person.hsaId,
      verificationEvidence: evidence,
    }
    await failActionHistory(db)
    expect((await updateAreaRoute(request('PUT', input), params)).status).toBe(
      500,
    )
    expect((await deleteAreaRoute(request('DELETE'), params)).status).toBe(500)
    expect(
      await db.query(
        'SELECT name, owner_hsa_id AS owner FROM requirement_areas WHERE id = @0',
        [area.id],
      ),
    ).toEqual([{ name: area.name, owner: context.actor.hsaId }])
    expect(
      await db.query(
        'SELECT hsa_id AS hsaId FROM requirement_responsibility_people',
      ),
    ).toEqual([{ hsaId: context.actor.hsaId }])
    expect(await successRows(db)).toEqual([])
    await db.query('DROP TRIGGER fail_mutation_action_history')
    expect((await updateAreaRoute(request('PUT', input), params)).status).toBe(
      200,
    )
    expect(
      await db.query(
        'SELECT hsa_id AS hsaId FROM requirement_responsibility_people',
      ),
    ).toEqual([{ hsaId: person.hsaId }])
    expect((await deleteAreaRoute(request('DELETE'), params)).status).toBe(200)
    expect((await deleteAreaRoute(request('DELETE'), params)).status).toBe(404)
    expect(await db.query('SELECT id FROM requirement_areas')).toEqual([])
    expect(
      await db.query('SELECT hsa_id FROM requirement_responsibility_people'),
    ).toEqual([])
    expect(await successRows(db)).toEqual([
      { action: 'admin.requirement_area.update' },
      { action: 'admin.requirement_area.delete' },
    ])
  })

  it('keeps repository-backed catalog writes and required history atomic', async () => {
    const db = appDb()
    const request = () =>
      new Request(
        'https://example.test/api/specification-implementation-types',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://example.test',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({ nameEn: 'Atomic type', nameSv: 'Atomär typ' }),
        },
      )
    await failActionHistory(db)
    expect((await createImplementationTypeRoute(request())).status).toBe(500)
    expect(
      await db.query(
        "SELECT id FROM specification_implementation_types WHERE name_en = 'Atomic type'",
      ),
    ).toEqual([])
    expect(await successRows(db)).toEqual([])
    await db.query('DROP TRIGGER fail_mutation_action_history')
    expect((await createImplementationTypeRoute(request())).status).toBe(201)
    expect(
      await db.query(
        "SELECT id FROM specification_implementation_types WHERE name_en = 'Atomic type'",
      ),
    ).toHaveLength(1)
    expect(await successRows(db)).toEqual([
      { action: 'admin.specification_implementation_type.create' },
    ])
  })

  it('keeps AI safety term creation, update and deletion atomic with required history', async () => {
    const db = appDb()
    await db.query(`IF NOT EXISTS (SELECT 1 FROM ai_safety_rules WHERE rule_id = 'instruction_override')
      INSERT INTO ai_safety_rules (rule_id, category, name_sv, name_en, pattern_kind, sort_order, created_at, updated_at)
      VALUES ('instruction_override', 'test', 'Test', 'Test', 'paired_terms', 1, SYSUTCDATETIME(), SYSUTCDATETIME())`)
    const request = (method: string, path: string, body?: unknown) =>
      new Request(`https://example.test/api/admin/ai-safety-rules${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://example.test',
          'X-Requested-With': 'XMLHttpRequest',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    const input = {
      direction: 'input',
      ruleId: 'instruction_override',
      termText: 'Synthetic atomic term',
      termType: 'action',
    }
    try {
      await failActionHistory(db)
      expect(
        (await createSafetyTermRoute(request('POST', '', input))).status,
      ).toBe(500)
      expect(
        await db.query(
          "SELECT id FROM ai_safety_rule_terms WHERE term_text = 'Synthetic atomic term'",
        ),
      ).toEqual([])
      await db.query('DROP TRIGGER fail_mutation_action_history')
      const response = await createSafetyTermRoute(request('POST', '', input))
      expect(response.status).toBe(200)
      const { term } = (await response.json()) as { term: { id: number } }
      const params = { params: Promise.resolve({ id: String(term.id) }) }
      await failActionHistory(db)
      expect(
        (
          await updateSafetyTermRoute(
            request('PATCH', `/terms/${term.id}`, { isActive: false }),
            params,
          )
        ).status,
      ).toBe(500)
      expect(
        (
          await deleteSafetyTermRoute(
            request('DELETE', `/terms/${term.id}`),
            params,
          )
        ).status,
      ).toBe(500)
      expect(
        await db.query(
          'SELECT CAST(is_active AS int) AS active FROM ai_safety_rule_terms WHERE id = @0',
          [term.id],
        ),
      ).toEqual([{ active: 1 }])
      expect(await successRows(db)).toEqual([
        { action: 'admin.ai_safety_rule_term.create' },
      ])
    } finally {
      await db.query(
        "DELETE FROM ai_safety_rule_terms WHERE term_text = 'Synthetic atomic term'",
      )
    }
  })

  it.each(['create', 'update'] as const)(
    'rolls back AI safety term %s and history when the saved row cannot be read',
    async operation => {
      const db = appDb()
      await db.query(`IF NOT EXISTS (SELECT 1 FROM ai_safety_rules WHERE rule_id = 'instruction_override')
      INSERT INTO ai_safety_rules (rule_id, category, name_sv, name_en, pattern_kind, sort_order, created_at, updated_at)
      VALUES ('instruction_override', 'test', 'Test', 'Test', 'paired_terms', 1, SYSUTCDATETIME(), SYSUTCDATETIME())`)
      const request = (method: string, body: unknown) =>
        new Request('https://example.test/api/admin/ai-safety-rules', {
          method,
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://example.test',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify(body),
        })
      const input = {
        direction: 'input',
        ruleId: 'instruction_override',
        termText: 'Read failure term',
        termType: 'action',
      }
      let id = 0
      if (operation === 'update') {
        const response = await createSafetyTermRoute(request('POST', input))
        expect(response.status).toBe(200)
        id = (await response.json()).term.id
      }
      const original = await db.query(
        'SELECT id, is_active FROM ai_safety_rule_terms',
      )
      const history = await successRows(db)
      const output = vi.spyOn(console, 'info').mockImplementation(() => {})
      const reached = failRead(db, sql =>
        sql.includes('FROM [ai_safety_rule_terms] terms'),
      )
      const response =
        operation === 'create'
          ? await createSafetyTermRoute(request('POST', input))
          : await updateSafetyTermRoute(request('PATCH', { isActive: false }), {
              params: Promise.resolve({ id: String(id) }),
            })
      expect(response.status).toBe(500)
      expect(reached).toHaveBeenCalledExactlyOnceWith(true)
      expect(
        await db.query('SELECT id, is_active FROM ai_safety_rule_terms'),
      ).toEqual(original)
      expect(await successRows(db)).toEqual(history)
      expect(
        parseSecurityAuditEvents(output).filter(
          event => event.outcome === 'success',
        ),
      ).toEqual([])
    },
  )

  it('rolls back HSA prefix changes and history when their saved usage cannot be read', async () => {
    const db = appDb()
    const prefixes = await listHsaIdPrefixesForAdmin(db)
    const original = await db.query('SELECT * FROM hsa_id_prefixes')
    const history = await successRows(db)
    const output = vi.spyOn(console, 'info').mockImplementation(() => {})
    let finalRead = false
    const reached = failRead(db, sql => {
      if (sql.includes('UPDATE hsa_id_prefixes SET is_default'))
        finalRead = true
      return (
        finalRead &&
        sql.includes('FROM [requirement_areas] WHERE [owner_hsa_id] LIKE')
      )
    })
    const response = await updatePrefixesRoute(
      new Request('https://example.test/api/admin/hsa-id-prefixes', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://example.test',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          prefixes: [
            ...prefixes.map(({ id, prefix, label, isVisible, isDefault }) => ({
              id,
              prefix,
              label,
              isVisible,
              isDefault,
            })),
            {
              prefix: 'SE5560000099',
              label: 'Read failure prefix',
              isVisible: true,
              isDefault: prefixes.length === 0,
            },
          ],
        }),
      }),
    )
    expect(response.status).toBe(500)
    expect(reached).toHaveBeenCalledExactlyOnceWith(true)
    expect(await db.query('SELECT * FROM hsa_id_prefixes')).toEqual(original)
    expect(await successRows(db)).toEqual(history)
    expect(
      parseSecurityAuditEvents(output).filter(
        event => event.outcome === 'success',
      ),
    ).toEqual([])
  })

  it('does not announce settings success before its commit', async () => {
    const db = appDb()
    const original = await getApplicationSettings(db)
    const output = vi.spyOn(console, 'info').mockImplementation(() => {})
    const createRunner = db.createQueryRunner.bind(db)
    vi.spyOn(db, 'createQueryRunner').mockImplementation(mode => {
      const runner = createRunner(mode)
      vi.spyOn(runner, 'commitTransaction').mockRejectedValue(
        new Error('Settings commit failure'),
      )
      return runner
    })
    const response = await updateSettingsRoute(
      new Request('https://example.test/api/admin/application-settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://example.test',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          cspViolationLoggingEnabled: !original.cspViolationLoggingEnabled,
        }),
      }),
    )
    expect(response.status).toBe(500)
    expect((await getApplicationSettings(db)).cspViolationLoggingEnabled).toBe(
      original.cspViolationLoggingEnabled,
    )
    expect(await successRows(db)).toEqual([])
    expect(
      parseSecurityAuditEvents(output).filter(
        event => event.outcome === 'success',
      ),
    ).toEqual([])
  })

  it.each(['history', 'commit'] as const)(
    'does not persist or announce AI connection creation after %s failure',
    async failure => {
      const db = appDb()
      const service = createAiConnectionAdministrationRuntime(
        db,
        await makeRequestContext(),
      )
      const output = vi.spyOn(console, 'info').mockImplementation(() => {})
      if (failure === 'history') await failActionHistory(db)
      else {
        const createRunner = db.createQueryRunner.bind(db)
        vi.spyOn(db, 'createQueryRunner').mockImplementation(mode => {
          const runner = createRunner(mode)
          vi.spyOn(runner, 'commitTransaction').mockRejectedValue(
            new Error('AI commit failure'),
          )
          return runner
        })
      }
      const input = {
        adapterKey: 'controlled_test',
        adapterVersion: '1',
        administrationName: 'Atomic AI connection',
        agentRuntimeKey: null,
        agentRuntimeVersion: null,
        authenticationType: 'none' as const,
        dataPolicySummary: 'No production data.',
        description: null,
        egressPolicyKey: 'sql_test',
        endpointUrl: 'https://ai.example.test/v1',
        maximumConcurrency: 2,
        publicName: 'Atomic AI connection',
        tlsPolicyKey: 'public_web_pki',
      }
      await expect(service.createConnection(input)).rejects.toThrow()
      expect(await db.query('SELECT id FROM ai_connections')).toEqual([])
      expect(await successRows(db)).toEqual([])
      expect(
        parseSecurityAuditEvents(output).filter(
          event => event.outcome === 'success',
        ),
      ).toEqual([])
      vi.restoreAllMocks()
      await db.query('DROP TRIGGER IF EXISTS fail_mutation_action_history')
      const saved = await service.createConnection(input)
      expect(saved.administrationName).toBe(input.administrationName)
      expect(await successRows(db)).toEqual([
        { action: 'admin.ai_connection.create' },
      ])
    },
  )

  it.each(['service', 'rest'] as const)(
    'rolls back an authorized %s deviation decision when its history fails',
    async transport => {
      const db = appDb()
      const area = await createArea(db)
      const requirement = await createPublishedRequirement(
        db,
        area.id,
        'Decision target',
      )
      const specification = await createSpecificationFixture(
        db,
        'DECISION-AUDIT',
      )
      await linkRequirementsToSpecificationAtomically(db, specification.id, {
        requirementIds: [requirement.requirementId],
      })
      const [item] = await db.query<Array<{ id: number }>>(
        'SELECT id FROM requirements_specification_items',
      )
      const deviation = await createDeviation(db, {
        specificationItemId: item.id,
        motivation: 'Needs a decision',
      })
      await requestReview(db, deviation.id)
      routeDatabase.roles = ['Reviewer']
      const context = await makeRequestContext()
      context.actor.roles = ['Reviewer']
      const output = vi.spyOn(console, 'info').mockImplementation(() => {})
      await failActionHistory(db)
      const historyFailure = vi.fn()
      const createRunner = db.createQueryRunner.bind(db)
      vi.spyOn(db, 'createQueryRunner').mockImplementation(mode => {
        const runner = createRunner(mode)
        const query = runner.query.bind(runner)
        vi.spyOn(runner, 'query').mockImplementation(async (...args) => {
          try {
            return await query(...args)
          } catch (error) {
            const parameters = Array.isArray(args[1]) ? args[1] : []
            if (/INSERT INTO\s+\[?action_audit_events\]?/i.test(args[0]))
              historyFailure(
                error instanceof Error ? error.message : String(error),
                parameters[5],
                parameters[9],
              )
            throw error
          }
        })
        return runner
      })
      const decide = () =>
        decideDeviationRoute(
          new Request(
            `https://example.test/api/deviations/${deviation.id}/decision`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Origin: 'https://example.test',
                'X-Requested-With': 'XMLHttpRequest',
              },
              body: JSON.stringify({
                decision: 1,
                decisionMotivation: 'Approved',
              }),
            },
          ),
          { params: Promise.resolve({ id: String(deviation.id) }) },
        )
      if (transport === 'service')
        await expect(
          createRequirementsService(db).manageDeviation(context, {
            operation: 'record_decision',
            deviationId: deviation.id,
            decision: 1,
            decisionMotivation: 'Approved',
          }),
        ).rejects.toThrow('Injected required history failure')
      else {
        const response = await decide()
        expect(response.status).toBe(500)
      }
      expect(historyFailure).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining('Injected required history failure'),
        'deviation.decision',
        'allowed',
      )
      expect(
        await db.query('SELECT decision FROM deviations WHERE id = @0', [
          deviation.id,
        ]),
      ).toEqual([{ decision: null }])
      expect(await successRows(db)).toEqual([])
      expect(
        parseSecurityAuditEvents(output).filter(
          event => event.outcome === 'success',
        ),
      ).toEqual([])
      if (transport === 'rest') {
        await db.query('DROP TRIGGER fail_mutation_action_history')
        const response = await decide()
        expect(response.status).toBe(200)
        expect(await successRows(db)).toEqual([
          { action: 'deviation.decision' },
        ])
        expect(
          await db.query('SELECT decision FROM deviations WHERE id = @0', [
            deviation.id,
          ]),
        ).toEqual([{ decision: 1 }])
        expect(
          parseSecurityAuditEvents(output).filter(
            event => event.outcome === 'success',
          ),
        ).toHaveLength(1)
      }
    },
  )

  it('rolls back requirement edits and transitions with their required history', async () => {
    const db = appDb()
    const service = createRequirementsService(db)
    const context = await makeRequestContext()
    const area = await createArea(db)
    const created = await service.manageRequirement(context, {
      operation: 'create',
      requirement: { areaId: area.id, description: 'Original draft' },
    })
    const detail = created.detail
    if (!detail) throw new Error('Created requirement detail missing')
    const version = detail.versions[0]
    const history = await successRows(db)
    await failActionHistory(db)
    await expect(
      service.manageRequirement(context, {
        operation: 'edit',
        id: detail.id,
        requirement: {
          description: 'Must not replace original',
          baseVersionId: version.id,
          baseRevisionToken: version.revisionToken,
        },
      }),
    ).rejects.toThrow('Injected required history failure')
    await expect(
      service.transitionRequirement(context, { id: detail.id, toStatusId: 2 }),
    ).rejects.toThrow('Injected required history failure')
    expect(
      await db.query(
        'SELECT description, requirement_status_id AS status FROM requirement_versions WHERE id = @0',
        [version.id],
      ),
    ).toEqual([{ description: 'Original draft', status: 1 }])
    expect(await successRows(db)).toEqual(history)
  })

  it('rolls back specification membership and graduation when required history fails', async () => {
    const db = appDb()
    const area = await createArea(db)
    const published = await createPublishedRequirement(
      db,
      area.id,
      'Link candidate',
    )
    const specification = await createSpecificationFixture(
      db,
      'MEMBERSHIP-AUDIT',
    )
    const local = await createSpecificationLocalRequirement(
      db,
      specification.id,
      { description: 'Graduation candidate' },
    )
    const service = createRequirementsService(db)
    const context = await makeRequestContext()
    await failActionHistory(db)
    await expect(
      service.addToSpecification(context, {
        specificationId: specification.id,
        requirementIds: [published.requirementId],
      }),
    ).rejects.toThrow('Injected required history failure')
    await expect(
      service.graduateSpecificationLocalRequirement(context, {
        specificationId: specification.id,
        localRequirementId: local.id,
        requirementAreaId: area.id,
      }),
    ).rejects.toThrow('Injected required history failure')
    expect(
      await db.query('SELECT id FROM requirements_specification_items'),
    ).toEqual([])
    expect(await db.query('SELECT id FROM requirements')).toEqual([
      { id: published.requirementId },
    ])
    expect(
      await db.query('SELECT id FROM specification_local_requirements'),
    ).toEqual([{ id: local.id }])
    expect(await successRows(db)).toEqual([])
  })

  it('records one specification addition and keeps a repeated link a no-op', async () => {
    const db = appDb()
    const area = await createArea(db)
    const published = await createPublishedRequirement(
      db,
      area.id,
      'Idempotent link',
    )
    const specification = await createSpecificationFixture(
      db,
      'LINK-NOOP-AUDIT',
    )
    const service = createRequirementsService(db)
    const context = await makeRequestContext()
    const output = vi.spyOn(console, 'info').mockImplementation(() => {})
    const input = {
      specificationId: specification.id,
      requirementIds: [published.requirementId],
    }
    expect((await service.addToSpecification(context, input)).addedCount).toBe(
      1,
    )
    expect((await service.addToSpecification(context, input)).addedCount).toBe(
      0,
    )
    expect(await successRows(db)).toEqual([
      { action: 'specification.requirements.added' },
    ])
    expect(
      parseSecurityAuditEvents(output).filter(
        event => event.outcome === 'success',
      ),
    ).toHaveLength(1)
  })

  it.each(['library', 'specification'] as const)(
    'keeps REST %s import rows and history atomic',
    async kind => {
      const db = appDb()
      const service = createRequirementsService(db)
      const context = await makeRequestContext()
      const area = await createArea(db)
      const specification = await createSpecificationFixture(
        db,
        'REST-IMPORT-AUDIT',
      )
      const payload = requirementsImportPayloadSchema.parse({
        schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
        requirements: [
          { description: 'First import row' },
          { description: 'Second import row' },
        ],
      })
      const preview =
        kind === 'library'
          ? await service.previewLibraryImport(context, {
              areaId: area.id,
              locale: 'en',
              payload,
            })
          : await service.previewSpecificationLocalImport(context, {
              specificationId: specification.id,
              locale: 'en',
              payload,
            })
      const input = {
        locale: 'en' as const,
        previewToken: preview.previewToken,
        rows: preview.rows.map(row => ({
          ...row.values,
          sourceIndex: row.sourceIndex,
          reviewRowId: row.reviewRowId,
        })),
      }
      const execute = () =>
        kind === 'library'
          ? service.executeLibraryImport(context, { ...input, areaId: area.id })
          : service.executeSpecificationLocalImport(context, {
              ...input,
              specificationId: specification.id,
            })
      await failActionHistory(db)
      const output = vi.spyOn(console, 'info').mockImplementation(() => {})
      await expect(execute()).rejects.toThrow()
      expect(await db.query('SELECT id FROM requirements')).toEqual([])
      expect(
        await db.query('SELECT id FROM specification_local_requirements'),
      ).toEqual([])
      expect(await successRows(db)).toEqual([])
      expect(
        parseSecurityAuditEvents(output).filter(
          event => event.outcome === 'success',
        ),
      ).toEqual([])
      await db.query('DROP TRIGGER fail_mutation_action_history')
      const result = await execute()
      expect(result.summary.createdCount).toBe(2)
      expect(result.createdRows.map(row => row.description)).toEqual([
        'First import row',
        'Second import row',
      ])
      expect(await successRows(db)).toHaveLength(3)
      expect(
        parseSecurityAuditEvents(output).filter(
          event => event.outcome === 'success',
        ),
      ).toHaveLength(3)
    },
  )

  it.each(['library', 'specification'] as const)(
    'rolls back %s import and audit if the execution receipt update fails',
    async kind => {
      const db = appDb()
      const service = createRequirementsService(db)
      const context = await makeRequestContext()
      const destination =
        kind === 'library'
          ? {
              kind: 'requirements_library' as const,
              areaId: (await createArea(db)).id,
            }
          : {
              kind: 'requirements_specification' as const,
              specificationId: (
                await createSpecificationFixture(db, 'IMPORT-AUDIT')
              ).id,
            }
      const validation = await service.manageImport(context, {
        operation: 'validate',
        destination,
        payload: {
          schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
          requirements: [{ description: 'Atomic import' }],
        },
      })
      if (!('validationToken' in validation) || !validation.validationToken)
        throw new Error('Expected validation token')
      await db.query(`CREATE TRIGGER fail_import_receipt ON requirement_import_validation_sessions AFTER UPDATE AS
      BEGIN SET NOCOUNT ON; THROW 51000, 'Injected receipt failure', 1; END`)
      const output = vi.spyOn(console, 'info').mockImplementation(() => {})
      await expect(
        service.manageImport(context, {
          operation: 'execute',
          validationToken: validation.validationToken,
        }),
      ).rejects.toThrow()
      expect(await db.query('SELECT id FROM requirements')).toEqual([])
      expect(
        await db.query('SELECT id FROM specification_local_requirements'),
      ).toEqual([])
      expect(
        await db.query(
          'SELECT execution_result_json AS receipt FROM requirement_import_validation_sessions',
        ),
      ).toEqual([{ receipt: null }])
      expect(await successRows(db)).toEqual([])
      expect(
        parseSecurityAuditEvents(output).filter(
          event => event.outcome === 'success',
        ),
      ).toEqual([])
      await db.query('DROP TRIGGER fail_import_receipt')
      const committed = await service.manageImport(context, {
        operation: 'execute',
        validationToken: validation.validationToken,
      })
      expect(committed).toMatchObject({ summary: { importedCount: 1 } })
      expect(await successRows(db)).toHaveLength(2)
      const replay = await service.manageImport(context, {
        operation: 'execute',
        validationToken: validation.validationToken,
      })
      expect(replay).toMatchObject({ summary: { importedCount: 0 } })
      expect(await successRows(db)).toHaveLength(2)
      expect(
        parseSecurityAuditEvents(output).filter(
          event => event.outcome === 'success',
        ),
      ).toHaveLength(2)
    },
  )
})
