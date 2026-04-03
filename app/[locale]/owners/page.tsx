import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import OwnersClient from './owners-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('areaOwners') }
}

export default function OwnersPage() {
  return <OwnersClient />
}
