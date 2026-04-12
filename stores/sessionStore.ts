import { supabase } from '@/utils/supabase'
import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'

type SessionState = {
  session: Session | null
  loading: boolean
}

export const useSessionStore = create<SessionState>(() => ({
  session: null,
  loading: true,
}))

const sessionStoreGlobal = globalThis as typeof globalThis & {
  __matesyncSessionStoreInit?: Promise<void>
}

function setSessionState(session: Session | null) {
  useSessionStore.setState((state) => {
    if (state.loading === false && state.session?.access_token === session?.access_token) {
      return state
    }
    return { session, loading: false }
  })
}

export async function initializeSessionStore() {
  if (sessionStoreGlobal.__matesyncSessionStoreInit) {
    return sessionStoreGlobal.__matesyncSessionStoreInit
  }

  sessionStoreGlobal.__matesyncSessionStoreInit = (async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    setSessionState(session)

    supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSessionState(nextSession)
    })
  })()

  return sessionStoreGlobal.__matesyncSessionStoreInit
}
