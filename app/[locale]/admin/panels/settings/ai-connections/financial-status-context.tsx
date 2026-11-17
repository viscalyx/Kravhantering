'use client'

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  type AiConnectionFinancialStatus,
  retainAiFinancialSnapshots,
} from '@/lib/ai/financial-contracts'
import { apiFetch } from '@/lib/http/api-fetch'
import { getResponseMessage } from '@/lib/http/response-message'

interface FinancialStatusState {
  busy: boolean
  errorMessage: string | null
  failed: boolean
  load(): Promise<void>
  mutate(action: string, values: Record<string, string>): Promise<void>
  status: AiConnectionFinancialStatus | null
}
const FinancialStatusContext = createContext<FinancialStatusState | null>(null)

export function FinancialStatusProvider({
  connectionId,
  children,
}: {
  connectionId: string
  children: ReactNode
}) {
  const [status, setStatus] = useState<AiConnectionFinancialStatus | null>(null)
  const [busy, setBusy] = useState(true)
  const [failed, setFailed] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const path = `/api/admin/ai-connections/${connectionId}/actions`
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      const response = await apiFetch(path, {
        method: 'POST',
        signal,
        body: JSON.stringify({ action: 'fetch_financial_status' }),
        headers: { 'Content-Type': 'application/json' },
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        if (body?.code === 'sql_failure')
          setErrorMessage(getResponseMessage(body))
        throw new Error('financial_status_unavailable')
      }
      const current: AiConnectionFinancialStatus = await response.json()
      if (!signal.aborted)
        setStatus(previous => retainAiFinancialSnapshots(previous, current))
    },
    [path],
  )

  const load = useCallback(async () => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setBusy(true)
    setFailed(false)
    setErrorMessage(null)
    try {
      await refresh(controller.signal)
    } catch {
      if (!controller.signal.aborted) {
        setStatus(null)
        setFailed(true)
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }, [refresh])

  useEffect(() => {
    void load()
    return () => requestRef.current?.abort()
  }, [load])

  async function mutate(
    action: string,
    values: Record<string, string>,
  ): Promise<void> {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setBusy(true)
    setFailed(false)
    setErrorMessage(null)
    let committed = false
    try {
      const response = await apiFetch(path, {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({ action, ...values }),
        headers: { 'Content-Type': 'application/json' },
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        if (body?.code === 'sql_failure')
          setErrorMessage(getResponseMessage(body))
        throw new Error('management_action_failed')
      }
      if (controller.signal.aborted) return
      committed = true
      if (action !== 'write_management_credential') setStatus(null)
      await refresh(controller.signal)
    } catch {
      if (!controller.signal.aborted) {
        if (committed) setStatus(null)
        setFailed(true)
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return (
    <FinancialStatusContext
      value={{ status, busy, failed, errorMessage, load, mutate }}
    >
      {children}
    </FinancialStatusContext>
  )
}

export function useFinancialStatus(): FinancialStatusState {
  const context = useContext(FinancialStatusContext)
  if (!context) throw new Error('Financial status provider is required.')
  return context
}
