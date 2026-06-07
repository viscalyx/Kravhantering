import { describe, expect, it } from 'vitest'
import {
  buildRequirementSelectionHierarchyLayout,
  getRequirementSelectionHierarchyBadgeCounts,
  type RequirementSelectionHierarchyCondition,
  type RequirementSelectionHierarchyQuestion,
} from '@/lib/requirement-selection-question-hierarchy'

function question(
  id: number,
  questionCode: string,
  visibilityGroups: RequirementSelectionHierarchyQuestion['visibilityGroups'] = [],
): RequirementSelectionHierarchyQuestion {
  return {
    areaName: questionCode.startsWith('DRF') ? 'Drift' : 'Security',
    areaPrefix: questionCode.split('-')[0] ?? 'SEC',
    id,
    isActive: true,
    isArchived: false,
    questionCode,
    sortOrder: id * 10,
    text: `Question ${questionCode}`,
    visibilityGroups,
  }
}

function condition(
  parent: RequirementSelectionHierarchyQuestion,
  answerId: number,
  answerText: string,
): RequirementSelectionHierarchyCondition {
  return {
    answerId,
    answerIsActive: true,
    answerIsArchived: false,
    answerText,
    parentAreaName: parent.areaName,
    parentQuestionCode: parent.questionCode,
    parentQuestionId: parent.id,
    parentQuestionIsActive: parent.isActive,
    parentQuestionIsArchived: parent.isArchived,
    parentQuestionText: parent.text,
  }
}

function visibilityGroup(
  id: number,
  conditions: RequirementSelectionHierarchyCondition[],
) {
  return {
    conditions,
    id,
    sortOrder: id,
  }
}

describe('requirement selection question hierarchy', () => {
  it('does not assign hierarchy badges to standalone questions', () => {
    const counts = getRequirementSelectionHierarchyBadgeCounts([
      question(1, 'SEC-KUF001'),
    ])

    expect(counts.size).toBe(0)
    expect(
      buildRequirementSelectionHierarchyLayout([question(1, 'SEC-KUF001')], 1),
    ).toBeNull()
  })

  it('counts the whole connected hierarchy for every participating question', () => {
    const parent = question(1, 'SEC-KUF001')
    const child = question(2, 'SEC-KUF002', [
      visibilityGroup(1, [condition(parent, 101, 'Yes')]),
    ])
    const grandchild = question(3, 'SEC-KUF003', [
      visibilityGroup(2, [condition(child, 201, 'High')]),
    ])
    const sibling = question(4, 'SEC-KUF004', [
      visibilityGroup(3, [condition(parent, 102, 'Partly')]),
    ])
    const standalone = question(5, 'DRF-KUF001')

    const counts = getRequirementSelectionHierarchyBadgeCounts([
      parent,
      child,
      grandchild,
      sibling,
      standalone,
    ])

    expect(Object.fromEntries(counts)).toEqual({
      1: 4,
      2: 4,
      3: 4,
      4: 4,
    })
  })

  it('lays out a connected hierarchy with top-down edges', () => {
    const parent = question(1, 'SEC-KUF001')
    const child = question(2, 'SEC-KUF002', [
      visibilityGroup(1, [condition(parent, 101, 'Yes')]),
    ])
    const grandchild = question(3, 'SEC-KUF003', [
      visibilityGroup(2, [condition(child, 201, 'High')]),
    ])
    const sibling = question(4, 'SEC-KUF004', [
      visibilityGroup(3, [condition(parent, 102, 'Partly')]),
    ])

    const layout = buildRequirementSelectionHierarchyLayout(
      [parent, child, grandchild, sibling],
      child.id,
    )

    expect(layout?.nodeCount).toBe(4)
    expect(layout?.nodes.map(node => node.question.questionCode)).toContain(
      'SEC-KUF001',
    )
    expect(layout?.nodes.find(node => node.id === child.id)?.isFocus).toBe(true)
    expect(layout?.edges.map(edge => edge.id).sort()).toEqual([
      '1->2',
      '1->4',
      '2->3',
    ])
    expect(layout?.edges.every(edge => edge.svgPath.startsWith('M'))).toBe(true)
    const parentNode = layout?.nodes.find(node => node.id === parent.id)
    const childNode = layout?.nodes.find(node => node.id === child.id)
    expect(parentNode && childNode && parentNode.y < childNode.y).toBe(true)
  })

  it('renders a multi-parent question once while preserving every incoming edge', () => {
    const firstParent = question(1, 'SEC-KUF001')
    const secondParent = question(2, 'DRF-KUF001')
    const sharedChild = question(3, 'SEC-KUF002', [
      visibilityGroup(1, [condition(firstParent, 101, 'Yes')]),
      visibilityGroup(2, [condition(secondParent, 201, 'Cloud')]),
    ])
    const grandchild = question(4, 'SEC-KUF003', [
      visibilityGroup(3, [condition(sharedChild, 301, 'High')]),
    ])

    const layout = buildRequirementSelectionHierarchyLayout(
      [firstParent, secondParent, sharedChild, grandchild],
      sharedChild.id,
    )

    expect(
      layout?.nodes.filter(node => node.id === sharedChild.id),
    ).toHaveLength(1)
    expect(layout?.edges.map(edge => edge.id).sort()).toEqual([
      '1->3',
      '2->3',
      '3->4',
    ])
    expect(
      layout?.nodes.find(node => node.id === sharedChild.id)?.conditionGroups,
    ).toEqual([
      {
        conditions: [
          {
            answers: [
              {
                answerId: 101,
                isActive: true,
                isArchived: false,
                text: 'Yes',
              },
            ],
            parent: expect.objectContaining({
              questionCode: 'SEC-KUF001',
              questionId: 1,
            }),
          },
        ],
        groupId: 1,
        sortOrder: 1,
      },
      {
        conditions: [
          {
            answers: [
              {
                answerId: 201,
                isActive: true,
                isArchived: false,
                text: 'Cloud',
              },
            ],
            parent: expect.objectContaining({
              questionCode: 'DRF-KUF001',
              questionId: 2,
            }),
          },
        ],
        groupId: 2,
        sortOrder: 2,
      },
    ])
  })

  it('groups multiple trigger answers from the same parent in one condition row', () => {
    const parent = question(1, 'SEC-KUF001')
    const child = question(2, 'SEC-KUF002', [
      visibilityGroup(1, [
        condition(parent, 101, 'Yes'),
        condition(parent, 102, 'Partly'),
      ]),
    ])

    const layout = buildRequirementSelectionHierarchyLayout(
      [parent, child],
      child.id,
    )
    const childNode = layout?.nodes.find(node => node.id === child.id)

    expect(childNode?.conditionGroups[0]?.conditions[0]?.answers).toEqual([
      expect.objectContaining({ text: 'Yes' }),
      expect.objectContaining({ text: 'Partly' }),
    ])
  })
})
