/**
 * Provedor raiz: decide o modo (nuvem com Supabase ou local), mantém a
 * sessão de autenticação e expõe o DataStore correspondente ao usuário.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CloudStore } from '../data/cloudStore';
import { LocalStore } from '../data/localStore';
import { ALL_TABLES, type DataStore } from '../data/store';
import { newId } from '../services/ids';
import { isCloudConfigured, supabase } from '../services/supabase';

interface AppState {
  mode: 'local' | 'cloud';
  ready: boolean;
  session: Session | null;
  store: DataStore | null;
  signOut: () => Promise<void>;
  /** Exclui todos os dados do usuário (local) — na nuvem use a função delete-account. */
  wipeLocal: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

const LOCAL_USER_KEY = 'meu-equilibrio:local-user-id';

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [localUser, setLocalUser] = useState<string | null>(null);
  const mode: AppState['mode'] = isCloudConfigured ? 'cloud' : 'local';

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      if (mode === 'cloud') {
        const { data } = await supabase().auth.getSession();
        setSession(data.session);
        const sub = supabase().auth.onAuthStateChange((_event, s) => setSession(s));
        unsub = () => sub.data.subscription.unsubscribe();
      } else {
        let id = await AsyncStorage.getItem(LOCAL_USER_KEY);
        if (!id) {
          id = newId();
          await AsyncStorage.setItem(LOCAL_USER_KEY, id);
        }
        setLocalUser(id);
      }
      setReady(true);
    })();
    return () => unsub?.();
  }, [mode]);

  const store = useMemo<DataStore | null>(() => {
    if (mode === 'cloud') return session ? new CloudStore(supabase(), session.user.id, AsyncStorage) : null;
    return localUser ? new LocalStore(localUser, AsyncStorage, newId) : null;
  }, [mode, session, localUser]);

  const value: AppState = {
    mode,
    ready,
    session,
    store,
    signOut: async () => {
      if (mode === 'cloud') await supabase().auth.signOut();
    },
    wipeLocal: async () => {
      if (store instanceof LocalStore) await store.wipe(ALL_TABLES);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp fora do AppProvider');
  return v;
}

export function useStore(): DataStore {
  const { store } = useApp();
  if (!store) throw new Error('Armazenamento indisponível (usuário não autenticado)');
  return store;
}
