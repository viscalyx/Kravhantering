export const restoreFocus = (target: HTMLElement | null | undefined): void => {
  queueMicrotask(() => {
    if (target?.isConnected) target.focus()
  })
}
