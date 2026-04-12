import { registerExpoPushTokenAsync, syncExpoPushTokenToProfile } from '@/utils/pushNotifications'
import { useEffect } from 'react'
import { Platform } from 'react-native'

export function useMateSyncPush(userId: string | undefined) {
  useEffect(() => {
    if (!userId || Platform.OS === 'web') return

    let cancelled = false
    ;(async () => {
      const token = await registerExpoPushTokenAsync()
      if (cancelled || !token) return
      try {
        await syncExpoPushTokenToProfile(userId, token)
      } catch (e) {
        console.warn('[MateSync] user_push_tokens upsert failed:', e)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userId])
}
