export interface ApiResponseLike {
  ok(): boolean
  status(): number
  statusText?(): string
  text(): Promise<string>
}

export async function apiResponseFailureMessage(
  response: ApiResponseLike,
): Promise<string> {
  const statusText = response.statusText?.()
  const status = statusText
    ? `${response.status()} ${statusText}`
    : String(response.status())
  const body = await response.text()
  return `${status}: ${body}`
}

export async function expectApiResponseOk<TResponse extends ApiResponseLike>(
  response: TResponse,
  label: string,
): Promise<TResponse> {
  if (response.ok()) return response

  throw new Error(
    `${label} returned ${await apiResponseFailureMessage(response)}`,
  )
}

export async function expectApiResponseStatus<
  TResponse extends ApiResponseLike,
>(
  response: TResponse,
  expectedStatus: number,
  label: string,
): Promise<TResponse> {
  if (response.status() === expectedStatus) return response

  throw new Error(
    `${label} returned ${await apiResponseFailureMessage(response)} instead of ${expectedStatus}`,
  )
}
