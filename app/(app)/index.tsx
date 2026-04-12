import { SafeAreaView } from '@/components/SafeAreaView'
import { BOARD_COLORS } from '@/constants/boardColors'
import { REFETCH_BOARD_MS } from '@/constants/reactQuery'
import { playful } from '@/constants/theme'
import { useProfile } from '@/hooks/useProfile'
import { useSessionStore } from '@/stores/sessionStore'
import { createBoard, getBoardsWithPendingCounts } from '@/utils/board'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { CheckCircle2, LayoutGrid, ListTodo, Plus } from 'lucide-react-native'
import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

export default function BoardsScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const session = useSessionStore((s) => s.session)
  const { data: profile } = useProfile(session)
  const coupleId = profile?.couple_id ?? ''

  const [modalVisible, setModalVisible] = useState(false)
  const [boardTitle, setBoardTitle] = useState('')
  const [selectedColor, setSelectedColor] = useState(BOARD_COLORS[0])

  function openCreateModal() {
    setBoardTitle('')
    setSelectedColor(BOARD_COLORS[0])
    setModalVisible(true)
  }
  const closeCreateModal = () => setModalVisible(false)

  const viewerId = session?.user.id ?? ''

  const { data: boards, isLoading } = useQuery({
    queryKey: ['boards', coupleId, viewerId],
    queryFn: () => getBoardsWithPendingCounts(coupleId, viewerId),
    enabled: !!coupleId && !!viewerId,
    refetchInterval: REFETCH_BOARD_MS,
    refetchIntervalInBackground: false,
  })

  const createMutation = useMutation({
    mutationFn: () => createBoard(coupleId, boardTitle.trim(), selectedColor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards', coupleId] })
      closeCreateModal()
    },
    onError: (err: any) => Alert.alert('Error', err.message),
  })

  return (
    <SafeAreaView className="flex-1 bg-mate-bg">
      <View className="flex-row items-end justify-between px-5 pb-4 pt-2">
        <View>
          <Text className="font-mate-semibold text-xs uppercase tracking-wider text-mate-accent">
            {profile?.couple?.name ?? ''}
          </Text>
          <Text className="font-mate-bold text-3xl tracking-tight text-mate-text">Our boards</Text>
        </View>
        <TouchableOpacity
          className="h-12 w-12 items-center justify-center rounded-[18px] bg-mate-accent active:opacity-90"
          onPress={openCreateModal}
        >
          <Plus size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center gap-2.5">
          <ActivityIndicator size="large" color={playful.accent} />
        </View>
      ) : boards?.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-2.5">
          <LayoutGrid size={52} color={playful.accentSoft} />
          <Text className="mt-2 font-mate-semibold text-xl text-mate-text">Blank canvas</Text>
          <Text className="font-mate text-sm text-mate-text-muted">
            Tap + and add a board for date nights, chores, bucket lists…
          </Text>
        </View>
      ) : (
        <FlatList
          data={boards}
          keyExtractor={(b) => b.id}
          className="flex-1"
          contentContainerClassName="gap-3 p-3 pt-1"
          renderItem={({ item }) => (
            <Pressable
              className="min-h-[120px] w-full rounded-[22px] border-2 border-white/55 p-4 active:opacity-95"
              style={{
                backgroundColor: item.color,
                shadowColor: item.color,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.35,
                shadowRadius: 14,
                elevation: 6,
              }}
              onPress={() => router.push(`/(app)/board/${item.id}`)}
            >
              <View className="flex-1 justify-between">
                <View className="flex-row items-start justify-between gap-3">
                  <Text
                    className="min-w-0 flex-1 pr-1 font-mate-semibold text-[17px] leading-[22px] text-white"
                    numberOfLines={2}
                  >
                    {item.title}
                  </Text>
                  {item.pending_count > 0 ? (
                    <View className="shrink-0 items-center rounded-2xl border-2 border-white/60 bg-white/25 px-3 py-2">
                      <View className="flex-row items-center gap-1">
                        <ListTodo size={15} color="#fff" />
                        <Text className="font-mate-bold text-[20px] text-white">{item.pending_count}</Text>
                      </View>
                      <Text className="mt-0.5 font-mate-semibold text-[9px] uppercase tracking-[0.08em] text-white/85">
                        your turn
                      </Text>
                    </View>
                  ) : (
                    <View className="h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/35 bg-white/12">
                      <CheckCircle2 size={22} color="rgba(255,255,255,0.92)" />
                    </View>
                  )}
                </View>
                <Text className="mt-4 font-mate-medium text-[13px] text-white/88">
                  {item.pending_count === 0
                    ? "You're all caught up here"
                    : `${item.pending_count} thing${item.pending_count === 1 ? '' : 's'} waiting for you`}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeCreateModal}>
        <View className="flex-1">
        <Pressable className="absolute inset-0 bg-mate-overlay" onPress={closeCreateModal} />
        <KeyboardAvoidingView className="flex-1 justify-end" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View className="gap-4 rounded-t-[28px] border-2 border-mate-border border-b-0 bg-mate-surface px-6 pb-9 pt-6">
          <Text className="font-mate-bold text-[22px] text-mate-text">New board</Text>
          <TextInput
            className="rounded-2xl border-2 border-mate-border p-4 font-mate text-base text-mate-text"
            style={{ includeFontPadding: false, lineHeight: undefined }}
            value={boardTitle}
            onChangeText={setBoardTitle}
            placeholder="Weekend adventures, Home stuff…"
            placeholderTextColor="#bbb"
            autoFocus
            returnKeyType="done"
          />
          <View className="flex-row gap-3">
            {BOARD_COLORS.map((c) => (
              <Pressable
                key={c}
                className={`h-10 w-10 rounded-full ${selectedColor === c ? 'border-[3px] border-mate-text' : 'border-0'}`}
                style={{
                  backgroundColor: c,
                  transform: [{ scale: selectedColor === c ? 1.08 : 1 }],
                }}
                onPress={() => setSelectedColor(c)}
              />
            ))}
          </View>
          <View
            className="h-[72px] justify-end rounded-[18px] p-3.5"
            style={{ backgroundColor: selectedColor }}
          >
            <Text className="font-mate-semibold text-base text-white">{boardTitle || 'Preview'}</Text>
          </View>
          <Pressable
            className={`items-center rounded-2xl bg-mate-accent py-[17px] ${!boardTitle.trim() || createMutation.isPending ? 'opacity-35' : 'active:opacity-90'}`}
            onPress={() => createMutation.mutate()}
            disabled={createMutation.isPending || !boardTitle.trim()}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="font-mate-semibold text-base text-white">Add board</Text>
            )}
          </Pressable>
        </View>
        </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  )
}
