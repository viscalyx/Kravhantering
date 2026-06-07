import {
  layout as dagreLayout,
  type EdgeLabel,
  type GraphLabel,
  graphlib,
  type NodeLabel,
  type Point,
} from '@dagrejs/dagre'

export const REQUIREMENT_SELECTION_HIERARCHY_NODE_WIDTH = 280
export const REQUIREMENT_SELECTION_HIERARCHY_NODE_HEIGHT = 150

export interface RequirementSelectionHierarchyCondition {
  answerId: number
  answerIsActive: boolean
  answerIsArchived: boolean
  answerText: string
  parentAreaName: string
  parentQuestionCode: string
  parentQuestionId: number
  parentQuestionIsActive: boolean
  parentQuestionIsArchived: boolean
  parentQuestionText: string
}

export interface RequirementSelectionHierarchyVisibilityGroup {
  conditions: RequirementSelectionHierarchyCondition[]
  id: number
  sortOrder: number
}

export interface RequirementSelectionHierarchyQuestion {
  areaName: string
  areaPrefix: string
  id: number
  isActive: boolean
  isArchived: boolean
  questionCode: string
  sortOrder: number
  text: string
  visibilityGroups: RequirementSelectionHierarchyVisibilityGroup[]
}

export interface RequirementSelectionHierarchyConditionAnswer {
  answerId: number
  isActive: boolean
  isArchived: boolean
  text: string
}

export interface RequirementSelectionHierarchyConditionParent {
  areaName: string
  isActive: boolean
  isArchived: boolean
  questionCode: string
  questionId: number
  text: string
}

export interface RequirementSelectionHierarchyConditionRow {
  answers: RequirementSelectionHierarchyConditionAnswer[]
  parent: RequirementSelectionHierarchyConditionParent
}

export interface RequirementSelectionHierarchyConditionGroup {
  conditions: RequirementSelectionHierarchyConditionRow[]
  groupId: number
  sortOrder: number
}

export interface RequirementSelectionHierarchyNode {
  conditionGroups: RequirementSelectionHierarchyConditionGroup[]
  height: number
  id: number
  isFocus: boolean
  question: RequirementSelectionHierarchyQuestion
  width: number
  x: number
  y: number
}

export interface RequirementSelectionHierarchyEdge {
  id: string
  points: Point[]
  sourceId: number
  svgPath: string
  targetId: number
}

export interface RequirementSelectionHierarchyLayout {
  edges: RequirementSelectionHierarchyEdge[]
  focusQuestionId: number
  height: number
  nodeCount: number
  nodes: RequirementSelectionHierarchyNode[]
  width: number
}

interface HierarchyEdge {
  sourceId: number
  targetId: number
}

interface HierarchyTopology {
  adjacencyByQuestionId: Map<number, Set<number>>
  edges: HierarchyEdge[]
  incomingByQuestionId: Map<number, Set<number>>
  outgoingByQuestionId: Map<number, Set<number>>
  questionsById: Map<number, RequirementSelectionHierarchyQuestion>
}

function compareQuestions(
  left: RequirementSelectionHierarchyQuestion,
  right: RequirementSelectionHierarchyQuestion,
): number {
  const areaCompare = left.areaName.localeCompare(right.areaName)
  if (areaCompare !== 0) return areaCompare
  if (left.sortOrder !== right.sortOrder)
    return left.sortOrder - right.sortOrder
  return left.questionCode.localeCompare(right.questionCode)
}

function addMapSetValue<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  const bucket = map.get(key) ?? new Set<V>()
  bucket.add(value)
  map.set(key, bucket)
}

