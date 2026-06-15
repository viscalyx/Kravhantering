#!/usr/bin/env node

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
// Tailwind exposes this loader as unstable in @tailwindcss/node (^4.3.1).
// Recheck this script and its tests when upgrading Tailwind packages.
import { __unstable__loadDesignSystem } from '@tailwindcss/node'
import ts from 'typescript'

const DEFAULT_ROOTS = ['app', 'components', 'lib']
const DEFAULT_CLASS_FUNCTIONS = ['cn', 'clsx', 'classNames', 'tw']
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css'])
const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.open-next',
  '.wrangler',
  'coverage',
  'node_modules',
  'test-results',
])

function isExcludedDirectoryName(name) {
  return EXCLUDED_DIRECTORIES.has(name) || name.startsWith('playwright-report')
}

function isSourceFilePath(filePath) {
  return SOURCE_EXTENSIONS.has(path.extname(filePath))
}

function createLineStarts(text) {
  const lineStarts = [0]
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') {
      lineStarts.push(index + 1)
    }
  }
  return lineStarts
}

function getPosition(lineStarts, offset) {
  let low = 0
  let high = lineStarts.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const lineStart = lineStarts[mid]
    const nextLineStart = lineStarts[mid + 1] ?? Number.POSITIVE_INFINITY

    if (offset < lineStart) {
      high = mid - 1
    } else if (offset >= nextLineStart) {
      low = mid + 1
    } else {
      return {
        column: offset - lineStart + 1,
        line: mid + 1,
      }
    }
  }

  return { column: 1, line: 1 }
}

function isClassSurfaceName(name) {
  return /class(?:name|names|es)?$/iu.test(name)
}

function getNodeNameText(name) {
  if (!name) return null
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text
  if (ts.isNumericLiteral(name)) return name.text
  return null
}

function getExpressionName(node) {
  if (ts.isIdentifier(node)) return node.text
  if (ts.isPropertyAccessExpression(node)) return node.name.text
  return null
}

function isClassFunctionExpression(node, classFunctions) {
  const name = getExpressionName(node)
  return name !== null && classFunctions.has(name)
}

function getLiteralSegment(node, sourceFile) {
  const rawText = node.getText(sourceFile)
  const literalTextIndex = rawText.indexOf(node.text)
  const textStart =
    node.getStart(sourceFile) + (literalTextIndex >= 0 ? literalTextIndex : 1)

  return {
    start: textStart,
    text: node.text,
  }
}

function collectReturnExpressionSegments(node, sourceFile, options) {
  const segments = []

  function visit(child) {
    if (ts.isReturnStatement(child) && child.expression) {
      segments.push(
        ...collectStaticExpressionSegments(
          child.expression,
          sourceFile,
          options,
        ),
      )
      return
    }

    ts.forEachChild(child, visit)
  }

  if (node.body) {
    if (ts.isBlock(node.body)) {
      visit(node.body)
    } else {
      segments.push(
        ...collectStaticExpressionSegments(node.body, sourceFile, options),
      )
    }
  }

  return segments
}

function collectStaticExpressionSegments(node, sourceFile, options) {
  const segments = []

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return [getLiteralSegment(node, sourceFile)]
  }

  if (ts.isTemplateExpression(node)) {
    segments.push(getLiteralSegment(node.head, sourceFile))
    for (const span of node.templateSpans) {
      segments.push(getLiteralSegment(span.literal, sourceFile))
    }
    return segments
  }

  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return collectStaticExpressionSegments(node.expression, sourceFile, options)
  }

  if (ts.isConditionalExpression(node)) {
    segments.push(
      ...collectStaticExpressionSegments(node.whenTrue, sourceFile, options),
      ...collectStaticExpressionSegments(node.whenFalse, sourceFile, options),
    )
    return segments
  }

  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    segments.push(
      ...collectStaticExpressionSegments(node.left, sourceFile, options),
      ...collectStaticExpressionSegments(node.right, sourceFile, options),
    )
    return segments
  }

  if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) {
      segments.push(
        ...collectStaticExpressionSegments(element, sourceFile, options),
      )
    }
    return segments
  }

  if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property)) {
        if (
          ts.isStringLiteral(property.name) ||
          ts.isNoSubstitutionTemplateLiteral(property.name)
        ) {
          segments.push(getLiteralSegment(property.name, sourceFile))
        }
        segments.push(
          ...collectStaticExpressionSegments(
            property.initializer,
            sourceFile,
            options,
          ),
        )
      } else if (ts.isSpreadAssignment(property)) {
        segments.push(
          ...collectStaticExpressionSegments(
            property.expression,
            sourceFile,
            options,
          ),
        )
      }
    }
    return segments
  }

  if (
    ts.isCallExpression(node) &&
    isClassFunctionExpression(node.expression, options.classFunctions)
  ) {
    for (const argument of node.arguments) {
      segments.push(
        ...collectStaticExpressionSegments(argument, sourceFile, options),
      )
    }
    return segments
  }

  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    node.body &&
    !ts.isBlock(node.body)
  ) {
    return collectStaticExpressionSegments(node.body, sourceFile, options)
  }

  return segments
}

