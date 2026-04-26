import RootLocaleRedirect from '@/components/RootLocaleRedirect'
import { routing } from '@/i18n/routing'

export default function RootPage() {
  return <RootLocaleRedirect defaultLocale={routing.defaultLocale} />
}
