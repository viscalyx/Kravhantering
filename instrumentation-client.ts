// THROWAWAY #1352: run before app hydration. Preview preferences live only
// in this tab's memory; the existing session cookie still handles real login.
if (
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PUBLIC_PROTOTYPE_1352 === 'true'
) {
  const stores = new WeakMap<Storage, Map<string, string>>()
  function values(storage: Storage) {
    let entries = stores.get(storage)
    if (!entries) {
      entries = new Map<string, string>()
      stores.set(storage, entries)
    }
    return entries
  }
  Storage.prototype.getItem = function (key: string) {
    return values(this).get(String(key)) ?? null
  }
  Storage.prototype.setItem = function (key: string, value: string) {
    values(this).set(String(key), String(value))
  }
  Storage.prototype.removeItem = function (key: string) {
    values(this).delete(String(key))
  }
  Storage.prototype.clear = function () {
    values(this).clear()
  }
  Storage.prototype.key = function (index: number) {
    return [...values(this).keys()][index] ?? null
  }
  Object.defineProperty(Storage.prototype, 'length', {
    configurable: true,
    get() {
      return values(this).size
    },
  })
  const params = new URLSearchParams(location.search)
  localStorage.setItem('theme', params.get('theme') ?? 'light')
  localStorage.setItem(
    'requirements.navigationRail.expanded.v1',
    params.get('nav') === 'expanded' ? 'expanded' : 'collapsed',
  )
  const specificationId = Number(
    location.pathname.match(/\/specifications\/(\d+)/)?.[1],
  )
  if (specificationId) {
    const variant = params.get('variant') ?? '0'
    localStorage.setItem(
      'specification-panel-width-v1',
      JSON.stringify({
        specificationId,
        leftRatio: variant === 'A' ? 0.6 : variant === 'B' ? 0.55 : 0.5,
      }),
    )
    localStorage.setItem(
      'specification-panel-layout-v1',
      JSON.stringify({ specificationId, layout: 'both' }),
    )
  }
}
