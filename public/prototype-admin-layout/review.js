// Throwaway static comparison viewer. Works from disk or the preview gallery.
const controls = ['variant', 'width', 'rail', 'theme'].map(id =>
  document.getElementById(id),
)
const descriptions = {
  A: 'A · Compact rows: quiet underline tabs, flat rows and a compact top action bar.',
  B: 'B · Settings table: a numbered grid with headings, alternating rows and bottom actions.',
  C: 'C · Split workspace: title, visibility summary and actions on the left; rows start earlier on the right.',
}
function update() {
  const [variant, width, rail, theme] = controls.map(control => control.value)
  const prefix = `${width}-${rail}-${theme}`
  document.getElementById('before').src = `${prefix}-0.png`
  document.getElementById('after').src = `${prefix}-${variant}.png`
  document.getElementById('afterLabel').textContent =
    descriptions[variant].split(':')[0]
  document.getElementById('description').textContent = descriptions[variant]
  document.getElementById('live').href =
    `http://localhost:3139/sv/admin?variant=${variant}`
  for (const scenario of ['long', 'mobile', 'english'])
    document.getElementById(scenario).href = `${scenario}-${variant}.png`
  document.getElementById('comparison').style.width = document.getElementById(
    'zoom',
  ).checked
    ? `${width}px`
    : '100%'
  const find = key =>
    window.REVIEW_DATA.measurements.find(
      row => row.image === `${prefix}-${key}.png`,
    )
  const before = find('0')
  const after = find(variant)
  const metrics = document.getElementById('metrics')
  metrics.replaceChildren()
  for (const [label, value] of [
    ['Header height', `${before.headerHeight} → ${after.headerHeight} px`],
    [
      'Fully visible rows',
      `${before.fullyVisibleRows} → ${after.fullyVisibleRows}`,
    ],
    ['Row height', `${before.rowHeights[0]} → ${after.rowHeights[0]} px`],
    ['Tab lines', `${before.tabLines} → ${after.tabLines}`],
  ]) {
    const metric = document.createElement('div')
    const strong = document.createElement('strong')
    strong.textContent = value
    const span = document.createElement('span')
    span.textContent = label
    metric.append(strong, span)
    metrics.append(metric)
  }
}
for (const control of controls) control.addEventListener('change', update)
document.getElementById('zoom').addEventListener('change', update)
document.getElementById('divider').addEventListener('input', event => {
  document.getElementById('after').style.clipPath =
    `inset(0 0 0 ${event.target.value}%)`
  document.getElementById('line').style.left = `${event.target.value}%`
})
update()
