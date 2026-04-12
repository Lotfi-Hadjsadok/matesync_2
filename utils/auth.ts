import { useSessionStore } from '@/stores/sessionStore'
import { supabase } from '@/utils/supabase'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { Platform } from 'react-native'

WebBrowser.maybeCompleteAuthSession()

export const googleOAuthRedirectUri = 'matesync://auth/callback'

export async function createSessionFromUrl(url: string) {
  const { queryParams } = Linking.parse(url)
  const err = queryParams?.error
  if (err) {
    throw new Error(String(queryParams?.error_description ?? err))
  }

  const code = queryParams?.code
  if (typeof code === 'string') {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) throw error
    return data.session
  }

  const access_token = queryParams?.access_token
  const refresh_token = queryParams?.refresh_token
  if (typeof access_token === 'string' && typeof refresh_token === 'string') {
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    })
    if (error) throw error
    return data.session
  }

  const hash = url.includes('#') ? url.split('#')[1] : null
  if (hash) {
    const params = new URLSearchParams(hash)
    const at = params.get('access_token')
    const rt = params.get('refresh_token')
    if (at && rt) {
      const { data, error } = await supabase.auth.setSession({
        access_token: at,
        refresh_token: rt,
      })
      if (error) throw error
      return data.session
    }
  }

  return null
}

/** Clears in-memory session first so layout guards can navigate away, then drops local auth storage. */
export async function signOutUser() {
  useSessionStore.setState({ session: null, loading: false })
  await supabase.auth.signOut({ scope: 'local' })
}

export async function signInWithGoogle() {
  if (Platform.OS === 'web') {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : ''
    const redirectTo = `${origin}/auth/callback`
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    })
    if (error) throw error
    if (data.url && typeof window !== 'undefined') {
      window.location.href = data.url
    }
    return null
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: googleOAuthRedirectUri,
      skipBrowserRedirect: true,
    },
  })
  if (error) throw error
  if (!data.url) throw new Error('No OAuth URL returned')

  const result = await WebBrowser.openAuthSessionAsync(
    data.url,
    googleOAuthRedirectUri
  )

  if (result.type === 'success' && result.url) {
    return createSessionFromUrl(result.url)
  }

  return null
}
