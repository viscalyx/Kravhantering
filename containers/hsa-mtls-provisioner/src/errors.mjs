export class ProvisionerError extends Error {
  constructor(category, message, options = undefined) {
    super(message, options)
    this.name = 'ProvisionerError'
    this.category = category
  }
}

export function fail(category, message, options = undefined) {
  throw new ProvisionerError(category, message, options)
}
