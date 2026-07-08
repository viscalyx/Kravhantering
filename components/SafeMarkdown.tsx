'use client'

import { ImageIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import ReactMarkdown, { type Components } from 'react-markdown'

interface SafeMarkdownProps {
  children: string
  className?: string
}

const ALLOWED_MARKDOWN_ELEMENTS = [
  'a',
  'blockquote',
  'br',
  'code',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  'strong',
  'ul',
]

const HTML_BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'audio',
  'body',
  'button',
  'canvas',
  'div',
  'embed',
  'fieldset',
  'figure',
  'footer',
  'form',
  'frame',
  'frameset',
  'head',
  'header',
  'hr',
  'html',
  'iframe',
  'input',
  'label',
  'legend',
  'link',
  'main',
  'meta',
  'nav',
  'object',
  'option',
  'p',
  'picture',
  'script',
  'section',
  'select',
  'source',
  'style',
  'table',
  'tbody',
  'td',
  'template',
  'textarea',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
  'video',
])

function classNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ')
}

function firstHtmlBlockTag(value: string): string | null {
  const match = value
    .trimStart()
    .match(/^<\/?([A-Za-z][A-Za-z0-9:-]*)(?=[\s>/])/u)
  return match?.[1]?.toLowerCase() ?? null
}

function isHtmlBlock(lines: string[]) {
  const text = lines.join('\n').trim()
  if (!text) return false
  const tag = firstHtmlBlockTag(text)
  return tag ? HTML_BLOCK_TAGS.has(tag) : false
}

function boldSectionHeadingText(value: string): string | null {
  const match = value
    .trim()
    .match(/^(?:\*\*|__)([^*_][\s\S]{2,140}?)(?:\*\*|__):?$/u)
  const heading = match?.[1]?.trim().replace(/:$/u, '').trim()
  return heading ? heading : null
}

