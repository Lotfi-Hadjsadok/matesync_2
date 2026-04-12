import { playful } from '@/constants/theme'
import { createCouple, joinCouple } from '@/utils/couple'
import { signOutUser } from '@/utils/auth'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Heart, LogOut, Mail, Sparkles } from 'lucide-react-native'
import { useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native'

export default function OnboardingScreen() {
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [coupleName, setCoupleName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const queryClient = useQueryClient()

  async function handleCreate() {
    setLoading(true)
    try {
      await createCouple(coupleName.trim())
      await queryClient.invalidateQueries({ queryKey: ['profile'] })
      router.replace('/(app)')
    } catch (err: any) {
      Alert.alert('Error', err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    setLoading(true)
    try {
      await joinCouple(inviteCode.trim())
      await queryClient.invalidateQueries({ queryKey: ['profile'] })
      router.replace('/(app)')
    } catch (err: any) {
      Alert.alert('Error', err.message)
    } finally {
      setLoading(false)
    }
  }

  async function signOut() {
    await signOutUser()
    queryClient.clear()
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-mate-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow justify-center gap-7 px-7"
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center gap-3">
          <View className="h-20 w-20 items-center justify-center rounded-[28px] border-2 border-mate-border bg-mate-surface">
            <Heart size={36} color={playful.accent} fill={playful.accentSoft} />
          </View>
          <Text className="font-mate-bold text-[28px] tracking-tight text-mate-text">Set up your duo</Text>
          <Text className="text-center font-mate text-[15px] leading-[22px] text-mate-text-muted">
            Start fresh together, or drop in with{'\n'}the code your partner sent you.
          </Text>
        </View>

        <View className="flex-row rounded-[18px] border-2 border-mate-border bg-mate-muted p-1.5">
          {(['create', 'join'] as const).map((t) => (
            <Pressable
              key={t}
              className={`flex-1 items-center rounded-[14px] py-3 ${tab === t ? 'bg-mate-surface shadow-sm' : ''}`}
              onPress={() => setTab(t)}
            >
              <View className="flex-row items-center gap-2">
                {t === 'create' ? (
                  <Sparkles size={16} color={tab === t ? playful.text : playful.textMuted} />
                ) : (
                  <Mail size={16} color={tab === t ? playful.text : playful.textMuted} />
                )}
                <Text
                  className={`font-mate-medium text-[15px] ${tab === t ? 'font-mate-semibold text-mate-text' : 'text-mate-text-muted'}`}
                >
                  {t === 'create' ? 'New space' : 'I have a code'}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        {tab === 'create' ? (
          <View className="gap-3">
            <Text className="font-mate-semibold text-[13px] uppercase tracking-wide text-mate-text-muted">
              What should we call you two?
            </Text>
            <TextInput
              className="rounded-2xl border-2 border-mate-border bg-mate-surface p-4 font-mate text-base text-mate-text"
              style={{ includeFontPadding: false, lineHeight: undefined }}
              value={coupleName}
              onChangeText={setCoupleName}
              placeholder="e.g. Sam & Riley"
              placeholderTextColor="#bbb"
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
            <Text className="font-mate text-[13px] text-mate-text-muted">
              {"We'll give you a code to share — only one of you needs to sign up first."}
            </Text>
            <Pressable
              className={`mt-1 items-center rounded-2xl bg-mate-accent py-[17px] ${!coupleName.trim() || loading ? 'opacity-35' : 'active:opacity-90'}`}
              onPress={handleCreate}
              disabled={loading || !coupleName.trim()}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="font-mate-semibold text-base text-white">Create our MateSync</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <View className="gap-3">
            <Text className="font-mate-semibold text-[13px] uppercase tracking-wide text-mate-text-muted">
              {"Partner's code"}
            </Text>
            <TextInput
              className="rounded-2xl border-2 border-mate-border bg-mate-surface p-4 text-center font-mate-bold text-[26px] tracking-[8px] text-mate-text"
              style={{ includeFontPadding: false, lineHeight: undefined }}
              value={inviteCode}
              onChangeText={(t) => setInviteCode(t.toUpperCase())}
              placeholder="A1B2C3"
              placeholderTextColor="#bbb"
              autoCapitalize="characters"
              maxLength={6}
              keyboardType="default"
              returnKeyType="done"
              onSubmitEditing={handleJoin}
            />
            <Text className="font-mate text-[13px] text-mate-text-muted">
              {"Text them — it's the 6 letters they see on Profile."}
            </Text>
            <Pressable
              className={`mt-1 items-center rounded-2xl bg-mate-accent py-[17px] ${inviteCode.length < 6 || loading ? 'opacity-35' : 'active:opacity-90'}`}
              onPress={handleJoin}
              disabled={loading || inviteCode.length < 6}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="font-mate-semibold text-base text-white">Join my person</Text>
              )}
            </Pressable>
          </View>
        )}

        <Pressable
          className={`mt-2 flex-row items-center justify-center gap-2.5 rounded-[18px] border-2 border-mate-border bg-mate-surface py-[17px] ${loading ? 'opacity-35' : 'active:opacity-90'}`}
          onPress={signOut}
          disabled={loading}
        >
          <LogOut size={17} color={playful.accent} />
          <Text className="font-mate-semibold text-[15px] text-mate-accent">Sign out</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
