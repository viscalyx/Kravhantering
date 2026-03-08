import fallbackData from '@/lib/owners-fallback.json'

export interface Owner {
  email: string
  firstName: string
  id: string
  lastName: string
}

interface OwnerApiResponse {
  email: string
  first_name: string
  id: string
  last_name: string
}

export async function listOwners(): Promise<Owner[]> {
  const apiUrl = process.env.OWNERS_API_URL

  if (apiUrl) {
    const response = await fetch(apiUrl, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 },
    })

    if (!response.ok) {
      console.error(`Owner API returned ${response.status}`)
      return mapFallback()
    }

    const data: OwnerApiResponse[] = await response.json()
    return data.map(o => ({
      id: o.id,
      firstName: o.first_name,
      lastName: o.last_name,
      email: o.email,
    }))
  }

  return mapFallback()
}

function mapFallback(): Owner[] {
  return fallbackData.map(o => ({
    id: o.id,
    firstName: o.first_name,
    lastName: o.last_name,
    email: o.email,
  }))
}

export async function getOwnerById(id: string): Promise<Owner | null> {
  const owners = await listOwners()
  return owners.find(o => o.id === id) ?? null
}
