import { createNavigation } from 'next-intl/navigation'
import { defineRouting } from 'next-intl/routing'
import { USE_INSECURE_COOKIE } from '@/lib/runtime/build-target'

export const routing = defineRouting({
  locales: ['sv', 'en'],
  defaultLocale: 'sv',
  // Harden the NEXT_LOCALE cookie. next-intl's default omits HttpOnly,
  // which trips ZAP rule 10010. The cookie is only read server-side by
  // next-intl's middleware, so HttpOnly is safe.
  localeCookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: !USE_INSECURE_COOKIE,
  },
})

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)
