import { supabase } from '@/utils/supabase'

export type Reward = {
  id: string
  couple_id: string
  title: string
  description: string | null
  cost_points: number
  max_redemptions: number | null
  position: number
  created_by: string | null
  created_at: string
}

export type RedemptionStatus = 'pending' | 'approved' | 'rejected'

export type RewardRedemption = {
  id: string
  reward_id: string
  profile_id: string
  cost_points: number
  status: RedemptionStatus
  approved_by: string | null
  approved_at: string | null
  created_at: string
  rewards: { title: string; cost_points: number } | null
  profiles: { display_name: string | null } | null
}

export type RewardListFilter = 'for_me' | 'i_created' | 'all'

export type PointBalanceRow = {
  profile_id: string
  balance: number
}

export async function getRewards(coupleId: string): Promise<Reward[]> {
  const { data, error } = await supabase
    .from('rewards')
    .select('*')
    .eq('couple_id', coupleId)
    .order('position', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createReward(
  coupleId: string,
  title: string,
  description: string | null,
  costPoints: number,
  position: number,
  maxRedemptions: number | null,
): Promise<Reward> {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('rewards')
    .insert({
      couple_id: coupleId,
      title,
      description,
      cost_points: costPoints,
      position,
      created_by: user!.id,
      max_redemptions: maxRedemptions,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteReward(rewardId: string): Promise<void> {
  const { error } = await supabase.from('rewards').delete().eq('id', rewardId)
  if (error) throw error
}

export async function redeemReward(rewardId: string): Promise<string> {
  const { data, error } = await supabase.rpc('redeem_reward', { p_reward_id: rewardId })
  if (error) throw error
  return data as string
}

export async function approveRedemption(redemptionId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_redemption', { p_redemption_id: redemptionId })
  if (error) throw error
}

export async function rejectRedemption(redemptionId: string): Promise<void> {
  const { error } = await supabase.rpc('reject_redemption', { p_redemption_id: redemptionId })
  if (error) throw error
}

/** Pending redemptions sent by the partner that the current user needs to act on. */
export async function getPendingRedemptionsForMe(myId: string): Promise<RewardRedemption[]> {
  const { data, error } = await supabase
    .from('reward_redemptions')
    .select('*, rewards(title, cost_points), profiles(display_name)')
    .eq('status', 'pending')
    .neq('profile_id', myId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as RewardRedemption[]
}

/** Pending redemptions the current user themselves submitted. */
export async function getMyPendingRedemptions(myId: string): Promise<RewardRedemption[]> {
  const { data, error } = await supabase
    .from('reward_redemptions')
    .select('*, rewards(title, cost_points)')
    .eq('status', 'pending')
    .eq('profile_id', myId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as RewardRedemption[]
}

/** Approved redemption history visible to both partners. */
export async function getRedemptionHistory(): Promise<RewardRedemption[]> {
  const { data, error } = await supabase
    .from('reward_redemptions')
    .select('*, rewards(title, cost_points), profiles(display_name)')
    .eq('status', 'approved')
    .order('approved_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return (data ?? []) as RewardRedemption[]
}

/** Count of approved redemptions per reward (for cap display). */
export async function getRedemptionCounts(rewardIds: string[]): Promise<Record<string, number>> {
  if (rewardIds.length === 0) return {}
  const { data, error } = await supabase
    .from('reward_redemptions')
    .select('reward_id')
    .in('reward_id', rewardIds)
    .eq('status', 'approved')
  if (error) throw error
  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.reward_id] = (counts[row.reward_id] ?? 0) + 1
  }
  return counts
}

export async function getPointBalancesForCouple(profileIds: string[]): Promise<PointBalanceRow[]> {
  if (profileIds.length === 0) return []
  const { data, error } = await supabase
    .from('point_balances')
    .select('profile_id, balance')
    .in('profile_id', profileIds)
  if (error) throw error
  return data ?? []
}

export type CoupleBalanceMember = {
  id: string
  display_name: string | null
  balance: number
}

export async function getCoupleBalancesView(coupleId: string): Promise<CoupleBalanceMember[]> {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('couple_id', coupleId)
  if (error) throw error
  const list = profiles ?? []
  const rows = await getPointBalancesForCouple(list.map((p) => p.id))
  const balMap = new Map(rows.map((r) => [r.profile_id, r.balance]))
  return list.map((p) => ({
    id: p.id,
    display_name: p.display_name,
    balance: balMap.get(p.id) ?? 0,
  }))
}
