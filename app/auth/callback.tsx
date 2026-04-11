import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { supabase } from '@/utils/supabase'

function firstParam(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v
}

export default function AuthCallbackScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{
    code?: string | string[]
    error?: string | string[]
  }>()
  const code = firstParam(params.code)
  const oauthError = firstParam(params.error)

  useEffect(() => {
    async function run() {
      if (oauthError) {
        router.replace('/')
        return
      }
      if (!code) {
        router.replace('/')
        return
      }
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        router.replace('/')
        return
      }
      router.replace('/welcome')
    }
    run()
  }, [code, oauthError, router])

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  )
}
