export const UTF8_BOM = '\uFEFF'

export function withUtf8Bom(text: string): string {
  return text.startsWith(UTF8_BOM) ? text : `${UTF8_BOM}${text}`
}

export function createUtf8BomBlob(text: string, type: string): Blob {
  return new Blob([withUtf8Bom(text)], { type })
}
