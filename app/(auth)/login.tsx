import { playful } from '@/constants/theme'
import { signInWithGoogle } from '@/utils/auth'
import { Heart } from 'lucide-react-native'
import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'

export default function LoginScreen() {
  const [signingIn, setSigningIn] = useState(false)
  const [signInError, setSignInError] = useState<string | null>(null)

  return (
    <View className="flex-1 items-center justify-center bg-mate-bg px-8">
      <View className="mb-12 items-center gap-3.5">
        <View className="h-[88px] w-[88px] items-center justify-center rounded-[32px] border-2 border-mate-border bg-mate-surface">
          <Heart size={40} color={playful.accent} fill={playful.accentSoft} />
        </View>
        <Text className="font-mate-bold text-[38px] tracking-tight text-mate-text">MateSync</Text>
        <Text className="max-w-[300px] text-center font-mate text-base leading-6 text-mate-text-muted">
          The app for two: lists, little wins,{'\n'}and treats for each other.
        </Text>
      </View>
      {signInError ? (
        <Text className="mb-3 text-center font-mate text-sm text-red-500">{signInError}</Text>
      ) : null}
      <Pressable
        disabled={signingIn}
        onPress={async () => {
          setSignInError(null)
          setSigningIn(true)
          try {
            await signInWithGoogle()
          } catch (e) {
            setSignInError(e instanceof Error ? e.message : 'Sign in failed')
          } finally {
            setSigningIn(false)
          }
        }}
        className="w-full items-center rounded-[18px] bg-mate-text py-[17px] active:opacity-90 disabled:opacity-50"
      >
        {signingIn ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="font-mate-semibold text-base text-white">Sign in with Google</Text>
        )}
      </Pressable>
    </View>
  )
}
