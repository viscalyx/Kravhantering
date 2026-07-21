import { describe, expect, it } from 'vitest'
import { listRequirementPackages } from '@/lib/dal/requirement-packages'
import { listRequirementSelectionQuestions } from '@/lib/dal/requirement-selection-questions'
import { listSpecificationsForActorCatalog } from '@/lib/dal/requirements-specifications'
import { listRfiQuestions } from '@/lib/dal/rfi-questions'
import {
  createArea,
  createPublishedRequirement,
  ensureResponsibilityPerson,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

const LARGE_CATALOG_SIZE = 2_101
const LARGE_SELECTION_ANSWER_COUNT = 1_050

describe('fixed-shape SQL Server catalog hydration', () => {
  const appDb = useSqlIntegrationDatabase()

  it('hydrates every selection answer and relationship beyond the duplicated-parameter boundary', async () => {
    const area = await createArea(appDb())
    const requirement = await createPublishedRequirement(
      appDb(),
      area.id,
      'Selection hydration requirement',
    )
    const leadHsaId = 'SE5560000001-pkgco'
    await ensureResponsibilityPerson(appDb(), leadHsaId)
    const packageRows = (await appDb().query(
      `INSERT INTO requirement_packages (
         name, purpose_and_scope, lead_hsa_id, is_archived, created_at, updated_at
       )
       OUTPUT INSERTED.id AS id
       VALUES (N'Selection package', N'Boundary hydration', @0, 0, SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [leadHsaId],
    )) as Array<{ id: number }>
    const packageId = packageRows[0]?.id
    expect(packageId).toBeTypeOf('number')
    await appDb().query(
      `INSERT INTO requirement_version_requirement_packages (
         requirement_version_id, requirement_package_id
       ) VALUES (@0, @1)`,
      [requirement.publishedVersionId, packageId],
    )
    const questionRows = (await appDb().query(
      `INSERT INTO requirement_selection_questions (
         question_code, area_id, question_text, help_text, selection_type,
         sort_order, is_active, is_archived, archived_at, created_at, updated_at
       )
       OUTPUT INSERTED.id AS id
       VALUES (
         N'SQL-KUF001', @0, N'Boundary question', NULL, N'multiple',
         1, 1, 0, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
      [area.id],
    )) as Array<{ id: number }>
    const questionId = questionRows[0]?.id
    expect(questionId).toBeTypeOf('number')

    await appDb().query(
      `WITH numbers AS (
         SELECT 1 AS value
         UNION ALL
         SELECT value + 1 FROM numbers WHERE value < @1
       )
       INSERT INTO requirement_selection_answers (
         question_id, answer_text, description, sort_order,
         is_no_requirement_selection, is_active, is_archived, archived_at,
         created_at, updated_at
       )
       SELECT
         @0, CONCAT(N'Answer ', FORMAT(value, '0000')), NULL, value,
         0, 1, 0, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()
       FROM numbers
       OPTION (MAXRECURSION 0)`,
      [questionId, LARGE_SELECTION_ANSWER_COUNT],
    )
    await appDb().query(
      `INSERT INTO requirement_selection_answer_requirements (answer_id, requirement_id)
       SELECT id, @1
       FROM requirement_selection_answers
       WHERE question_id = @0`,
      [questionId, requirement.requirementId],
    )
    await appDb().query(
      `INSERT INTO requirement_selection_answer_packages (answer_id, requirement_package_id)
       SELECT id, @1
       FROM requirement_selection_answers
       WHERE question_id = @0`,
      [questionId, packageId],
    )
    const visibilityGroupRows = (await appDb().query(
      `INSERT INTO requirement_selection_question_visibility_groups (
         question_id, sort_order, created_at, updated_at
       )
       OUTPUT INSERTED.id AS id
       VALUES (@0, 1, SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [questionId],
    )) as Array<{ id: number }>
    await appDb().query(
      `INSERT INTO requirement_selection_question_visibility_conditions (
         visibility_group_id, parent_question_id, answer_id, sort_order,
         created_at, updated_at
       )
       SELECT @0, @1, id, sort_order, SYSUTCDATETIME(), SYSUTCDATETIME()
       FROM requirement_selection_answers
       WHERE question_id = @1`,
      [visibilityGroupRows[0]?.id, questionId],
    )

    const result = await listRequirementSelectionQuestions(appDb(), {
      includeArchived: true,
    })

    expect(result).toHaveLength(1)
    const answers = result[0]?.answers ?? []
    expect(
      answers.map(answer => ({
        matchingRequirementCount: answer.matchingRequirementCount,
        matchingRequirements: answer.matchingRequirements.map(match => ({
          direct: match.direct,
          id: match.id,
          sourcePackageIds: match.sourcePackages.map(source => source.id),
        })),
        packageIds: answer.packageIds,
        requirementIds: answer.requirementIds,
        sortOrder: answer.sortOrder,
        text: answer.text,
      })),
    ).toEqual(
      Array.from({ length: LARGE_SELECTION_ANSWER_COUNT }, (_, index) => ({
        matchingRequirementCount: 1,
        matchingRequirements: [
          {
            direct: true,
            id: requirement.requirementId,
            sourcePackageIds: [packageId],
          },
        ],
        packageIds: [packageId],
        requirementIds: [requirement.requirementId],
        sortOrder: index + 1,
        text: `Answer ${String(index + 1).padStart(4, '0')}`,
      })),
    )
    expect(
      result[0]?.visibilityGroups[0]?.conditions.map(condition => ({
        answerId: condition.answerId,
        answerText: condition.answerText,
      })),
    ).toEqual(
      answers.map(answer => ({
        answerId: answer.id,
        answerText: answer.text,
      })),
    )
  })

  it('hydrates all three RFI version relationship kinds beyond 2,100 versions', async () => {
    const area = await createArea(appDb())
    const requirement = await createPublishedRequirement(
      appDb(),
      area.id,
      'RFI hydration requirement',
    )
    const leadHsaId = 'SE5560000001-pkgcoauthor'
    await ensureResponsibilityPerson(appDb(), leadHsaId)
    const packageRows = (await appDb().query(
      `INSERT INTO requirement_packages (
         name, purpose_and_scope, lead_hsa_id, is_archived, created_at, updated_at
       ) OUTPUT INSERTED.id AS id
       VALUES (N'RFI package', N'Boundary hydration', @0, 0, SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [leadHsaId],
    )) as Array<{ id: number }>
    const selectionQuestionRows = (await appDb().query(
      `INSERT INTO requirement_selection_questions (
         question_code, area_id, question_text, help_text, selection_type,
         sort_order, is_active, is_archived, archived_at, created_at, updated_at
       ) OUTPUT INSERTED.id AS id
       VALUES (
         N'SQL-KUF-RFI', @0, N'RFI selection source', NULL, N'single',
         1, 1, 0, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
      [area.id],
    )) as Array<{ id: number }>

    await appDb().query(
      `WITH numbers AS (
         SELECT 1 AS value
         UNION ALL
         SELECT value + 1 FROM numbers WHERE value < @1
       )
       INSERT INTO rfi_questions (
         question_code, area_id, sort_order, is_archived, archived_at,
         created_at, updated_at
       )
       SELECT
         CONCAT(N'SQL-RFI', FORMAT(value, '0000')), @0, value, 0, NULL,
         SYSUTCDATETIME(), SYSUTCDATETIME()
       FROM numbers
       OPTION (MAXRECURSION 0)`,
      [area.id, LARGE_CATALOG_SIZE],
    )
    await appDb().query(
      `INSERT INTO rfi_question_versions (
         rfi_question_id, version_number, question_text, help_text,
         expected_answer_format, is_active, created_by_hsa_id,
         created_by_display_name, created_at, updated_at
       )
       SELECT
         id, 1, CONCAT(N'Question ', question_code), NULL, NULL, 1, NULL, NULL,
         SYSUTCDATETIME(), SYSUTCDATETIME()
       FROM rfi_questions`,
    )
    await appDb().query(
      `INSERT INTO rfi_question_version_requirement_selection_questions (
         rfi_question_version_id, requirement_selection_question_id
       )
       SELECT id, @0 FROM rfi_question_versions`,
      [selectionQuestionRows[0]?.id],
    )
    await appDb().query(
      `INSERT INTO rfi_question_version_requirement_packages (
         rfi_question_version_id, requirement_package_id
       )
       SELECT id, @0 FROM rfi_question_versions`,
      [packageRows[0]?.id],
    )
    await appDb().query(
      `INSERT INTO rfi_question_version_requirements (
         rfi_question_version_id, requirement_id
       )
       SELECT id, @0 FROM rfi_question_versions`,
      [requirement.requirementId],
    )

    const result = await listRfiQuestions(appDb(), { includeArchived: true })

    expect(
      result.map(question => ({
        questionCode: question.questionCode,
        requirementIds: question.requirementIds,
        requirementPackageIds: question.requirementPackageIds,
        requirementSelectionQuestionIds:
          question.requirementSelectionQuestionIds,
      })),
    ).toEqual(
      Array.from({ length: LARGE_CATALOG_SIZE }, (_, index) => ({
        questionCode: `SQL-RFI${String(index + 1).padStart(4, '0')}`,
        requirementIds: [requirement.requirementId],
        requirementPackageIds: [packageRows[0]?.id],
        requirementSelectionQuestionIds: [selectionQuestionRows[0]?.id],
      })),
    )
  })

  it('retains actor scope, aggregates, areas, classifications, and co-authors beyond 2,100 specifications', async () => {
    const area = await createArea(appDb())
    const requirement = await createPublishedRequirement(
      appDb(),
      area.id,
      'Specification hydration requirement',
    )
    const responsibleHsaId = 'SE5560000001-specresp'
    const coAuthorHsaId = 'SE5560000001-areaco'
    await ensureResponsibilityPerson(appDb(), responsibleHsaId)
    await ensureResponsibilityPerson(appDb(), coAuthorHsaId)
    await appDb().query(
      `IF NOT EXISTS (SELECT 1 FROM specification_governance_object_types)
         INSERT INTO specification_governance_object_types (name_sv, name_en)
         VALUES (N'Plattform', N'Platform');
       IF NOT EXISTS (SELECT 1 FROM specification_implementation_types)
         INSERT INTO specification_implementation_types (name_sv, name_en)
         VALUES (N'Införande', N'Implementation');`,
    )

    await appDb().query(
      `WITH numbers AS (
         SELECT 1 AS value
         UNION ALL
         SELECT value + 1 FROM numbers WHERE value < @2
       )
       INSERT INTO requirements_specifications (
         specification_code, name, specification_governance_object_type_id,
         specification_implementation_type_id, specification_lifecycle_status_id,
         business_needs_reference, responsible_hsa_id,
         local_requirement_next_sequence, created_at, updated_at
       )
       SELECT
         CONCAT(N'SQL-SPEC-', FORMAT(value, '0000')),
         CONCAT(N'Specification ', FORMAT(value, '0000')),
         (SELECT MIN(id) FROM specification_governance_object_types),
         (SELECT MIN(id) FROM specification_implementation_types),
         (SELECT MIN(id) FROM specification_lifecycle_statuses),
         N'Boundary need', @0, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
       FROM numbers
       OPTION (MAXRECURSION 0)`,
      [responsibleHsaId, coAuthorHsaId, LARGE_CATALOG_SIZE],
    )
    await appDb().query(
      `INSERT INTO specification_co_authors (
         specification_id, hsa_id, created_at, created_by_hsa_id
       )
       SELECT id, @0, SYSUTCDATETIME(), @1
       FROM requirements_specifications`,
      [coAuthorHsaId, responsibleHsaId],
    )
    await appDb().query(
      `INSERT INTO requirements_specification_items (
         requirements_specification_id, requirement_id, requirement_version_id,
         needs_reference_id, specification_item_status_id, created_at
       )
       SELECT
         id, @0, @1, NULL,
         (SELECT MIN(id) FROM specification_item_statuses),
         SYSUTCDATETIME()
       FROM requirements_specifications`,
      [requirement.requirementId, requirement.publishedVersionId],
    )

    const catalog = await listSpecificationsForActorCatalog(appDb(), {
      actorHsaId: coAuthorHsaId,
      canReadAll: false,
    })

    const firstSpecification = catalog.specifications[0]
    expect(firstSpecification?.governanceObjectType?.id).toEqual(
      expect.any(Number),
    )
    expect(firstSpecification?.implementationType?.id).toEqual(
      expect.any(Number),
    )
    expect(firstSpecification?.lifecycleStatus?.id).toEqual(expect.any(Number))
    expect(
      catalog.specifications.map(specification => ({
        governanceObjectTypeId: specification.governanceObjectType?.id,
        implementationTypeId: specification.implementationType?.id,
        itemCount: specification.itemCount,
        lifecycleStatusId: specification.lifecycleStatus?.id,
        requirementAreas: specification.requirementAreas,
        responsibleHsaId: specification.responsibleHsaId,
        specificationCode: specification.specificationCode,
      })),
    ).toEqual(
      Array.from({ length: LARGE_CATALOG_SIZE }, (_, index) => ({
        governanceObjectTypeId: firstSpecification?.governanceObjectType?.id,
        implementationTypeId: firstSpecification?.implementationType?.id,
        itemCount: 1,
        lifecycleStatusId: firstSpecification?.lifecycleStatus?.id,
        requirementAreas: [{ id: area.id, name: area.name }],
        responsibleHsaId,
        specificationCode: `SQL-SPEC-${String(index + 1).padStart(4, '0')}`,
      })),
    )
    expect(catalog.coAuthorHsaIdsBySpecification.size).toBe(LARGE_CATALOG_SIZE)
    expect(
      catalog.specifications.map(specification =>
        catalog.coAuthorHsaIdsBySpecification.get(specification.id),
      ),
    ).toEqual(Array.from({ length: LARGE_CATALOG_SIZE }, () => [coAuthorHsaId]))
  })

  it('hydrates every package responsibility relationship beyond 2,100 packages', async () => {
    const leadHsaId = 'SE5560000001-pkglead'
    const coAuthorHsaId = 'SE5560000001-pkgco'
    await ensureResponsibilityPerson(appDb(), leadHsaId)
    await ensureResponsibilityPerson(appDb(), coAuthorHsaId)

    await appDb().query(
      `WITH numbers AS (
         SELECT 1 AS value
         UNION ALL
         SELECT value + 1 FROM numbers WHERE value < @2
       )
       INSERT INTO requirement_packages (
         name, purpose_and_scope, lead_hsa_id, is_archived, created_at, updated_at
       )
       SELECT
         CONCAT(N'Package ', FORMAT(value, '0000')), N'Boundary hydration',
         @0, 0, SYSUTCDATETIME(), SYSUTCDATETIME()
       FROM numbers
       OPTION (MAXRECURSION 0)`,
      [leadHsaId, coAuthorHsaId, LARGE_CATALOG_SIZE],
    )
    await appDb().query(
      `INSERT INTO requirement_package_co_authors (
         requirement_package_id, hsa_id, created_at,
         created_by_hsa_id, created_by_display_name
       )
       SELECT id, @0, SYSUTCDATETIME(), @1, N'Package lead'
       FROM requirement_packages`,
      [coAuthorHsaId, leadHsaId],
    )

    const result = await listRequirementPackages(appDb(), {
      includeArchived: true,
    })

    expect(
      result.map(requirementPackage => ({
        coAuthorHsaIds: requirementPackage.coAuthors.map(
          coAuthor => coAuthor.hsaId,
        ),
        leadHsaId: requirementPackage.leadHsaId,
        name: requirementPackage.name,
      })),
    ).toEqual(
      Array.from({ length: LARGE_CATALOG_SIZE }, (_, index) => ({
        coAuthorHsaIds: [coAuthorHsaId],
        leadHsaId,
        name: `Package ${String(index + 1).padStart(4, '0')}`,
      })),
    )
  })
})
