#!/usr/bin/env node

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const DEFAULT_ROOTS = ['app', 'components']
const SOURCE_EXTENSIONS = new Set(['.jsx', '.tsx'])
const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.open-next',
  '.wrangler',
  'coverage',
  'node_modules',
  'test-results',
])
const TARGET_TAGS = new Set([
  'a',
  'button',
  'input',
  'Link',
  'select',
  'summary',
  'textarea',
])
const TARGET_ROLES = new Set([
  'button',
  'checkbox',
  'link',
  'menuitem',
  'option',
  'radio',
  'switch',
  'tab',
  'treeitem',
])
const ALLOWED_EXCEPTIONS = new Set([
  'essential',
  'equivalent',
  'inline',
  'spacing',
  'user-agent',
])
const ANNOTATION_PREFIX = 'WCAG 2.5.8 target-size exception:'
const IDENTITY_ATTRIBUTES = ['aria-label', 'data-testid', 'id', 'name', 'title']
const CLASS_COMPOSITION_FUNCTIONS = new Set([
  'classNames',
  'clsx',
  'cn',
  'twMerge',
])

function isExcludedDirectoryName(name) {
  return EXCLUDED_DIRECTORIES.has(name) || name.startsWith('playwright-report')
}

function isSourceFilePath(filePath) {
  return SOURCE_EXTENSIONS.has(path.extname(filePath))
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/gu, ' ').trim()
}

function getTagName(node, sourceFile) {
  return node.tagName.getText(sourceFile)
}

function getAttribute(node, name) {
  return node.attributes.properties.find(
    property => ts.isJsxAttribute(property) && property.name.getText() === name,
  )
}

function getAttributeSource(node, sourceFile) {
  if (!node?.initializer) return null
  return normalizeWhitespace(node.initializer.getText(sourceFile))
}

function getStaticExpressionFragments(
  node,
  bindings,
  sourceFile,
  seen = new Set(),
) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return [node.text]
  }

  if (ts.isTemplateExpression(node)) {
    const fragments = [node.head.text]
    for (const span of node.templateSpans) {
      fragments.push(
        ...getStaticExpressionFragments(
          span.expression,
          bindings,
          sourceFile,
          seen,
        ),
        span.literal.text,
      )
    }
    return fragments
  }

  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return getStaticExpressionFragments(
      node.expression,
      bindings,
      sourceFile,
      seen,
    )
  }

  if (ts.isConditionalExpression(node)) {
    return [
      ...getStaticExpressionFragments(
        node.whenTrue,
        bindings,
        sourceFile,
        seen,
      ),
      ...getStaticExpressionFragments(
        node.whenFalse,
        bindings,
        sourceFile,
        seen,
      ),
    ]
  }

  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = getStaticExpressionFragments(
      node.left,
      bindings,
      sourceFile,
      seen,
    )
    const right = getStaticExpressionFragments(
      node.right,
      bindings,
      sourceFile,
      seen,
    )
    if (left.length === 1 && right.length === 1) {
      return [`${left[0]}${right[0]}`]
    }
    return [...left, ...right]
  }

  if (
    ts.isIdentifier(node) &&
    getBinding(node, bindings) &&
    !seen.has(getBinding(node, bindings))
  ) {
    const binding = getBinding(node, bindings)
    const nextSeen = new Set(seen)
    nextSeen.add(binding)
    return getStaticExpressionFragments(binding, bindings, sourceFile, nextSeen)
  }

  if (ts.isCallExpression(node) && isClassCompositionCall(node)) {
    return node.arguments.flatMap(argument =>
      getStaticExpressionFragments(argument, bindings, sourceFile, seen),
    )
  }

  return []
}

function getClassFragments(node, bindings, sourceFile) {
  const attribute = getAttribute(node, 'className')
  if (!attribute?.initializer) return []

  if (ts.isStringLiteral(attribute.initializer)) {
    return [attribute.initializer.text]
  }

  if (
    ts.isJsxExpression(attribute.initializer) &&
    attribute.initializer.expression
  ) {
    return getStaticExpressionFragments(
      attribute.initializer.expression,
      bindings,
      sourceFile,
    )
  }

  return []
}

