import React, { useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch, formatCurrency } from '../lib/api.ts';
import { AccountPlan } from '../types.ts';

interface AuthViewsProps {
  mode: 'login' | 'register';
  preselectedPlanId?: string;
  onSwitchMode: (mode: 'login' | 'register') => void;
  onBackPublic: () => void;
  onAuthenticated: (user: import('../types.ts').UserProfile) => void;
}

const DEMO_ACCOUNTS = [
  { label: 'Retail User (Verified)', email: 'amaka@veloce.ng', role: 'USER' },
  { label: 'Retail User (Pending KYC)', email: 'zainab@veloce.ng', role: 'USER' },
  { label: 'Operations Admin', email: 'ops@veloce.ng', role: 'ADMIN' },
  { label: 'Super Admin', email: 'admin@veloce.ng', role: 'SUPER_ADMIN' },
];

export const AuthViews: React.FC<AuthViewsProps> = ({
  mode,
  preselectedPlanId,
  onSwitchMode,
  onBackPublic,
  onAuthenticated,
}) => {
  const { login, register } = useAuth();
  const [plans, setPlans] = useState<AccountPlan[]>([]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [handle, setHandle] = useState('');
  const [planId, setPlanId] = useState(preselectedPlanId || 'plan_standard');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preselectedPlanId) {
      setPlanId(preselectedPlanId);
    }
  }, [preselectedPlanId]);

  useEffect(() => {
    apiFetch<{ accountPlans: AccountPlan[] }>('/api/public/plans')
      .then((res) => setPlans(res.accountPlans))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const signedInUser =
        mode === 'login'
          ? await login(email, password)
          : await register({
              fullName,
              email,
              handle: handle || fullName.split(' ')[0] || 'member',
              password,
              planId,
            });
      onAuthenticated(signedInUser);
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const quickLogin = async (demoEmail: string) => {
    setError(null);
    setEmail(demoEmail);
    setPassword('Veloce2026!');
    setSubmitting(true);
    try {
      const signedInUser = await login(demoEmail, 'Veloce2026!');
      onAuthenticated(signedInUser);
    } catch (err: any) {
      setError(err.message || 'Demo login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-6">
      <div className="max-w-md w-full mx-auto">
        <div className="flex items-center justify-between mb-8">
          <button
            type="button"
            onClick={onBackPublic}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Veloce
          </button>
          <span className="font-display text-lg font-bold text-slate-900">Veloce</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-8">
          <div className="mb-6">
            <h1 className="font-display text-2xl font-bold text-slate-900">
              {mode === 'login' ? 'Sign in to your account' : 'Open a Veloce account'}
            </h1>
            <p className="text-sm text-slate-600 mt-1.5">
              {mode === 'login'
                ? 'Access your Naira checking wallet, NIP transfers, savings vaults, or admin workspace.'
                : 'Create your account with an instant 10-digit NUBAN wallet and ₦2,500.00 starter balance.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="auth-name">
                    Full Legal Name
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Amaka Nwosu"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="auth-handle">
                    Veloce @handle
                  </label>
                  <input
                    id="auth-handle"
                    type="text"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="@amaka.n"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 font-mono"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="auth-email">
                Email Address
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@veloce.ng"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="auth-password">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>

            {mode === 'register' && plans.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="auth-plan">
                  Account Plan Tier
                </label>
                <select
                  id="auth-plan"
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-600"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatCurrency(p.monthlyFeeCents)}/mo · Daily {formatCurrency(p.dailyTransferLimitCents)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg transition-colors"
            >
              {submitting ? 'Authenticating...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 text-center text-sm text-slate-600">
            {mode === 'login' ? (
              <>
                Need an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    onSwitchMode('register');
                  }}
                  className="font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  Create one now
                </button>
              </>
            ) : (
              <>
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    onSwitchMode('login');
                  }}
                  className="font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>

        {/* Seeded RBAC Role Quick Access */}
        {mode === 'login' && (
          <div className="mt-6 bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-3">
              <KeyRound className="w-3.5 h-3.5 text-emerald-700" />
              <span>Demo RBAC Accounts (Password: Veloce2026!)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  disabled={submitting}
                  onClick={() => quickLogin(acc.email)}
                  className="text-left p-2.5 rounded-lg border border-slate-200 hover:border-emerald-600 hover:bg-emerald-50/40 transition-colors"
                >
                  <p className="text-xs font-semibold text-slate-900 flex items-center justify-between gap-1">
                    <span className="truncate">{acc.label}</span>
                    <Shield className="w-3 h-3 text-slate-400 shrink-0" />
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 truncate mt-0.5">{acc.email}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
