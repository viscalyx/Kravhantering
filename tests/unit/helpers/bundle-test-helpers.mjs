export function deterministicBytes(length) {
  const content = Buffer.alloc(length)
  let state = 0x1a2b3c4d
  for (let index = 0; index < length; index += 1) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    content[index] = state >>> 24
  }
  return content
}
