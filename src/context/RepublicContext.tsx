import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as api from '@/lib/api';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'republica:selected';

interface RepublicState {
  loading: boolean;
  republics: api.Republic[];
  current: api.Republic | null;
  members: api.Member[];
  activeMembers: api.Member[];
  categories: api.Category[];
  isAdmin: boolean;
  userId: string | null;
  memberName: (userId: string | null) => string;
  select: (republicId: string) => Promise<void>;
  refresh: () => Promise<void>;
  /** Incrementa quando contas mudam, para as telas recarregarem. */
  billsVersion: number;
  bumpBills: () => void;
}

const RepublicContext = createContext<RepublicState | null>(null);

export function RepublicProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [loading, setLoading] = useState(true);
  const [republics, setRepublics] = useState<api.Republic[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [members, setMembers] = useState<api.Member[]>([]);
  const [categories, setCategories] = useState<api.Category[]>([]);
  const [billsVersion, setBillsVersion] = useState(0);
  // Para qual usuário os dados atuais foram carregados. Evita um render "sem república"
  // logo após o login, antes do efeito de carregamento rodar.
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);

  const loadDetails = useCallback(async (republicId: string) => {
    const [m, c] = await Promise.all([api.listMembers(republicId), api.listCategories(republicId)]);
    setMembers(m);
    setCategories(c);
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) {
      setRepublics([]);
      setCurrentId(null);
      setLoading(false);
      setLoadedFor(null);
      return;
    }
    setLoading(true);
    try {
      const list = await api.listMyRepublics(userId);
      setRepublics(list);
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      const chosen = list.find((r) => r.id === saved)?.id ?? list[0]?.id ?? null;
      setCurrentId(chosen);
      if (chosen) await loadDetails(chosen);
    } finally {
      setLoading(false);
      setLoadedFor(userId);
    }
  }, [userId, loadDetails]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const select = useCallback(
    async (republicId: string) => {
      await AsyncStorage.setItem(STORAGE_KEY, republicId);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<RepublicState>(() => {
    const current = republics.find((r) => r.id === currentId) ?? null;
    const byId = new Map(members.map((m) => [m.userId, m]));
    return {
      loading: loading || loadedFor !== userId,
      republics,
      current,
      members,
      activeMembers: members.filter((m) => m.active),
      categories,
      isAdmin: current?.role === 'admin',
      userId,
      memberName: (id) => {
        if (!id) return '—';
        const m = byId.get(id);
        if (!m) return 'Ex-morador';
        return id === userId ? `${m.name} (você)` : m.active ? m.name : `${m.name} (saiu)`;
      },
      select,
      refresh,
      billsVersion,
      bumpBills: () => setBillsVersion((v) => v + 1),
    };
  }, [loading, loadedFor, republics, currentId, members, categories, userId, select, refresh, billsVersion]);

  return <RepublicContext.Provider value={value}>{children}</RepublicContext.Provider>;
}

export function useRepublic() {
  const ctx = useContext(RepublicContext);
  if (!ctx) throw new Error('useRepublic fora do RepublicProvider');
  return ctx;
}
