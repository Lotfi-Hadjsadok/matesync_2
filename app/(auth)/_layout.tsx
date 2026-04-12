import { playful } from '@/constants/theme'
import { useProfile } from '@/hooks/useProfile'
import { useSessionStore } from '@/stores/sessionStore'
import { Redirect, Stack } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'

export default function AuthLayout() {
  const session = useSessionStore((s) => s.session)
  const sessionLoading = useSessionStore((s) => s.loading)
  const { data: profile, isLoading: profileLoading } = useProfile(session)

  if (sessionLoading || (session && profileLoading)) {
    return (
      <View className="flex-1 items-center justify-center bg-mate-bg">
        <ActivityIndicator size="large" color={playful.accent} />
      </View>
    )
  }

  if (session) {
    return <Redirect href={profile?.couple_id ? '/(app)' : '/onboarding'} />
  }

  return <Stack screenOptions={{ headerShown: false }} />
}
