// THROWAWAY #1346: classify existing DOM and generate CSS; never mutate React-owned elements.
// Public classes/roles identify the current rendered patterns. This is not production styling.
export function scanPrototype1346() {
  const groups: Record<string, Set<string>> = {}
  const elements: Record<string, HTMLElement[]> = {
    control: [],
    panel: [],
    floating: [],
  }
  const exclude =
    ':not([data-prototype1346-tools], [data-prototype1346-tools] *, [data-developer-mode-overlay-root], [data-developer-mode-overlay-root] *, [data-developer-mode-toast], [data-developer-mode-toast] *, [role=switch], [role=switch] *)'
  for (const node of document.body.querySelectorAll<HTMLElement>('*')) {
    if (
      node.closest(
        '[data-prototype1346-tools], nextjs-portal, [data-developer-mode-overlay-root], [data-developer-mode-toast], [data-developer-mode-ui]',
      ) ||
      node.namespaceURI !== 'http://www.w3.org/1999/xhtml'
    )
      continue
    const classes = node.className || ''
    const role = node.getAttribute('role')
    const functional =
      ['switch', 'checkbox', 'radio'].includes(role ?? '') ||
      /animate-spin|status-badge/.test(classes) ||
      !!node.closest('[role=switch]')
    const control = node.matches(
      'button, input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=hidden]), textarea, select, a[class*="btn-"], a[class*="rounded"]',
    )
    let kind = ''
    if (control && !functional) kind = 'control'
    else if (
      node.matches('div,section,article,aside,fieldset,nav,form') &&
      /rounded/.test(classes) &&
      !functional &&
      (!classes.includes('rounded-full') || role === 'tablist')
    )
      kind = 'panel'
    if (
      kind === 'panel' &&
      (role === 'dialog' ||
        role === 'menu' ||
        ((/\b(fixed|absolute)\b/.test(classes) || node.matches('[popover]')) &&
          /shadow|z-50/.test(classes)))
    )
      kind = 'floating'
    const selector = `${node.tagName.toLowerCase()}${node.hasAttribute('class') ? `[class="${CSS.escape(classes)}"]` : ':not([class])'}${role ? `[role="${CSS.escape(role)}"]` : ':not([role])'}${node.hasAttribute('type') ? `[type="${CSS.escape(node.getAttribute('type') ?? '')}"]` : ':not([type])'}${exclude}`
    const add = (group: string) => {
      groups[group] ??= new Set()
      groups[group].add(selector)
    }
    if (kind) {
      add(kind)
      elements[kind].push(node)
    }
    if (kind === 'control' && role !== 'tab') {
      if (/btn-primary|(?:^|\s)bg-primary-(?:600|700)/.test(classes))
        add('primary')
      else if (
        !/btn-destructive|(?:text|bg)-red-/.test(classes) &&
        node.matches('button,a') &&
        /(?:^|\s)bg-(?:white|secondary|gray|slate)|btn-secondary/.test(classes)
      )
        add('ordinary')
    }
    if (
      (kind === 'panel' || kind === 'floating') &&
      !/\b(?:bg|border)-(?:red|amber|yellow|green|emerald|blue|orange|rose)-/.test(
        classes,
      )
    ) {
      add(
        /bg-(?:secondary|gray|slate)-(?:50|100|800|950)/.test(classes)
          ? 'muted'
          : 'base',
      )
    }
    if (/gradient/.test(classes))
      add(
        /text-gradient|bg-clip-text/.test(classes)
          ? 'textGradient'
          : 'surfaceGradient',
      )
    if (
      (kind === 'control' ||
        kind === 'panel' ||
        /(?:^|\s)(?:hover:)?shadow/.test(classes)) &&
      kind !== 'floating' &&
      !functional &&
      !node.matches('[role=status],[role=alert]')
    )
      add('flat')
  }
  const rules: [string, string, string?][] = [
    ['control', 'border-radius:8px!important'],
    ['panel', 'border-radius:12px!important'],
    [
      'floating',
      'border-radius:12px!important;--tw-shadow:0 12px 32px -12px rgb(0 0 0 / 35%)!important',
    ],
    [
      'base',
      'background:var(--p1346-base)!important;border-color:var(--p1346-line)!important;backdrop-filter:none!important',
    ],
    [
      'muted',
      'background:var(--p1346-muted)!important;border-color:var(--p1346-line)!important;backdrop-filter:none!important',
    ],
    ['surfaceGradient', 'background-image:none!important'],
    [
      'textGradient',
      'background-image:none!important;color:var(--p1346-text)!important;-webkit-text-fill-color:var(--p1346-text)!important',
    ],
    ['flat', '--tw-shadow:0 0 #0000!important'],
    [
      'primary',
      'background-color:var(--p1346-primary)!important;color:white!important',
    ],
    [
      'ordinary',
      'background-color:var(--p1346-base)!important;color:var(--p1346-text)!important',
    ],
    ['ordinary', 'background-color:var(--p1346-muted)!important', ':hover'],
    ['primary', 'background-color:#3730a3!important', ':hover'],
    [
      'control',
      'background:var(--p1346-primary)!important;color:white!important',
      '[role=tab][aria-selected=true]',
    ],
    [
      'control',
      'background:transparent!important;color:var(--p1346-text)!important',
      '[role=tab][aria-selected=false]',
    ],
  ]
  let css = rules
    .filter(([group]) => groups[group]?.size)
    .map(
      ([group, rule, suffix = '']) =>
        `html[data-prototype1346=after] :is(${[...groups[group]].join(',')})${suffix}{${rule}}`,
    )
    .join('\n')
  const inspect = [
    ...(groups.control ?? []),
    ...(groups.panel ?? []),
    ...(groups.floating ?? []),
  ]
  if (inspect.length)
    css += `\nhtml[data-prototype1346-inspect=true] :is(${inspect.join(',')}){outline:1px dashed #e879f9;outline-offset:2px}`
  let sheet = document.getElementById(
    'prototype1346-generated-skin',
  ) as HTMLStyleElement | null
  if (!sheet) {
    sheet = document.createElement('style')
    sheet.id = 'prototype1346-generated-skin'
    document.head.append(sheet)
  }
  if (sheet.textContent !== css) sheet.textContent = css
  Object.assign(window, { prototype1346Elements: elements })
  return Object.fromEntries(
    Object.entries(elements).map(([kind, nodes]) => [kind, nodes.length]),
  )
}
