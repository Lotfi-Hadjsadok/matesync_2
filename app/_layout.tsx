import 'react-native-gesture-handler'
import '../global.css'

import {
    Fredoka_400Regular,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    useFonts,
} from '@expo-google-fonts/fredoka'
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { initializeSessionStore } from '@/stores/sessionStore'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

SplashScreen.preventAutoHideAsync().catch(() => {})

function onAppStateChange(status: AppStateStatus) {
  focusManager.setFocused(status === 'active')
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fredoka_400Regular,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
  })

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {})
  }, [fontsLoaded])

  useEffect(() => {
    initializeSessionStore().catch(() => {})
  }, [])

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            retry: 1,
          },
        },
      }),
  )

  useEffect(() => {
    const sub = AppState.addEventListener('change', onAppStateChange)
    return () => sub.remove()
  }, [])

  if (!fontsLoaded) {
    return null
  }

  return (
    <GestureHandlerRootView className="flex-1 bg-mate-bg">
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }} />
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
}