function collectJsxAttributeSegments(node, sourceFile, options) {
  if (!node.initializer) return []

  if (ts.isStringLiteral(node.initializer)) {
    return [getLiteralSegment(node.initializer, sourceFile)]
  }

  if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
    return collectStaticExpressionSegments(
      node.initializer.expression,
      sourceFile,
      options,
    )
  }

  return []
}

function collectClassSurfaceSegments(node, sourceFile, options) {
  if (ts.isVariableDeclaration(node)) {
    const name = ts.isIdentifier(node.name) ? node.name.text : null
    if (!name || !isClassSurfaceName(name) || !node.initializer) return []

    if (
      ts.isArrowFunction(node.initializer) ||
      ts.isFunctionExpression(node.initializer)
    ) {
      return collectReturnExpressionSegments(
        node.initializer,
        sourceFile,
        options,
      )
    }

    return collectStaticExpressionSegments(
      node.initializer,
      sourceFile,
      options,
    )
  }

  if (ts.isPropertyAssignment(node)) {
    const name = getNodeNameText(node.name)
    if (!name || !isClassSurfaceName(name)) return []
    return collectStaticExpressionSegments(
      node.initializer,
      sourceFile,
      options,
    )
  }

  if (ts.isPropertyDeclaration(node) && node.initializer) {
    const name = getNodeNameText(node.name)
    if (!name || !isClassSurfaceName(name)) return []
    return collectStaticExpressionSegments(
      node.initializer,
      sourceFile,
      options,
    )
  }

  if (ts.isFunctionDeclaration(node)) {
    const name = node.name?.text
    if (!name || !isClassSurfaceName(name)) return []
    return collectReturnExpressionSegments(node, sourceFile, options)
  }

  if (ts.isMethodDeclaration(node)) {
    const name = getNodeNameText(node.name)
    if (!name || !isClassSurfaceName(name)) return []
    return collectReturnExpressionSegments(node, sourceFile, options)
  }

  return []
}

