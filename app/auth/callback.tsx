import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { supabase } from '@/utils/supabase'

export default function AuthCallbackScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{
    code?: string | string[]
    error?: string | string[]
  }>()
  const code = Array.isArray(params.code) ? params.code[0] : params.code
  const oauthError = Array.isArray(params.error) ? params.error[0] : params.error

  useEffect(() => {
    async function run() {
      if (oauthError) {
        router.replace('/login')
        return
      }
      if (!code) {
        router.replace('/login')
        return
      }
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        router.replace('/login')
        return
      }
      router.replace('/')
    }
    run()
  }, [code, oauthError, router])

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  )
}