function isStaticClassExpression(node, bindings, seen = new Set()) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return true
  }
  if (ts.isTemplateExpression(node)) {
    return node.templateSpans.every(span =>
      isStaticClassExpression(span.expression, bindings, seen),
    )
  }
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return isStaticClassExpression(node.expression, bindings, seen)
  }
  if (ts.isConditionalExpression(node)) {
    return (
      isStaticClassExpression(node.whenTrue, bindings, seen) &&
      isStaticClassExpression(node.whenFalse, bindings, seen)
    )
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    return (
      isStaticClassExpression(node.left, bindings, seen) &&
      isStaticClassExpression(node.right, bindings, seen)
    )
  }
  if (
    ts.isIdentifier(node) &&
    getBinding(node, bindings) &&
    !seen.has(getBinding(node, bindings))
  ) {
    const binding = getBinding(node, bindings)
    const nextSeen = new Set(seen)
    nextSeen.add(binding)
    return isStaticClassExpression(binding, bindings, nextSeen)
  }
  if (ts.isCallExpression(node) && isClassCompositionCall(node)) {
    return node.arguments.every(argument =>
      isStaticClassExpression(argument, bindings, seen),
    )
  }
  return false
}

function hasUnresolvedClassExpression(node, bindings) {
  const attribute = getAttribute(node, 'className')
  if (!attribute?.initializer || ts.isStringLiteral(attribute.initializer)) {
    return false
  }
  if (!ts.isJsxExpression(attribute.initializer)) return true
  if (!attribute.initializer.expression) return false
  return (
    ts.isCallExpression(attribute.initializer.expression) &&
    isClassCompositionCall(attribute.initializer.expression) &&
    !isStaticClassExpression(attribute.initializer.expression, bindings)
  )
}

function hasUnknownClassExpression(node, bindings) {
  const attribute = getAttribute(node, 'className')
  if (!attribute?.initializer || ts.isStringLiteral(attribute.initializer)) {
    return false
  }
  if (!ts.isJsxExpression(attribute.initializer)) return true
  if (!attribute.initializer.expression) return false
  return !isStaticClassExpression(attribute.initializer.expression, bindings)
}

function isClassCompositionCall(node) {
  return (
    ts.isIdentifier(node.expression) &&
    CLASS_COMPOSITION_FUNCTIONS.has(node.expression.text)
  )
}

