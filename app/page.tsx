import { AtelierApp } from '@/components/atelier/atelier-app'
import { createClient } from '@/lib/supabase/server'
import type { AtelierUser } from '@/components/atelier/types'

export const dynamic = 'force-dynamic'

export default async function Page() {
  let initialUser: AtelierUser | null = null
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      initialUser = {
        id: user.id,
        email: user.email ?? '',
        name: String(user.user_metadata?.display_name ?? user.email?.split('@')[0] ?? 'there'),
        styleProfile: String(user.user_metadata?.style_profile ?? 'Classic'),
        palette: String(user.user_metadata?.palette ?? 'Warm neutrals'),
      }
    }
  } catch {
    initialUser = null
  }

  return <AtelierApp initialUser={initialUser} />
}
