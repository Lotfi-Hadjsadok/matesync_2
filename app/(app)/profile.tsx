import { SafeAreaView } from '@/components/SafeAreaView'
import { playful } from '@/constants/theme'
import { useProfile } from '@/hooks/useProfile'
import { useSessionStore } from '@/stores/sessionStore'
import { signOutUser } from '@/utils/auth'
import { useQueryClient } from '@tanstack/react-query'
import { Copy, Heart, LogOut } from 'lucide-react-native'
import { Alert, Pressable, ScrollView, Text, View } from 'react-native'

export default function ProfileScreen() {
  const session = useSessionStore((s) => s.session)
  const { data: profile } = useProfile(session)
  const queryClient = useQueryClient()

  async function signOut() {
    await signOutUser()
    queryClient.clear()
  }

  function showInviteCode() {
    Alert.alert(
      'Your invite code',
      `Send this to your person:\n\n${profile?.couple?.invite_code}\n\nThey’ll paste it when they open MateSync to hop into your duo.`,
      [{ text: 'Nice', style: 'default' }],
    )
  }

  const initial = (profile?.display_name ?? session?.user.email ?? '?')[0].toUpperCase()
  const hasPartner = !!profile?.couple?.partner_id

  return (
    <SafeAreaView className="flex-1 bg-mate-bg">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-6 pb-10 pt-2"
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center gap-1.5 py-3">
          <View className="mb-1 h-[84px] w-[84px] items-center justify-center rounded-full border-2 border-mate-border bg-mate-muted">
            <Text className="font-mate-bold text-[34px] text-mate-accent">{initial}</Text>
          </View>
          <Text className="font-mate-semibold text-[21px] text-mate-text">{profile?.display_name ?? 'You'}</Text>
          <Text className="font-mate text-sm text-mate-text-muted">{session?.user.email}</Text>
        </View>

        {profile?.couple && (
          <View className="gap-3.5 rounded-[22px] border-2 border-mate-border bg-mate-surface p-5">
            <View className="flex-row items-center gap-2">
              <Heart size={18} color={playful.accent} fill={playful.accentSoft} />
              <Text className="font-mate-semibold text-lg text-mate-text">{profile.couple.name}</Text>
            </View>

            <View className="flex-row items-center gap-2">
              <View
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: hasPartner ? playful.success : playful.star }}
              />
              <Text className="font-mate text-sm text-mate-text-muted">
                {hasPartner ? "Partner's in" : 'Still waiting on them…'}
              </Text>
            </View>

            {!hasPartner && (
              <Pressable className="gap-2.5" onPress={showInviteCode}>
                <View className="items-center rounded-2xl border-2 border-mate-border bg-mate-muted px-5 py-3">
                  <Text className="font-mate-bold text-[26px] tracking-[6px] text-mate-text">
                    {profile.couple.invite_code}
                  </Text>
                </View>
                <View className="flex-row items-center justify-center gap-1.5">
                  <Copy size={15} color={playful.accent} />
                  <Text className="font-mate-semibold text-[13px] text-mate-accent">Tap for the full invite spiel</Text>
                </View>
              </Pressable>
            )}
          </View>
        )}

        <Pressable
          className="flex-row items-center justify-center gap-2.5 rounded-[18px] border-2 border-mate-border bg-mate-surface py-[17px] active:opacity-90"
          onPress={signOut}
        >
          <LogOut size={17} color={playful.accent} />
          <Text className="font-mate-semibold text-[15px] text-mate-accent">Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}
