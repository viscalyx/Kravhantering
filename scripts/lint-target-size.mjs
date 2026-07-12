#!/usr/bin/env node

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const DEFAULT_ROOTS = ['app', 'components']
const DEFAULT_BASELINE_PATH = 'scripts/target-size-policy-baseline.json'
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
const TARGET_TAGS = new Set(['a', 'button', 'Link', 'summary'])
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
    bindings.has(node.text) &&
    !seen.has(node.text)
  ) {
    const nextSeen = new Set(seen)
    nextSeen.add(node.text)
    return getStaticExpressionFragments(
      bindings.get(node.text),
      bindings,
      sourceFile,
      nextSeen,
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
    bindings.has(node.text) &&
    !seen.has(node.text)
  ) {
    const nextSeen = new Set(seen)
    nextSeen.add(node.text)
    return isStaticClassExpression(bindings.get(node.text), bindings, nextSeen)
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
  return !isStaticClassExpression(attribute.initializer.expression, bindings)
}

function buildBindings(sourceFile) {
  const bindings = new Map()

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      bindings.set(node.name.text, node.initializer)
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

function findCompactSizeTokens(classFragments) {
  const sizes = classFragments
    .flatMap(fragment => fragment.split(/\s+/u))
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

function isTargetNode(node, sourceFile) {
  const tagName = getTagName(node, sourceFile)
  if (TARGET_TAGS.has(tagName)) return true

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

  if (hasUnresolvedClassExpression(node, bindings)) return null

  const targetClasses = getClassFragments(node, bindings, sourceFile)
  const hasDeclaredHitArea = targetClasses.some(fragment =>
    /(?:^|\s)(?:[a-z]+:)*(?:min-h|min-w|h|w|size)-/u.test(fragment),
  )
  const hasPadding = targetClasses.some(fragment =>
    /(?:^|\s)(?:[a-z]+:)*p[xy]?-/u.test(fragment),
  )
  if (hasDeclaredHitArea || hasPadding) return null

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

function findNearbyAnnotation(source, targetStart) {
  const before = source.slice(Math.max(0, targetStart - 700), targetStart)
  const markerIndex = before.lastIndexOf(ANNOTATION_PREFIX)
  if (markerIndex < 0) return null

  const annotationSource = before.slice(markerIndex)
  if (annotationSource.split('\n').length > 6) return null

  const header = annotationSource.match(
    /^WCAG 2\.5\.8 target-size exception:\s*([a-z-]+)\s*(?:—|-)\s*/u,
  )
  if (!header) return { error: 'malformed target-size exception annotation' }

  const exception = header[1]
  const evidence = normalizeWhitespace(
    annotationSource
      .slice(header[0].length)
      .split('*/', 1)[0]
      .replace(/^\s*\*\s?/gmu, ''),
  )
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
      const compactTokens = findCompactSizeTokens(
        getClassFragments(node, bindings, sourceFile),
      )
      const iconToken =
        compactTokens.length === 0
          ? findIconOnlyCompactToken(node, bindings, sourceFile)
          : null

      if (compactTokens.length > 0 || iconToken) {
        const start = node.getStart(sourceFile)
        const annotation = findNearbyAnnotation(source, start)
        const position = getLineAndColumn(sourceFile, start)
        const tagName = getTagName(node, sourceFile)
        const identity = getIdentity(node, sourceFile)

        if (!annotation || annotation.error) {
          diagnostics.push({
            ...position,
            detail:
              annotation?.error ??
              'missing WCAG 2.5.8 target-size exception annotation',
            filePath,
            fingerprint: `${filePath}|${tagName}|${identity}`,
            identity,
            tagName,
            tokens: compactTokens.length > 0 ? compactTokens : [iconToken],
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

export function applyBaseline(diagnostics, baseline) {
  const entries = baseline?.entries ?? []
  const baselineErrors = []
  const fingerprints = new Set()

  for (const entry of entries) {
    if (!entry?.fingerprint || fingerprints.has(entry.fingerprint)) {
      baselineErrors.push('baseline entries need unique non-empty fingerprints')
      continue
    }
    fingerprints.add(entry.fingerprint)
    if (
      !/^https:\/\/github\.com\/viscalyx\/Kravhantering\/issues\/\d+$/u.test(
        entry.issue ?? '',
      )
    ) {
      baselineErrors.push(
        `${entry.fingerprint}: baseline entry needs an issue URL`,
      )
    }
  }

  const diagnosticFingerprints = new Set(
    diagnostics.map(diagnostic => diagnostic.fingerprint),
  )
  for (const fingerprint of fingerprints) {
    if (!diagnosticFingerprints.has(fingerprint)) {
      baselineErrors.push(`${fingerprint}: stale baseline entry`)
    }
  }

  return {
    activeBaseline: diagnostics.filter(diagnostic =>
      fingerprints.has(diagnostic.fingerprint),
    ),
    baselineErrors,
    diagnostics: diagnostics.filter(
      diagnostic => !fingerprints.has(diagnostic.fingerprint),
    ),
  }
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

  if (result.baselineErrors.length > 0) {
    lines.push('Target-size policy baseline errors:')
    lines.push(...result.baselineErrors.map(error => `- ${error}`))
  }

  if (result.activeBaseline.length > 0) {
    const baselineUnit =
      result.activeBaseline.length === 1 ? 'entry' : 'entries'
    lines.push(
      `Target-size policy lint: ${result.activeBaseline.length} temporary issue-linked baseline ${baselineUnit} active.`,
    )
  }

  return `${lines.join('\n')}\n`
}

export async function runTargetSizeLint({
  baselinePath = DEFAULT_BASELINE_PATH,
  cwd = process.cwd(),
  roots = DEFAULT_ROOTS,
} = {}) {
  const baseline = JSON.parse(
    await fs.readFile(path.join(cwd, baselinePath), 'utf8'),
  )
  const files = await discoverFiles({ cwd, roots })
  const diagnostics = []

  for (const filePath of files) {
    const source = await fs.readFile(path.join(cwd, filePath), 'utf8')
    diagnostics.push(...inspectSource(source, filePath))
  }

  return applyBaseline(diagnostics, baseline)
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

  const failed =
    result.diagnostics.length > 0 || result.baselineErrors.length > 0
  if (failed) processObj.stderr.write(formatResults(result))
  else {
    const baselineMessage =
      result.activeBaseline.length > 0
        ? ` ${result.activeBaseline.length} temporary issue-linked baseline entries remain.`
        : ''
    processObj.stdout.write(
      `Target-size policy lint: no new issues found.${baselineMessage}\n`,
    )
  }
  processObj.exit(failed ? 1 : 0)
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) await main()
