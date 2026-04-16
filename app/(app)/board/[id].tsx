import { SafeAreaView } from '@/components/SafeAreaView'
import { REFETCH_BOARD_MS } from '@/constants/reactQuery'
import { playful } from '@/constants/theme'
import { useProfile } from '@/hooks/useProfile'
import { useSessionStore } from '@/stores/sessionStore'
import type { BoardDetail, Subtask, Task, TaskListFilter } from '@/utils/board'
import {
  completeTask,
  createSubtask,
  createTask,
  deleteBoard,
  deleteSubtask,
  deleteTask,
  getBoardDetail,
  mergeTaskOrderAfterFilteredReorder,
  setSubtaskDone,
  taskCanComplete,
  updateSubtaskPositions,
  updateTaskPositions,
} from '@/utils/board'
import { getPartnerUserId } from '@/utils/couple'
import { getCoupleBalancesView } from '@/utils/rewards'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Haptics from 'expo-haptics'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Circle,
  FileText,
  Gift,
  GripVertical,
  ListTodo,
  Plus,
  Send,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import DraggableFlatList from 'react-native-draggable-flatlist'

function mixWithWhite(hex: string, amount: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const blend = (c: number) => Math.round(c + (255 - c) * amount)
  return `rgb(${blend(r)},${blend(g)},${blend(b)})`
}

const FILTER_KEYS = [
  { key: 'my_open' as const, label: 'For me' },
  { key: 'i_assigned_open' as const, label: 'Their turn' },
  { key: 'done' as const, label: 'Crushed' },
  { key: 'all' as const, label: 'All' },
] as const

const TASK_POINT_PRESETS = ['5', '10', '25', '50'] as const

type DraftSubtaskRow = { id: string; title: string }

function newDraftSubtaskId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

