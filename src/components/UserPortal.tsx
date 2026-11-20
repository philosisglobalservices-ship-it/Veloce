import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Copy,
  Download,
  Flag,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  PiggyBank,
  Plus,
  Receipt,
  Send,
  Settings,
  Shield,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  apiFetch,
  formatBpsPercent,
  formatCurrency,
  formatDateTime,
  formatShortDate,
} from '../lib/api.ts';
import {
  AccountPlan,
  AccountStatus,
  BankingOverview,
  DisputeStatus,
  KycStatus,
  PaymentRequestRecord,
  PaymentRequestStatus,
  SavingsPlan,
  SavingsVault,
  TransactionRecord,
  TransactionType,
  UserRole,
} from '../types.ts';

type PortalTab = 'overview' | 'transfers' | 'vaults' | 'transactions' | 'settings';
type TransferSubTab = 'send' | 'request' | 'queue' | 'deposit';

interface RecipientSuggestion {
  id: string;
  fullName: string;
  email: string;
  handle: string;
  accountNumber: string;
  kycStatus: KycStatus;
  accountStatus: AccountStatus;
}

interface UserPortalProps {
  onOpenPublic: () => void;
  onOpenAdmin: () => void;
}

export const UserPortal: React.FC<UserPortalProps> = ({ onOpenPublic, onOpenAdmin }) => {
  const { user, logout, refreshSession } = useAuth();
  const [activeTab, setActiveTab] = useState<PortalTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [overview, setOverview] = useState<BankingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bannerNotice, setBannerNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Transfers state
  const [transferSubTab, setTransferSubTab] = useState<TransferSubTab>('send');
  const [recipientQuery, setRecipientQuery] = useState('');
  const [suggestions, setSuggestions] = useState<RecipientSuggestion[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<RecipientSuggestion | null>(null);
  const [transferDollars, setTransferDollars] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferReceipt, setTransferReceipt] = useState<{ referenceCode: string; amountCents: number } | null>(
    null
  );

  // Payment request creation & queue
  const [reqTargetQuery, setReqTargetQuery] = useState('');
  const [reqDollars, setReqDollars] = useState('');
  const [reqNote, setReqNote] = useState('');
  const [requests, setRequests] = useState<PaymentRequestRecord[]>([]);
  const [reqLoading, setReqLoading] = useState(false);

  // Deposit state
  const [depositDollars, setDepositDollars] = useState('25000.00');
  const [depositSource, setDepositSource] = useState('NIBSS Instant Payment (NIP)');

  // Vaults state
  const [vaults, setVaults] = useState<SavingsVault[]>([]);
  const [savingsPlans, setSavingsPlans] = useState<SavingsPlan[]>([]);
  const [newVaultName, setNewVaultName] = useState('');
  const [newVaultPlanId, setNewVaultPlanId] = useState('');
  const [newVaultTarget, setNewVaultTarget] = useState('500000');
  const [newVaultInitial, setNewVaultInitial] = useState('25000');
  const [showNewVaultForm, setShowNewVaultForm] = useState(false);
  const [vaultMoveId, setVaultMoveId] = useState<string | null>(null);
  const [vaultMoveDirection, setVaultMoveDirection] = useState<'TO_VAULT' | 'TO_CHECKING'>('TO_VAULT');
  const [vaultMoveDollars, setVaultMoveDollars] = useState('');

  // Transactions & Dispute state
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [txFilter, setTxFilter] = useState('ALL');
  const [txSearch, setTxSearch] = useState('');
  const [txLoading, setTxLoading] = useState(false);
  const [disputeTx, setDisputeTx] = useState<TransactionRecord | null>(null);
  const [disputeReason, setDisputeReason] = useState('');

  // Settings & Plans state
  const [publicPlans, setPublicPlans] = useState<AccountPlan[]>([]);
  const [kycName, setKycName] = useState(user?.fullName || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const loadOverview = useCallback(async () => {
    try {
      const data = await apiFetch<BankingOverview>('/api/banking/overview');
      setOverview(data);
      setVaults(data.vaults);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load account overview.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    setReqLoading(true);
    try {
      const data = await apiFetch<{ requests: PaymentRequestRecord[] }>('/api/banking/requests');
      setRequests(data.requests);
    } catch {
      // Ignore transient
    } finally {
      setReqLoading(false);
    }
  }, []);

  const loadVaults = useCallback(async () => {
    try {
      const data = await apiFetch<{ vaults: SavingsVault[]; savingsPlans: SavingsPlan[] }>('/api/banking/vaults');
      setVaults(data.vaults);
      setSavingsPlans(data.savingsPlans);
      if (!newVaultPlanId && data.savingsPlans.length > 0) {
        setNewVaultPlanId(data.savingsPlans[0].id);
      }
    } catch {
      // Ignore
    }
  }, [newVaultPlanId]);

  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const params = new URLSearchParams({ type: txFilter, q: txSearch });
      const data = await apiFetch<{ transactions: TransactionRecord[] }>(
        `/api/banking/transactions?${params.toString()}`
      );
      setTransactions(data.transactions);
    } catch {
      // Ignore
    } finally {
      setTxLoading(false);
    }
  }, [txFilter, txSearch]);

  useEffect(() => {
    loadOverview();
    loadRequests();
    loadVaults();
    apiFetch<{ accountPlans: AccountPlan[] }>('/api/public/plans')
      .then((res) => setPublicPlans(res.accountPlans))
      .catch(() => {});
  }, [loadOverview, loadRequests, loadVaults]);

  useEffect(() => {
    if (activeTab === 'transactions') {
      loadTransactions();
    }
  }, [activeTab, loadTransactions]);

  useEffect(() => {
    if (user?.fullName) setKycName(user.fullName);
  }, [user?.fullName]);

  // Recipient autocomplete lookup
  useEffect(() => {
    const query = recipientQuery.trim();
    if (query.length < 2 || (selectedRecipient && query === selectedRecipient.handle)) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      apiFetch<{ recipients: RecipientSuggestion[] }>(
        `/api/banking/recipient-lookup?q=${encodeURIComponent(query)}`
      )
        .then((res) => setSuggestions(res.recipients))
        .catch(() => setSuggestions([]));
    }, 180);
    return () => clearTimeout(timer);
  }, [recipientQuery, selectedRecipient]);

  const copyValue = (label: string, val: string) => {
    navigator.clipboard?.writeText(val).catch(() => {});
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 1600);
  };

  const handleSendTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setBannerNotice(null);
    setTransferReceipt(null);
    const amountCents = Math.round(parseFloat(transferDollars || '0') * 100);
    const identifier = selectedRecipient?.handle || recipientQuery.trim();
    if (!identifier || !Number.isFinite(amountCents) || amountCents <= 0) {
      setBannerNotice({ type: 'error', text: 'Enter a valid recipient and transfer amount.' });
      return;
    }

    setTransferSubmitting(true);
    try {
      const res = await apiFetch<{ referenceCode: string; message: string }>('/api/banking/transfer', {
        method: 'POST',
        body: JSON.stringify({
          recipientIdentifier: identifier,
          amountCents,
          note: transferNote,
        }),
      });
      setTransferReceipt({ referenceCode: res.referenceCode, amountCents });
      setBannerNotice({ type: 'success', text: `Transfer settled · Ref ${res.referenceCode}` });
      setTransferDollars('');
      setTransferNote('');
      setRecipientQuery('');
      setSelectedRecipient(null);
      await Promise.all([loadOverview(), refreshSession(), loadTransactions()]);
    } catch (err: any) {
      setBannerNotice({ type: 'error', text: err.message || 'Transfer failed.' });
    } finally {
      setTransferSubmitting(false);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setBannerNotice(null);
    const amountCents = Math.round(parseFloat(reqDollars || '0') * 100);
    if (!reqTargetQuery.trim() || !Number.isFinite(amountCents) || amountCents <= 0) {
      setBannerNotice({ type: 'error', text: 'Provide payer @handle/email and a positive amount.' });
      return;
    }
    setTransferSubmitting(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/banking/requests', {
        method: 'POST',
        body: JSON.stringify({
          payerIdentifier: reqTargetQuery.trim(),
          amountCents,
          note: reqNote,
        }),
      });
      setBannerNotice({ type: 'success', text: res.message });
      setReqTargetQuery('');
      setReqDollars('');
      setReqNote('');
      await loadRequests();
      setTransferSubTab('queue');
    } catch (err: any) {
      setBannerNotice({ type: 'error', text: err.message || 'Failed to send request.' });
    } finally {
      setTransferSubmitting(false);
    }
  };

  const handleRequestAction = async (id: string, action: 'ACCEPT' | 'DECLINE' | 'CANCEL') => {
    setBannerNotice(null);
    try {
      await apiFetch(`/api/banking/requests/${id}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      setBannerNotice({
        type: 'success',
        text:
          action === 'ACCEPT'
            ? 'Payment request settled and transferred.'
            : action === 'DECLINE'
            ? 'Payment request declined.'
            : 'Payment request cancelled.',
      });
      await Promise.all([loadRequests(), loadOverview(), refreshSession()]);
    } catch (err: any) {
      setBannerNotice({ type: 'error', text: err.message || 'Could not process payment request.' });
    }
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBannerNotice(null);
    const amountCents = Math.round(parseFloat(depositDollars || '0') * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setBannerNotice({ type: 'error', text: 'Enter a valid deposit amount.' });
      return;
    }
    setTransferSubmitting(true);
    try {
      const res = await apiFetch<{ referenceCode: string }>('/api/banking/deposit', {
        method: 'POST',
        body: JSON.stringify({ amountCents, source: depositSource }),
      });
      setBannerNotice({
        type: 'success',
        text: `Deposited ${formatCurrency(amountCents)} to Checking · Ref ${res.referenceCode}`,
      });
      await Promise.all([loadOverview(), refreshSession(), loadTransactions()]);
    } catch (err: any) {
      setBannerNotice({ type: 'error', text: err.message || 'Deposit failed.' });
    } finally {
      setTransferSubmitting(false);
    }
  };

  const handleCreateVault = async (e: React.FormEvent) => {
    e.preventDefault();
    setBannerNotice(null);
    const targetCents = Math.round(parseFloat(newVaultTarget || '0') * 100);
    const initialDepositCents = Math.round(parseFloat(newVaultInitial || '0') * 100);
    try {
      await apiFetch('/api/banking/vaults', {
        method: 'POST',
        body: JSON.stringify({
          name: newVaultName,
          savingsPlanId: newVaultPlanId,
          targetCents,
          initialDepositCents,
        }),
      });
      setBannerNotice({ type: 'success', text: `Savings vault "${newVaultName}" created.` });
      setNewVaultName('');
      setShowNewVaultForm(false);
      await Promise.all([loadVaults(), loadOverview(), refreshSession()]);
    } catch (err: any) {
      setBannerNotice({ type: 'error', text: err.message || 'Could not create savings vault.' });
    }
  };

  const handleVaultMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultMoveId) return;
    setBannerNotice(null);
    const amountCents = Math.round(parseFloat(vaultMoveDollars || '0') * 100);
    try {
      await apiFetch(`/api/banking/vaults/${vaultMoveId}/move`, {
        method: 'POST',
        body: JSON.stringify({ direction: vaultMoveDirection, amountCents }),
      });
      setBannerNotice({
        type: 'success',
        text:
          vaultMoveDirection === 'TO_VAULT'
            ? `Allocated ${formatCurrency(amountCents)} to savings vault.`
            : `Withdrew ${formatCurrency(amountCents)} back to checking.`,
      });
      setVaultMoveId(null);
      setVaultMoveDollars('');
      await Promise.all([loadVaults(), loadOverview(), refreshSession()]);
    } catch (err: any) {
      setBannerNotice({ type: 'error', text: err.message || 'Vault move failed.' });
    }
  };

  const handleOpenDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeTx) return;
    setBannerNotice(null);
    try {
      await apiFetch('/api/banking/disputes', {
        method: 'POST',
        body: JSON.stringify({ transactionId: disputeTx.id, reason: disputeReason }),
      });
      setBannerNotice({
        type: 'success',
        text: `Dispute opened for ${disputeTx.referenceCode}. Compliance review initiated.`,
      });
      setDisputeTx(null);
      setDisputeReason('');
      await Promise.all([loadTransactions(), loadOverview()]);
    } catch (err: any) {
      setBannerNotice({ type: 'error', text: err.message || 'Could not file dispute.' });
    }
  };

  const handleChangePlan = async (planId: string) => {
    setBannerNotice(null);
    try {
      await apiFetch('/api/banking/plan', {
        method: 'POST',
        body: JSON.stringify({ planId }),
      });
      setBannerNotice({ type: 'success', text: 'Account plan tier updated.' });
      await Promise.all([loadOverview(), refreshSession()]);
    } catch (err: any) {
      setBannerNotice({ type: 'error', text: err.message || 'Could not switch plan.' });
    }
  };

  const handleUpdateKyc = async (e: React.FormEvent) => {
    e.preventDefault();
    setBannerNotice(null);
    try {
      await apiFetch('/api/banking/kyc', {
        method: 'POST',
        body: JSON.stringify({ fullName: kycName }),
      });
      setBannerNotice({ type: 'success', text: 'Identity profile updated.' });
      await Promise.all([loadOverview(), refreshSession()]);
    } catch (err: any) {
      setBannerNotice({ type: 'error', text: err.message || 'Could not update profile.' });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBannerNotice(null);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setBannerNotice({ type: 'success', text: 'Password updated successfully.' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setBannerNotice({ type: 'error', text: err.message || 'Password change failed.' });
    }
  };

  const exportCsv = () => {
    const header = ['Reference', 'Date', 'Type', 'Sender', 'Recipient', 'Amount NGN', 'Fee NGN', 'Status', 'Note'];
    const lines = transactions.map((t) => [
      t.referenceCode,
      t.createdAt,
      t.type,
      t.senderHandle || 'External',
      t.recipientHandle || 'Internal',
      (t.amountCents / 100).toFixed(2),
      (t.feeCents / 100).toFixed(2),
      t.status,
      `"${t.note.replace(/"/g, '""')}"`,
    ]);
    const csv = [header.join(','), ...lines.map((l) => l.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `veloce-statement-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;
  const activeUser = overview?.user || user;
  const activeWallet = overview?.wallet;
  const activePlan = overview?.plan;
  const dailySent = overview?.dailySentCents || 0;
  const dailyLimit = activePlan?.dailyTransferLimitCents || 50000000;
  const limitPct = Math.min(100, Math.round((dailySent / dailyLimit) * 100));

  const navItems: { id: PortalTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    {
      id: 'transfers',
      label: 'Send & Request',
      icon: <Send className="w-4 h-4" />,
      count: overview?.pendingIncomingRequests || 0,
    },
    { id: 'vaults', label: 'Savings Vaults', icon: <PiggyBank className="w-4 h-4" /> },
    { id: 'transactions', label: 'Transactions', icon: <Receipt className="w-4 h-4" /> },
    { id: 'settings', label: 'Account & Plan', icon: <Settings className="w-4 h-4" /> },
  ];

  const tabTitles: Record<PortalTab, string> = {
    overview: 'Overview',
    transfers: 'Send & Request Money',
    vaults: 'Savings Vaults',
    transactions: 'Ledger & Statements',
    settings: 'Account & Plan Settings',
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-white border-r border-slate-200 shrink-0">
        <div className="h-16 px-6 flex items-center justify-between border-b border-slate-200">
          <button
            type="button"
            onClick={onOpenPublic}
            className="font-display text-lg font-bold text-slate-900 tracking-tight"
          >
            Veloce
          </button>
          <span className="text-xs font-mono text-slate-500">Banking</span>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === item.id
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-3">
                {item.icon}
                <span>{item.label}</span>
              </span>
              {item.count !== undefined && item.count > 0 && (
                <span className="font-mono text-xs font-semibold text-emerald-700">{item.count}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3">
          {isAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="w-full flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Shield className="w-3.5 h-3.5" />
              Switch to Admin Console
            </button>
          )}
          <div className="text-xs text-slate-600 px-1">
            <p className="font-semibold text-slate-900 truncate">{activeUser?.fullName}</p>
            <p className="font-mono text-[11px] text-slate-500 truncate">
              {activeUser?.handle} · {activeUser?.role}
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-900/40" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative w-64 bg-white h-full border-r border-slate-200 flex flex-col z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
              <span className="font-display text-lg font-bold text-slate-900">Veloce</span>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-500">
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
                    activeTab === item.id ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                  {item.count !== undefined && item.count > 0 && (
                    <span className="font-mono text-xs font-semibold text-emerald-700">{item.count}</span>
                  )}
                </button>
              ))}
              {isAdmin && (
                <button
                  type="button"
                  onClick={onOpenAdmin}
                  className="mt-4 w-full flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-lg"
                >
                  <Shield className="w-3.5 h-3.5" />
                  Admin Console
                </button>
              )}
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
              className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm text-slate-500 truncate">
              <span>Veloce Portal</span>
              <span className="mx-2 text-slate-300">/</span>
              <span className="font-medium text-slate-900">{tabTitles[activeTab]}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {isAdmin && (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Shield className="w-3.5 h-3.5" />
                Admin Console
              </button>
            )}
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 max-w-6xl w-full mx-auto space-y-6">
          {/* Account Compliance Alerts */}
          {activeUser?.accountStatus === AccountStatus.FROZEN && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-sm text-red-800">
              <Lock className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Account Frozen</p>
                <p className="text-xs text-red-700 mt-0.5">
                  Outgoing transfers, deposits, and vault moves are suspended pending administrative review.
                </p>
              </div>
            </div>
          )}

          {activeUser?.kycStatus === KycStatus.PENDING && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start justify-between gap-4 text-sm text-amber-900">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">BVN / NIN KYC Verification Pending Review</p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Your CBN-aligned identity profile is queued for compliance verification. You can review your
                    details in Account Settings.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className="text-xs font-semibold text-amber-900 underline whitespace-nowrap shrink-0"
              >
                Review Profile
              </button>
            </div>
          )}

          {bannerNotice && (
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between gap-4 text-sm ${
                bannerNotice.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {bannerNotice.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{bannerNotice.text}</span>
              </div>
              <button type="button" onClick={() => setBannerNotice(null)} className="text-xs opacity-70 hover:opacity-100">
                Dismiss
              </button>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          )}

          {loading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-32 rounded-xl bg-white border border-slate-200 animate-pulse" />
                ))}
              </div>
              <div className="h-64 rounded-xl bg-white border border-slate-200 animate-pulse" />
            </div>
          ) : (
            <>
              {/* OVERVIEW TAB */}
              {activeTab === 'overview' && overview && (
                <div className="space-y-6">
                  {/* Balance Summary Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="bg-white border border-slate-200 rounded-xl p-6">
                      <p className="text-xs font-medium text-slate-500">Checking Balance</p>
                      <p className="font-mono tabular-nums text-3xl font-semibold text-slate-900 mt-2">
                        {formatCurrency(activeWallet?.checkingBalanceCents || 0)}
                      </p>
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span className="font-mono tabular-nums">NUBAN {activeUser?.accountNumber}</span>
                        <button
                          type="button"
                          onClick={() => copyValue('acct', activeUser?.accountNumber || '')}
                          className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-medium"
                        >
                          <Copy className="w-3 h-3" />
                          {copiedField === 'acct' ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-6">
                      <p className="text-xs font-medium text-slate-500">Savings Vaults Total</p>
                      <p className="font-mono tabular-nums text-3xl font-semibold text-slate-900 mt-2">
                        {formatCurrency(activeWallet?.savingsBalanceCents || 0)}
                      </p>
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span>Base tier APY {formatBpsPercent(activePlan?.savingsApyBps || 0)}</span>
                        <button
                          type="button"
                          onClick={() => setActiveTab('vaults')}
                          className="text-emerald-700 hover:text-emerald-800 font-medium"
                        >
                          Manage vaults →
                        </button>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-6">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-slate-500">24h Transfer Allowance</p>
                        <span className="text-xs font-medium text-slate-700">{activePlan?.name} Tier</span>
                      </div>
                      <p className="font-mono tabular-nums text-2xl font-semibold text-slate-900 mt-2">
                        {formatCurrency(Math.max(0, dailyLimit - dailySent))}
                        <span className="text-xs font-normal text-slate-500"> remaining</span>
                      </p>
                      <div className="mt-4">
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-600 transition-all"
                            style={{ width: `${limitPct}%` }}
                          />
                        </div>
                        <p className="text-[11px] font-mono tabular-nums text-slate-500 mt-1.5">
                          Used {formatCurrency(dailySent)} of {formatCurrency(dailyLimit)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions Strip */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
                    <div className="text-sm text-slate-600">
                      <span className="font-medium text-slate-900">Receive handle:</span>{' '}
                      <span className="font-mono text-slate-900">{activeUser?.handle}</span>
                      <span className="mx-2 text-slate-300">·</span>
                      <span>
                        KYC:{' '}
                        <strong
                          className={
                            activeUser?.kycStatus === KycStatus.VERIFIED
                              ? 'text-emerald-700'
                              : activeUser?.kycStatus === KycStatus.REJECTED
                              ? 'text-red-700'
                              : 'text-amber-700'
                          }
                        >
                          {activeUser?.kycStatus}
                        </strong>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('transfers');
                          setTransferSubTab('send');
                        }}
                        className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap"
                      >
                        Send Money
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('transfers');
                          setTransferSubTab('request');
                        }}
                        className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 hover:border-slate-300 bg-white rounded-lg transition-colors whitespace-nowrap"
                      >
                        Request Payment
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('transfers');
                          setTransferSubTab('deposit');
                        }}
                        className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 hover:border-slate-300 bg-white rounded-lg transition-colors whitespace-nowrap"
                      >
                        Deposit Funds
                      </button>
                    </div>
                  </div>

                  {/* Recent Transactions */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="font-display text-lg font-bold text-slate-900">Recent Ledger Activity</h2>
                      <button
                        type="button"
                        onClick={() => setActiveTab('transactions')}
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                      >
                        View all transactions →
                      </button>
                    </div>

                    {overview.recentTransactions.length === 0 ? (
                      <div className="py-10 text-center text-sm text-slate-500">
                        No transactions recorded yet. Deposit funds or initiate your first transfer.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-xs text-slate-500">
                              <th className="py-2.5 pr-4 font-medium">Reference</th>
                              <th className="py-2.5 pr-4 font-medium">Counterparty & Note</th>
                              <th className="py-2.5 pr-4 font-medium">Type</th>
                              <th className="py-2.5 pr-4 font-medium">Date</th>
                              <th className="py-2.5 font-medium text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {overview.recentTransactions.slice(0, 8).map((tx) => {
                              const isOutflow =
                                tx.senderId === activeUser?.id && tx.recipientId !== activeUser?.id;
                              const isSavings = tx.type === TransactionType.SAVINGS_MOVE;
                              return (
                                <tr key={tx.id} className="hover:bg-slate-50/70">
                                  <td className="py-3 pr-4 font-mono text-xs text-slate-600">{tx.referenceCode}</td>
                                  <td className="py-3 pr-4">
                                    <p className="font-medium text-slate-900">
                                      {isSavings
                                        ? 'Internal Savings Vault'
                                        : isOutflow
                                        ? `To ${tx.recipientName || tx.recipientHandle || 'Account'}`
                                        : `From ${tx.senderName || tx.senderHandle || 'NIBSS NIP / External'}`}
                                    </p>
                                    <p className="text-xs text-slate-500 truncate max-w-xs">{tx.note}</p>
                                  </td>
                                  <td className="py-3 pr-4 text-xs text-slate-600">
                                    {tx.status === 'REVERSED' ? 'REVERSED' : tx.type.replace('_', ' ')}
                                  </td>
                                  <td className="py-3 pr-4 font-mono text-xs text-slate-500 whitespace-nowrap">
                                    {formatShortDate(tx.createdAt)}
                                  </td>
                                  <td
                                    className={`py-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                                      isSavings
                                        ? 'text-slate-700'
                                        : isOutflow
                                        ? 'text-slate-900'
                                        : 'text-emerald-700'
                                    }`}
                                  >
                                    {isSavings ? '' : isOutflow ? '-' : '+'}
                                    {formatCurrency(tx.amountCents)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SEND & REQUEST TAB */}
              {activeTab === 'transfers' && (
                <div className="space-y-6">
                  <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                    {(
                      [
                        { id: 'send', label: 'Send Money' },
                        { id: 'request', label: 'Request Payment' },
                        {
                          id: 'queue',
                          label: `Requests Queue (${requests.filter((r) => r.status === 'PENDING').length})`,
                        },
                        { id: 'deposit', label: 'Deposit Funds' },
                      ] as { id: TransferSubTab; label: string }[]
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTransferSubTab(t.id)}
                        className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          transferSubTab === t.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {transferSubTab === 'send' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
                        <h2 className="font-display text-lg font-bold text-slate-900 mb-1">
                          Send Peer-to-Peer Transfer
                        </h2>
                        <p className="text-xs text-slate-500 mb-5">
                          Available checking: <span className="font-mono font-semibold text-slate-900">{formatCurrency(activeWallet?.checkingBalanceCents || 0)}</span>
                        </p>

                        <form onSubmit={handleSendTransfer} className="space-y-4">
                          <div className="relative">
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              Recipient (@handle, email, or 10-digit NUBAN)
                            </label>
                            <input
                              type="text"
                              required
                              value={recipientQuery}
                              onChange={(e) => {
                                setRecipientQuery(e.target.value);
                                setSelectedRecipient(null);
                              }}
                              placeholder="Search @chidi.o, email, or 012..."
                              className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                            />
                            {suggestions.length > 0 && (
                              <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-sm divide-y divide-slate-100">
                                {suggestions.map((s) => (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedRecipient(s);
                                      setRecipientQuery(s.handle);
                                      setSuggestions([]);
                                    }}
                                    className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-center justify-between text-xs"
                                  >
                                    <div>
                                      <p className="font-semibold text-slate-900">{s.fullName}</p>
                                      <p className="font-mono text-slate-500">
                                        {s.handle} · {s.email}
                                      </p>
                                    </div>
                                    <span className="font-mono text-slate-500">{s.accountNumber}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Amount (NGN ₦)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              required
                              value={transferDollars}
                              onChange={(e) => setTransferDollars(e.target.value)}
                              placeholder="0.00"
                              className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Memo / Reference Note</label>
                            <input
                              type="text"
                              maxLength={140}
                              value={transferNote}
                              onChange={(e) => setTransferNote(e.target.value)}
                              placeholder="Lagos rent share, vendor invoice, family support..."
                              className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                            />
                          </div>

                          <button
                            type="submit"
                            disabled={transferSubmitting}
                            className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg transition-colors"
                          >
                            {transferSubmitting ? 'Settling Transfer...' : 'Send Instant Transfer'}
                          </button>
                        </form>
                      </div>

                      <div className="lg:col-span-5 space-y-5">
                        <div className="bg-white border border-slate-200 rounded-xl p-6">
                          <h3 className="font-display text-base font-bold text-slate-900 mb-3">
                            Settlement Rules ({activePlan?.name} Tier)
                          </h3>
                          <dl className="space-y-2.5 text-xs">
                            <div className="flex justify-between">
                              <dt className="text-slate-500">Single transfer ceiling</dt>
                              <dd className="font-mono tabular-nums font-medium text-slate-900">
                                {formatCurrency(activePlan?.singleTransferLimitCents || 0)}
                              </dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-slate-500">24h remaining allowance</dt>
                              <dd className="font-mono tabular-nums font-medium text-slate-900">
                                {formatCurrency(Math.max(0, dailyLimit - dailySent))}
                              </dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-slate-500">P2P fee rate</dt>
                              <dd className="font-mono tabular-nums font-medium text-emerald-700">
                                {formatBpsPercent(activePlan?.p2pFeeBps || 0)}
                              </dd>
                            </div>
                          </dl>
                        </div>

                        <div className="bg-white border border-slate-200 rounded-xl p-6">
                          <h3 className="font-display text-base font-bold text-slate-900 mb-2">Receive Money</h3>
                          <p className="text-xs text-slate-600 mb-3">
                            Share your Veloce handle or 10-digit NUBAN account number to receive instant Naira payments.
                          </p>
                          <div className="space-y-2 text-xs font-mono">
                            <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                              <span>{activeUser?.handle}</span>
                              <button
                                type="button"
                                onClick={() => copyValue('handle', activeUser?.handle || '')}
                                className="text-emerald-700 font-sans font-semibold"
                              >
                                {copiedField === 'handle' ? 'Copied' : 'Copy'}
                              </button>
                            </div>
                            <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                              <span>{activeUser?.accountNumber}</span>
                              <button
                                type="button"
                                onClick={() => copyValue('num', activeUser?.accountNumber || '')}
                                className="text-emerald-700 font-sans font-semibold"
                              >
                                {copiedField === 'num' ? 'Copied' : 'Copy'}
                              </button>
                            </div>
                          </div>
                        </div>

                        {transferReceipt && (
                          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-xs text-emerald-900">
                            <p className="font-semibold">Settlement Confirmed</p>
                            <p className="mt-1 font-mono">
                              Ref {transferReceipt.referenceCode} · {formatCurrency(transferReceipt.amountCents)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {transferSubTab === 'request' && (
                    <div className="max-w-xl bg-white border border-slate-200 rounded-xl p-6">
                      <h2 className="font-display text-lg font-bold text-slate-900 mb-1">Request Payment</h2>
                      <p className="text-xs text-slate-500 mb-5">
                        Send a payment request to another Veloce member (e.g. @chidi.o or @zainab.b).
                      </p>
                      <form onSubmit={handleCreateRequest} className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Payer (@handle, email, or 10-digit NUBAN)
                          </label>
                          <input
                            type="text"
                            required
                            value={reqTargetQuery}
                            onChange={(e) => setReqTargetQuery(e.target.value)}
                            placeholder="@chidi.o"
                            className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Amount (NGN ₦)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            value={reqDollars}
                            onChange={(e) => setReqDollars(e.target.value)}
                            placeholder="15000.00"
                            className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Reason / Invoice Note</label>
                          <input
                            type="text"
                            maxLength={140}
                            value={reqNote}
                            onChange={(e) => setReqNote(e.target.value)}
                            placeholder="Lagos office logistics milestone #2"
                            className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={transferSubmitting}
                          className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
                        >
                          Send Request
                        </button>
                      </form>
                    </div>
                  )}

                  {transferSubTab === 'queue' && (
                    <div className="bg-white border border-slate-200 rounded-xl p-6">
                      <h2 className="font-display text-lg font-bold text-slate-900 mb-4">
                        Incoming & Outgoing Payment Requests
                      </h2>
                      {reqLoading ? (
                        <div className="h-32 bg-slate-100 rounded-lg animate-pulse" />
                      ) : requests.length === 0 ? (
                        <p className="text-sm text-slate-500 py-8 text-center">No payment requests found.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 text-xs text-slate-500">
                                <th className="py-2.5 pr-4 font-medium">Direction</th>
                                <th className="py-2.5 pr-4 font-medium">Counterparty</th>
                                <th className="py-2.5 pr-4 font-medium">Note</th>
                                <th className="py-2.5 pr-4 font-medium">Status</th>
                                <th className="py-2.5 pr-4 font-medium text-right">Amount</th>
                                <th className="py-2.5 font-medium text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {requests.map((pr) => {
                                const isIncoming = pr.payerId === activeUser?.id;
                                return (
                                  <tr key={pr.id}>
                                    <td className="py-3 pr-4 text-xs font-medium text-slate-700">
                                      {isIncoming ? (
                                        <span className="inline-flex items-center gap-1 text-amber-700">
                                          <ArrowUpRight className="w-3.5 h-3.5" /> Incoming Bill
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-emerald-700">
                                          <ArrowDownLeft className="w-3.5 h-3.5" /> Requested
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-3 pr-4">
                                      <p className="font-medium text-slate-900">
                                        {isIncoming ? pr.requesterName : pr.payerName}
                                      </p>
                                      <p className="font-mono text-xs text-slate-500">
                                        {isIncoming ? pr.requesterHandle : pr.payerHandle}
                                      </p>
                                    </td>
                                    <td className="py-3 pr-4 text-slate-600 text-xs">{pr.note}</td>
                                    <td className="py-3 pr-4 text-xs font-semibold text-slate-700">{pr.status}</td>
                                    <td className="py-3 pr-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                                      {formatCurrency(pr.amountCents)}
                                    </td>
                                    <td className="py-3 text-right whitespace-nowrap">
                                      {pr.status === PaymentRequestStatus.PENDING && isIncoming && (
                                        <div className="inline-flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() => handleRequestAction(pr.id, 'ACCEPT')}
                                            className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded"
                                          >
                                            Pay Now
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleRequestAction(pr.id, 'DECLINE')}
                                            className="px-2.5 py-1 text-xs font-medium text-slate-600 border border-slate-200 hover:border-slate-300 rounded"
                                          >
                                            Decline
                                          </button>
                                        </div>
                                      )}
                                      {pr.status === PaymentRequestStatus.PENDING && !isIncoming && (
                                        <button
                                          type="button"
                                          onClick={() => handleRequestAction(pr.id, 'CANCEL')}
                                          className="px-2.5 py-1 text-xs font-medium text-slate-600 border border-slate-200 rounded"
                                        >
                                          Cancel
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {transferSubTab === 'deposit' && (
                    <div className="max-w-xl bg-white border border-slate-200 rounded-xl p-6">
                      <h2 className="font-display text-lg font-bold text-slate-900 mb-1">
                        Fund Checking Account
                      </h2>
                      <p className="text-xs text-slate-500 mb-5">
                        Simulate an instant NIBSS NIP or Nigerian bank funding transfer up to ₦5,000,000.00.
                      </p>
                      <form onSubmit={handleDeposit} className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {['5000.00', '25000.00', '100000.00'].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setDepositDollars(preset)}
                              className="px-3 py-1.5 text-xs font-mono font-medium border border-slate-200 hover:border-emerald-600 rounded-lg"
                            >
                              +₦{Number(preset).toLocaleString('en-NG')}
                            </button>
                          ))}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Amount (NGN ₦)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="1"
                            max="5000000"
                            required
                            value={depositDollars}
                            onChange={(e) => setDepositDollars(e.target.value)}
                            className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Funding Source</label>
                          <select
                            value={depositSource}
                            onChange={(e) => setDepositSource(e.target.value)}
                            className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-600"
                          >
                            <option value="NIBSS Instant Payment (NIP)">NIBSS Instant Payment (NIP)</option>
                            <option value="GTBank / Zenith / Access NUBAN Transfer">
                              GTBank / Zenith / Access NUBAN Transfer
                            </option>
                            <option value="Verve / Mastercard Naira Card Top-Up">
                              Verve / Mastercard Naira Card Top-Up
                            </option>
                          </select>
                        </div>
                        <button
                          type="submit"
                          disabled={transferSubmitting}
                          className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
                        >
                          Deposit to Checking
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              )}

              {/* VAULTS TAB */}
              {activeTab === 'vaults' && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="font-display text-xl font-bold text-slate-900">Savings Vaults</h2>
                      <p className="text-sm text-slate-600">
                        Total savings allocated:{' '}
                        <span className="font-mono tabular-nums font-semibold text-slate-900">
                          {formatCurrency(activeWallet?.savingsBalanceCents || 0)}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowNewVaultForm(!showNewVaultForm)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                    >
                      <Plus className="w-4 h-4" />
                      New Savings Vault
                    </button>
                  </div>

                  {showNewVaultForm && (
                    <form
                      onSubmit={handleCreateVault}
                      className="bg-white border border-slate-200 rounded-xl p-6 grid grid-cols-1 md:grid-cols-2 gap-4"
                    >
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Vault Goal Name</label>
                        <input
                          type="text"
                          required
                          value={newVaultName}
                          onChange={(e) => setNewVaultName(e.target.value)}
                          placeholder="Lagos Rent Reserve"
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Savings Plan Template</label>
                        <select
                          value={newVaultPlanId}
                          onChange={(e) => setNewVaultPlanId(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                        >
                          {savingsPlans.map((sp) => (
                            <option key={sp.id} value={sp.id}>
                              {sp.name} (+{formatBpsPercent(sp.bonusApyBps)} · Min {formatCurrency(sp.minDepositCents)})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Target Amount (NGN ₦)</label>
                        <input
                          type="number"
                          min="1000"
                          step="1"
                          required
                          value={newVaultTarget}
                          onChange={(e) => setNewVaultTarget(e.target.value)}
                          className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Initial Checking Transfer (NGN ₦)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          value={newVaultInitial}
                          onChange={(e) => setNewVaultInitial(e.target.value)}
                          className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                        />
                      </div>
                      <div className="md:col-span-2 flex items-center gap-3">
                        <button
                          type="submit"
                          className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                        >
                          Create Vault
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowNewVaultForm(false)}
                          className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {vaults.length === 0 ? (
                    <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
                      <p className="text-sm text-slate-600 mb-4">You have not created any savings vaults yet.</p>
                      <button
                        type="button"
                        onClick={() => setShowNewVaultForm(true)}
                        className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg"
                      >
                        Create Your First Vault
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {vaults.map((v) => {
                        const pct = Math.min(100, Math.round((v.balanceCents / Math.max(1, v.targetCents)) * 100));
                        const combinedApy = (activePlan?.savingsApyBps || 0) + v.bonusApyBps;
                        return (
                          <div key={v.id} className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-xs text-slate-500">
                                    {v.planName} · {v.lockDays === 0 ? 'Liquid' : `${v.lockDays}d Term`}
                                  </p>
                                  <h3 className="font-display text-lg font-bold text-slate-900 mt-0.5">{v.name}</h3>
                                </div>
                                <span className="font-mono text-xs font-semibold text-emerald-700">
                                  {formatBpsPercent(combinedApy)} APY
                                </span>
                              </div>
                              <p className="font-mono tabular-nums text-2xl font-semibold text-slate-900 mt-4">
                                {formatCurrency(v.balanceCents)}
                                <span className="text-xs font-normal text-slate-500">
                                  {' '}
                                  / {formatCurrency(v.targetCents)}
                                </span>
                              </p>
                              <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-600" style={{ width: `${pct}%` }} />
                              </div>
                            </div>

                            {vaultMoveId === v.id ? (
                              <form onSubmit={handleVaultMove} className="mt-5 pt-4 border-t border-slate-100 space-y-3">
                                <div className="flex items-center gap-2 text-xs">
                                  <button
                                    type="button"
                                    onClick={() => setVaultMoveDirection('TO_VAULT')}
                                    className={`px-2.5 py-1 rounded ${
                                      vaultMoveDirection === 'TO_VAULT'
                                        ? 'bg-slate-900 text-white'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    Add from Checking
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setVaultMoveDirection('TO_CHECKING')}
                                    className={`px-2.5 py-1 rounded ${
                                      vaultMoveDirection === 'TO_CHECKING'
                                        ? 'bg-slate-900 text-white'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    Withdraw to Checking
                                  </button>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    required
                                    value={vaultMoveDollars}
                                    onChange={(e) => setVaultMoveDollars(e.target.value)}
                                    placeholder="5000.00"
                                    className="flex-1 px-3 py-1.5 text-sm font-mono border border-slate-200 rounded-lg"
                                  />
                                  <button
                                    type="submit"
                                    className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 rounded-lg"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setVaultMoveId(null)}
                                    className="px-2.5 py-1.5 text-xs text-slate-600"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-2.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVaultMoveId(v.id);
                                    setVaultMoveDirection('TO_VAULT');
                                    setVaultMoveDollars('5000.00');
                                  }}
                                  className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-emerald-700 rounded-lg transition-colors"
                                >
                                  Add Funds
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVaultMoveId(v.id);
                                    setVaultMoveDirection('TO_CHECKING');
                                    setVaultMoveDollars('5000.00');
                                  }}
                                  className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg"
                                >
                                  Withdraw
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TRANSACTIONS TAB */}
              {activeTab === 'transactions' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="font-display text-xl font-bold text-slate-900">Ledger & Statements</h2>
                      <p className="text-xs text-slate-500">
                        Searchable transaction log with dispute reporting and CSV export
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={exportCsv}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download CSV
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
                      {['ALL', 'SENT', 'RECEIVED', 'DEPOSIT', 'SAVINGS_MOVE', 'REVERSAL'].map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setTxFilter(f)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                            txFilter === f ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                          }`}
                        >
                          {f === 'SAVINGS_MOVE' ? 'VAULTS' : f}
                        </button>
                      ))}
                    </div>
                    <input
                      type="search"
                      value={txSearch}
                      onChange={(e) => setTxSearch(e.target.value)}
                      placeholder="Filter reference, handle, note..."
                      className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg w-full sm:w-64"
                    />
                  </div>

                  {txLoading ? (
                    <div className="h-48 bg-slate-100 rounded-lg animate-pulse" />
                  ) : transactions.length === 0 ? (
                    <p className="text-sm text-slate-500 py-10 text-center">No matching transactions.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-xs text-slate-500">
                            <th className="py-2.5 pr-4 font-medium">Reference</th>
                            <th className="py-2.5 pr-4 font-medium">Counterparty & Note</th>
                            <th className="py-2.5 pr-4 font-medium">Status / Dispute</th>
                            <th className="py-2.5 pr-4 font-medium">Timestamp</th>
                            <th className="py-2.5 pr-4 font-medium text-right">Amount</th>
                            <th className="py-2.5 font-medium text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {transactions.map((tx) => {
                            const isOutflow =
                              tx.senderId === activeUser?.id && tx.recipientId !== activeUser?.id;
                            const canDispute =
                              isOutflow &&
                              tx.type === TransactionType.P2P_TRANSFER &&
                              tx.status !== 'REVERSED' &&
                              !tx.disputeStatus;
                            return (
                              <tr key={tx.id} className="hover:bg-slate-50/70">
                                <td className="py-3 pr-4 font-mono text-xs text-slate-600">{tx.referenceCode}</td>
                                <td className="py-3 pr-4">
                                  <p className="font-medium text-slate-900">
                                    {tx.type === TransactionType.SAVINGS_MOVE
                                      ? 'Savings Vault Allocation'
                                      : isOutflow
                                      ? `To ${tx.recipientName || tx.recipientHandle}`
                                      : `From ${tx.senderName || tx.senderHandle || 'NIBSS NIP / External'}`}
                                  </p>
                                  <p className="text-xs text-slate-500">{tx.note}</p>
                                </td>
                                <td className="py-3 pr-4 text-xs">
                                  {tx.disputeStatus ? (
                                    <span
                                      className={`font-semibold ${
                                        tx.disputeStatus === DisputeStatus.REVERSED
                                          ? 'text-emerald-700'
                                          : tx.disputeStatus === DisputeStatus.OPEN
                                          ? 'text-amber-700'
                                          : 'text-slate-600'
                                      }`}
                                    >
                                      Dispute: {tx.disputeStatus}
                                    </span>
                                  ) : (
                                    <span className="text-slate-600">{tx.status}</span>
                                  )}
                                </td>
                                <td className="py-3 pr-4 font-mono text-xs text-slate-500 whitespace-nowrap">
                                  {formatDateTime(tx.createdAt)}
                                </td>
                                <td
                                  className={`py-3 pr-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                                    tx.type === TransactionType.SAVINGS_MOVE
                                      ? 'text-slate-700'
                                      : isOutflow
                                      ? 'text-slate-900'
                                      : 'text-emerald-700'
                                  }`}
                                >
                                  {tx.type === TransactionType.SAVINGS_MOVE ? '' : isOutflow ? '-' : '+'}
                                  {formatCurrency(tx.amountCents)}
                                </td>
                                <td className="py-3 text-right whitespace-nowrap">
                                  {canDispute && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDisputeTx(tx);
                                        setDisputeReason('');
                                      }}
                                      className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800"
                                    >
                                      <Flag className="w-3 h-3" />
                                      Report Issue
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* SETTINGS & PLAN TAB */}
              {activeTab === 'settings' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white border border-slate-200 rounded-xl p-6">
                      <h2 className="font-display text-lg font-bold text-slate-900 mb-1">
                        BVN / NIN Identity &amp; KYC Profile
                      </h2>
                      <p className="text-xs text-slate-500 mb-4">
                        CBN Verification state: <strong className="text-slate-900">{activeUser?.kycStatus}</strong> ·
                        Account status: <strong className="text-slate-900">{activeUser?.accountStatus}</strong>
                      </p>
                      <form onSubmit={handleUpdateKyc} className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Full Legal Name</label>
                          <input
                            type="text"
                            required
                            value={kycName}
                            onChange={(e) => setKycName(e.target.value)}
                            className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs text-slate-600">
                          <div>
                            <span className="block text-slate-400">10-Digit NUBAN</span>
                            <span className="font-mono text-slate-900">{activeUser?.accountNumber}</span>
                          </div>
                          <div>
                            <span className="block text-slate-400">Handle</span>
                            <span className="font-mono text-slate-900">{activeUser?.handle}</span>
                          </div>
                        </div>
                        <button
                          type="submit"
                          className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-emerald-700 rounded-lg transition-colors"
                        >
                          Update Identity Profile
                        </button>
                      </form>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-6">
                      <h2 className="font-display text-lg font-bold text-slate-900 mb-1">Security Credentials</h2>
                      <p className="text-xs text-slate-500 mb-4">Rotate your account password.</p>
                      <form onSubmit={handleChangePassword} className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
                          <input
                            type="password"
                            required
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
                          <input
                            type="password"
                            required
                            minLength={8}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg"
                          />
                        </div>
                        <button
                          type="submit"
                          className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-emerald-700 rounded-lg transition-colors"
                        >
                          Change Password
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Account Plans Switcher */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Building2 className="w-4 h-4 text-emerald-700" />
                      <h2 className="font-display text-lg font-bold text-slate-900">Account Plan Tier</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {publicPlans.map((p) => {
                        const isCurrent = p.id === activeUser?.planId;
                        return (
                          <div
                            key={p.id}
                            className={`border rounded-xl p-5 flex flex-col justify-between ${
                              isCurrent ? 'border-emerald-600 bg-emerald-50/30' : 'border-slate-200'
                            }`}
                          >
                            <div>
                              <div className="flex items-baseline justify-between">
                                <h3 className="font-display font-bold text-slate-900">{p.name}</h3>
                                <span className="font-mono text-sm font-semibold">
                                  {formatCurrency(p.monthlyFeeCents)}/mo
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 mt-1.5">{p.tagline}</p>
                              <div className="mt-4 space-y-1 text-xs text-slate-600">
                                <div className="flex justify-between">
                                  <span>Daily limit</span>
                                  <span className="font-mono text-slate-900">
                                    {formatCurrency(p.dailyTransferLimitCents)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Savings APY</span>
                                  <span className="font-mono text-emerald-700">
                                    {formatBpsPercent(p.savingsApyBps)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={isCurrent}
                              onClick={() => handleChangePlan(p.id)}
                              className={`mt-4 w-full py-2 text-xs font-semibold rounded-lg transition-colors ${
                                isCurrent
                                  ? 'bg-emerald-700 text-white opacity-90 cursor-default'
                                  : 'bg-slate-900 text-white hover:bg-emerald-700'
                              }`}
                            >
                              {isCurrent ? 'Current Plan' : `Switch to ${p.name}`}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Dispute Modal */}
      {disputeTx && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6">
            <h3 className="font-display text-lg font-bold text-slate-900">Report Transaction Dispute</h3>
            <p className="text-xs text-slate-600 mt-1 font-mono">
              {disputeTx.referenceCode} · {formatCurrency(disputeTx.amountCents)} to {disputeTx.recipientName}
            </p>
            <form onSubmit={handleOpenDispute} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Dispute Reason</label>
                <textarea
                  required
                  minLength={10}
                  rows={3}
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Describe why this transfer should be investigated or reversed..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDisputeTx(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg"
                >
                  Submit Dispute
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
