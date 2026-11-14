export type AuditCompletion = () => void
export type MutationAudit<TArgs extends unknown[]> = (
  ...args: TArgs
) => Promise<void> | Promise<AuditCompletion | undefined>

/** The mutation callback must resolve only after its owning transaction commits. */
export async function withCommittedAudit<T, TArgs extends unknown[]>(
  writeAudit: MutationAudit<TArgs> | undefined,
  commitMutation: (audit: (...args: TArgs) => Promise<void>) => Promise<T>,
): Promise<T> {
  const completions: AuditCompletion[] = []
  const result = await commitMutation(async (...args) => {
    const complete = await writeAudit?.(...args)
    if (complete) completions.push(complete)
  })
  for (const complete of completions) {
    try {
      complete()
    } catch {
      // External audit delivery is best effort; the database has committed.
    }
  }
  return result
}
