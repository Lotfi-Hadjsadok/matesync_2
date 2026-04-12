import { playful } from '@/constants/theme'
import { useSessionStore } from '@/stores/sessionStore'
import { Redirect, Stack } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'

export default function OnboardingLayout() {
  const session = useSessionStore((s) => s.session)
  const sessionLoading = useSessionStore((s) => s.loading)

  if (sessionLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-mate-bg">
        <ActivityIndicator size="large" color={playful.accent} />
      </View>
    )
  }
  if (!session) {
    return <Redirect href="/login" />
  }

  return <Stack screenOptions={{ headerShown: false }} />
}
