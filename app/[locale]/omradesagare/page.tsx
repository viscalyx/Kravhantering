import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import OmradesagareClient from './omradesagare-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('areaOwners') }
}

export default function OmradesagarePage() {
  return <OmradesagareClient />
}
