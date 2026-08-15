import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setToken } from '../api/client';
import type { ClientSummary, User } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  /**
   * Whose data the app is currently showing. For a client this is always
   * themselves; a trainer picks a client from the roster and every module
   * screen then reads and writes on that client's behalf.
   */
  activeClient: ClientSummary | null;
  setActiveClient: (client: ClientSummary | null) => void;
  /** The clientId query parameter to send, or undefined when acting as self. */
  clientId: string | undefined;
  login: (email: string, password: string) => Promise<void>;
  registerTrainer: (email: string, password: string, fullName: string) => Promise<void>;
  registerClient: (input: {
    email: string;
    password: string;
    fullName: string;
    inviteCode: string;
    heightCm?: number;
    goal?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeClient, setActiveClient] = useState<ClientSummary | null>(null);

  // Restore the session on cold start.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { user } = await api<{ user: User }>('/api/auth/me');
        if (!cancelled) setUser(user);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const authenticate = useCallback(async (path: string, body: unknown) => {
    const { token, user } = await api<{ token: string; user: User }>(path, {
      method: 'POST',
      body,
    });
    await setToken(token);
    setUser(user);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      activeClient,
      setActiveClient,
      clientId: user?.role === 'trainer' ? activeClient?.id : undefined,
      login: (email, password) => authenticate('/api/auth/login', { email, password }),
      registerTrainer: (email, password, fullName) =>
        authenticate('/api/auth/register/trainer', { email, password, fullName }),
      registerClient: (input) => authenticate('/api/auth/register/client', input),
      logout: async () => {
        await setToken(null);
        setUser(null);
        setActiveClient(null);
      },
    }),
    [user, loading, activeClient, authenticate],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