export default function BoardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const session = useSessionStore((s) => s.session)
  const { data: profile } = useProfile(session)
  const coupleId = profile?.couple_id ?? ''

  const [addTaskOpen, setAddTaskOpen] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [newTaskPoints, setNewTaskPoints] = useState('10')
  const [draftSubtasks, setDraftSubtasks] = useState<DraftSubtaskRow[]>([])
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [taskFilter, setTaskFilter] = useState<TaskListFilter>('my_open')

  const { data: board, isLoading } = useQuery({
    queryKey: ['board', id],
    queryFn: () => getBoardDetail(id!),
    enabled: !!id,
    refetchInterval: REFETCH_BOARD_MS,
    refetchIntervalInBackground: false,
  })

  const { data: balanceMembers = [] } = useQuery({
    queryKey: ['coupleBalances', coupleId],
    queryFn: () => getCoupleBalancesView(coupleId),
    enabled: !!coupleId,
    refetchInterval: REFETCH_BOARD_MS,
    refetchIntervalInBackground: false,
  })

  const myBalance = useMemo(
    () => balanceMembers.find((m) => m.id === session?.user.id)?.balance ?? 0,
    [balanceMembers, session?.user.id],
  )

  const invalidateBoard = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['board', id] })
  }, [id, queryClient])

  const invalidateBalances = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['coupleBalances', coupleId] })
  }, [coupleId, queryClient])

  const addTaskMutation = useMutation({
    mutationFn: async () => {
      const pts = Math.max(0, parseInt(newTaskPoints, 10) || 0)
      const list = board?.tasks ?? []
      const pos = list.length ? Math.max(...list.map((t) => t.position)) + 1 : 0
      const partner = getPartnerUserId(profile?.couple, session!.user.id)
      const assignee = partner ?? session!.user.id
      const task = await createTask(id!, newTaskTitle.trim(), newTaskDesc.trim() || null, pts, pos, assignee)
      const steps = draftSubtasks.map((r) => r.title.trim()).filter(Boolean)
      await Promise.all(steps.map((title, i) => createSubtask(task.id, title, i)))
      return task
    },
    onSuccess: () => {
      invalidateBoard()
      setTaskFilter('i_assigned_open')
      setAddTaskOpen(false)
      setNewTaskTitle('')
      setNewTaskDesc('')
      setNewTaskPoints('10')
      setDraftSubtasks([])
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    },
    onError: (err: Error) => Alert.alert('Oops', err.message),
  })

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => updateTaskPositions(id!, orderedIds),
    onMutate: async (mergedIds) => {
      await queryClient.cancelQueries({ queryKey: ['board', id] })
      const previous = queryClient.getQueryData<BoardDetail>(['board', id])
      if (!previous?.tasks?.length) return { previous }
      const byId = new Map(previous.tasks.map((t) => [t.id, t]))
      const nextTasks = mergedIds
        .map((tid, i) => {
          const t = byId.get(tid)
          return t ? { ...t, position: i } : null
        })
        .filter((t): t is Task => t != null)
      queryClient.setQueryData(['board', id], { ...previous, tasks: nextTasks })
      return { previous }
    },
    onError: (err: Error, _mergedIds, ctx) => {
      if (ctx?.previous != null) {
        queryClient.setQueryData(['board', id], ctx.previous)
      }
      Alert.alert('Order not saved', err.message)
    },
    onSettled: () => invalidateBoard(),
  })

  const reorderSubtasksMutation = useMutation({
    mutationFn: ({ taskId, orderedIds }: { taskId: string; orderedIds: string[] }) =>
      updateSubtaskPositions(taskId, orderedIds),
    onMutate: async ({ taskId, orderedIds }) => {
      await queryClient.cancelQueries({ queryKey: ['board', id] })
      const previous = queryClient.getQueryData<BoardDetail>(['board', id])
      const task = previous?.tasks.find((t) => t.id === taskId)
      if (!previous?.tasks?.length || !task?.subtasks?.length) return { previous }
      const bySubId = new Map(task.subtasks.map((s) => [s.id, s]))
      const nextSubs = orderedIds
        .map((sid, i) => {
          const s = bySubId.get(sid)
          return s ? { ...s, position: i } : null
        })
        .filter((s): s is Subtask => s != null)
      const nextTasks = previous.tasks.map((t) =>
        t.id === taskId ? { ...t, subtasks: nextSubs } : t,
      )
      queryClient.setQueryData(['board', id], { ...previous, tasks: nextTasks })
      return { previous }
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.previous != null) {
        queryClient.setQueryData(['board', id], ctx.previous)
      }
      Alert.alert('Steps order not saved', err.message)
    },
    onSettled: () => invalidateBoard(),
  })

  const completeMutation = useMutation({
    mutationFn: completeTask,
    onSuccess: () => {
      invalidateBoard()
      invalidateBalances()
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    },
    onError: (err: Error) => {
      const msg = err.message.includes('subtasks_incomplete')
        ? 'Check off every step first — we believe in the journey.'
        : err.message.includes('not_assignee')
          ? 'Only the person on the hook for this one can mark it done.'
          : err.message
      Alert.alert('Hold up', msg)
    },
  })

  const deleteTaskMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      invalidateBoard()
      setDetailTask(null)
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  })

  const deleteBoardMutation = useMutation({
    mutationFn: () => deleteBoard(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards'] })
      router.back()
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  })

  const createSubMutation = useMutation({
    mutationFn: () =>
      createSubtask(detailTask!.id, newSubtaskTitle.trim(), detailTask!.subtasks?.length ?? 0),
    onSuccess: () => {
      invalidateBoard()
      setNewSubtaskTitle('')
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  })

  const toggleSubMutation = useMutation({
    mutationFn: ({ subId, done }: { subId: string; done: boolean }) => setSubtaskDone(subId, done),
    onSuccess: invalidateBoard,
    onError: (err: Error) => Alert.alert('Error', err.message),
  })

  const deleteSubMutation = useMutation({
    mutationFn: deleteSubtask,
    onSuccess: invalidateBoard,
    onError: (err: Error) => Alert.alert('Error', err.message),
  })

  const accent = board?.color ?? playful.accent
  const headerTint = mixWithWhite(accent, 0.72)
  const tasks = board?.tasks ?? []
  const myId = session?.user.id ?? ''

  const nameForUser = useCallback(
    (userId: string) => {
      if (userId === myId) return 'You'
      const m = balanceMembers.find((b) => b.id === userId)
      return m?.display_name?.trim() || 'Partner'
    },
    [balanceMembers, myId],
  )

  const filteredTasks = useMemo(() => {
    if (!myId) return tasks
    switch (taskFilter) {
      case 'my_open':
        return tasks.filter((t) => t.status === 'open' && t.assigned_to === myId)
      case 'i_assigned_open':
        return tasks.filter(
          (t) => t.status === 'open' && t.created_by === myId && t.assigned_to !== myId,
        )
      case 'done':
        return tasks.filter((t) => t.status === 'done')
      case 'all':
      default:
        return tasks
    }
  }, [tasks, taskFilter, myId])

  useEffect(() => {
    if (!detailTask) return
    if (!tasks.some((t) => t.id === detailTask.id)) {
      setDetailTask(null)
    }
  }, [tasks, detailTask])

  const openDetail = useCallback(
    (t: Task) => {
      const fresh = tasks.find((x) => x.id === t.id)
      setDetailTask(fresh ?? t)
    },
    [tasks],
  )

  const syncDetailFromBoard = useMemo(() => {
    if (!detailTask) return null
    return tasks.find((x) => x.id === detailTask.id) ?? detailTask
  }, [detailTask, tasks])

  const shownTask = syncDetailFromBoard
  const detailIsAssignee = !!(shownTask && shownTask.assigned_to === myId)
  const detailIsCreator = !!(shownTask && shownTask.created_by === myId)
  const detailAssigneeName = shownTask ? nameForUser(shownTask.assigned_to) : ''
  const detailCanReorderSubtasks = !!(
    shownTask &&
    shownTask.status === 'open' &&
    (detailIsAssignee || detailIsCreator)
  )

  function confirmDeleteBoard() {
    Alert.alert('Scrap this board?', 'Every task and step on it goes poof — for real.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteBoardMutation.mutate() },
    ])
  }

  function confirmDeleteTask(t: Task) {
    Alert.alert('Lose this task?', `"${t.title}"`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteTaskMutation.mutate(t.id) },
    ])
  }

  const renderTaskCard = useCallback(
    (item: Task, opts: { drag: () => void; isActive: boolean; reorderable: boolean }) => {
      const done = item.status === 'done'
      const subTotal = item.subtasks?.length ?? 0
      const subDone = item.subtasks?.filter((s) => s.done).length ?? 0
      const assigneeLabel = nameForUser(item.assigned_to)

      const progress = subTotal > 0 ? subDone / subTotal : 0
      const card = (
        <View className="mb-3.5">
        <Pressable
          onPress={() => openDetail(item)}
          className="rounded-[18px] border border-mate-border border-l-[4px] bg-mate-surface p-4 shadow-sm"
          style={{
            opacity: opts.isActive ? 0.92 : 1,
            borderColor: done ? playful.successSoft : playful.border,
            borderLeftColor: done ? playful.success : accent,
            ...(done ? { backgroundColor: playful.successSoft } : {}),
          }}
        >
          <View className="flex-row items-start gap-2">
            {opts.reorderable ? (
              <Pressable onLongPress={opts.drag} delayLongPress={180} className="py-0.5 pr-1">
                <GripVertical size={20} color={playful.textMuted} />
              </Pressable>
            ) : (
              <View className="w-6" />
            )}
            <View className="min-w-0 flex-1">
              <Text
                className={`font-mate-semibold text-[15px] leading-[21px] ${done ? 'text-mate-text-muted line-through' : 'text-mate-text'}`}
                numberOfLines={2}
              >
                {item.title}
              </Text>
              <View className="mt-2 flex-row items-center gap-1.5">
                <UserRound size={14} color={playful.textMuted} />
                <Text className="flex-1 font-mate-medium text-[12px] text-mate-text-muted" numberOfLines={1}>
                  {assigneeLabel}
                </Text>
              </View>
            </View>
            <View
              className="flex-row items-center gap-1 rounded-full px-2 py-1"
              style={{ backgroundColor: mixWithWhite(accent, 0.82) }}
            >
              <Sparkles size={12} color={accent} />
              <Text className="font-mate-bold text-[13px]" style={{ color: accent }}>
                {item.points}
              </Text>
            </View>
          </View>
          {subTotal > 0 && (
            <View className="mt-3 gap-2">
              <View className="flex-row items-center gap-1.5">
                <ListTodo size={14} color={playful.textMuted} />
                <Text className="font-mate-medium text-xs text-mate-text-muted">
                  {subDone}/{subTotal} mini-steps
                </Text>
              </View>
              <View className="h-1.5 overflow-hidden rounded-full bg-mate-muted">
                <View
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round(progress * 100)}%`,
                    backgroundColor: done ? playful.success : accent,
                  }}
                />
              </View>
            </View>
          )}
          <View className="mt-3 flex-row items-center justify-between border-t border-mate-border/80 pt-3">
            {done ? (
              <View className="flex-row items-center gap-1.5">
                <CheckCircle2 size={14} color={playful.success} />
                <Text className="font-mate-semibold text-[13px] text-mate-success">Nailed it</Text>
              </View>
            ) : (
              <Text className="font-mate-medium text-xs text-mate-text-muted">
                {subTotal > 0 ? 'Keep going' : 'Tap to add steps'}
              </Text>
            )}
            <ChevronRight size={18} color={playful.textMuted} style={{ opacity: 0.65 }} />
          </View>
        </Pressable>
        </View>
      )

      return card
    },
    [accent, nameForUser, openDetail],
  )

  const renderDraggableRow = useCallback(
    ({ item, drag, isActive }: { item: Task; drag: () => void; isActive: boolean }) =>
      renderTaskCard(item, { drag, isActive, reorderable: true }),
    [renderTaskCard],
  )

  const listHeader = useMemo(
    () => (
      <View className="pb-3">
        <View
          className="mb-3 flex-row items-start gap-2.5 rounded-2xl border border-mate-border/90 bg-mate-surface px-3.5 py-3"
          style={{ borderLeftWidth: 3, borderLeftColor: accent }}
        >
          <Sparkles size={16} color={accent} style={{ marginTop: 1 }} />
          <Text className="flex-1 font-mate-medium text-[12px] leading-[18px] text-mate-text-muted">
            {
              "Stuff you add lands on your partner's list — you bank points when they finish. Tap a card for the play-by-play."
            }
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="flex-row items-center gap-2.5 py-1"
        >
          {FILTER_KEYS.map(({ key, label }) => (
            <Pressable
              key={key}
              onPress={() => setTaskFilter(key)}
              className={`rounded-full border px-3.5 py-2 ${taskFilter === key ? 'border-transparent' : 'border-mate-border bg-mate-surface'}`}
              style={taskFilter === key ? { backgroundColor: accent, borderColor: accent } : undefined}
            >
              <Text
                className={`font-mate-semibold text-[13px] ${taskFilter === key ? 'text-white' : 'text-mate-text'}`}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    ),
    [accent, taskFilter],
  )

  const listContentStyle = useMemo(
    () => ({
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 128,
    }),
    [],
  )

  const emptyFiltered = useMemo(
    () => (
      <View className="items-center gap-3 px-4 py-10">
        <Sparkles size={36} color={playful.accentSoft} />
        <Text className="text-center font-mate-semibold text-lg text-mate-text">
          {taskFilter === 'my_open'
            ? 'Inbox zero (for now)'
            : taskFilter === 'i_assigned_open'
              ? 'Nothing in their queue from you'
              : taskFilter === 'done'
                ? 'No wins here yet'
                : 'Nothing matches'}
        </Text>
        <Text className="text-center font-mate text-sm leading-5 text-mate-text-muted">
          {taskFilter === 'my_open'
            ? 'Switch tabs or have your partner toss something your way.'
            : 'Try another filter or hit + to send them a task.'}
        </Text>
      </View>
    ),
    [taskFilter],
  )

  const emptyAll = useMemo(
    () => (
      <View className="items-center gap-3 px-4 py-10">
        <Sparkles size={36} color={playful.accentSoft} />
        <Text className="font-mate-semibold text-lg text-mate-text">Quiet in here</Text>
        <Text className="text-center font-mate text-sm leading-5 text-mate-text-muted">
          {"Tap + and give your partner something to crush — don't forget the points."}
        </Text>
      </View>
    ),
    [],
  )

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: headerTint }}>
        <ActivityIndicator size="large" color={accent} />
      </View>
    )
  }

  if (!board) {
    return (
      <View className="flex-1 items-center justify-center bg-mate-bg px-6">
        <Text className="font-mate-semibold text-base text-mate-text">This board wandered off.</Text>
        <Pressable onPress={() => router.back()} className="mt-4 p-3.5 active:opacity-80">
          <Text className="font-mate-semibold text-mate-accent">Back to safety</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-mate-bg">
      <SafeAreaView className="border-b border-white/30 px-3 pb-3.5 pt-1" style={{ backgroundColor: headerTint }} edges={['top']}>
        <View className="flex-row items-center gap-2.5">
          <Pressable
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-xl active:opacity-90"
            style={{ backgroundColor: 'rgba(255,255,255,0.5)' }}
          >
            <ArrowLeft size={20} color={playful.text} />
          </Pressable>
          <Text className="min-w-0 flex-1 font-mate-bold text-lg text-mate-text" numberOfLines={1}>
            {board.title}
          </Text>
          <Pressable
            onPress={() => router.push('/(app)/rewards')}
            className="flex-row items-center gap-1 rounded-full border border-white/80 bg-white/55 px-3 py-2 active:opacity-90"
          >
            <Sparkles size={13} color={accent} />
            <Text className="font-mate-semibold text-[13px]" style={{ color: accent }}>
              {myBalance}
            </Text>
            <Gift size={13} color={playful.textMuted} />
          </Pressable>
          <Pressable
            onPress={confirmDeleteBoard}
            className="h-10 w-10 items-center justify-center rounded-xl active:opacity-90"
            style={{ backgroundColor: 'rgba(255,255,255,0.4)' }}
          >
            <Trash2 size={18} color={playful.textMuted} />
          </Pressable>
        </View>
      </SafeAreaView>

      <View className="flex-1">
        <DraggableFlatList
          data={filteredTasks}
          keyExtractor={(item) => item.id}
          onDragEnd={({ data }) => {
            const merged = mergeTaskOrderAfterFilteredReorder(tasks, data.map((t) => t.id))
            reorderMutation.mutate(merged)
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          }}
          activationDistance={10}
          containerStyle={{ flex: 1 }}
          contentContainerStyle={listContentStyle}
          ListHeaderComponent={listHeader}
          renderItem={renderDraggableRow}
          ListEmptyComponent={tasks.length === 0 ? emptyAll : emptyFiltered}
        />

        <Pressable
          className="absolute bottom-7 right-5 h-[56px] w-[56px] items-center justify-center rounded-full shadow-lg active:opacity-95"
          style={{
            backgroundColor: accent,
            shadowColor: accent,
            shadowOpacity: 0.32,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 5 },
            elevation: 6,
          }}
          onPress={() => {
            setNewTaskTitle('')
            setNewTaskDesc('')
            setNewTaskPoints('10')
            setDraftSubtasks([])
            setAddTaskOpen(true)
          }}
        >
          <Plus size={26} color="#fff" />
        </Pressable>
      </View>

      <Modal visible={addTaskOpen} transparent animationType="slide" onRequestClose={() => setAddTaskOpen(false)}>
        <View className="flex-1">
          <Pressable className="absolute inset-0 bg-mate-overlay" onPress={() => setAddTaskOpen(false)} />
          <KeyboardAvoidingView className="flex-1 justify-end" behavior="padding">
          <View className="max-h-[92%] overflow-hidden rounded-t-[28px] bg-mate-surface">
            <View className="items-center pt-3 pb-1">
              <View className="h-1 w-10 rounded-full bg-mate-border" />
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerClassName="px-[22px] pb-9 pt-1"
            >
              <View className="flex-row items-center gap-3">
                <View
                  className="h-[52px] w-[52px] items-center justify-center rounded-[18px] border-2 border-mate-border"
                  style={{ backgroundColor: mixWithWhite(accent, 0.82) }}
                >
                  <ListTodo size={26} color={accent} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="font-mate-bold text-[22px] text-mate-text">Send a task</Text>
                  <Text className="mt-0.5 font-mate text-sm text-mate-text-muted">They earn sparkles when it’s done</Text>
                </View>
              </View>

              <View
                className="mt-4 flex-row items-center gap-2.5 self-start rounded-full border-2 border-mate-border px-3.5 py-2.5"
                style={{ backgroundColor: mixWithWhite(accent, 0.9) }}
              >
                <UserRound size={18} color={accent} />
                <Text className="font-mate text-sm text-mate-text">
                  <Text className="font-mate-semibold">{nameForUser(getPartnerUserId(profile?.couple, session!.user.id) ?? session!.user.id)}</Text>
                  {" gets this one"}
                </Text>
              </View>

              <Text className="mb-2 mt-5 font-mate-semibold text-xs uppercase tracking-wide text-mate-text-muted">
                The mission
              </Text>
              <View className="flex-row items-stretch overflow-hidden rounded-2xl border-2 border-mate-border">
                <View className="w-[48px] items-center justify-center bg-mate-muted">
                  <ListTodo size={20} color={playful.accent} />
                </View>
                <TextInput
                  className="min-h-[52px] flex-1 px-3.5 py-3 font-mate text-base text-mate-text"
                  style={{ includeFontPadding: false, lineHeight: undefined }}
                  value={newTaskTitle}
                  onChangeText={setNewTaskTitle}
                  placeholder="Groceries, plan date night…"
                  placeholderTextColor={playful.textMuted}
                  autoFocus
                  returnKeyType="next"
                />
              </View>

              <Text className="mb-2 mt-4 font-mate-semibold text-xs uppercase tracking-wide text-mate-text-muted">
                Sneaky details
              </Text>
              <View className="flex-row items-stretch overflow-hidden rounded-2xl border-2 border-mate-border">
                <View className="w-[48px] items-start justify-start bg-mate-muted pt-3.5">
                  <View className="w-full items-center">
                    <FileText size={20} color={playful.accent} />
                  </View>
                </View>
                <TextInput
                  className="min-h-[96px] flex-1 px-3.5 py-3.5 font-mate text-base text-mate-text"
                  style={{ textAlignVertical: 'top', includeFontPadding: false }}
                  value={newTaskDesc}
                  onChangeText={setNewTaskDesc}
                  placeholder="Links, timing, inside jokes…"
                  placeholderTextColor={playful.textMuted}
                  multiline
                />
              </View>

              <View className="mt-5 flex-row items-center gap-2">
                <CheckCircle2 size={18} color={playful.success} />
                <Text className="font-mate-semibold text-sm text-mate-text">Mini-steps</Text>
              </View>
              <Text className="mt-1 font-mate text-xs text-mate-text-muted">
                Optional checklist — they’ll need every step ticked before the big points drop.
              </Text>
              <View className="mt-3 gap-2.5">
                {draftSubtasks.map((row) => (
                  <View
                    key={row.id}
                    className="flex-row items-center gap-2.5 rounded-2xl border-2 border-mate-border bg-mate-muted pl-3 pr-2"
                  >
                    <Circle size={20} color={playful.textMuted} />
                    <TextInput
                      className="min-h-[48px] flex-1 py-3 font-mate text-[15px] text-mate-text"
                      style={{ includeFontPadding: false, lineHeight: undefined }}
                      value={row.title}
                      onChangeText={(t) =>
                        setDraftSubtasks((prev) => prev.map((r) => (r.id === row.id ? { ...r, title: t } : r)))
                      }
                      placeholder="Break it into a step…"
                      placeholderTextColor={playful.textMuted}
                      returnKeyType="done"
                    />
                    <Pressable
                      hitSlop={8}
                      className="h-10 w-10 items-center justify-center rounded-xl active:opacity-70"
                      onPress={() => setDraftSubtasks((prev) => prev.filter((r) => r.id !== row.id))}
                    >
                      <Trash2 size={17} color={playful.textMuted} />
                    </Pressable>
                  </View>
                ))}
                <Pressable
                  className="flex-row items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-mate-border bg-mate-surface py-3.5 active:opacity-85"
                  onPress={() =>
                    setDraftSubtasks((prev) => [...prev, { id: newDraftSubtaskId(), title: '' }])
                  }
                >
                  <Plus size={20} color={playful.accent} />
                  <Text className="font-mate-semibold text-[15px] text-mate-accent">Add a mini-step</Text>
                </Pressable>
              </View>

              <View className="mt-5 flex-row items-center gap-2">
                <Sparkles size={18} color={playful.star} />
                <Text className="font-mate-semibold text-sm text-mate-text">Points when they crush it</Text>
              </View>
              <View className="mt-2.5 flex-row flex-wrap gap-2">
                {TASK_POINT_PRESETS.map((p) => {
                  const active = newTaskPoints === p
                  return (
                    <Pressable
                      key={p}
                      onPress={() => setNewTaskPoints(p)}
                      className={`rounded-full border-2 px-4 py-2.5 ${active ? 'border-mate-accent bg-mate-accent' : 'border-mate-border bg-mate-muted'}`}
                    >
                      <Text
                        className={`font-mate-semibold text-sm ${active ? 'text-white' : 'text-mate-text'}`}
                      >
                        {p} pts
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
                  value={newTaskPoints}
                  onChangeText={setNewTaskPoints}
                  keyboardType="number-pad"
                  placeholder="Custom amount"
                  placeholderTextColor={playful.textMuted}
                />
              </View>

              <Pressable
                className={`mt-6 flex-row items-center justify-center gap-2 rounded-2xl py-4 ${!newTaskTitle.trim() || addTaskMutation.isPending ? 'opacity-40' : 'active:opacity-90'}`}
                style={{ backgroundColor: accent }}
                disabled={!newTaskTitle.trim() || addTaskMutation.isPending}
                onPress={() => addTaskMutation.mutate()}
              >
                {addTaskMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Send size={20} color="#fff" />
                    <Text className="font-mate-semibold text-[17px] text-white">Send their way</Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={!!shownTask} transparent animationType="slide" onRequestClose={() => setDetailTask(null)}>
        <View className="flex-1">
          <Pressable className="absolute inset-0 bg-mate-overlay" onPress={() => setDetailTask(null)} />
          <KeyboardAvoidingView className="flex-1 justify-end" behavior="padding">
          {shownTask && (
            <View className="max-h-[88%] flex-1 rounded-t-[28px] bg-mate-surface px-[22px] pb-9 pt-0">
              <DraggableFlatList
                data={shownTask.subtasks ?? []}
                keyExtractor={(s) => s.id}
                keyboardShouldPersistTaps="handled"
                activationDistance={10}
                containerStyle={{ flex: 1 }}
                contentContainerStyle={{ flexGrow: 1, paddingBottom: 8 }}
                onDragEnd={({ data }) => {
                  if (!detailCanReorderSubtasks) return
                  reorderSubtasksMutation.mutate({
                    taskId: shownTask.id,
                    orderedIds: data.map((x) => x.id),
                  })
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                }}
                ListHeaderComponent={
                  <View>
                    <View className="mb-2 gap-2.5 pt-1">
                      <View
                        className="flex-row items-center gap-2 self-start rounded-full px-3.5 py-2"
                        style={{ backgroundColor: mixWithWhite(accent, 0.8) }}
                      >
                        <Sparkles size={18} color={accent} />
                        <Text className="font-mate-bold text-lg" style={{ color: accent }}>
                          {shownTask.points} pts
                        </Text>
                      </View>
                      <Text className="font-mate-bold text-[22px] leading-7 text-mate-text">{shownTask.title}</Text>
                      {shownTask.description ? (
                        <Text className="font-mate text-[15px] leading-[22px] text-mate-text-muted">
                          {shownTask.description}
                        </Text>
                      ) : null}
                      <Text className="mt-1 font-mate text-sm text-mate-text-muted">
                        {detailAssigneeName === 'You' ? (
                          <>
                            On <Text className="font-mate-semibold">your</Text> plate
                          </>
                        ) : (
                          <>
                            On <Text className="font-mate-semibold">{detailAssigneeName}</Text>
                            {"'s plate"}
                          </>
                        )}
                      </Text>
                    </View>

                    {shownTask.status === 'open' && !detailIsAssignee ? (
                      <View className="mt-3 rounded-[14px] border-2 border-mate-border bg-mate-muted p-3.5">
                        <Text className="font-mate text-sm leading-5 text-mate-text">
                          {detailAssigneeName === 'You'
                            ? "You're the only one who can tick steps and close this out."
                            : `Only ${detailAssigneeName} can tick steps and close this out.`}
                        </Text>
                      </View>
                    ) : null}

                    <Text className="mt-4 font-mate-semibold text-base text-mate-text">Mini-steps</Text>
                    <Text className="mb-2.5 font-mate text-xs text-mate-text-muted">
                      All checked off before the big points drop.
                      {detailCanReorderSubtasks ? ' Long-press the handle to reorder.' : ''}
                    </Text>
                  </View>
                }
                renderItem={({ item: s, drag, isActive }) => {
                  const canToggle = shownTask.status === 'open' && detailIsAssignee
                  const rowMuted = shownTask.status === 'open' && !detailIsAssignee ? 'opacity-75' : ''
                  const row = (
                    <View
                      className={`flex-row items-center gap-2 border-b border-mate-border py-3 ${rowMuted}`}
                      style={{ opacity: isActive ? 0.92 : 1 }}
                    >
                      {detailCanReorderSubtasks ? (
                        <Pressable onLongPress={drag} delayLongPress={180} className="py-0.5 pr-0.5">
                          <GripVertical size={20} color={playful.textMuted} />
                        </Pressable>
                      ) : (
                        <View className="w-0" />
                      )}
                      <Pressable
                        className="min-w-0 flex-1 flex-row items-center gap-3"
                        disabled={!canToggle}
                        onPress={() =>
                          canToggle && toggleSubMutation.mutate({ subId: s.id, done: !s.done })
                        }
                      >
                        {s.done ? (
                          <CheckCircle2 size={22} color={playful.success} />
                        ) : (
                          <Circle size={22} color={playful.textMuted} />
                        )}
                        <Text
                          className={`flex-1 font-mate-medium text-[15px] ${s.done ? 'text-mate-text-muted line-through' : 'text-mate-text'}`}
                        >
                          {s.title}
                        </Text>
                      </Pressable>
                      <Pressable
                        hitSlop={10}
                        onPress={() => deleteSubMutation.mutate(s.id)}
                        disabled={shownTask.status !== 'open' || (!detailIsAssignee && !detailIsCreator)}
                      >
                        <Trash2 size={16} color={playful.textMuted} />
                      </Pressable>
                    </View>
                  )
                  return row
                }}
                ListFooterComponent={
                  <View>
                    {shownTask.status === 'open' && (detailIsAssignee || detailIsCreator) && (
                      <View className="mt-3 flex-row items-center gap-2.5">
                        <TextInput
                          className="flex-1 rounded-[14px] border-2 border-mate-border p-3 font-mate text-[15px] text-mate-text"
                          style={{ includeFontPadding: false, lineHeight: undefined }}
                          value={newSubtaskTitle}
                          onChangeText={setNewSubtaskTitle}
                          placeholder="Break it into a step…"
                          placeholderTextColor={playful.textMuted}
                          returnKeyType="done"
                          onSubmitEditing={() => newSubtaskTitle.trim() && createSubMutation.mutate()}
                        />
                        <Pressable
                          className="h-11 w-11 items-center justify-center rounded-[14px] active:opacity-90"
                          style={{ backgroundColor: accent }}
                          disabled={!newSubtaskTitle.trim() || createSubMutation.isPending}
                          onPress={() => newSubtaskTitle.trim() && createSubMutation.mutate()}
                        >
                          <Plus size={20} color="#fff" />
                        </Pressable>
                      </View>
                    )}

                    {shownTask.status === 'open' && detailIsAssignee ? (
                      <Pressable
                        className="mt-5 flex-row items-center justify-center gap-2.5 rounded-2xl py-4 active:opacity-90"
                        style={{
                          backgroundColor: taskCanComplete(shownTask) ? playful.success : playful.border,
                        }}
                        disabled={!taskCanComplete(shownTask) || completeMutation.isPending}
                        onPress={() => completeMutation.mutate(shownTask.id)}
                      >
                        <Sparkles size={18} color="#fff" />
                        <Text className="font-mate-semibold text-base text-white">
                          Crush it — +{shownTask.points} pts
                        </Text>
                      </Pressable>
                    ) : null}

                    <Pressable
                      className="mb-2 mt-6 flex-row items-center justify-center gap-2 active:opacity-80"
                      onPress={() => confirmDeleteTask(shownTask)}
                    >
                      <Trash2 size={16} color={playful.danger} />
                      <Text className="font-mate-medium text-[15px] text-mate-danger">Delete this task</Text>
                    </Pressable>
                  </View>
                }
              />
            </View>
          )}
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  )
}