function createHierarchyTopology(
  questions: RequirementSelectionHierarchyQuestion[],
): HierarchyTopology {
  const questionsById = new Map(
    questions.map(question => [question.id, question]),
  )
  const edgeByKey = new Map<string, HierarchyEdge>()
  const adjacencyByQuestionId = new Map<number, Set<number>>()
  const incomingByQuestionId = new Map<number, Set<number>>()
  const outgoingByQuestionId = new Map<number, Set<number>>()

  for (const question of questions) {
    for (const group of question.visibilityGroups) {
      for (const condition of group.conditions) {
        if (
          condition.parentQuestionId === question.id ||
          !questionsById.has(condition.parentQuestionId)
        ) {
          continue
        }
        const edgeKey = `${condition.parentQuestionId}->${question.id}`
        if (edgeByKey.has(edgeKey)) continue
        edgeByKey.set(edgeKey, {
          sourceId: condition.parentQuestionId,
          targetId: question.id,
        })
        addMapSetValue(
          adjacencyByQuestionId,
          condition.parentQuestionId,
          question.id,
        )
        addMapSetValue(
          adjacencyByQuestionId,
          question.id,
          condition.parentQuestionId,
        )
        addMapSetValue(
          incomingByQuestionId,
          question.id,
          condition.parentQuestionId,
        )
        addMapSetValue(
          outgoingByQuestionId,
          condition.parentQuestionId,
          question.id,
        )
      }
    }
  }

  return {
    adjacencyByQuestionId,
    edges: [...edgeByKey.values()],
    incomingByQuestionId,
    outgoingByQuestionId,
    questionsById,
  }
}

function collectConnectedQuestionIds(
  topology: HierarchyTopology,
  focusQuestionId: number,
): Set<number> {
  if (!topology.adjacencyByQuestionId.has(focusQuestionId))
    return new Set<number>()

  const connected = new Set<number>()
  const stack = [focusQuestionId]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || connected.has(current)) continue
    connected.add(current)
    for (const adjacent of topology.adjacencyByQuestionId.get(current) ?? []) {
      if (!connected.has(adjacent)) stack.push(adjacent)
    }
  }
  return connected
}

export function getRequirementSelectionHierarchyBadgeCounts(
  questions: RequirementSelectionHierarchyQuestion[],
): Map<number, number> {
  const topology = createHierarchyTopology(questions)
  const counts = new Map<number, number>()
  const handled = new Set<number>()

  for (const question of questions) {
    if (handled.has(question.id)) continue
    const component = collectConnectedQuestionIds(topology, question.id)
    if (component.size === 0) continue
    for (const questionId of component) {
      handled.add(questionId)
      counts.set(questionId, component.size)
    }
  }

  return counts
}

function createConditionGroups(
  question: RequirementSelectionHierarchyQuestion,
  questionsById: Map<number, RequirementSelectionHierarchyQuestion>,
): RequirementSelectionHierarchyConditionGroup[] {
  return [...question.visibilityGroups]
    .sort(
      (left, right) => left.sortOrder - right.sortOrder || left.id - right.id,
    )
    .map(group => {
      const rowByParentId = new Map<
        number,
        RequirementSelectionHierarchyConditionRow
      >()

      for (const condition of group.conditions) {
        const parentQuestion = questionsById.get(condition.parentQuestionId)
        const existing = rowByParentId.get(condition.parentQuestionId)
        const row =
          existing ??
          ({
            answers: [],
            parent: {
              areaName: parentQuestion?.areaName ?? condition.parentAreaName,
              isActive:
                parentQuestion?.isActive ?? condition.parentQuestionIsActive,
              isArchived:
                parentQuestion?.isArchived ??
                condition.parentQuestionIsArchived,
              questionCode:
                parentQuestion?.questionCode ?? condition.parentQuestionCode,
              questionId: condition.parentQuestionId,
              text: parentQuestion?.text ?? condition.parentQuestionText,
            },
          } satisfies RequirementSelectionHierarchyConditionRow)
        row.answers.push({
          answerId: condition.answerId,
          isActive: condition.answerIsActive,
          isArchived: condition.answerIsArchived,
          text: condition.answerText,
        })
        rowByParentId.set(condition.parentQuestionId, row)
      }

      return {
        conditions: [...rowByParentId.values()],
        groupId: group.id,
        sortOrder: group.sortOrder,
      }
    })
}

function createSvgPath(points: Point[]): string {
  if (points.length === 0) return ''
  return points
    .map((point, index) => {
      const prefix = index === 0 ? 'M' : 'L'
      return `${prefix}${Math.round(point.x)} ${Math.round(point.y)}`
    })
    .join(' ')
}

