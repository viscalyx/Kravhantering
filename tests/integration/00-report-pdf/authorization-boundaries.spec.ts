import { existsSync, readFileSync } from 'node:fs'
import {
  type APIRequestContext,
  type APIResponse,
  expect,
  test,
} from '@playwright/test'
import type { DataSource } from 'typeorm'
import {
  createSqlServerDataSource,
  getSqlServerDatabaseUrl,
  type SqlServerRuntimeEnv,
} from '@/lib/typeorm/sqlserver-config'
import {
  expectOk,
  expectStatus,
  newRoleContext,
  type RequirementListResponse,
  referenceManualCases,
} from '../authorization/authorization-test-helpers'

const RESPONSE_BODY_EXCERPT_LENGTH = 2_000
const RESOURCE_FIXTURE_PREFIX = 'I596LOAD'
const RESOURCE_FIXTURE_SIZE = 1_000

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}

  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/u)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const normalized = line.startsWith('export ')
          ? line.slice('export '.length).trim()
          : line
        const separatorIndex = normalized.indexOf('=')
        if (separatorIndex === -1) return null

        const key = normalized.slice(0, separatorIndex).trim()
        let value = normalized.slice(separatorIndex + 1).trim()
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1)
        }
        return [key, value] as const
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  )
}

async function openSqlServer(): Promise<DataSource> {
  const env = {
    ...readEnvFile('.env.prodlike'),
    ...readEnvFile('.env.sqlserver'),
    ...process.env,
  } as SqlServerRuntimeEnv
  const dataSource = createSqlServerDataSource({
    env,
    url: getSqlServerDatabaseUrl(env),
  })
  await dataSource.initialize()
  return dataSource
}

async function removeResourceFixture(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    `
      DELETE versions
      FROM requirement_versions versions
      INNER JOIN requirements requirement
        ON requirement.id = versions.requirement_id
      WHERE requirement.unique_id LIKE @0;

      DELETE FROM requirements WHERE unique_id LIKE @0;
    `,
    [`${RESOURCE_FIXTURE_PREFIX}%`],
  )
}

async function seedResourceFixture(dataSource: DataSource): Promise<void> {
  await removeResourceFixture(dataSource)
  await dataSource.query(
    `
      DECLARE @areaId int = (
        SELECT TOP (1) id FROM requirement_areas ORDER BY id
      );
      IF @areaId IS NULL
        THROW 51000, 'Issue 596 resource fixture needs a requirement area.', 1;

      DECLARE @numbers TABLE (n int NOT NULL PRIMARY KEY);
      INSERT INTO @numbers (n)
      SELECT TOP (${RESOURCE_FIXTURE_SIZE})
        ROW_NUMBER() OVER (ORDER BY firstObject.object_id, secondObject.object_id)
      FROM sys.all_objects firstObject
      CROSS JOIN sys.all_objects secondObject;

      DECLARE @requirements TABLE (
        n int NOT NULL PRIMARY KEY,
        requirement_id int NOT NULL
      );

      MERGE requirements AS target
      USING @numbers AS source
        ON 1 = 0
      WHEN NOT MATCHED THEN
        INSERT (
          unique_id,
          sequence_number,
          requirement_area_id,
          is_archived,
          created_at
        )
        VALUES (
          CONCAT(
            N'${RESOURCE_FIXTURE_PREFIX}',
            RIGHT(CONCAT(N'0000', source.n), 4)
          ),
          15960000 + source.n,
          @areaId,
          0,
          CONVERT(datetime2, '2026-07-18T00:00:00')
        )
      OUTPUT source.n, inserted.id
        INTO @requirements (n, requirement_id);

      INSERT INTO requirement_versions (
        requirement_id,
        version_number,
        description,
        acceptance_criteria,
        is_verifiable,
        verification_method,
        requirement_status_id,
        created_at,
        published_at,
        created_by,
        created_by_hsa_id,
        status_updated_at,
        has_specification_item_history
      )
      SELECT
        fixture.requirement_id,
        1,
        CONCAT(
          N'Blocking issue 596 resource verification requirement ',
          fixture.n,
          N'. This text exercises actual SQL traversal, CSV spooling, and ',
          N'the isolated PDF worker without retaining the full output in memory.'
        ),
        CONCAT(N'Output contains requirement ', fixture.n, N'.'),
        1,
        N'Automated actual-SQL resource verification',
        3,
        CONVERT(datetime2, '2026-07-18T00:00:00'),
        CONVERT(datetime2, '2026-07-18T00:00:00'),
        N'Issue 596 resource gate',
        N'SE5560000001-596',
        CONVERT(datetime2, '2026-07-18T00:00:00'),
        0
      FROM @requirements fixture;
    `,
  )
}

async function responseBodyExcerpt(response: APIResponse): Promise<string> {
  const body = await response.text()
  return body.length > RESPONSE_BODY_EXCERPT_LENGTH
    ? `${body.slice(0, RESPONSE_BODY_EXCERPT_LENGTH)}...`
    : body
}

async function isNextDevNotFoundResponse(
  response: APIResponse,
): Promise<boolean> {
  if (response.status() !== 404) return false

  const contentType = response.headers()['content-type'] ?? ''
  return contentType.includes('text/html')
}