function getScriptKind(filePath) {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX
  if (filePath.endsWith('.js')) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

function dedupeClassLists(classLists) {
  const seen = new Set()
  const deduped = []

  for (const classList of classLists) {
    const key = `${classList.filePath}:${classList.start}:${classList.text}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(classList)
  }

  return deduped
}

export function extractClassListsFromScript(
  sourceText,
  filePath,
  options = {},
) {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath),
  )
  const classFunctions = new Set(
    options.classFunctions ?? DEFAULT_CLASS_FUNCTIONS,
  )
  const extractionOptions = { classFunctions }
  const classLists = []

  function addSegments(segments) {
    for (const segment of segments) {
      if (segment.text.trim() === '') continue
      classLists.push({
        filePath,
        start: segment.start,
        text: segment.text,
      })
    }
  }

  function visit(node) {
    if (
      ts.isJsxAttribute(node) &&
      (node.name.text === 'className' || node.name.text === 'class')
    ) {
      addSegments(
        collectJsxAttributeSegments(node, sourceFile, extractionOptions),
      )
    }

    if (
      ts.isCallExpression(node) &&
      isClassFunctionExpression(node.expression, classFunctions)
    ) {
      for (const argument of node.arguments) {
        addSegments(
          collectStaticExpressionSegments(
            argument,
            sourceFile,
            extractionOptions,
          ),
        )
      }
    }

    if (
      ts.isTaggedTemplateExpression(node) &&
      isClassFunctionExpression(node.tag, classFunctions)
    ) {
      addSegments(
        collectStaticExpressionSegments(
          node.template,
          sourceFile,
          extractionOptions,
        ),
      )
    }

    addSegments(
      collectClassSurfaceSegments(node, sourceFile, extractionOptions),
    )

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return dedupeClassLists(classLists)
}

export function extractClassListsFromCss(sourceText, filePath) {
  const classLists = []
  const applyPattern = /@apply\s+([^;{}]+?)\s*(?:!important)?\s*;/giu

  for (const match of sourceText.matchAll(applyPattern)) {
    const classList = match[1].trim()
    if (!classList) continue
    const leadingWhitespace = match[1].match(/^\s*/u)?.[0].length ?? 0
    classLists.push({
      filePath,
      start: match.index + match[0].indexOf(match[1]) + leadingWhitespace,
      text: classList,
    })
  }

  return classLists
}

export function extractClassLists(sourceText, filePath, options = {}) {
  if (path.extname(filePath) === '.css') {
    return extractClassListsFromCss(sourceText, filePath)
  }

  return extractClassListsFromScript(sourceText, filePath, options)
}

export function findCanonicalClassDiagnostics(
  sourceText,
  classLists,
  canonicalize,
) {
  const diagnostics = []
  const lineStarts = createLineStarts(sourceText)
  const seen = new Set()

  for (const classList of classLists) {
    for (const match of classList.text.matchAll(/\S+/gu)) {
      const current = match[0]
      let replacement

      try {
        replacement = canonicalize(current)
      } catch {
        continue
      }

      if (!replacement || replacement === current) continue

      const start = classList.start + match.index
      const position = getPosition(lineStarts, start)
      const key = `${classList.filePath}:${start}:${current}:${replacement}`
      if (seen.has(key)) continue
      seen.add(key)
      diagnostics.push({
        column: position.column,
        current,
        filePath: classList.filePath,
        line: position.line,
        replacement,
      })
    }
  }

  return diagnostics
}

export function formatDiagnostics(diagnostics) {
  if (diagnostics.length === 0) {
    return 'Tailwind canonical class lint: no issues found.\n'
  }

  const plural = diagnostics.length === 1 ? 'issue' : 'issues'
  const lines = [
    `Tailwind canonical class lint found ${diagnostics.length} ${plural}:`,
    ...diagnostics.map(
      diagnostic =>
        `${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column} ${diagnostic.current} -> ${diagnostic.replacement}`,
    ),
  ]

  return `${lines.join('\n')}\n`
}

export async function discoverFiles(options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const roots = options.roots ?? DEFAULT_ROOTS
  const fsImpl = options.fsImpl ?? fs
  const files = []

  async function walk(entryPath) {
    let entries

    try {
      entries = await fsImpl.readdir(entryPath, { withFileTypes: true })
    } catch (error) {
      if (error?.code === 'ENOENT') return
      throw error
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (isExcludedDirectoryName(entry.name)) continue
        await walk(path.join(entryPath, entry.name))
        continue
      }

      const filePath = path.join(entryPath, entry.name)
      if (entry.isFile() && isSourceFilePath(filePath)) {
        files.push(path.relative(cwd, filePath).split(path.sep).join('/'))
      }
    }
  }

  for (const root of roots) {
    await walk(path.resolve(cwd, root))
  }

  return files.sort()
}

export async function runTailwindLint(options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const roots = options.roots ?? DEFAULT_ROOTS
  const entrypoint = options.entrypoint ?? 'app/globals.css'
  const loadDesignSystem =
    options.loadDesignSystem ?? __unstable__loadDesignSystem
  const classFunctions = options.classFunctions ?? DEFAULT_CLASS_FUNCTIONS
  const entrypointPath = path.resolve(cwd, entrypoint)
  const css = await fsImpl.readFile(entrypointPath, 'utf8')
  const designSystem = await loadDesignSystem(css, {
    base: path.dirname(entrypointPath),
  })
  const files =
    options.files ??
    (await discoverFiles({
      cwd,
      fsImpl,
      roots,
    }))
  const diagnostics = []
  const canonicalize = className =>
    designSystem.canonicalizeCandidates([className], { rem: 16 })[0]

  for (const filePath of files) {
    const absolutePath = path.resolve(cwd, filePath)
    const sourceText = await fsImpl.readFile(absolutePath, 'utf8')
    const classLists = extractClassLists(sourceText, filePath, {
      classFunctions,
    })
    diagnostics.push(
      ...findCanonicalClassDiagnostics(sourceText, classLists, canonicalize),
    )
  }

  return diagnostics
}

export async function main(
  args = process.argv.slice(2),
  impl = {
    consoleObj: console,
    processObj: process,
    runTailwindLint,
  },
) {
  const roots = args.length > 0 ? args : DEFAULT_ROOTS
  const { consoleObj, processObj } = impl
  let diagnostics

  try {
    diagnostics = await impl.runTailwindLint({ roots })
  } catch (error) {
    consoleObj.error(`Tailwind canonical class lint failed: ${error.message}`)
    processObj.exit(1)
    return
  }

  const output = formatDiagnostics(diagnostics)

  if (diagnostics.length === 0) {
    processObj.stdout.write(output)
    processObj.exit(0)
    return
  }

  processObj.stderr.write(output)
  processObj.exit(1)
}

/* c8 ignore next 3 */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