export function buildRequirementSelectionHierarchyLayout(
  questions: RequirementSelectionHierarchyQuestion[],
  focusQuestionId: number,
): RequirementSelectionHierarchyLayout | null {
  const topology = createHierarchyTopology(questions)
  const componentQuestionIds = collectConnectedQuestionIds(
    topology,
    focusQuestionId,
  )
  if (componentQuestionIds.size === 0) return null

  const componentQuestions = [...componentQuestionIds]
    .map(questionId => topology.questionsById.get(questionId))
    .filter((question): question is RequirementSelectionHierarchyQuestion =>
      Boolean(question),
    )
    .sort(compareQuestions)
  const componentQuestionIdSet = new Set(
    componentQuestions.map(question => question.id),
  )
  const componentEdges = topology.edges
    .filter(
      edge =>
        componentQuestionIdSet.has(edge.sourceId) &&
        componentQuestionIdSet.has(edge.targetId),
    )
    .sort((left, right) => {
      const leftSource = topology.questionsById.get(left.sourceId)
      const rightSource = topology.questionsById.get(right.sourceId)
      if (leftSource && rightSource) {
        const sourceCompare = compareQuestions(leftSource, rightSource)
        if (sourceCompare !== 0) return sourceCompare
      }
      const leftTarget = topology.questionsById.get(left.targetId)
      const rightTarget = topology.questionsById.get(right.targetId)
      if (leftTarget && rightTarget) {
        return compareQuestions(leftTarget, rightTarget)
      }
      return left.sourceId - right.sourceId || left.targetId - right.targetId
    })

  const graph = new graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>({
    directed: true,
    multigraph: false,
  })
  graph.setGraph({
    marginx: 24,
    marginy: 24,
    nodesep: 56,
    rankdir: 'TB',
    ranksep: 96,
  })
  graph.setDefaultEdgeLabel(() => ({}))

  for (const question of componentQuestions) {
    graph.setNode(String(question.id), {
      height: REQUIREMENT_SELECTION_HIERARCHY_NODE_HEIGHT,
      width: REQUIREMENT_SELECTION_HIERARCHY_NODE_WIDTH,
    })
  }
  for (const edge of componentEdges) {
    graph.setEdge(String(edge.sourceId), String(edge.targetId), { weight: 1 })
  }

  dagreLayout(graph)

  const nodes = componentQuestions
    .map(question => {
      const layoutNode = graph.node(String(question.id)) as
        | NodeLabel
        | undefined
      const width =
        layoutNode?.width ?? REQUIREMENT_SELECTION_HIERARCHY_NODE_WIDTH
      const height =
        layoutNode?.height ?? REQUIREMENT_SELECTION_HIERARCHY_NODE_HEIGHT
      return {
        conditionGroups: createConditionGroups(
          question,
          topology.questionsById,
        ),
        height,
        id: question.id,
        isFocus: question.id === focusQuestionId,
        question,
        width,
        x: Math.round((layoutNode?.x ?? 0) - width / 2),
        y: Math.round((layoutNode?.y ?? 0) - height / 2),
      } satisfies RequirementSelectionHierarchyNode
    })
    .sort((left, right) => left.y - right.y || left.x - right.x)

  const edges = componentEdges.map(edge => {
    const layoutEdge = graph.edge(
      String(edge.sourceId),
      String(edge.targetId),
    ) as EdgeLabel | undefined
    const points = (layoutEdge?.points ?? []).map(point => ({
      x: Math.round(point.x),
      y: Math.round(point.y),
    }))
    return {
      id: `${edge.sourceId}->${edge.targetId}`,
      points,
      sourceId: edge.sourceId,
      svgPath: createSvgPath(points),
      targetId: edge.targetId,
    } satisfies RequirementSelectionHierarchyEdge
  })

  const graphLabel = graph.graph()
  const widthFromNodes = Math.max(
    0,
    ...nodes.map(node => node.x + node.width + 24),
    ...edges.flatMap(edge => edge.points.map(point => point.x + 24)),
  )
  const heightFromNodes = Math.max(
    0,
    ...nodes.map(node => node.y + node.height + 24),
    ...edges.flatMap(edge => edge.points.map(point => point.y + 24)),
  )

  return {
    edges,
    focusQuestionId,
    height: Math.ceil(Math.max(graphLabel.height ?? 0, heightFromNodes)),
    nodeCount: nodes.length,
    nodes,
    width: Math.ceil(Math.max(graphLabel.width ?? 0, widthFromNodes)),
  }
}
