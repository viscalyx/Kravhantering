import type { ComponentProps } from 'react'
import type { Mock } from 'vitest'

export function confirmModalMock(confirm: Mock) {
  return {
    useConfirmModal: () => ({ confirm }),
  }
}

export function StatusBadgeMock({ label }: { label: string }) {
  return <span>{label}</span>
}

export function statusBadgeMock() {
  return { default: StatusBadgeMock }
}

export function iconPickerMock() {
  return {
    default: ({ onChange }: { onChange: (name: string | null) => void }) => (
      <button onClick={() => onChange('Circle')} type="button">
        choose icon
      </button>
    ),
  }
}

export function routingLinkMock() {
  return {
    Link: ({ children, href, ...props }: ComponentProps<'a'>) => (
      <a href={href} {...props}>
        {children}
      </a>
    ),
  }
}

export function okJsonResponse(body: unknown): Response {
  return jsonResponse(body, 200)
}

export function failedJsonResponse(body: unknown): Response {
  return jsonResponse(body, 500)
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}
