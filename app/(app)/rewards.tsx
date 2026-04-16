import { SafeAreaView } from '@/components/SafeAreaView'
import { REFETCH_BOARD_MS } from '@/constants/reactQuery'
import { playful } from '@/constants/theme'
import { useProfile } from '@/hooks/useProfile'
import { useSessionStore } from '@/stores/sessionStore'
import { getPartnerUserId } from '@/utils/couple'
import {
  approveRedemption,
  createReward,
  deleteReward,
  getCoupleBalancesView,
  getMyPendingRedemptions,
  getPendingRedemptionsForMe,
  getRedemptionCounts,
  getRedemptionHistory,
  getRewards,
  mergeRewardOrderAfterFilteredReorder,
  redeemReward,
  rejectRedemption,
  updateRewardPositions,
  type Reward,
  type RewardListFilter,
} from '@/utils/rewards'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Haptics from 'expo-haptics'
import {
  CheckCircle2,
  Clock,
  FileText,
  Gift,
  GripVertical,
  Heart,
  History,
  PartyPopper,
  Plus,
  Repeat2,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react-native'
import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import DraggableFlatList from 'react-native-draggable-flatlist'

const REWARD_COST_PRESETS = ['25', '50', '100', '150'] as const

function formatTimeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function RewardsScreen() {
  const queryClient = useQueryClient()
  const session = useSessionStore((s) => s.session)
  const { data: profile } = useProfile(session)
  const coupleId = profile?.couple_id ?? ''
  const myId = session?.user.id ?? ''

  const [createOpen, setCreateOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [cost, setCost] = useState('50')
  const [limitEnabled, setLimitEnabled] = useState(false)
  const [limitCount, setLimitCount] = useState('1')
  const [rewardFilter, setRewardFilter] = useState<RewardListFilter>('for_me')

  const { data: rewards = [], isLoading } = useQuery({
    queryKey: ['rewards', coupleId],
    queryFn: () => getRewards(coupleId),
    enabled: !!coupleId,
    refetchInterval: REFETCH_BOARD_MS,
    refetchIntervalInBackground: false,
  })

  const { data: members = [] } = useQuery({
    queryKey: ['coupleBalances', coupleId],
    queryFn: () => getCoupleBalancesView(coupleId),
    enabled: !!coupleId,
    refetchInterval: REFETCH_BOARD_MS,
    refetchIntervalInBackground: false,
  })

  const { data: pendingForMe = [] } = useQuery({
    queryKey: ['pendingForMe', myId],
    queryFn: () => getPendingRedemptionsForMe(myId),
    enabled: !!myId,
    refetchInterval: REFETCH_BOARD_MS,
    refetchIntervalInBackground: false,
  })

  const { data: myPending = [] } = useQuery({
    queryKey: ['myPending', myId],
    queryFn: () => getMyPendingRedemptions(myId),
    enabled: !!myId,
    refetchInterval: REFETCH_BOARD_MS,
    refetchIntervalInBackground: false,
  })

  const { data: redemptionHistory = [] } = useQuery({
    queryKey: ['redemptionHistory', coupleId],
    queryFn: getRedemptionHistory,
    enabled: !!coupleId && historyOpen,
  })

  const rewardIds = rewards.map((r) => r.id)
  const { data: redemptionCounts = {} } = useQuery({
    queryKey: ['redemptionCounts', rewardIds.join(',')],
    queryFn: () => getRedemptionCounts(rewardIds),
    enabled: rewardIds.length > 0,
    refetchInterval: REFETCH_BOARD_MS,
    refetchIntervalInBackground: false,
  })

  const myBalance = members.find((m) => m.id === myId)?.balance ?? 0
  const partnerId = getPartnerUserId(profile?.couple, myId)
  const partnerName = members.find((m) => m.id === partnerId)?.display_name?.trim() || 'Partner'

  // Map: rewardId → my pending redemption id (so we can show "awaiting" state)
  const myPendingByReward = useMemo(
    () => new Map(myPending.map((r) => [r.reward_id, r.id])),
    [myPending],
  )

  const filteredRewards = useMemo(() => {
    switch (rewardFilter) {
      case 'for_me':
        return rewards.filter((r) => r.created_by !== myId)
      case 'i_created':
        return rewards.filter((r) => r.created_by === myId)
      case 'all':
      default:
        return rewards
    }
  }, [rewards, rewardFilter, myId])

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['rewards', coupleId] })
    queryClient.invalidateQueries({ queryKey: ['coupleBalances', coupleId] })
    queryClient.invalidateQueries({ queryKey: ['pendingForMe', myId] })
    queryClient.invalidateQueries({ queryKey: ['myPending', myId] })
    queryClient.invalidateQueries({ queryKey: ['redemptionCounts'] })
    queryClient.invalidateQueries({ queryKey: ['redemptionHistory', coupleId] })
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const c = Math.max(1, parseInt(cost, 10) || 1)
      const max = limitEnabled ? Math.max(1, parseInt(limitCount, 10) || 1) : null
      const nextPos = rewards.reduce((m, r) => Math.max(m, r.position), -1) + 1
      return createReward(coupleId, title.trim(), description.trim() || null, c, nextPos, max)
    },
    onSuccess: () => {
      invalidateAll()
      setCreateOpen(false)
      setTitle('')
      setDescription('')
      setCost('50')
      setLimitEnabled(false)
      setLimitCount('1')
      setRewardFilter('i_created')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  })

  const redeemMutation = useMutation({
    mutationFn: redeemReward,
    onSuccess: () => {
      invalidateAll()
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert('Request sent!', `${partnerName} needs to approve it — then it's yours.`)
    },
    onError: (err: Error) => {
      const msg = err.message.includes('insufficient')
        ? 'Almost there — rack up a few more points first.'
        : err.message.includes('cannot_redeem_own_reward') || err.message.includes('own_reward')
          ? 'Nice try — the treats you add are for your partner to cash in.'
          : err.message.includes('already_pending')
            ? 'You already have a pending request for this treat.'
            : err.message.includes('max_redemptions_reached')
              ? "You've already claimed this treat the maximum number of times."
              : err.message
      Alert.alert('Not quite', msg)
    },
  })

  const approveMutation = useMutation({
    mutationFn: approveRedemption,
    onSuccess: () => {
      invalidateAll()
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  })

  const rejectMutation = useMutation({
    mutationFn: rejectRedemption,
    onSuccess: () => {
      invalidateAll()
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  })

  const cancelMutation = useMutation({
    mutationFn: rejectRedemption,
    onSuccess: () => {
      invalidateAll()
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteReward,
    onSuccess: invalidateAll,
    onError: (err: Error) => Alert.alert('Error', err.message),
  })

  const reorderRewardsMutation = useMutation({
    mutationFn: (orderedIds: string[]) => updateRewardPositions(coupleId, orderedIds),
    onSuccess: invalidateAll,
    onError: (err: Error) => Alert.alert('Order not saved', err.message),
  })

  function handleOpenCreateReward() {
    setCreateOpen(true)
  }

  const renderRewardDraggableRow = useCallback(
    ({
      item: r,
      drag,
      isActive,
    }: {
      item: Reward
      drag: () => void
      isActive: boolean
    }) => {
      const iCreated = r.created_by === myId
      const fromLabel = !r.created_by
        ? 'From both of you'
        : iCreated
          ? 'Your treat for them'
          : `From ${partnerName}`
      const approvedCount = redemptionCounts[r.id] ?? 0
      const isMaxed = r.max_redemptions !== null && approvedCount >= r.max_redemptions
      const hasPending = myPendingByReward.has(r.id)
      const canRedeem = !iCreated && !isMaxed && !hasPending && myBalance >= r.cost_points
      const showRedeem = !iCreated
      const canDelete = !r.created_by || r.created_by === myId

      const card = (
        <View
          className="mb-3.5 rounded-[22px] border-2 border-mate-border bg-mate-surface p-4"
          style={{ opacity: isActive ? 0.92 : 1 }}
        >
          <View className="flex-row items-start gap-2">
            <Pressable onLongPress={drag} delayLongPress={180} className="py-1 pr-0.5">
              <GripVertical size={20} color={playful.textMuted} />
            </Pressable>
            <View className="min-w-0 flex-1 flex-row items-start gap-3">
              <View className="min-w-0 flex-1">
                <Text className="font-mate-semibold text-[17px] text-mate-text">{r.title}</Text>
                <Text className="mt-1 font-mate-semibold text-xs text-mate-accent">{fromLabel}</Text>
                {r.description ? (
                  <Text className="mt-1 font-mate text-sm text-mate-text-muted">{r.description}</Text>
                ) : null}

                {r.max_redemptions !== null && (
                  <View className="mt-2 flex-row items-center gap-1">
                    <Repeat2 size={12} color={isMaxed ? playful.textMuted : playful.accent} />
                    <Text
                      className={`font-mate-medium text-xs ${isMaxed ? 'text-mate-text-muted' : 'text-mate-accent'}`}
                    >
                      {isMaxed
                        ? `Claimed ${approvedCount}/${r.max_redemptions} — fully redeemed`
                        : `${approvedCount}/${r.max_redemptions} claimed`}
                    </Text>
                  </View>
                )}
              </View>
              <View className="flex-row items-center gap-1 rounded-full bg-mate-muted px-3 py-2">
                <Sparkles size={14} color={playful.accent} />
                <Text className="font-mate-bold text-[15px] text-mate-accent">{r.cost_points}</Text>
              </View>
            </View>
          </View>

          <View className="mt-3.5 flex-row items-center gap-2.5">
            {showRedeem ? (
              hasPending ? (
                <View className="flex-1 flex-row items-center justify-between rounded-[14px] border border-amber-300 bg-amber-50 px-3.5 py-3">
                  <View className="flex-row items-center gap-2">
                    <Clock size={14} color="#d97706" />
                    <Text className="font-mate-medium text-sm text-amber-700">Awaiting approval</Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      const pendingId = myPendingByReward.get(r.id)!
                      Alert.alert('Cancel request?', 'Take back your treat request.', [
                        { text: 'Keep it', style: 'cancel' },
                        { text: 'Cancel', style: 'destructive', onPress: () => cancelMutation.mutate(pendingId) },
                      ])
                    }}
                  >
                    <XCircle size={16} color="#d97706" />
                  </Pressable>
                </View>
              ) : isMaxed ? (
                <View className="flex-1 justify-center rounded-[14px] bg-mate-muted px-3.5 py-3">
                  <Text className="font-mate-medium text-sm text-mate-text-muted">Fully redeemed</Text>
                </View>
              ) : (
                <Pressable
                  className={`flex-1 items-center rounded-[14px] bg-mate-success py-3 ${!canRedeem ? 'opacity-35' : 'active:opacity-90'}`}
                  disabled={!canRedeem || redeemMutation.isPending}
                  onPress={() => redeemMutation.mutate(r.id)}
                >
                  <Text className="font-mate-semibold text-[15px] text-white">Claim it</Text>
                </Pressable>
              )
            ) : (
              <View className="flex-1 justify-center rounded-[14px] bg-mate-muted px-3.5 py-3">
                <Text className="font-mate-medium text-sm text-mate-text-muted">
                  {partnerId ? `${partnerName} claims this one` : 'Your partner claims this one'}
                </Text>
              </View>
            )}
            {canDelete ? (
              <Pressable
                className="rounded-[14px] bg-mate-muted p-3 active:opacity-80"
                onPress={() =>
                  Alert.alert('Take this off the shelf?', r.title, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: () => deleteMutation.mutate(r.id),
                    },
                  ])
                }
              >
                <Trash2 size={18} color={playful.textMuted} />
              </Pressable>
            ) : (
              <View className="w-12" />
            )}
          </View>
        </View>
      )

      return card
    },
    [
      cancelMutation,
      deleteMutation,
      myBalance,
      myId,
      myPendingByReward,
      partnerId,
      partnerName,
      redeemMutation,
      redemptionCounts,
    ],
  )

  const rewardsListHeader = useMemo(
    () => (
      <View>
        <View className="mb-5 items-center gap-2">
          <View className="h-14 w-14 items-center justify-center rounded-[20px] border-2 border-mate-border bg-mate-surface">
            <Gift size={28} color={playful.accent} />
          </View>
          <Text className="font-mate-bold text-[26px] text-mate-text">The treat shelf</Text>
          <Text className="max-w-[300px] text-center font-mate text-sm leading-5 text-mate-text-muted">
            {"List things you'll do for each other — your partner cashes in with points you both earn from knocking out tasks."}
          </Text>
        </View>

        <View className="mb-4 rounded-3xl border-2 border-mate-border bg-mate-surface p-5">
          <Text className="mb-1.5 font-mate-semibold text-[13px] text-mate-text-muted">Your points stash</Text>
          <View className="flex-row items-center gap-2">
            <Sparkles size={22} color={playful.star} />
            <Text className="font-mate-bold text-4xl text-mate-text">{myBalance}</Text>
            <Text className="mt-2 font-mate-medium text-base text-mate-text-muted">pts to spend</Text>
          </View>
          {members.length > 1 && (
            <View className="mt-3.5 gap-2">
              {members
                .filter((m) => m.id !== myId)
                .map((m) => (
                  <View
                    key={m.id}
                    className="flex-row items-center justify-between rounded-[14px] bg-mate-muted p-3"
                  >
                    <Text className="mr-2 flex-1 font-mate-medium text-sm text-mate-text" numberOfLines={1}>
                      {m.display_name ?? 'Partner'}
                    </Text>
                    <Text className="font-mate-semibold text-sm text-mate-accent">{m.balance} pts</Text>
                  </View>
                ))}
            </View>
          )}
        </View>

        {pendingForMe.length > 0 && (
          <View className="mb-4 overflow-hidden rounded-3xl border-2 border-amber-400/60 bg-amber-50 dark:bg-amber-950/30">
            <View className="flex-row items-center gap-2 border-b border-amber-400/30 px-4 py-3">
              <Clock size={16} color="#d97706" />
              <Text className="font-mate-semibold text-sm text-amber-700">
                {pendingForMe.length === 1 ? '1 treat request waiting' : `${pendingForMe.length} treat requests waiting`}
              </Text>
            </View>
            {pendingForMe.map((req) => (
              <View key={req.id} className="px-4 py-3.5">
                <View className="flex-row items-start justify-between gap-2">
                  <View className="min-w-0 flex-1">
                    <Text className="font-mate-semibold text-[15px] text-mate-text" numberOfLines={1}>
                      {req.rewards?.title ?? 'Treat'}
                    </Text>
                    <View className="mt-1 flex-row items-center gap-1.5">
                      <Sparkles size={12} color={playful.star} />
                      <Text className="font-mate-medium text-xs text-mate-accent">
                        {req.cost_points} pts
                      </Text>
                      <Text className="font-mate text-xs text-mate-text-muted">
                        · {formatTimeAgo(req.created_at)}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row gap-2">
                    <Pressable
                      className="flex-row items-center gap-1 rounded-[12px] bg-mate-success px-3 py-2.5 active:opacity-80"
                      disabled={approveMutation.isPending || rejectMutation.isPending}
                      onPress={() => approveMutation.mutate(req.id)}
                    >
                      <CheckCircle2 size={15} color="#fff" />
                      <Text className="font-mate-semibold text-xs text-white">Approve</Text>
                    </Pressable>
                    <Pressable
                      className="flex-row items-center gap-1 rounded-[12px] bg-mate-muted px-3 py-2.5 active:opacity-80"
                      disabled={approveMutation.isPending || rejectMutation.isPending}
                      onPress={() => rejectMutation.mutate(req.id)}
                    >
                      <XCircle size={15} color={playful.textMuted} />
                      <Text className="font-mate-semibold text-xs text-mate-text-muted">Decline</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        <View className="mb-5 flex-row gap-2.5">
          <Pressable
            className="flex-1 flex-row items-center justify-center gap-2 rounded-[18px] bg-mate-accent py-4 active:opacity-90"
            onPress={handleOpenCreateReward}
          >
            <Plus size={20} color="#fff" />
            <Text className="font-mate-semibold text-base text-white">Dream up a treat</Text>
          </Pressable>
          <Pressable
            className="items-center justify-center rounded-[18px] border-2 border-mate-border bg-mate-surface px-4 py-4 active:opacity-80"
            onPress={() => setHistoryOpen(true)}
          >
            <History size={20} color={playful.accent} />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="mb-4 flex-row items-center gap-2"
        >
          {(
            [
              { key: 'for_me' as const, label: 'For me' },
              { key: 'i_created' as const, label: 'I made' },
              { key: 'all' as const, label: 'All' },
            ] as const
          ).map(({ key, label }) => (
            <Pressable
              key={key}
              onPress={() => setRewardFilter(key)}
              className={`rounded-full border-2 px-4 py-2.5 ${rewardFilter === key ? 'border-mate-accent bg-mate-accent' : 'border-mate-border bg-mate-surface'}`}
            >
              <Text
                className={`font-mate-semibold text-sm ${rewardFilter === key ? 'text-white' : 'text-mate-text'}`}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    ),
    [approveMutation, members, myBalance, myId, pendingForMe, rejectMutation, rewardFilter],
  )

  const showDraggableRewards = !isLoading && rewards.length > 0 && filteredRewards.length > 0

  return (
    <SafeAreaView className="flex-1 bg-mate-bg" edges={['top']}>
      {showDraggableRewards ? (
        <DraggableFlatList
          key={rewardFilter}
          data={filteredRewards}
          keyExtractor={(r) => r.id}
          containerStyle={{ flex: 1 }}
          contentContainerClassName="px-5 pb-12 pt-1"
          ListHeaderComponent={rewardsListHeader}
          renderItem={renderRewardDraggableRow}
          activationDistance={10}
          onDragEnd={({ data }) => {
            const merged = mergeRewardOrderAfterFilteredReorder(
              rewards,
              data.map((x) => x.id),
            )
            reorderRewardsMutation.mutate(merged)
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          }}
        />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-12 pt-1"
          showsVerticalScrollIndicator={false}
        >
          {rewardsListHeader}
          {isLoading ? (
            <View className="mt-8 items-center">
              <ActivityIndicator size="large" color={playful.accent} />
            </View>
          ) : rewards.length === 0 ? (
            <View className="items-center gap-2.5 py-8">
              <Sparkles size={36} color={playful.accentSoft} />
              <Text className="font-mate-semibold text-lg text-mate-text">{"Shelf's empty"}</Text>
              <Text className="text-center font-mate text-sm text-mate-text-muted">
                Add a massage, movie night, or breakfast in bed — whatever feels like you two.
              </Text>
            </View>
          ) : (
            <View className="items-center gap-2.5 py-8">
              <Sparkles size={36} color={playful.accentSoft} />
              <Text className="text-center font-mate-semibold text-lg text-mate-text">
                {rewardFilter === 'for_me'
                  ? 'Nothing for you yet'
                  : rewardFilter === 'i_created'
                    ? "You haven't added any treats"
                    : 'Nothing here'}
              </Text>
              <Text className="text-center font-mate text-sm text-mate-text-muted">
                {rewardFilter === 'for_me'
                  ? 'Nudge your partner to stock the shelf, or peek at "I made" / "All".'
                  : 'Add something sweet for them or try another filter.'}
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Create reward modal ── */}
      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <View className="flex-1">
          <Pressable className="absolute inset-0 bg-mate-overlay" onPress={() => setCreateOpen(false)} />
          <KeyboardAvoidingView className="flex-1 justify-end" behavior="padding">
          <View className="max-h-[92%] overflow-hidden rounded-t-[28px] bg-mate-surface">
            <View className="items-center pt-3 pb-1">
              <View className="h-1 w-10 rounded-full bg-mate-border" />
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerClassName="px-5 pb-10 pt-1"
            >
              <View className="flex-row items-center gap-3">
                <View
                  className="h-[52px] w-[52px] items-center justify-center rounded-[18px] border-2 border-mate-border"
                  style={{ backgroundColor: `${playful.star}33` }}
                >
                  <Gift size={26} color={playful.accent} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="font-mate-bold text-[22px] text-mate-text">New treat</Text>
                  <Text className="mt-0.5 font-mate text-sm text-mate-text-muted">Something sweet for the shelf</Text>
                </View>
              </View>

              <View className="mt-4 flex-row items-center gap-2.5 rounded-[16px] border-2 border-mate-border bg-mate-muted px-3.5 py-3">
                <Heart size={18} color={playful.accent} fill={playful.accentSoft} />
                <Text className="flex-1 font-mate text-sm leading-5 text-mate-text">
                  {partnerId
                    ? `${partnerName} will redeem this with points you both earn from tasks.`
                    : 'Your partner will redeem this with points from shared tasks.'}
                </Text>
              </View>

              {/* Title */}
              <Text className="mb-2 mt-5 font-mate-semibold text-xs uppercase tracking-wide text-mate-text-muted">
                What's the treat?
              </Text>
              <View className="flex-row items-stretch overflow-hidden rounded-2xl border-2 border-mate-border">
                <View className="w-[48px] items-center justify-center bg-mate-muted">
                  <Gift size={20} color={playful.accent} />
                </View>
                <TextInput
                  className="min-h-[52px] flex-1 px-3.5 py-3 font-mate text-base text-mate-text"
                  style={{ includeFontPadding: false, lineHeight: undefined }}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Back rub, picnic, dish duty…"
                  placeholderTextColor={playful.textMuted}
                  autoFocus
                />
              </View>

              {/* Description */}
              <Text className="mb-2 mt-4 font-mate-semibold text-xs uppercase tracking-wide text-mate-text-muted">
                The vibe / fine print
              </Text>
              <View className="flex-row items-stretch overflow-hidden rounded-2xl border-2 border-mate-border">
                <View className="w-[48px] items-start justify-start bg-mate-muted pt-3.5">
                  <View className="w-full items-center">
                    <FileText size={20} color={playful.accent} />
                  </View>
                </View>
                <TextInput
                  className="min-h-[88px] flex-1 px-3.5 py-3.5 font-mate text-base text-mate-text"
                  style={{ textAlignVertical: 'top', includeFontPadding: false }}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Duration, mood, secret handshake…"
                  placeholderTextColor={playful.textMuted}
                  multiline
                />
              </View>

              {/* Cost */}
              <View className="mt-5 flex-row items-center gap-2">
                <Sparkles size={18} color={playful.star} />
                <Text className="font-mate-semibold text-sm text-mate-text">Point price</Text>
              </View>
              <Text className="mt-1 font-mate text-xs text-mate-text-muted">How many sparkles to claim it?</Text>
              <View className="mt-2.5 flex-row flex-wrap gap-2">
                {REWARD_COST_PRESETS.map((c) => {
                  const active = cost === c
                  return (
                    <Pressable
                      key={c}
                      onPress={() => setCost(c)}
                      className={`flex-row items-center gap-1 rounded-full border-2 px-3.5 py-2.5 ${active ? 'border-mate-accent bg-mate-accent' : 'border-mate-border bg-mate-muted'}`}
                    >
                      <Sparkles size={14} color={active ? '#fff' : playful.star} />
                      <Text className={`font-mate-semibold text-sm ${active ? 'text-white' : 'text-mate-text'}`}>
                        {c}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
              <View className="mt-3 flex-row items-stretch overflow-hidden rounded-2xl border-2 border-mate-border">
                <View className="w-[48px] items-center justify-center bg-mate-muted">
                  <Sparkles size={20} color={playful.star} />
                </View>
                <TextInput
                  className="min-h-[52px] flex-1 px-3.5 py-3 font-mate text-base text-mate-text"
                  style={{ includeFontPadding: false, lineHeight: undefined }}
                  value={cost}
                  onChangeText={setCost}
                  keyboardType="number-pad"
                  placeholder="Your own number"
                  placeholderTextColor={playful.textMuted}
                />
              </View>

              {/* Redemption limit */}
              <View className="mt-5">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Repeat2 size={18} color={playful.accent} />
                    <Text className="font-mate-semibold text-sm text-mate-text">Limit claims</Text>
                  </View>
                  <Switch
                    value={limitEnabled}
                    onValueChange={setLimitEnabled}
                    trackColor={{ false: playful.border, true: playful.accent }}
                    thumbColor="#fff"
                  />
                </View>
                <Text className="mt-1 font-mate text-xs text-mate-text-muted">
                  {limitEnabled
                    ? 'Your partner can only claim this a set number of times.'
                    : 'No limit — claimable as many times as they like.'}
                </Text>
                {limitEnabled && (
                  <View className="mt-3 flex-row items-stretch overflow-hidden rounded-2xl border-2 border-mate-border">
                    <View className="w-[48px] items-center justify-center bg-mate-muted">
                      <Repeat2 size={20} color={playful.accent} />
                    </View>
                    <TextInput
                      className="min-h-[52px] flex-1 px-3.5 py-3 font-mate text-base text-mate-text"
                      style={{ includeFontPadding: false, lineHeight: undefined }}
                      value={limitCount}
                      onChangeText={setLimitCount}
                      keyboardType="number-pad"
                      placeholder="e.g. 1"
                      placeholderTextColor={playful.textMuted}
                    />
                  </View>
                )}
              </View>

              <Pressable
                className={`mt-6 flex-row items-center justify-center gap-2 rounded-2xl bg-mate-accent py-4 ${!title.trim() ? 'opacity-40' : 'active:opacity-90'}`}
                disabled={!title.trim() || createMutation.isPending}
                onPress={() => createMutation.mutate()}
              >
                {createMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <PartyPopper size={22} color="#fff" />
                    <Text className="font-mate-semibold text-[17px] text-white">Put it on the shelf</Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Redemption history modal ── */}
      <Modal visible={historyOpen} transparent animationType="slide" onRequestClose={() => setHistoryOpen(false)}>
        <Pressable className="absolute inset-0 bg-mate-overlay" onPress={() => setHistoryOpen(false)} />
        <View className="mt-auto max-h-[80%] overflow-hidden rounded-t-[28px] bg-mate-surface">
          <View className="items-center pt-3 pb-1">
            <View className="h-1 w-10 rounded-full bg-mate-border" />
          </View>
          <View className="flex-row items-center gap-3 border-b border-mate-border px-5 pb-4 pt-3">
            <View
              className="h-[44px] w-[44px] items-center justify-center rounded-[16px] border-2 border-mate-border"
              style={{ backgroundColor: `${playful.accent}22` }}
            >
              <History size={22} color={playful.accent} />
            </View>
            <View>
              <Text className="font-mate-bold text-[20px] text-mate-text">Treat history</Text>
              <Text className="font-mate text-sm text-mate-text-muted">All approved redemptions</Text>
            </View>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerClassName="px-5 pb-10 pt-3"
          >
            {redemptionHistory.length === 0 ? (
              <View className="items-center gap-2.5 py-10">
                <Sparkles size={32} color={playful.accentSoft} />
                <Text className="font-mate-semibold text-base text-mate-text">No treats redeemed yet</Text>
                <Text className="text-center font-mate text-sm text-mate-text-muted">
                  Once you both start claiming treats, you'll see the history here.
                </Text>
              </View>
            ) : (
              <View className="gap-3">
                {redemptionHistory.map((item) => {
                  const redeemerName =
                    item.profile_id === myId
                      ? 'You'
                      : (item.profiles?.display_name?.trim() || partnerName)
                  return (
                    <View
                      key={item.id}
                      className="flex-row items-center gap-3 rounded-[18px] border-2 border-mate-border bg-mate-surface p-3.5"
                    >
                      <View className="h-10 w-10 items-center justify-center rounded-full bg-mate-muted">
                        <Gift size={18} color={playful.accent} />
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text className="font-mate-semibold text-[15px] text-mate-text" numberOfLines={1}>
                          {item.rewards?.title ?? 'Treat'}
                        </Text>
                        <Text className="mt-0.5 font-mate text-xs text-mate-text-muted">
                          {redeemerName} · {formatTimeAgo(item.approved_at ?? item.created_at)}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1 rounded-full bg-mate-muted px-2.5 py-1.5">
                        <Sparkles size={12} color={playful.star} />
                        <Text className="font-mate-semibold text-xs text-mate-accent">{item.cost_points}</Text>
                      </View>
                    </View>
                  )
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  )
}
