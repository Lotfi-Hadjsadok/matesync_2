import { supabase } from '@/utils/supabase';
import * as Crypto from 'expo-crypto';

type CouplePartnerFields = { created_by: string; partner_id: string | null } | null | undefined

/** Other member of the couple, if any (invite accepted). */
export function getPartnerUserId(couple: CouplePartnerFields, myUserId: string): string | null {
  if (!couple) return null
  if (couple.partner_id === myUserId) return couple.created_by
  if (couple.created_by === myUserId) return couple.partner_id
  return null
}

async function randomInviteCode(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(3)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

export async function createCouple(name: string): Promise<string> {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) throw new Error('Not signed in.')

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('couple_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profileErr) throw new Error(profileErr.message)
  if (profile?.couple_id) throw new Error('You already belong to a couple.')

  for (let attempt = 0; attempt < 8; attempt++) {
    const invite_code = await randomInviteCode()
    const { data: couple, error } = await supabase
      .from('couples')
      .insert({ name, invite_code, created_by: user.id })
      .select('id')
      .single()

    if (error?.code === '23505') continue
    if (error) throw new Error(error.message)
    if (!couple) throw new Error('Failed to create couple.')

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ couple_id: couple.id })
      .eq('id', user.id)

    if (updateErr) throw new Error(updateErr.message)
    return couple.id
  }

  throw new Error('Could not generate a unique invite code.')
}

export async function joinCouple(inviteCode: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_couple', {
    p_invite_code: inviteCode,
  })
  if (error) {
    const msg = error.message.includes('already_in_couple')
      ? 'You already belong to a couple.'
      : error.message.includes('invalid_invite_code')
        ? 'Invalid invite code. Please check and try again.'
        : error.message.includes('couple_full')
          ? 'This couple already has two members.'
          : error.message
    throw new Error(msg)
  }
  return data as string
}