async function getAfterReportRouteReady(
  request: APIRequestContext,
  url: string,
  label: string,
): Promise<APIResponse> {
  let lastStatus: number | null = null
  let lastBodyExcerpt: string | null = null
  let readyResponse: APIResponse | null = null

  await expect
    .poll(
      async () => {
        const response = await request.get(url)
        lastStatus = response.status()

        if (!(await isNextDevNotFoundResponse(response))) {
          lastBodyExcerpt = null
          readyResponse = response
          return 'ready'
        }

        lastBodyExcerpt = await responseBodyExcerpt(response)
        return 'next-dev-not-found'
      },
      {
        message: `${label} route should resolve after Next dev route compilation`,
        timeout: 20_000,
      },
    )
    .toBe('ready')

  if (!readyResponse) {
    throw new Error(
      `${label} did not return a response after route-ready polling. Last status: ${lastStatus}; previous body excerpt: ${lastBodyExcerpt ?? '<not captured>'}`,
    )
  }
  return readyResponse
}

test('REQ-10/LIFE-11/SPEC-10d/AUTH-10/AUTH-11: report PDFs enforce published and history boundaries', async ({
  browserName: _browserName,
}, testInfo) => {
  referenceManualCases(
    testInfo,
    'REQ-10',
    'LIFE-11',
    'SPEC-10d',
    'AUTH-10',
    'AUTH-11',
  )
  const noRoles = await newRoleContext(testInfo, 'noRoles')

  try {
    const requirementsResponse = await noRoles.get(
      '/api/requirements?limit=1&locale=sv&statuses=3',
    )
    await expectOk(requirementsResponse, 'published requirements list')
    const requirements =
      (await requirementsResponse.json()) as RequirementListResponse
    const publishedRequirement = requirements.requirements[0]
    expect(publishedRequirement).toBeDefined()

    const listPdfResponse = await getAfterReportRouteReady(
      noRoles,
      `/sv/requirements/reports/pdf/list?ids=${publishedRequirement.id}`,
      'published requirement list PDF',
    )
    await expectOk(listPdfResponse, 'published requirement list PDF')
    expect(listPdfResponse.headers()['content-type']).toContain(
      'application/pdf',
    )

    const historyUrls = [
      [
        `/sv/requirements/reports/pdf/history/${publishedRequirement.id}`,
        'history PDF without history access',
      ],
      [
        `/sv/requirements/reports/pdf/review/${publishedRequirement.id}`,
        'review PDF without history access',
      ],
      [
        `/sv/requirements/reports/pdf/suggestion-history/${publishedRequirement.id}`,
        'suggestion history PDF without history access',
      ],
      [
        `/sv/requirements/reports/pdf/review-combined?ids=${publishedRequirement.id}`,
        'combined review PDF without history access',
      ],
    ] as const

    for (const [url, label] of historyUrls) {
      await expectStatus(
        await getAfterReportRouteReady(noRoles, url, label),
        403,
        label,
      )
    }

    await expectStatus(
      await getAfterReportRouteReady(
        noRoles,
        '/sv/specifications/8/reports/pdf/procurement',
        'unassigned specification profile PDF',
      ),
      403,
      'unassigned specification profile PDF',
    )
  } finally {
    await noRoles.dispose()
  }
})

test('REQ-10/REQ-18: actual SQL renders and exports exactly 1,000 requirements', async ({
  request,
}, testInfo) => {
  test.setTimeout(240_000)
  referenceManualCases(testInfo, 'REQ-10', 'REQ-18')

  const dataSource = await openSqlServer()

  try {
    await seedResourceFixture(dataSource)
    const query = new URLSearchParams({
      locale: 'sv',
      statuses: '3',
      uniqueIdSearch: RESOURCE_FIXTURE_PREFIX,
    })

    const csvStartedAt = Date.now()
    const csvResponse = await request.get(
      `/api/requirements/export?${query.toString()}`,
    )
    await expectOk(csvResponse, '1,000-requirement CSV export')
    const csv = await csvResponse.text()
    const exportedIds =
      csv.match(new RegExp(`${RESOURCE_FIXTURE_PREFIX}\\d{4}`, 'gu')) ?? []
    expect(exportedIds).toHaveLength(RESOURCE_FIXTURE_SIZE)
    expect(csvResponse.headers()['content-length']).toBe(
      String(Buffer.byteLength(csv)),
    )

    const pdfStartedAt = Date.now()
    const pdfResponse = await request.get(
      `/sv/requirements/reports/pdf/list?${query.toString()}`,
      { timeout: 220_000 },
    )
    await expectOk(pdfResponse, '1,000-requirement PDF report')
    const pdf = await pdfResponse.body()
    expect(pdfResponse.headers()['content-type']).toContain('application/pdf')
    expect(pdfResponse.headers()['content-length']).toBe(String(pdf.length))
    expect(pdf.length).toBeGreaterThan(1_000)

    await testInfo.attach('issue-596-resource-gate.json', {
      body: Buffer.from(
        JSON.stringify(
          {
            csvBytes: Buffer.byteLength(csv),
            csvDurationMs: pdfStartedAt - csvStartedAt,
            itemCount: RESOURCE_FIXTURE_SIZE,
            pdfBytes: pdf.length,
            pdfDurationMs: Date.now() - pdfStartedAt,
          },
          null,
          2,
        ),
      ),
      contentType: 'application/json',
    })
  } finally {
    await removeResourceFixture(dataSource)
    if (dataSource.isInitialized) await dataSource.destroy()
  }
})
