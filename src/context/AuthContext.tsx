import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, getAuthToken, setAuthToken } from '../lib/api.ts';
import { AccountPlan, UserProfile, Wallet } from '../types.ts';

interface AuthContextValue {
  user: UserProfile | null;
  wallet: Wallet | null;
  plan: AccountPlan | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
  register: (payload: {
    fullName: string;
    email: string;
    handle: string;
    password: string;
    planId: string;
  }) => Promise<UserProfile>;
  logout: () => void;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [plan, setPlan] = useState<AccountPlan | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshSession = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      setWallet(null);
      setPlan(null);
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch<{ user: UserProfile; wallet: Wallet; plan: AccountPlan }>(
        '/api/auth/me'
      );
      setUser(data.user);
      setWallet(data.wallet);
      setPlan(data.plan);
    } catch {
      setAuthToken(null);
      setUser(null);
      setWallet(null);
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const login = useCallback(
    async (email: string, password: string): Promise<UserProfile> => {
      const data = await apiFetch<{ token: string; user: UserProfile; wallet: Wallet }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        }
      );
      setAuthToken(data.token);
      setUser(data.user);
      setWallet(data.wallet);
      await refreshSession();
      return data.user;
    },
    [refreshSession]
  );

  const register = useCallback(
    async (payload: {
      fullName: string;
      email: string;
      handle: string;
      password: string;
      planId: string;
    }): Promise<UserProfile> => {
      const data = await apiFetch<{ token: string; user: UserProfile; wallet: Wallet }>(
        '/api/auth/register',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      setAuthToken(data.token);
      setUser(data.user);
      setWallet(data.wallet);
      await refreshSession();
      return data.user;
    },
    [refreshSession]
  );

  const logout = useCallback(() => {
    setAuthToken(null);
    setUser(null);
    setWallet(null);
    setPlan(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        wallet,
        plan,
        loading,
        login,
        register,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
