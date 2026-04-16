import { supabase } from '@/utils/supabase'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

const ANDROID_CHANNEL_ID = 'matesync-default'

export type MateSyncNotifyInput =
  | { action: 'task_assigned'; taskId: string }
  | { action: 'task_completed'; taskId: string }
  | { action: 'board_created'; boardId: string }
  | { action: 'reward_created'; rewardId: string }
  | { action: 'reward_pending'; redemptionId: string }
  | { action: 'reward_approved'; redemptionId: string }
  | { action: 'reward_rejected'; redemptionId: string }

export function configureNotificationPresentation() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    }),
  })
}

export async function ensureAndroidNotificationChannel() {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'MateSync',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FFFBFC',
  })
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync()
  if (existing === 'granted') return true
  const { status } = await Notifications.requestPermissionsAsync()
  return status === 'granted'
}

function resolveExpoProjectId(): string | undefined {
  const fromEnv = process.env.EXPO_PUBLIC_EAS_PROJECT_ID
  if (fromEnv) return fromEnv
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
  return Constants.easConfig?.projectId ?? extra?.eas?.projectId
}

export async function registerExpoPushTokenAsync(): Promise<string | null> {
  if (Platform.OS === 'web') return null
  if (!Device.isDevice) return null
  const ok = await requestNotificationPermissions()
  if (!ok) return null
  await ensureAndroidNotificationChannel()
  try {
    const projectId = resolveExpoProjectId()
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {})
    return data ?? null
  } catch (e) {
    console.warn('[MateSync] Expo push token unavailable:', e)
    return null
  }
}

export async function syncExpoPushTokenToProfile(userId: string, token: string) {
  const { error } = await supabase.from('user_push_tokens').upsert(
    { user_id: userId, expo_push_token: token, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,expo_push_token' },
  )
  if (error) throw error
}

export async function removeExpoPushToken(userId: string, token: string) {
  await supabase.from('user_push_tokens').delete().eq('user_id', userId).eq('expo_push_token', token)
}

/** Fire-and-forget from UI after successful writes; errors are logged only by callers. */
export async function triggerPushNotification(input: MateSyncNotifyInput): Promise<void> {
  const { error: userError } = await supabase.auth.getUser()
  if (userError) throw userError

  const { error } = await supabase.functions.invoke('send-push-notification', { body: input })
  if (error) throw error
}
