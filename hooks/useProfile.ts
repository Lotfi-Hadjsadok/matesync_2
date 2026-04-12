import { useQuery } from '@tanstack/react-query'
import { REFETCH_PROFILE_MS } from '@/constants/reactQuery'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/utils/supabase'

export type Couple = {
  id: string
  name: string
  invite_code: string
  created_by: string
  partner_id: string | null
  created_at: string
}

export type Profile = {
  id: string
  display_name: string | null
  avatar_url: string | null
  couple_id: string | null
  couple: Couple | null
}

const profileSelect = '*, couple:couples(*)'

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(profileSelect)
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export function useProfile(session: Session | null) {
  return useQuery({
    queryKey: ['profile', session?.user.id],
    queryFn: async () => {
      const userId = session!.user.id
      let profile = await fetchProfile(userId)
      if (profile) return profile

      const u = session!.user
      const meta = u.user_metadata as Record<string, unknown> | undefined
      const email = u.email ?? ''
      const { error: insertErr } = await supabase.from('profiles').insert({
        id: userId,
        display_name:
          typeof meta?.full_name === 'string' && meta.full_name.length > 0
            ? meta.full_name
            : email.split('@')[0] || null,
        avatar_url: typeof meta?.avatar_url === 'string' ? meta.avatar_url : null,
      })
      if (insertErr?.code !== '23505' && insertErr) throw insertErr

      profile = await fetchProfile(userId)
      if (!profile) throw new Error('Profile missing after ensure')
      return profile
    },
    enabled: !!session,
    refetchInterval: REFETCH_PROFILE_MS,
    refetchIntervalInBackground: false,
  })
}
