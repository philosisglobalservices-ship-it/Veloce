import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { PublicPage, PublicSite } from './components/PublicSite.tsx';
import { AuthViews } from './components/AuthViews.tsx';
import { UserPortal } from './components/UserPortal.tsx';
import { AdminConsole } from './components/AdminConsole.tsx';
import { UserRole } from './types.ts';

type AppRoute =
  | { kind: 'public'; page: PublicPage }
  | { kind: 'auth'; mode: 'login' | 'register'; planId?: string }
  | { kind: 'portal' }
  | { kind: 'admin' };

const AppRouter: React.FC = () => {
  const { user, loading } = useAuth();
  const [route, setRoute] = useState<AppRoute>({ kind: 'public', page: 'home' });

  // Automatically route signed-in user to appropriate workspace when auth initializes from session
  useEffect(() => {
    if (!loading && user && route.kind === 'auth') {
      if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
        setRoute({ kind: 'admin' });
      } else {
        setRoute({ kind: 'portal' });
      }
    }
  }, [loading, user, route.kind]);

  // If user logs out while in protected routes, return to public home
  useEffect(() => {
    if (!loading && !user && (route.kind === 'portal' || route.kind === 'admin')) {
      setRoute({ kind: 'public', page: 'home' });
    }
  }, [loading, user, route.kind]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="font-display text-xl font-bold text-slate-900">Veloce</p>
          <p className="text-xs text-slate-500 mt-1">Verifying session...</p>
        </div>
      </div>
    );
  }

  if (route.kind === 'auth') {
    return (
      <AuthViews
        mode={route.mode}
        preselectedPlanId={route.planId}
        onSwitchMode={(mode) => setRoute({ kind: 'auth', mode })}
        onBackPublic={() => setRoute({ kind: 'public', page: 'home' })}
        onAuthenticated={(signedInUser) => {
          if (signedInUser.role === UserRole.ADMIN || signedInUser.role === UserRole.SUPER_ADMIN) {
            setRoute({ kind: 'admin' });
          } else {
            setRoute({ kind: 'portal' });
          }
        }}
      />
    );
  }

  if (route.kind === 'admin' && user) {
    return (
      <AdminConsole
        onOpenUserPortal={() => setRoute({ kind: 'portal' })}
        onOpenPublic={() => setRoute({ kind: 'public', page: 'home' })}
      />
    );
  }

  if (route.kind === 'portal' && user) {
    return (
      <UserPortal
        onOpenPublic={() => setRoute({ kind: 'public', page: 'home' })}
        onOpenAdmin={() => setRoute({ kind: 'admin' })}
      />
    );
  }

  return (
    <PublicSite
      page={route.kind === 'public' ? route.page : 'home'}
      currentUser={user}
      onNavigatePublic={(page) => setRoute({ kind: 'public', page })}
      onNavigateAuth={(mode, planId) => setRoute({ kind: 'auth', mode, planId })}
      onEnterPortal={() => {
        if (user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN) {
          setRoute({ kind: 'admin' });
        } else {
          setRoute({ kind: 'portal' });
        }
      }}
    />
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