function inlineBoldSectionBreak(value: string) {
  const match = value.match(
    /^([\s\S]*[.!?][)"'”’]*)\s*(?:\*\*|__)([^*_\n][^*\n]{2,140}?)(?:\*\*|__):?\s*$/u,
  )
  const before = match?.[1]?.trimEnd()
  const heading = match?.[2]?.trim().replace(/:$/u, '').trim()
  return before && heading ? { before, heading } : null
}

function fenceFor(value: string) {
  const matches = value.match(/`+/gu) ?? []
  const longest = matches.reduce((max, item) => Math.max(max, item.length), 0)
  return '`'.repeat(Math.max(3, longest + 1))
}

function displayUrl(value: string) {
  try {
    return decodeURI(value)
  } catch {
    return value
  }
}

export function prepareSafeMarkdown(markdown: string): string {
  const lines = markdown.split(/\r?\n/u)
  const output: string[] = []
  let paragraph: string[] = []
  let fenced = false

  const pushParagraph = (linesToPush: string[]) => {
    if (linesToPush.length === 0) return
    output.push(...linesToPush)
  }

  const pushPreparedParagraph = (linesToPrepare: string[]) => {
    let currentLines: string[] = []
    for (const line of linesToPrepare) {
      const sectionBreak = inlineBoldSectionBreak(line)
      if (!sectionBreak) {
        currentLines.push(line)
        continue
      }

      currentLines.push(sectionBreak.before)
      pushParagraph(currentLines)
      currentLines = []
      output.push(`## ${sectionBreak.heading}`)
    }

    pushParagraph(currentLines)
  }

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    if (isHtmlBlock(paragraph)) {
      const block = paragraph.join('\n')
      const fence = fenceFor(block)
      output.push(`${fence}html`, block, fence)
    } else {
      pushPreparedParagraph(paragraph)
    }
    paragraph = []
  }

  for (const line of lines) {
    if (/^\s*(```|~~~)/u.test(line)) {
      flushParagraph()
      output.push(line)
      fenced = !fenced
      continue
    }

    if (fenced) {
      output.push(line)
      continue
    }

    if (line.trim() === '') {
      flushParagraph()
      output.push(line)
      continue
    }

    const sectionHeading = boldSectionHeadingText(line)
    if (sectionHeading) {
      flushParagraph()
      output.push(`## ${sectionHeading}`)
      continue
    }

    paragraph.push(line)
  }

  flushParagraph()
  return output.join('\n')
}

export default function SafeMarkdown({
  children,
  className,
}: SafeMarkdownProps) {
  const t = useTranslations('safeMarkdown')
  const prepared = prepareSafeMarkdown(children)
  const components: Components = {
    a({ children: linkChildren }) {
      return <span>{linkChildren}</span>
    },
    blockquote({ children: quoteChildren }) {
      return (
        <blockquote className="border-l-2 border-primary-300 pl-3 text-secondary-700 italic dark:border-primary-700 dark:text-secondary-200">
          {quoteChildren}
        </blockquote>
      )
    },
    code({ children: codeChildren, className: codeClassName }) {
      return (
        <code
          className={classNames(
            'rounded bg-secondary-100 px-1 py-0.5 font-mono text-[0.9em] wrap-break-word text-secondary-900 dark:bg-secondary-800 dark:text-secondary-100',
            codeClassName,
          )}
        >
          {codeChildren}
        </code>
      )
    },
    h1({ children: headingChildren }) {
      return (
        <h3 className="text-sm font-semibold text-secondary-900 dark:text-secondary-50">
          {headingChildren}
        </h3>
      )
    },
    h2({ children: headingChildren }) {
      return (
        <h4 className="text-sm font-semibold text-secondary-800 dark:text-secondary-100">
          {headingChildren}
        </h4>
      )
    },
    h3({ children: headingChildren }) {
      return (
        <h4 className="text-sm font-semibold text-secondary-800 dark:text-secondary-100">
          {headingChildren}
        </h4>
      )
    },
    h4({ children: headingChildren }) {
      return (
        <h4 className="text-sm font-semibold text-secondary-800 dark:text-secondary-100">
          {headingChildren}
        </h4>
      )
    },
    h5({ children: headingChildren }) {
      return (
        <h4 className="text-sm font-semibold text-secondary-800 dark:text-secondary-100">
          {headingChildren}
        </h4>
      )
    },
    h6({ children: headingChildren }) {
      return (
        <h4 className="text-sm font-semibold text-secondary-800 dark:text-secondary-100">
          {headingChildren}
        </h4>
      )
    },
    img({ alt, src }) {
      const label = alt?.trim() || t('imageOmitted')
      const imageUrl = typeof src === 'string' ? displayUrl(src) : ''
      return (
        <span className="my-2 inline-flex max-w-full items-start gap-2 rounded-md border border-secondary-200 bg-secondary-50 px-3 py-2 text-xs text-secondary-700 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200">
          <ImageIcon
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-secondary-500 dark:text-secondary-400"
          />
          <span className="min-w-0">
            <span className="block font-medium">{label}</span>
            {imageUrl ? (
              <span className="mt-1 block break-all font-mono text-[0.72rem] text-secondary-500 dark:text-secondary-400">
                {imageUrl}
              </span>
            ) : null}
          </span>
        </span>
      )
    },
    li({ children: itemChildren }) {
      return <li className="pl-1">{itemChildren}</li>
    },
    ol({ children: listChildren }) {
      return <ol className="list-decimal space-y-1 pl-5">{listChildren}</ol>
    },
    p({ children: paragraphChildren }) {
      return <p>{paragraphChildren}</p>
    },
    pre({ children: preChildren }) {
      return (
        <pre className="overflow-x-auto whitespace-pre-wrap wrap-break-word rounded-md border border-secondary-200 bg-secondary-50 p-3 text-xs leading-6 text-secondary-800 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100 [&_code]:rounded-none [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit">
          {preChildren}
        </pre>
      )
    },
    ul({ children: listChildren }) {
      return <ul className="list-disc space-y-1 pl-5">{listChildren}</ul>
    },
  }

  return (
    <div
      className={classNames(
        'space-y-3 text-sm leading-7 text-secondary-700 dark:text-secondary-200',
        className,
      )}
    >
      <ReactMarkdown
        allowedElements={ALLOWED_MARKDOWN_ELEMENTS}
        components={components}
        unwrapDisallowed
        urlTransform={value => value}
      >
        {prepared}
      </ReactMarkdown>
    </div>
  )
}
