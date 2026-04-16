import { fonts, playful } from '@/constants/theme'
import { useMateSyncPush } from '@/hooks/useMateSyncPush'
import { useSessionStore } from '@/stores/sessionStore'
import { Redirect, Tabs } from 'expo-router'
import { Gift, LayoutGrid, UserCircle } from 'lucide-react-native'
import { ActivityIndicator, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function AppLayout() {
  const session = useSessionStore((s) => s.session)
  const sessionLoading = useSessionStore((s) => s.loading)
  const insets = useSafeAreaInsets()

  useMateSyncPush(session?.user?.id)

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

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: playful.surface,
          borderTopColor: playful.border,
          borderTopWidth: 2,
          height: 62 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
        },
        tabBarActiveTintColor: playful.accent,
        tabBarInactiveTintColor: playful.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontFamily: fonts.semi },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Boards',
          tabBarIcon: ({ color, size }) => <LayoutGrid size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="rewards"
        options={{
          title: 'Treats',
          tabBarIcon: ({ color, size }) => <Gift size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Us',
          tabBarIcon: ({ color, size }) => <UserCircle size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="board/[id]" options={{ href: null }} />
    </Tabs>
  )
}
