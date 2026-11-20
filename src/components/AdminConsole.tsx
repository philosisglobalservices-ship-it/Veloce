import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  FileSearch,
  Layers,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Scale,
  Sliders,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  apiFetch,
  formatBpsPercent,
  formatCurrency,
  formatDateTime,
} from '../lib/api.ts';
import {
  AccountPlan,
  AccountStatus,
  AdminOverview,
  AdminUserRecord,
  AuditLogRecord,
  ContactInquiryRecord,
  DisputeRecord,
  DisputeStatus,
  KycStatus,
  SavingsPlan,
  TransactionRecord,
  UserRole,
} from '../types.ts';

type AdminTab = 'overview' | 'users' | 'plans' | 'disputes' | 'audit' | 'inquiries';

interface AdminConsoleProps {
  onOpenUserPortal: () => void;
  onOpenPublic: () => void;
}

export const AdminConsole: React.FC<AdminConsoleProps> = ({ onOpenUserPortal, onOpenPublic }) => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [accountPlans, setAccountPlans] = useState<AccountPlan[]>([]);
  const [savingsPlans, setSavingsPlans] = useState<SavingsPlan[]>([]);
  const [disputes, setDisputes] = useState<DisputeRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [inquiries, setInquiries] = useState<ContactInquiryRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // User search & filter
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('ALL');
  const [userStatusFilter, setUserStatusFilter] = useState('ALL');

  // Create User modal
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newHandle, setNewHandle] = useState('');
  const [newPassword, setNewPassword] = useState('Veloce2026!');
  const [newRole, setNewRole] = useState<UserRole>(UserRole.USER);
  const [newPlanId, setNewPlanId] = useState('plan_standard');
  const [newKycStatus, setNewKycStatus] = useState<KycStatus>(KycStatus.VERIFIED);
  const [newInitialDollars, setNewInitialDollars] = useState('50000.00');

  // Manage User modal
  const [managedUser, setManagedUser] = useState<AdminUserRecord | null>(null);
  const [managedRole, setManagedRole] = useState<UserRole>(UserRole.USER);
  const [managedKyc, setManagedKyc] = useState<KycStatus>(KycStatus.PENDING);
  const [managedStatus, setManagedStatus] = useState<AccountStatus>(AccountStatus.ACTIVE);
  const [managedPlanId, setManagedPlanId] = useState('plan_standard');
  const [adjType, setAdjType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [adjDollars, setAdjDollars] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [managedUserTxs, setManagedUserTxs] = useState<TransactionRecord[]>([]);

  // Plan editor state
  const [editingPlan, setEditingPlan] = useState<AccountPlan | null>(null);
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [planForm, setPlanForm] = useState({
    name: '',
    audience: '',
    tagline: '',
    monthlyFeeDollars: '0',
    dailyLimitDollars: '5000',
    singleLimitDollars: '2500',
    p2pFeePercent: '0',
    savingsApyPercent: '2.25',
    isActive: true,
  });

  // Savings plan editor state
  const [editingSavingsPlan, setEditingSavingsPlan] = useState<SavingsPlan | null>(null);
  const [showCreateSavingsPlan, setShowCreateSavingsPlan] = useState(false);
  const [spForm, setSpForm] = useState({
    name: '',
    description: '',
    bonusApyPercent: '0.50',
    minDepositDollars: '100',
    lockDays: '30',
    isActive: true,
  });

  // Dispute resolution notes keyed by dispute id
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});

  // Audit filter
  const [auditSearch, setAuditSearch] = useState('');

  const loadAllAdminData = useCallback(async () => {
    try {
      const [ov, usrRes, plnRes, dspRes, audRes, inqRes] = await Promise.all([
        apiFetch<AdminOverview>('/api/admin/overview'),
        apiFetch<{ users: AdminUserRecord[] }>('/api/admin/users'),
        apiFetch<{ accountPlans: AccountPlan[]; savingsPlans: SavingsPlan[] }>('/api/admin/plans'),
        apiFetch<{ disputes: DisputeRecord[] }>('/api/admin/disputes'),
        apiFetch<{ logs: AuditLogRecord[] }>('/api/admin/audit-logs'),
        apiFetch<{ inquiries: ContactInquiryRecord[] }>('/api/admin/inquiries'),
      ]);
      setOverview(ov);
      setUsers(usrRes.users);
      setAccountPlans(plnRes.accountPlans);
      setSavingsPlans(plnRes.savingsPlans);
      setDisputes(dspRes.disputes);
      setAuditLogs(audRes.logs);
      setInquiries(inqRes.inquiries);
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Failed to load administrative telemetry.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllAdminData();
  }, [loadAllAdminData]);

  // RBAC Gate
  if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-8 text-center">
          <Lock className="w-8 h-8 text-red-700 mx-auto mb-3" />
          <h1 className="font-display text-xl font-bold text-slate-900">RBAC Access Restricted</h1>
          <p className="text-sm text-slate-600 mt-2">
            Administrative governance requires <span className="font-mono">ADMIN</span> or{' '}
            <span className="font-mono">SUPER_ADMIN</span> privileges.
          </p>
          <button
            type="button"
            onClick={onOpenUserPortal}
            className="mt-6 px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg"
          >
            Return to User Portal
          </button>
        </div>
      </div>
    );
  }

  const openManageUser = async (target: AdminUserRecord) => {
    setManagedUser(target);
    setManagedRole(target.role);
    setManagedKyc(target.kycStatus);
    setManagedStatus(target.accountStatus);
    setManagedPlanId(target.planId);
    setAdjDollars('');
    setAdjReason('');
    setManagedUserTxs([]);
    try {
      const res = await apiFetch<{ transactions: TransactionRecord[] }>(
        `/api/admin/users/${target.id}/transactions`
      );
      setManagedUserTxs(res.transactions);
    } catch {
      // Ignore
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const initialBalanceCents = Math.round(parseFloat(newInitialDollars || '0') * 100);
    try {
      const res = await apiFetch<{ accountNumber: string; handle: string }>('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          fullName: newFullName,
          email: newEmail,
          handle: newHandle || newFullName.split(' ')[0],
          password: newPassword,
          role: newRole,
          planId: newPlanId,
          kycStatus: newKycStatus,
          initialBalanceCents,
        }),
      });
      setNotice({
        type: 'success',
        text: `Provisioned account ${res.handle} (${res.accountNumber}) successfully.`,
      });
      setShowCreateUser(false);
      setNewFullName('');
      setNewEmail('');
      setNewHandle('');
      await loadAllAdminData();
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Account creation failed.' });
    }
  };

  const handleSaveUserControls = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managedUser) return;
    setNotice(null);
    try {
      await apiFetch(`/api/admin/users/${managedUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: managedRole,
          kycStatus: managedKyc,
          accountStatus: managedStatus,
          planId: managedPlanId,
        }),
      });
      setNotice({ type: 'success', text: `Updated governance settings for ${managedUser.email}.` });
      setManagedUser(null);
      await loadAllAdminData();
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Failed to update user.' });
    }
  };

  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managedUser) return;
    setNotice(null);
    const amountCents = Math.round(parseFloat(adjDollars || '0') * 100);
    try {
      await apiFetch(`/api/admin/users/${managedUser.id}/adjust-balance`, {
        method: 'POST',
        body: JSON.stringify({ type: adjType, amountCents, reason: adjReason }),
      });
      setNotice({
        type: 'success',
        text: `${adjType === 'CREDIT' ? 'Credited' : 'Debited'} ${formatCurrency(amountCents)} on ${
          managedUser.handle
        }.`,
      });
      setAdjDollars('');
      setAdjReason('');
      await loadAllAdminData();
      const refreshed = await apiFetch<{ transactions: TransactionRecord[] }>(
        `/api/admin/users/${managedUser.id}/transactions`
      );
      setManagedUserTxs(refreshed.transactions);
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Balance adjustment failed.' });
    }
  };

  const startEditPlan = (plan: AccountPlan) => {
    setEditingPlan(plan);
    setShowCreatePlan(false);
    setPlanForm({
      name: plan.name,
      audience: plan.audience,
      tagline: plan.tagline,
      monthlyFeeDollars: (plan.monthlyFeeCents / 100).toString(),
      dailyLimitDollars: (plan.dailyTransferLimitCents / 100).toString(),
      singleLimitDollars: (plan.singleTransferLimitCents / 100).toString(),
      p2pFeePercent: (plan.p2pFeeBps / 100).toString(),
      savingsApyPercent: (plan.savingsApyBps / 100).toString(),
      isActive: plan.isActive,
    });
  };

  const startCreatePlan = () => {
    setEditingPlan(null);
    setShowCreatePlan(true);
    setPlanForm({
      name: '',
      audience: 'For high-volume Nigerian businesses',
      tagline: 'Custom Naira limits and treasury yield.',
      monthlyFeeDollars: '25000',
      dailyLimitDollars: '50000000',
      singleLimitDollars: '10000000',
      p2pFeePercent: '0',
      savingsApyPercent: '16.50',
      isActive: true,
    });
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const payload = {
      name: planForm.name,
      audience: planForm.audience,
      tagline: planForm.tagline,
      monthlyFeeCents: Math.round(parseFloat(planForm.monthlyFeeDollars || '0') * 100),
      dailyTransferLimitCents: Math.round(parseFloat(planForm.dailyLimitDollars || '0') * 100),
      singleTransferLimitCents: Math.round(parseFloat(planForm.singleLimitDollars || '0') * 100),
      p2pFeeBps: Math.round(parseFloat(planForm.p2pFeePercent || '0') * 100),
      savingsApyBps: Math.round(parseFloat(planForm.savingsApyPercent || '0') * 100),
      isActive: planForm.isActive,
    };

    try {
      if (editingPlan) {
        await apiFetch(`/api/admin/plans/${editingPlan.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setNotice({ type: 'success', text: `Updated ${payload.name} account tier.` });
      } else {
        await apiFetch('/api/admin/plans', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setNotice({ type: 'success', text: `Created ${payload.name} account tier.` });
      }
      setEditingPlan(null);
      setShowCreatePlan(false);
      await loadAllAdminData();
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Could not save account plan.' });
    }
  };

  const startEditSavingsPlan = (sp: SavingsPlan) => {
    setEditingSavingsPlan(sp);
    setShowCreateSavingsPlan(false);
    setSpForm({
      name: sp.name,
      description: sp.description,
      bonusApyPercent: (sp.bonusApyBps / 100).toString(),
      minDepositDollars: (sp.minDepositCents / 100).toString(),
      lockDays: sp.lockDays.toString(),
      isActive: sp.isActive,
    });
  };

  const startCreateSavingsPlan = () => {
    setEditingSavingsPlan(null);
    setShowCreateSavingsPlan(true);
    setSpForm({
      name: '',
      description: '',
      bonusApyPercent: '2.50',
      minDepositDollars: '50000',
      lockDays: '60',
      isActive: true,
    });
  };

  const handleSaveSavingsPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const payload = {
      name: spForm.name,
      description: spForm.description,
      bonusApyBps: Math.round(parseFloat(spForm.bonusApyPercent || '0') * 100),
      minDepositCents: Math.round(parseFloat(spForm.minDepositDollars || '0') * 100),
      lockDays: Math.max(0, parseInt(spForm.lockDays || '0', 10)),
      isActive: spForm.isActive,
    };

    try {
      if (editingSavingsPlan) {
        await apiFetch(`/api/admin/savings-plans/${editingSavingsPlan.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setNotice({ type: 'success', text: `Updated savings template "${payload.name}".` });
      } else {
        await apiFetch('/api/admin/savings-plans', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setNotice({ type: 'success', text: `Created savings template "${payload.name}".` });
      }
      setEditingSavingsPlan(null);
      setShowCreateSavingsPlan(false);
      await loadAllAdminData();
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Could not save savings template.' });
    }
  };

  const handleResolveDispute = async (disputeId: string, decision: 'REVERSE' | 'DISMISS') => {
    setNotice(null);
    const note = (resolutionNotes[disputeId] || '').trim();
    if (note.length < 5) {
      setNotice({ type: 'error', text: 'Enter a resolution note (minimum 5 characters) before resolving.' });
      return;
    }
    try {
      await apiFetch(`/api/admin/disputes/${disputeId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ decision, resolutionNote: note }),
      });
      setNotice({
        type: 'success',
        text:
          decision === 'REVERSE'
            ? 'Dispute approved and funds atomically reversed to sender.'
            : 'Dispute dismissed with resolution note.',
      });
      await loadAllAdminData();
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Dispute resolution failed.' });
    }
  };

  const handleMarkInquiryReviewed = async (id: string) => {
    try {
      await apiFetch(`/api/admin/inquiries/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'REVIEWED' }),
      });
      await loadAllAdminData();
    } catch {
      // Ignore
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = userSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      u.fullName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.handle.toLowerCase().includes(q) ||
      u.accountNumber.includes(q);
    const matchesRole = userRoleFilter === 'ALL' || u.role === userRoleFilter;
    const matchesStatus =
      userStatusFilter === 'ALL' ||
      u.accountStatus === userStatusFilter ||
      u.kycStatus === userStatusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const filteredLogs = auditLogs.filter((l) => {
    const q = auditSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      l.actorEmail.toLowerCase().includes(q) ||
      l.action.toLowerCase().includes(q) ||
      l.targetId.toLowerCase().includes(q) ||
      l.detailsJson.toLowerCase().includes(q)
    );
  });

  const navItems: { id: AdminTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'overview', label: 'Platform Overview', icon: <Layers className="w-4 h-4" /> },
    { id: 'users', label: 'Users & Accounts', icon: <Users className="w-4 h-4" /> },
    { id: 'plans', label: 'Plans & Yield Rules', icon: <Sliders className="w-4 h-4" /> },
    {
      id: 'disputes',
      label: 'Disputes & Reversals',
      icon: <Scale className="w-4 h-4" />,
      badge: overview?.openDisputesCount || 0,
    },
    { id: 'audit', label: 'Audit Logs', icon: <FileSearch className="w-4 h-4" /> },
    {
      id: 'inquiries',
      label: 'Public Inquiries',
      icon: <MessageSquare className="w-4 h-4" />,
      badge: overview?.openInquiriesCount || 0,
    },
  ];

  const tabLabels: Record<AdminTab, string> = {
    overview: 'Platform Overview',
    users: 'Users & Account Provisioning',
    plans: 'Plans & Yield Rules',
    disputes: 'Disputes & Reversals',
    audit: 'Immutable Audit Logs',
    inquiries: 'Public Inquiries',
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Admin Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-slate-900 text-slate-200 shrink-0">
        <div className="h-16 px-6 flex items-center justify-between border-b border-slate-800">
          <button
            type="button"
            onClick={onOpenPublic}
            className="font-display text-lg font-bold text-white tracking-tight"
          >
            Veloce
          </button>
          <span className="text-xs font-mono text-emerald-400">Governance</span>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === item.id
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3">
                {item.icon}
                <span>{item.label}</span>
              </span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="font-mono text-xs font-semibold text-amber-300">{item.badge}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-3">
          <button
            type="button"
            onClick={onOpenUserPortal}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Wallet className="w-3.5 h-3.5" />
            My Banking Wallet
          </button>
          <div className="text-xs px-1">
            <p className="font-semibold text-white truncate">{user.fullName}</p>
            <p className="font-mono text-[11px] text-slate-400 truncate">
              {user.role} · {user.email}
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative w-64 bg-slate-900 text-slate-200 h-full flex flex-col z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800">
              <span className="font-display text-lg font-bold text-white">Veloce Governance</span>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-4 space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium rounded-lg ${
                    activeTab === item.id ? 'bg-emerald-600 text-white' : 'text-slate-300'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={onOpenUserPortal}
                className="mt-4 w-full py-2.5 text-xs font-semibold text-slate-900 bg-white rounded-lg"
              >
                My Banking Wallet
              </button>
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-600"
              aria-label="Open admin menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm text-slate-500 truncate">
              <span>Admin Console</span>
              <span className="mx-2 text-slate-300">/</span>
              <span className="font-medium text-slate-900">{tabLabels[activeTab]}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onOpenUserPortal}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg whitespace-nowrap"
            >
              <Wallet className="w-3.5 h-3.5" />
              User Wallet
            </button>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 max-w-6xl w-full mx-auto space-y-6">
          {notice && (
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between gap-4 text-sm ${
                notice.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {notice.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{notice.text}</span>
              </div>
              <button type="button" onClick={() => setNotice(null)} className="text-xs opacity-70">
                Dismiss
              </button>
            </div>
          )}

          {loading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
                ))}
              </div>
              <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
            </div>
          ) : (
            <>
              {/* ADMIN OVERVIEW */}
              {activeTab === 'overview' && overview && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <p className="text-xs font-medium text-slate-500">Total Platform Liquidity</p>
                      <p className="font-mono tabular-nums text-2xl font-semibold text-slate-900 mt-1.5">
                        {formatCurrency(overview.totalLiquidityCents)}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500 mt-2">
                        Checking {formatCurrency(overview.totalCheckingCents)}
                      </p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <p className="text-xs font-medium text-slate-500">Registered Accounts</p>
                      <p className="font-mono tabular-nums text-2xl font-semibold text-slate-900 mt-1.5">
                        {overview.totalUsers}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-2">
                        {overview.activeUsers} active · {overview.frozenUsers} frozen
                      </p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <p className="text-xs font-medium text-slate-500">Compliance Queue</p>
                      <p className="font-mono tabular-nums text-2xl font-semibold text-amber-700 mt-1.5">
                        {overview.pendingKycCount + overview.openDisputesCount}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-2">
                        {overview.pendingKycCount} KYC · {overview.openDisputesCount} disputes
                      </p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <p className="text-xs font-medium text-slate-500">24h Ledger Volume</p>
                      <p className="font-mono tabular-nums text-2xl font-semibold text-emerald-700 mt-1.5">
                        {formatCurrency(overview.volume24hCents)}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-2">
                        Savings pool {formatCurrency(overview.totalSavingsCents)}
                      </p>
                    </div>
                  </div>

                  {/* Quick Governance Actions */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
                    <div className="text-sm text-slate-700">
                      <span className="font-semibold text-slate-900">Administrative Controls:</span> Provision new
                      accounts, edit live transfer ceilings, or resolve disputes.
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('users');
                          setShowCreateUser(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Create Account
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('disputes')}
                        className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:border-slate-300"
                      >
                        Review Disputes ({overview.openDisputesCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('plans')}
                        className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:border-slate-300"
                      >
                        Configure Plans
                      </button>
                    </div>
                  </div>

                  {/* Recent Audit Trail */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="font-display text-lg font-bold text-slate-900">Recent Audit Activity</h2>
                      <button
                        type="button"
                        onClick={() => setActiveTab('audit')}
                        className="text-xs font-semibold text-emerald-700"
                      >
                        Full audit log →
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-xs text-slate-500">
                            <th className="py-2.5 pr-4 font-medium">Action</th>
                            <th className="py-2.5 pr-4 font-medium">Actor</th>
                            <th className="py-2.5 pr-4 font-medium">Target</th>
                            <th className="py-2.5 font-medium text-right">Timestamp</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {overview.recentAuditLogs.map((log) => (
                            <tr key={log.id}>
                              <td className="py-2.5 pr-4 font-mono text-xs font-semibold text-slate-900">
                                {log.action}
                              </td>
                              <td className="py-2.5 pr-4 text-xs text-slate-600">
                                {log.actorEmail} · <span className="font-mono">{log.actorRole}</span>
                              </td>
                              <td className="py-2.5 pr-4 font-mono text-xs text-slate-500">
                                {log.targetType} ({log.targetId})
                              </td>
                              <td className="py-2.5 text-right font-mono text-xs text-slate-500 whitespace-nowrap">
                                {formatDateTime(log.createdAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* USERS & PROVISIONING TAB */}
              {activeTab === 'users' && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="font-display text-xl font-bold text-slate-900">
                        User Accounts & RBAC Governance
                      </h2>
                      <p className="text-xs text-slate-500">
                        Create accounts, manage KYC status, freeze/unfreeze wallets, assign roles, and adjust balances
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCreateUser(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                    >
                      <UserPlus className="w-4 h-4" />
                      Create New Account
                    </button>
                  </div>

                  {/* Filters */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
                    <input
                      type="search"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Search name, email, @handle, NUBAN..."
                      className="flex-1 min-w-[220px] px-3.5 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                    <select
                      value={userRoleFilter}
                      onChange={(e) => setUserRoleFilter(e.target.value)}
                      className="px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="ALL">All Roles</option>
                      <option value="USER">USER</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                    </select>
                    <select
                      value={userStatusFilter}
                      onChange={(e) => setUserStatusFilter(e.target.value)}
                      className="px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="ALL">All States</option>
                      <option value="ACTIVE">Active Accounts</option>
                      <option value="FROZEN">Frozen Accounts</option>
                      <option value="PENDING">Pending KYC</option>
                      <option value="VERIFIED">Verified KYC</option>
                    </select>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/60 text-xs text-slate-500">
                            <th className="py-3 px-4 font-medium">Account Holder</th>
                            <th className="py-3 px-4 font-medium">Role & Plan</th>
                            <th className="py-3 px-4 font-medium">KYC / Status</th>
                            <th className="py-3 px-4 font-medium text-right">Checking</th>
                            <th className="py-3 px-4 font-medium text-right">Savings</th>
                            <th className="py-3 px-4 font-medium text-right">Controls</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredUsers.map((u) => (
                            <tr key={u.id} className="hover:bg-slate-50/70">
                              <td className="py-3 px-4">
                                <p className="font-semibold text-slate-900">{u.fullName}</p>
                                <p className="font-mono text-xs text-slate-500">
                                  {u.email} · {u.handle} · {u.accountNumber}
                                </p>
                              </td>
                              <td className="py-3 px-4 text-xs">
                                <p className="font-mono font-semibold text-slate-900">{u.role}</p>
                                <p className="text-slate-500">{u.planName || u.planId} Tier</p>
                              </td>
                              <td className="py-3 px-4 text-xs">
                                <p
                                  className={`font-semibold ${
                                    u.kycStatus === KycStatus.VERIFIED
                                      ? 'text-emerald-700'
                                      : u.kycStatus === KycStatus.REJECTED
                                      ? 'text-red-700'
                                      : 'text-amber-700'
                                  }`}
                                >
                                  KYC: {u.kycStatus}
                                </p>
                                <p
                                  className={`font-medium ${
                                    u.accountStatus === AccountStatus.FROZEN ? 'text-red-700' : 'text-slate-600'
                                  }`}
                                >
                                  {u.accountStatus}
                                </p>
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                                {formatCurrency(u.checkingBalanceCents)}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                                {formatCurrency(u.savingsBalanceCents)}
                              </td>
                              <td className="py-3 px-4 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => openManageUser(u)}
                                  className="px-3 py-1.5 text-xs font-semibold text-slate-900 border border-slate-200 hover:border-emerald-600 rounded-lg"
                                >
                                  Manage
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* PLANS & YIELD RULES TAB */}
              {activeTab === 'plans' && (
                <div className="space-y-8">
                  {/* Account Plans */}
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h2 className="font-display text-xl font-bold text-slate-900">Account Plan Tiers</h2>
                        <p className="text-xs text-slate-500">
                          Changes apply live to transfer limits, fee rates, and the public Plans page
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={startCreatePlan}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                      >
                        <Plus className="w-4 h-4" />
                        New Account Tier
                      </button>
                    </div>

                    {(editingPlan || showCreatePlan) && (
                      <form
                        onSubmit={handleSavePlan}
                        className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
                      >
                        <h3 className="font-display text-base font-bold text-slate-900">
                          {editingPlan ? `Edit ${editingPlan.name} Tier` : 'Create New Account Tier'}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Tier Name</label>
                            <input
                              type="text"
                              required
                              value={planForm.name}
                              onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Target Audience</label>
                            <input
                              type="text"
                              required
                              value={planForm.audience}
                              onChange={(e) => setPlanForm({ ...planForm, audience: e.target.value })}
                              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Monthly Fee (NGN ₦)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              required
                              value={planForm.monthlyFeeDollars}
                              onChange={(e) => setPlanForm({ ...planForm, monthlyFeeDollars: e.target.value })}
                              className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Daily Transfer Limit (NGN ₦)
                            </label>
                            <input
                              type="number"
                              step="1"
                              min="1000"
                              required
                              value={planForm.dailyLimitDollars}
                              onChange={(e) => setPlanForm({ ...planForm, dailyLimitDollars: e.target.value })}
                              className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Single Transfer Max (NGN ₦)
                            </label>
                            <input
                              type="number"
                              step="1"
                              min="1000"
                              required
                              value={planForm.singleLimitDollars}
                              onChange={(e) => setPlanForm({ ...planForm, singleLimitDollars: e.target.value })}
                              className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Base Savings APY (%)
                            </label>
                            <input
                              type="number"
                              step="0.05"
                              min="0"
                              required
                              value={planForm.savingsApyPercent}
                              onChange={(e) => setPlanForm({ ...planForm, savingsApyPercent: e.target.value })}
                              className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">P2P Fee (%)</label>
                            <input
                              type="number"
                              step="0.05"
                              min="0"
                              required
                              value={planForm.p2pFeePercent}
                              onChange={(e) => setPlanForm({ ...planForm, p2pFeePercent: e.target.value })}
                              className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-slate-700 mb-1">Tagline</label>
                            <input
                              type="text"
                              required
                              value={planForm.tagline}
                              onChange={(e) => setPlanForm({ ...planForm, tagline: e.target.value })}
                              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-2">
                          <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={planForm.isActive}
                              onChange={(e) => setPlanForm({ ...planForm, isActive: e.target.checked })}
                            />
                            Tier active and available for selection
                          </label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPlan(null);
                                setShowCreatePlan(false);
                              }}
                              className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                            >
                              Save Tier Rules
                            </button>
                          </div>
                        </div>
                      </form>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {accountPlans.map((p) => (
                        <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
                          <div>
                            <div className="flex items-baseline justify-between">
                              <h3 className="font-display text-lg font-bold text-slate-900">{p.name}</h3>
                              <span className="font-mono text-sm font-semibold">
                                {formatCurrency(p.monthlyFeeCents)}/mo
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {p.isActive ? 'Active Tier' : 'Archived'} · {p.audience}
                            </p>
                            <dl className="mt-4 space-y-1.5 text-xs text-slate-600">
                              <div className="flex justify-between">
                                <dt>Daily limit</dt>
                                <dd className="font-mono text-slate-900">
                                  {formatCurrency(p.dailyTransferLimitCents)}
                                </dd>
                              </div>
                              <div className="flex justify-between">
                                <dt>Single limit</dt>
                                <dd className="font-mono text-slate-900">
                                  {formatCurrency(p.singleTransferLimitCents)}
                                </dd>
                              </div>
                              <div className="flex justify-between">
                                <dt>P2P fee</dt>
                                <dd className="font-mono text-slate-900">{formatBpsPercent(p.p2pFeeBps)}</dd>
                              </div>
                              <div className="flex justify-between">
                                <dt>Base APY</dt>
                                <dd className="font-mono text-emerald-700 font-semibold">
                                  {formatBpsPercent(p.savingsApyBps)}
                                </dd>
                              </div>
                            </dl>
                          </div>
                          <button
                            type="button"
                            onClick={() => startEditPlan(p)}
                            className="mt-4 w-full py-2 text-xs font-semibold text-slate-900 border border-slate-200 hover:border-emerald-600 rounded-lg"
                          >
                            Edit Limits & Yield
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Savings Plan Templates */}
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h2 className="font-display text-xl font-bold text-slate-900">Savings Plan Templates</h2>
                        <p className="text-xs text-slate-500">
                          Configure bonus APY rules, term lengths, and minimum initial deposits for member vaults
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={startCreateSavingsPlan}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-emerald-700 rounded-lg"
                      >
                        <Plus className="w-4 h-4" />
                        New Savings Template
                      </button>
                    </div>

                    {(editingSavingsPlan || showCreateSavingsPlan) && (
                      <form
                        onSubmit={handleSaveSavingsPlan}
                        className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
                      >
                        <h3 className="font-display text-base font-bold text-slate-900">
                          {editingSavingsPlan ? `Edit ${editingSavingsPlan.name}` : 'Create Savings Plan Template'}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Template Name</label>
                            <input
                              type="text"
                              required
                              value={spForm.name}
                              onChange={(e) => setSpForm({ ...spForm, name: e.target.value })}
                              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Bonus APY (%)</label>
                            <input
                              type="number"
                              step="0.05"
                              min="0"
                              required
                              value={spForm.bonusApyPercent}
                              onChange={(e) => setSpForm({ ...spForm, bonusApyPercent: e.target.value })}
                              className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Min Deposit (NGN ₦)</label>
                            <input
                              type="number"
                              step="1"
                              min="0"
                              required
                              value={spForm.minDepositDollars}
                              onChange={(e) => setSpForm({ ...spForm, minDepositDollars: e.target.value })}
                              className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Lock Term (Days)</label>
                            <input
                              type="number"
                              min="0"
                              required
                              value={spForm.lockDays}
                              onChange={(e) => setSpForm({ ...spForm, lockDays: e.target.value })}
                              className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                            <input
                              type="text"
                              required
                              value={spForm.description}
                              onChange={(e) => setSpForm({ ...spForm, description: e.target.value })}
                              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSavingsPlan(null);
                              setShowCreateSavingsPlan(false);
                            }}
                            className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg"
                          >
                            Save Savings Template
                          </button>
                        </div>
                      </form>
                    )}

                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/60 text-xs text-slate-500">
                            <th className="py-3 px-4 font-medium">Template</th>
                            <th className="py-3 px-4 font-medium">Description</th>
                            <th className="py-3 px-4 font-medium text-right">Bonus APY</th>
                            <th className="py-3 px-4 font-medium text-right">Min Deposit</th>
                            <th className="py-3 px-4 font-medium text-right">Term</th>
                            <th className="py-3 px-4 font-medium text-right">Edit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {savingsPlans.map((sp) => (
                            <tr key={sp.id}>
                              <td className="py-3 px-4 font-semibold text-slate-900">{sp.name}</td>
                              <td className="py-3 px-4 text-xs text-slate-600">{sp.description}</td>
                              <td className="py-3 px-4 text-right font-mono text-emerald-700 font-semibold">
                                +{formatBpsPercent(sp.bonusApyBps)}
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-slate-900">
                                {formatCurrency(sp.minDepositCents)}
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-slate-600">
                                {sp.lockDays === 0 ? 'Liquid' : `${sp.lockDays}d`}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => startEditSavingsPlan(sp)}
                                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                                >
                                  Configure
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* DISPUTES & REVERSALS TAB */}
              {activeTab === 'disputes' && (
                <div className="space-y-4">
                  <div>
                    <h2 className="font-display text-xl font-bold text-slate-900">Disputes & Ledger Reversals</h2>
                    <p className="text-xs text-slate-500">
                      Review member-flagged transactions and execute atomic compensating reversal entries
                    </p>
                  </div>

                  {disputes.length === 0 ? (
                    <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                      No transaction disputes recorded.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {disputes.map((d) => (
                        <div key={d.id} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <p className="font-mono text-xs text-slate-500">
                                {d.referenceCode} · Opened {formatDateTime(d.createdAt)}
                              </p>
                              <h3 className="font-display text-lg font-bold text-slate-900 mt-1">
                                {formatCurrency(d.amountCents)} — {d.openedByName} → {d.recipientName || 'Recipient'}
                              </h3>
                              <p className="text-sm text-slate-700 mt-2">{d.reason}</p>
                            </div>
                            <span
                              className={`text-xs font-semibold px-2.5 py-1 rounded border ${
                                d.status === DisputeStatus.OPEN
                                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                                  : d.status === DisputeStatus.REVERSED
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                  : 'bg-slate-100 border-slate-200 text-slate-700'
                              }`}
                            >
                              {d.status}
                            </span>
                          </div>

                          {d.status === DisputeStatus.OPEN ? (
                            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
                              <input
                                type="text"
                                value={resolutionNotes[d.id] || ''}
                                onChange={(e) =>
                                  setResolutionNotes({ ...resolutionNotes, [d.id]: e.target.value })
                                }
                                placeholder="Enter compliance resolution note (required)..."
                                className="flex-1 px-3.5 py-2 text-sm border border-slate-200 rounded-lg"
                              />
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleResolveDispute(d.id, 'REVERSE')}
                                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                                >
                                  Reverse Funds
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleResolveDispute(d.id, 'DISMISS')}
                                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg"
                                >
                                  Dismiss
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="pt-3 border-t border-slate-100 text-xs text-slate-600">
                              <span className="font-semibold text-slate-900">Resolution Note:</span>{' '}
                              {d.resolutionNote}{' '}
                              {d.resolvedAt && (
                                <span className="font-mono text-slate-400 ml-2">
                                  ({formatDateTime(d.resolvedAt)})
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* AUDIT LOGS TAB */}
              {activeTab === 'audit' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="font-display text-xl font-bold text-slate-900">Immutable Audit Logs</h2>
                      <p className="text-xs text-slate-500">
                        Chronological trace of authentication, account provisioning, KYC, freezes, and ledger reversals
                      </p>
                    </div>
                    <input
                      type="search"
                      value={auditSearch}
                      onChange={(e) => setAuditSearch(e.target.value)}
                      placeholder="Filter action, actor, target..."
                      className="px-3.5 py-2 text-sm border border-slate-200 rounded-lg w-full sm:w-64"
                    />
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs text-slate-500">
                          <th className="py-2.5 pr-4 font-medium">Timestamp</th>
                          <th className="py-2.5 pr-4 font-medium">Action</th>
                          <th className="py-2.5 pr-4 font-medium">Actor</th>
                          <th className="py-2.5 pr-4 font-medium">Target</th>
                          <th className="py-2.5 font-medium">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredLogs.map((l) => (
                          <tr key={l.id} className="hover:bg-slate-50/70">
                            <td className="py-2.5 pr-4 font-mono text-xs text-slate-500 whitespace-nowrap">
                              {formatDateTime(l.createdAt)}
                            </td>
                            <td className="py-2.5 pr-4 font-mono text-xs font-semibold text-slate-900">
                              {l.action}
                            </td>
                            <td className="py-2.5 pr-4 text-xs text-slate-700">
                              {l.actorEmail} <span className="font-mono text-slate-400">({l.actorRole})</span>
                            </td>
                            <td className="py-2.5 pr-4 font-mono text-xs text-slate-600">
                              {l.targetType}:{l.targetId}
                            </td>
                            <td className="py-2.5 font-mono text-[11px] text-slate-500 max-w-xs truncate">
                              {l.detailsJson}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* PUBLIC INQUIRIES TAB */}
              {activeTab === 'inquiries' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div>
                    <h2 className="font-display text-xl font-bold text-slate-900">Public Contact Inquiries</h2>
                    <p className="text-xs text-slate-500">Messages submitted via the public Contact desk</p>
                  </div>
                  {inquiries.length === 0 ? (
                    <p className="text-sm text-slate-500 py-8 text-center">No inquiries received yet.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {inquiries.map((inq) => (
                        <div key={inq.id} className="py-4 flex flex-wrap items-start justify-between gap-4">
                          <div className="max-w-2xl">
                            <p className="text-xs font-mono text-slate-500">
                              {inq.topic} · {formatDateTime(inq.createdAt)}
                            </p>
                            <p className="font-semibold text-slate-900 mt-0.5">
                              {inq.fullName} <span className="font-mono text-xs font-normal text-slate-500">({inq.email})</span>
                            </p>
                            <p className="text-sm text-slate-700 mt-1.5">{inq.message}</p>
                          </div>
                          <div>
                            {inq.status === 'NEW' ? (
                              <button
                                type="button"
                                onClick={() => handleMarkInquiryReviewed(inq.id)}
                                className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-emerald-700 rounded-lg"
                              >
                                Mark Reviewed
                              </button>
                            ) : (
                              <span className="text-xs font-semibold text-emerald-700">REVIEWED</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* CREATE NEW USER MODAL */}
      {showCreateUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 my-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold text-slate-900">Provision New Account</h3>
              <button type="button" onClick={() => setShowCreateUser(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    placeholder="Kemi Adebayo"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Handle</label>
                  <input
                    type="text"
                    value={newHandle}
                    onChange={(e) => setNewHandle(e.target.value)}
                    placeholder="@kemi.a"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="kemi@veloce.ng"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Initial Password</label>
                  <input
                    type="text"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">RBAC Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value={UserRole.USER}>USER</option>
                    {user.role === UserRole.SUPER_ADMIN && <option value={UserRole.ADMIN}>ADMIN</option>}
                    {user.role === UserRole.SUPER_ADMIN && (
                      <option value={UserRole.SUPER_ADMIN}>SUPER_ADMIN</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Plan Tier</label>
                  <select
                    value={newPlanId}
                    onChange={(e) => setNewPlanId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {accountPlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">KYC Status</label>
                  <select
                    value={newKycStatus}
                    onChange={(e) => setNewKycStatus(e.target.value as KycStatus)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value={KycStatus.VERIFIED}>VERIFIED</option>
                    <option value={KycStatus.PENDING}>PENDING</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Opening Checking Balance (NGN ₦)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newInitialDollars}
                  onChange={(e) => setNewInitialDollars(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateUser(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                >
                  Provision Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANAGE USER MODAL */}
      {managedUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 my-8 space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">{managedUser.fullName}</h3>
                <p className="font-mono text-xs text-slate-500">
                  {managedUser.email} · {managedUser.handle} · NUBAN {managedUser.accountNumber}
                </p>
              </div>
              <button type="button" onClick={() => setManagedUser(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Governance Settings */}
            <form onSubmit={handleSaveUserControls} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">KYC Verification Status</label>
                  <select
                    value={managedKyc}
                    onChange={(e) => setManagedKyc(e.target.value as KycStatus)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value={KycStatus.PENDING}>PENDING</option>
                    <option value={KycStatus.VERIFIED}>VERIFIED</option>
                    <option value={KycStatus.REJECTED}>REJECTED</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Account Freeze State</label>
                  <select
                    value={managedStatus}
                    disabled={managedUser.id === user.id}
                    onChange={(e) => setManagedStatus(e.target.value as AccountStatus)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white disabled:opacity-60"
                  >
                    <option value={AccountStatus.ACTIVE}>ACTIVE</option>
                    <option value={AccountStatus.FROZEN}>FROZEN</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Account Plan Tier</label>
                  <select
                    value={managedPlanId}
                    onChange={(e) => setManagedPlanId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {accountPlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">RBAC Role</label>
                  <select
                    value={managedRole}
                    disabled={user.role !== UserRole.SUPER_ADMIN || managedUser.id === user.id}
                    onChange={(e) => setManagedRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white disabled:opacity-60"
                  >
                    <option value={UserRole.USER}>USER</option>
                    <option value={UserRole.ADMIN}>ADMIN</option>
                    <option value={UserRole.SUPER_ADMIN}>SUPER_ADMIN</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Save Account Governance
              </button>
            </form>

            {/* Balance Adjustment */}
            <form onSubmit={handleAdjustBalance} className="pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-display text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <ArrowLeftRight className="w-4 h-4 text-emerald-700" />
                  Manual Balance Adjustment
                </h4>
                <span className="font-mono text-xs text-slate-600">
                  Checking: {formatCurrency(managedUser.checkingBalanceCents)}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={adjType}
                  onChange={(e) => setAdjType(e.target.value as 'CREDIT' | 'DEBIT')}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="CREDIT">Credit (+)</option>
                  <option value="DEBIT">Debit (-)</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={adjDollars}
                  onChange={(e) => setAdjDollars(e.target.value)}
                  placeholder="Amount (NGN ₦)"
                  className="px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                />
                <input
                  type="text"
                  required
                  minLength={5}
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="Mandatory audit reason..."
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
              >
                Execute Audited Adjustment
              </button>
            </form>

            {/* User Recent Transactions */}
            <div className="pt-4 border-t border-slate-100">
              <h4 className="font-display text-sm font-bold text-slate-900 mb-2">Recent User Ledger</h4>
              {managedUserTxs.length === 0 ? (
                <p className="text-xs text-slate-500">No ledger entries for this user.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 text-xs">
                  {managedUserTxs.slice(0, 8).map((tx) => (
                    <div key={tx.id} className="py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-slate-700">
                          {tx.referenceCode} · {tx.type}
                        </p>
                        <p className="text-slate-500 truncate">{tx.note}</p>
                      </div>
                      <span className="font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {formatCurrency(tx.amountCents)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