function isLexicalScope(node) {
  return (
    ts.isBlock(node) ||
    ts.isCaseBlock(node) ||
    ts.isCatchClause(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isFunctionLike(node) ||
    ts.isModuleBlock(node) ||
    ts.isSourceFile(node)
  )
}

function getDeclarationScope(declaration, sourceFile) {
  const declarationList = declaration.parent
  const isBlockScoped =
    ts.isVariableDeclarationList(declarationList) &&
    Boolean(declarationList.flags & ts.NodeFlags.BlockScoped)
  let current = declaration.parent

  while (current) {
    if (
      isBlockScoped
        ? isLexicalScope(current)
        : ts.isFunctionLike(current) || ts.isSourceFile(current)
    ) {
      return current
    }
    current = current.parent
  }

  return sourceFile
}

function getBinding(identifier, bindings) {
  let current = identifier
  while (current) {
    const scopeBindings = bindings.get(current)
    const binding = scopeBindings?.get(identifier.text)
    if (binding) return binding
    current = current.parent
  }
  return undefined
}

function buildBindings(sourceFile) {
  const bindings = new Map()

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      const scope = getDeclarationScope(node, sourceFile)
      const scopeBindings = bindings.get(scope) ?? new Map()
      scopeBindings.set(node.name.text, node.initializer)
      bindings.set(scope, scopeBindings)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return bindings
}

function parseTailwindPixels(value) {
  if (value === 'px') return 1

  if (/^\d+(?:\.5)?$/u.test(value)) {
    return Number(value) * 4
  }

  const arbitrary = value.match(/^\[(\d+(?:\.\d+)?)(px|rem)\]$/u)
  if (!arbitrary) return null
  const amount = Number(arbitrary[1])
  return arbitrary[2] === 'rem' ? amount * 16 : amount
}

function parseSizeToken(token) {
  const segments = token.split(':')
  const utility = segments.pop()?.replace(/^!/u, '') ?? ''
  const variant = segments.join(':')
  const match = utility.match(/^(min-)?(h|w|size)-(.+)$/u)
  if (!match) return null

  const pixels = parseTailwindPixels(match[3])
  if (pixels === null) return null

  return {
    axes: match[2] === 'size' ? ['h', 'w'] : [match[2]],
    minimum: Boolean(match[1]),
    pixels,
    token,
    variant,
  }
}

function parsePaddingToken(token) {
  const segments = token.split(':')
  const utility = segments.pop()?.replace(/^!/u, '') ?? ''
  const variant = segments.join(':')
  const match = utility.match(/^p([xy]?)-(.+)$/u)
  if (!match) return null

  const pixels = parseTailwindPixels(match[2])
  if (pixels === null) return null

  return {
    axes: match[1] === 'x' ? ['w'] : match[1] === 'y' ? ['h'] : ['h', 'w'],
    pixels,
    token,
    variant,
  }
}

function getClassTokens(classFragments) {
  return classFragments.flatMap(fragment => fragment.split(/\s+/u))
}

function findCompactSizeTokens(classFragments) {
  const sizes = getClassTokens(classFragments)
    .map(parseSizeToken)
    .filter(Boolean)
  const compact = []

  for (const size of sizes) {
    if (size.minimum || size.pixels >= 24) continue

    const protectedByMinimum = size.axes.every(axis =>
      sizes.some(
        candidate =>
          candidate.minimum &&
          candidate.pixels >= 24 &&
          candidate.axes.includes(axis) &&
          (candidate.variant === '' || candidate.variant === size.variant),
      ),
    )

    if (!protectedByMinimum) compact.push(size.token)
  }

  return [...new Set(compact)]
}

function getBaseAxisSize(classFragments, axis) {
  const sizes = getClassTokens(classFragments)
    .map(parseSizeToken)
    .filter(size => size && size.variant === '' && size.axes.includes(axis))
  if (sizes.length === 0) return null
  return Math.max(...sizes.map(size => size.pixels))
}

function getBaseAxisPadding(classFragments, axis) {
  const padding = getClassTokens(classFragments)
    .map(parsePaddingToken)
    .filter(pad => pad && pad.variant === '')
  const axisSpecific = padding.filter(
    pad => pad.axes.length === 1 && pad.axes.includes(axis),
  )
  const general = padding.filter(pad => pad.axes.length === 2)
  const applicable = axisSpecific.length > 0 ? axisSpecific : general
  return applicable.length === 0
    ? 0
    : Math.min(...applicable.map(pad => pad.pixels))
}

function hasProvenIconHitArea(node, child, bindings, sourceFile) {
  const targetClasses = getClassFragments(node, bindings, sourceFile)
  const iconClasses = getClassFragments(child, bindings, sourceFile)

  return ['h', 'w'].every(axis => {
    const declaredSize = getBaseAxisSize(targetClasses, axis)
    if (declaredSize !== null && declaredSize >= 24) return true

    const iconSize = getBaseAxisSize(iconClasses, axis)
    const padding = getBaseAxisPadding(targetClasses, axis)
    return iconSize !== null && iconSize + padding * 2 >= 24
  })
}

function isTargetNode(node, sourceFile) {
  const tagName = getTagName(node, sourceFile)
  if (TARGET_TAGS.has(tagName)) {
    if (tagName !== 'input') return true
    const type = getAttributeSource(getAttribute(node, 'type'), sourceFile)
    return type?.replace(/^['"]|['"]$/gu, '').toLowerCase() !== 'hidden'
  }

  const role = getAttribute(node, 'role')
  const roleValue = getAttributeSource(role, sourceFile)?.replace(
    /^['"]|['"]$/gu,
    '',
  )
  return roleValue !== null && TARGET_ROLES.has(roleValue)
}

function findIconOnlyCompactToken(node, bindings, sourceFile) {
  if (!ts.isJsxElement(node.parent)) return null
  const element = node.parent
  const meaningfulChildren = element.children.filter(child => {
    if (ts.isJsxText(child)) return child.text.trim().length > 0
    if (ts.isJsxExpression(child)) return Boolean(child.expression)
    return true
  })

  if (meaningfulChildren.length !== 1) return null
  const child = meaningfulChildren[0]
  if (!ts.isJsxSelfClosingElement(child)) return null

  const childTag = getTagName(child, sourceFile)
  if (!/^\p{Lu}/u.test(childTag)) return null

  if (hasUnknownClassExpression(node, bindings)) return null

  if (hasProvenIconHitArea(node, child, bindings, sourceFile)) return null

  const compactIconTokens = findCompactSizeTokens(
    getClassFragments(child, bindings, sourceFile),
  )
  return compactIconTokens[0] ?? null
}

function getIdentity(node, sourceFile) {
  for (const name of IDENTITY_ATTRIBUTES) {
    const attribute = getAttribute(node, name)
    const value = getAttributeSource(attribute, sourceFile)
    if (value) return `${name}=${value}`
  }
  return 'unlabelled'
}

function getLineAndColumn(sourceFile, offset) {
  const position = sourceFile.getLineAndCharacterOfPosition(offset)
  return { column: position.character + 1, line: position.line + 1 }
}

function getAssociatedComment(node, sourceFile) {
  const source = sourceFile.text
  const targetStart = node.getStart(sourceFile)
  const targetElement = ts.isJsxOpeningElement(node) ? node.parent : node

  if (
    (ts.isJsxElement(targetElement) ||
      ts.isJsxSelfClosingElement(targetElement)) &&
    (ts.isJsxElement(targetElement.parent) ||
      ts.isJsxFragment(targetElement.parent))
  ) {
    const siblings = targetElement.parent.children
    let index = siblings.indexOf(targetElement) - 1
    while (index >= 0) {
      const sibling = siblings[index]
      if (ts.isJsxText(sibling) && sibling.text.trim() === '') {
        index -= 1
        continue
      }
      if (!ts.isJsxExpression(sibling) || sibling.expression) return null
      const commentSource = sibling.getText(sourceFile)
      const comment = commentSource.match(/\/\*[\s\S]*?\*\//u)
      if (!comment || comment.index === undefined) return null
      const start = sibling.getStart(sourceFile) + comment.index
      const end = start + comment[0].length
      return { end, source: comment[0] }
    }
  }

  const comments = ts.getLeadingCommentRanges(source, node.getFullStart()) ?? []
  const comment = comments.at(-1)
  if (!comment || source.slice(comment.end, targetStart).trim() !== '') {
    return null
  }
  return {
    end: comment.end,
    source: source.slice(comment.pos, comment.end),
  }
}

function hasTargetBetween(sourceFile, annotationEnd, targetStart) {
  let found = false

  function visit(node) {
    if (found) return
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.getStart(sourceFile) >= annotationEnd &&
      node.getStart(sourceFile) < targetStart &&
      isTargetNode(node, sourceFile)
    ) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return found
}

function findNearbyAnnotation(node, sourceFile) {
  const comment = getAssociatedComment(node, sourceFile)
  if (!comment) return null
  const targetStart = node.getStart(sourceFile)
  if (hasTargetBetween(sourceFile, comment.end, targetStart)) return null

  const annotationSource = comment.source
    .replace(/^\{?\s*\/\*\s*/u, '')
    .replace(/\s*\*\/\s*\}?$/u, '')
    .replace(/^\s*\*\s?/gmu, '')
    .trim()
  if (!annotationSource.startsWith(ANNOTATION_PREFIX)) return null

  const header = annotationSource.match(
    /^WCAG 2\.5\.8 target-size exception:\s*([a-z-]+)\s*(?:—|-)\s*/u,
  )
  if (!header) return { error: 'malformed target-size exception annotation' }

  const exception = header[1]
  const evidence = normalizeWhitespace(annotationSource.slice(header[0].length))
  if (!ALLOWED_EXCEPTIONS.has(exception)) {
    return { error: `unsupported target-size exception "${exception}"` }
  }
  if (evidence.length < 12 || evidence.includes('<')) {
    return { error: 'target-size exception annotation needs concrete evidence' }
  }

  return { evidence, exception }
}

export function inspectSource(source, filePath) {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TSX,
  )
  const bindings = buildBindings(sourceFile)
  const diagnostics = []

  function visit(node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      isTargetNode(node, sourceFile)
    ) {
      const start = node.getStart(sourceFile)
      const annotation = findNearbyAnnotation(node, sourceFile)
      const position = getLineAndColumn(sourceFile, start)
      const tagName = getTagName(node, sourceFile)
      const identity = getIdentity(node, sourceFile)
      const unresolvedClassExpression = hasUnresolvedClassExpression(
        node,
        bindings,
      )
      const compactTokens = findCompactSizeTokens(
        getClassFragments(node, bindings, sourceFile),
      )
      const iconToken =
        compactTokens.length === 0
          ? findIconOnlyCompactToken(node, bindings, sourceFile)
          : null

      if (unresolvedClassExpression || compactTokens.length > 0 || iconToken) {
        if (!annotation || annotation.error) {
          diagnostics.push({
            ...position,
            detail:
              annotation?.error ??
              (unresolvedClassExpression
                ? 'unresolved className needs a concrete target-size exception annotation'
                : 'missing WCAG 2.5.8 target-size exception annotation'),
            filePath,
            identity,
            tagName,
            tokens: unresolvedClassExpression
              ? ['className']
              : compactTokens.length > 0
                ? compactTokens
                : [iconToken],
          })
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return diagnostics
}

export async function discoverFiles({
  cwd = process.cwd(),
  roots = DEFAULT_ROOTS,
} = {}) {
  const files = []

  async function walk(relativePath) {
    const absolutePath = path.join(cwd, relativePath)
    let entries
    try {
      entries = await fs.readdir(absolutePath, { withFileTypes: true })
    } catch (error) {
      if (error?.code === 'ENOENT') return
      throw error
    }

    for (const entry of entries) {
      if (entry.isDirectory() && isExcludedDirectoryName(entry.name)) continue
      const childPath = path.join(relativePath, entry.name)
      if (entry.isDirectory()) await walk(childPath)
      else if (entry.isFile() && isSourceFilePath(childPath))
        files.push(childPath)
    }
  }

  for (const root of roots) await walk(root)
  return files.sort()
}

export function formatResults(result) {
  const lines = []

  if (result.diagnostics.length > 0) {
    lines.push(
      `Target-size policy lint found ${result.diagnostics.length} unapproved compact target${result.diagnostics.length === 1 ? '' : 's'}:`,
    )
    for (const diagnostic of result.diagnostics) {
      lines.push(
        `${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column} ${diagnostic.tokens.join(', ')} (${diagnostic.identity}): ${diagnostic.detail}`,
      )
    }
  }

  return `${lines.join('\n')}\n`
}

export async function runTargetSizeLint({
  cwd = process.cwd(),
  roots = DEFAULT_ROOTS,
} = {}) {
  const files = await discoverFiles({ cwd, roots })
  const diagnostics = []

  for (const filePath of files) {
    const source = await fs.readFile(path.join(cwd, filePath), 'utf8')
    diagnostics.push(...inspectSource(source, filePath))
  }

  return { diagnostics }
}

export async function main(
  _argv = process.argv.slice(2),
  { processObj = process, runLint = runTargetSizeLint } = {},
) {
  let result
  try {
    result = await runLint()
  } catch (error) {
    processObj.stderr.write(
      `Target-size policy lint failed: ${error instanceof Error ? error.message : String(error)}\n`,
    )
    processObj.exit(1)
    return
  }

  const failed = result.diagnostics.length > 0
  if (failed) processObj.stderr.write(formatResults(result))
  else
    processObj.stdout.write('Target-size policy lint: no new issues found.\n')
  processObj.exit(failed ? 1 : 0)
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) await main()
