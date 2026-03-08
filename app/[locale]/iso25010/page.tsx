import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import Iso25010Client from './iso25010-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('iso25010') }
}

export default function Iso25010Page() {
  return <Iso25010Client />
}
