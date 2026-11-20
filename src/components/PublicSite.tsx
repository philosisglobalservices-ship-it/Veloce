import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, Lock, ShieldCheck } from 'lucide-react';
import { apiFetch, formatBpsPercent, formatCurrency } from '../lib/api.ts';
import { AccountPlan, SavingsPlan, UserProfile } from '../types.ts';
import { ResilientImage } from './ResilientImage.tsx';

export type PublicPage = 'home' | 'plans' | 'security' | 'contact';

interface PublicSiteProps {
  page: PublicPage;
  onNavigatePublic: (page: PublicPage) => void;
  onNavigateAuth: (mode: 'login' | 'register', preselectedPlanId?: string) => void;
  onEnterPortal: () => void;
  currentUser: UserProfile | null;
}

export const PublicSite: React.FC<PublicSiteProps> = ({
  page,
  onNavigatePublic,
  onNavigateAuth,
  onEnterPortal,
  currentUser,
}) => {
  const [accountPlans, setAccountPlans] = useState<AccountPlan[]>([]);
  const [savingsPlans, setSavingsPlans] = useState<SavingsPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState<boolean>(true);
  const [plansError, setPlansError] = useState<string | null>(null);

  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactTopic, setContactTopic] = useState('Account Onboarding');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactStatus, setContactStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    setPlansLoading(true);
    apiFetch<{ accountPlans: AccountPlan[]; savingsPlans: SavingsPlan[] }>('/api/public/plans')
      .then((data) => {
        if (!active) return;
        setAccountPlans(data.accountPlans);
        setSavingsPlans(data.savingsPlans);
        setPlansError(null);
      })
      .catch((err: any) => {
        if (!active) return;
        setPlansError(err.message || 'Unable to load account plans.');
      })
      .finally(() => {
        if (active) setPlansLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page]);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactStatus(null);
    setContactSubmitting(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/public/contact', {
        method: 'POST',
        body: JSON.stringify({
          fullName: contactName,
          email: contactEmail,
          topic: contactTopic,
          message: contactMessage,
        }),
      });
      setContactStatus({ type: 'success', text: res.message });
      setContactName('');
      setContactEmail('');
      setContactMessage('');
    } catch (err: any) {
      setContactStatus({ type: 'error', text: err.message || 'Could not submit inquiry.' });
    } finally {
      setContactSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => onNavigatePublic('home')}
            className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-emerald-600"
          >
            Veloce
          </button>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => onNavigatePublic('home')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                page === 'home'
                  ? 'border-emerald-600 text-slate-900'
                  : 'border-transparent hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => onNavigatePublic('plans')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                page === 'plans'
                  ? 'border-emerald-600 text-slate-900'
                  : 'border-transparent hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              Plans
            </button>
            <button
              type="button"
              onClick={() => onNavigatePublic('security')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                page === 'security'
                  ? 'border-emerald-600 text-slate-900'
                  : 'border-transparent hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              Security
            </button>
            <button
              type="button"
              onClick={() => onNavigatePublic('contact')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                page === 'contact'
                  ? 'border-emerald-600 text-slate-900'
                  : 'border-transparent hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              Contact
            </button>
            {!currentUser && (
              <button
                type="button"
                onClick={() => onNavigateAuth('login')}
                className="whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent hover:text-slate-900 hover:border-slate-300 transition-colors"
              >
                Sign in
              </button>
            )}
          </nav>

          <div className="shrink-0">
            {currentUser ? (
              <button
                type="button"
                onClick={onEnterPortal}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              >
                Go to Portal
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigateAuth('register')}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              >
                Open Account
              </button>
            )}
          </div>
        </div>

        {/* Mobile sub-nav strip (kept compact inside 15% mobile cap) */}
        <div className="md:hidden border-t border-slate-100 px-6 py-2 flex items-center gap-5 overflow-x-auto text-xs font-medium text-slate-600">
          <button type="button" onClick={() => onNavigatePublic('home')} className="whitespace-nowrap shrink-0">
            Overview
          </button>
          <button type="button" onClick={() => onNavigatePublic('plans')} className="whitespace-nowrap shrink-0">
            Plans
          </button>
          <button type="button" onClick={() => onNavigatePublic('security')} className="whitespace-nowrap shrink-0">
            Security
          </button>
          <button type="button" onClick={() => onNavigatePublic('contact')} className="whitespace-nowrap shrink-0">
            Contact
          </button>
          {!currentUser && (
            <button
              type="button"
              onClick={() => onNavigateAuth('login')}
              className="whitespace-nowrap shrink-0 text-emerald-700 font-semibold"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      <main className="flex-1">
        {page === 'home' && (
          <>
            {/* Hero Section */}
            <section className="bg-white border-b border-slate-200">
              <div className="max-w-7xl mx-auto px-6 py-16 lg:py-20">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
                  <div className="lg:col-span-6 flex flex-col justify-center">
                    <p className="text-xs font-medium text-emerald-700 tracking-wide mb-4">
                      Nigerian Digital Banking · Instant NIBSS NIP Clearing
                    </p>
                    <h1
                      className="font-display font-bold tracking-tight text-slate-900 leading-[1.08] mb-6"
                      style={{ fontSize: 'clamp(2.25rem, 4vw, 3.65rem)', textWrap: 'balance' }}
                    >
                      Naira checking, instant NIP transfers, and high-yield reserve vaults.
                    </h1>
                    <p className="text-base lg:text-lg text-slate-600 leading-relaxed max-w-xl mb-8">
                      Veloce Nigeria unites peer-to-peer NUBAN &amp; @handle clearing, goal-based Naira savings plans,
                      and CBN-aligned compliance governance on a single atomic ledger with zero hidden transfer delays.
                    </p>
                    <div className="flex flex-wrap items-center gap-4">
                      <button
                        type="button"
                        onClick={() => (currentUser ? onEnterPortal() : onNavigateAuth('register'))}
                        className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        {currentUser ? 'Enter Banking Portal' : 'Open an Account'}
                        <ArrowRight className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigatePublic('plans')}
                        className="inline-flex items-center px-5 py-3 text-sm font-medium text-slate-700 hover:text-slate-900 border border-slate-200 hover:border-slate-300 bg-white rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        Compare Account Tiers
                      </button>
                    </div>
                  </div>

                  <div className="lg:col-span-6">
                    <div className="h-72 sm:h-96 lg:h-full min-h-[360px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                      <ResilientImage
                        src="/src/assets/images/veloce_hero_architecture_1795108859093.jpg"
                        alt="Veloce architectural institutional banking atrium"
                        className="w-full h-full object-cover"
                        fallbackLabel="Veloce Private Clearing Headquarters"
                      />
                    </div>
                  </div>
                </div>

                {/* Full-width 4-column KPI strip below hero */}
                <div className="mt-14 pt-10 border-t border-slate-200 grid grid-cols-2 lg:grid-cols-4 gap-8">
                  <div>
                    <p className="font-mono tabular-nums text-2xl lg:text-3xl font-semibold text-slate-900">
                      &lt; 150ms
                    </p>
                    <p className="text-sm text-slate-600 mt-1">Atomic double-entry ledger finality</p>
                  </div>
                  <div>
                    <p className="font-mono tabular-nums text-2xl lg:text-3xl font-semibold text-slate-900">₦0.00</p>
                    <p className="text-sm text-slate-600 mt-1">Peer-to-peer transfer fee on all tiers</p>
                  </div>
                  <div>
                    <p className="font-mono tabular-nums text-2xl lg:text-3xl font-semibold text-slate-900">
                      Up to 18.00%
                    </p>
                    <p className="text-sm text-slate-600 mt-1">Base annual yield p.a. on Naira savings</p>
                  </div>
                  <div>
                    <p className="font-mono tabular-nums text-2xl lg:text-3xl font-semibold text-slate-900">100%</p>
                    <p className="text-sm text-slate-600 mt-1">Audit coverage on administrative actions</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Asymmetric Bento Capabilities */}
            <section className="max-w-7xl mx-auto px-6 py-16 lg:py-20">
              <div className="max-w-2xl mb-12">
                <h2 className="font-display text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">
                  Built for reliable daily liquidity and strict operational control.
                </h2>
                <p className="text-slate-600 mt-3 leading-relaxed">
                  Every deposit, peer transfer, payment request, and dispute reversal executes inside serialized
                  transactions so balances remain verifiable at every millisecond.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Marquee Capability (2 cols) */}
                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 md:grid-cols-2 items-stretch">
                  <div className="p-8 flex flex-col justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-3">01. Peer-to-Peer Clearing</p>
                      <h3 className="font-display text-xl font-bold text-slate-900 mb-3">
                        Send and request funds by @handle, email, or 10-digit NUBAN.
                      </h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        Instant recipient resolution verifies BVN/NIN KYC and account standing before funds move,
                        enforcing per-transfer and rolling 24-hour tier ceilings automatically.
                      </p>
                    </div>
                    <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                      <span>Instant NIP settlement · Dispute protection</span>
                      <button
                        type="button"
                        onClick={() => (currentUser ? onEnterPortal() : onNavigateAuth('register'))}
                        className="font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
                      >
                        Try transfers →
                      </button>
                    </div>
                  </div>
                  <div className="h-64 md:h-auto bg-slate-100 border-t md:border-t-0 md:border-l border-slate-200">
                    <ResilientImage
                      src="/src/assets/images/veloce_card_showcase_1795108858144.jpg"
                      alt="Veloce metallic debit card resting on pale stone"
                      className="w-full h-full object-cover"
                      fallbackLabel="Veloce Payment Instrument"
                    />
                  </div>
                </div>

                {/* Secondary Capability (1 col) */}
                <div className="bg-white border border-slate-200 rounded-xl p-8 flex flex-col justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-3">02. Programmable Savings Vaults</p>
                    <h3 className="font-display text-xl font-bold text-slate-900 mb-3">
                      Dedicated goal reserves paired with tier APY.
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Allocate Naira from checking into liquid emergency cushions or 90-day fixed locks governed by
                      live admin-configured yield bonuses.
                    </p>
                  </div>
                  <div className="mt-6 pt-5 border-t border-slate-100 text-xs text-slate-600">
                    Real-time checking-to-vault transfers
                  </div>
                </div>

                {/* Security & Governance Span */}
                <div className="bg-white border border-slate-200 rounded-xl p-8 flex flex-col justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-3">03. Role-Based Access Control</p>
                    <h3 className="font-display text-xl font-bold text-slate-900 mb-3">
                      Strict separation between members, ops admins, and super admins.
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Every sensitive API route validates signed JWT identity against live database role and freeze
                      state—preventing privilege escalation or frozen-account outflows.
                    </p>
                  </div>
                  <div className="mt-6 pt-5 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => onNavigatePublic('security')}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                    >
                      Inspect security architecture →
                    </button>
                  </div>
                </div>

                {/* Live Plans Preview (2 cols) */}
                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-8">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1">04. Live Tier Economics</p>
                      <h3 className="font-display text-xl font-bold text-slate-900">
                        Transparent limits and savings APY
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigatePublic('plans')}
                      className="text-sm font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
                    >
                      Full tier matrix →
                    </button>
                  </div>

                  {plansLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-28 rounded-lg bg-slate-100 animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {accountPlans.slice(0, 3).map((tier) => (
                        <div key={tier.id} className="border border-slate-200 rounded-lg p-5 bg-slate-50/50">
                          <div className="flex items-baseline justify-between gap-2">
                            <h4 className="font-display font-bold text-slate-900">{tier.name}</h4>
                            <span className="font-mono tabular-nums text-sm font-semibold text-slate-900">
                              {formatCurrency(tier.monthlyFeeCents)}/mo
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">{tier.audience}</p>
                          <div className="mt-4 pt-3 border-t border-slate-200 space-y-1.5 text-xs text-slate-600">
                            <div className="flex justify-between">
                              <span>Daily limit</span>
                              <span className="font-mono tabular-nums font-medium text-slate-900">
                                {formatCurrency(tier.dailyTransferLimitCents)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Savings APY</span>
                              <span className="font-mono tabular-nums font-medium text-emerald-700">
                                {formatBpsPercent(tier.savingsApyBps)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {page === 'plans' && (
          <section className="max-w-7xl mx-auto px-6 py-16">
            <div className="max-w-2xl mb-12">
              <p className="text-xs font-medium text-emerald-700 mb-3">Live Tier Rules · Governed by Ledger Policy</p>
              <h1
                className="font-display font-bold tracking-tight text-slate-900 mb-4"
                style={{ fontSize: 'clamp(2rem, 3.5vw, 3rem)', textWrap: 'balance' }}
              >
                Account tiers built around your transfer velocity.
              </h1>
              <p className="text-slate-600 leading-relaxed">
                Limits, peer transfer fees, and base savings yields are read directly from Veloce’s live ledger
                configuration and enforced on every transaction.
              </p>
            </div>

            {plansError && (
              <div className="mb-8 p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
                {plansError}
              </div>
            )}

            {plansLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-80 rounded-xl bg-white border border-slate-200 animate-pulse" />
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14">
                  {accountPlans.map((tier) => (
                    <div
                      key={tier.id}
                      className="bg-white border border-slate-200 rounded-xl p-8 flex flex-col justify-between"
                    >
                      <div>
                        <p className="text-xs text-slate-500 font-medium">{tier.audience}</p>
                        <div className="mt-2 flex items-baseline justify-between gap-4">
                          <h2 className="font-display text-2xl font-bold text-slate-900">{tier.name}</h2>
                          <span className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                            {formatCurrency(tier.monthlyFeeCents)}
                            <span className="text-xs font-normal text-slate-500">/mo</span>
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 mt-3 leading-relaxed">{tier.tagline}</p>

                        <dl className="mt-6 pt-6 border-t border-slate-100 space-y-3 text-sm">
                          <div className="flex items-center justify-between">
                            <dt className="text-slate-500">24h Transfer Limit</dt>
                            <dd className="font-mono tabular-nums font-medium text-slate-900">
                              {formatCurrency(tier.dailyTransferLimitCents)}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between">
                            <dt className="text-slate-500">Single Transfer Max</dt>
                            <dd className="font-mono tabular-nums font-medium text-slate-900">
                              {formatCurrency(tier.singleTransferLimitCents)}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between">
                            <dt className="text-slate-500">P2P Transfer Fee</dt>
                            <dd className="font-mono tabular-nums font-medium text-slate-900">
                              {formatBpsPercent(tier.p2pFeeBps)}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between">
                            <dt className="text-slate-500">Base Savings APY</dt>
                            <dd className="font-mono tabular-nums font-semibold text-emerald-700">
                              {formatBpsPercent(tier.savingsApyBps)}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <button
                        type="button"
                        onClick={() => (currentUser ? onEnterPortal() : onNavigateAuth('register', tier.id))}
                        className="mt-8 w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-emerald-700 rounded-lg transition-colors"
                      >
                        {currentUser ? 'Manage Plan in Portal' : `Open ${tier.name} Account`}
                      </button>
                    </div>
                  ))}
                </div>

                {/* Savings Plan Templates */}
                <div className="bg-white border border-slate-200 rounded-xl p-8">
                  <h3 className="font-display text-xl font-bold text-slate-900 mb-2">
                    Programmable Savings Plan Templates
                  </h3>
                  <p className="text-sm text-slate-600 mb-6">
                    Combine your account tier’s base APY with goal-specific vault bonuses.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs text-slate-500">
                          <th className="py-3 pr-4 font-medium">Savings Plan</th>
                          <th className="py-3 pr-4 font-medium">Purpose</th>
                          <th className="py-3 pr-4 font-medium text-right">Bonus APY</th>
                          <th className="py-3 pr-4 font-medium text-right">Min Initial Deposit</th>
                          <th className="py-3 font-medium text-right">Term Horizon</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {savingsPlans.map((sp) => (
                          <tr key={sp.id}>
                            <td className="py-3.5 pr-4 font-medium text-slate-900">{sp.name}</td>
                            <td className="py-3.5 pr-4 text-slate-600">{sp.description}</td>
                            <td className="py-3.5 pr-4 text-right font-mono tabular-nums font-medium text-emerald-700">
                              +{formatBpsPercent(sp.bonusApyBps)}
                            </td>
                            <td className="py-3.5 pr-4 text-right font-mono tabular-nums text-slate-900">
                              {formatCurrency(sp.minDepositCents)}
                            </td>
                            <td className="py-3.5 text-right font-mono tabular-nums text-slate-600">
                              {sp.lockDays === 0 ? 'Liquid' : `${sp.lockDays} days`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {page === 'security' && (
          <section className="max-w-7xl mx-auto px-6 py-16">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch mb-14">
              <div className="lg:col-span-6 flex flex-col justify-center">
                <p className="text-xs font-medium text-emerald-700 mb-3">Security & Governance Architecture</p>
                <h1
                  className="font-display font-bold tracking-tight text-slate-900 mb-5"
                  style={{ fontSize: 'clamp(2rem, 3.5vw, 3rem)', textWrap: 'balance' }}
                >
                  Engineered to make balance drift and unauthorized access impossible.
                </h1>
                <p className="text-slate-600 leading-relaxed mb-6">
                  Every monetary movement in Veloce executes inside an immediate serialized SQLite transaction that
                  records immutable ledger rows, checks account freeze state, and enforces per-user RBAC permissions on
                  the server.
                </p>
                <div className="space-y-3 text-sm text-slate-700">
                  <div className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
                    <span>Per-user salted scrypt password hashing with constant-time verification</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
                    <span>Signed JWT sessions re-validated against live database role & freeze status</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
                    <span>Full administrative audit log covering account creation, KYC, freezes, and reversals</span>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-6">
                <div className="h-72 lg:h-full min-h-[320px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                  <ResilientImage
                    src="/src/assets/images/veloce_vault_security_1795108860736.jpg"
                    alt="Veloce precision brushed steel security vault corridor"
                    className="w-full h-full object-cover"
                    fallbackLabel="Veloce Institutional Vault Custody"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white border border-slate-200 rounded-xl p-7">
                <Lock className="w-5 h-5 text-emerald-700 mb-4" />
                <h2 className="font-display text-lg font-bold text-slate-900 mb-2">Role-Based Access Control</h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Three distinct security tiers (User, Admin, Super Admin) isolate retail banking endpoints from
                  administrative provisioning, balance adjustments, and role promotion.
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-7">
                <ShieldCheck className="w-5 h-5 text-emerald-700 mb-4" />
                <h2 className="font-display text-lg font-bold text-slate-900 mb-2">BVN/NIN KYC &amp; Freeze Controls</h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Compliance teams review BVN/NIN identity verification states and can freeze suspicious accounts
                  immediately, halting outgoing transfers and vault withdrawals at the API middleware layer.
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-7">
                <ArrowRight className="w-5 h-5 text-emerald-700 mb-4" />
                <h2 className="font-display text-lg font-bold text-slate-900 mb-2">Dispute Reversal Ledger</h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Members can flag peer transfers directly from their statement. Admins verify claims and issue atomic
                  compensating reversal entries with full audit traceability.
                </p>
              </div>
            </div>
          </section>
        )}

        {page === 'contact' && (
          <section className="max-w-4xl mx-auto px-6 py-16">
            <div className="mb-10">
              <p className="text-xs font-medium text-emerald-700 mb-3">Institutional Support & Onboarding Desk</p>
              <h1
                className="font-display font-bold tracking-tight text-slate-900 mb-3"
                style={{ fontSize: 'clamp(2rem, 3.5vw, 2.75rem)', textWrap: 'balance' }}
              >
                Speak with Veloce Operations.
              </h1>
              <p className="text-slate-600">
                Questions about Private Naira tier limits, BVN/NIN KYC documentation, or multi-account onboarding? Send
                a direct message to our Lagos compliance and support queue.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-8">
              <form onSubmit={handleContactSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5" htmlFor="contact-name">
                      Full Name
                    </label>
                    <input
                      id="contact-name"
                      type="text"
                      required
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Amaka Nwosu"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5" htmlFor="contact-email">
                      Email Address
                    </label>
                    <input
                      id="contact-email"
                      type="email"
                      required
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="name@company.ng"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5" htmlFor="contact-topic">
                    Inquiry Topic
                  </label>
                  <select
                    id="contact-topic"
                    value={contactTopic}
                    onChange={(e) => setContactTopic(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-600"
                  >
                    <option value="Account Onboarding">Account Onboarding</option>
                    <option value="Private Tier & Limits">Private Tier & Limits</option>
                    <option value="Compliance & KYC">Compliance & KYC</option>
                    <option value="General Support">General Support</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5" htmlFor="contact-message">
                    Message
                  </label>
                  <textarea
                    id="contact-message"
                    required
                    rows={4}
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    placeholder="Describe your inquiry or onboarding requirements..."
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                  />
                </div>

                {contactStatus && (
                  <div
                    className={`p-3.5 rounded-lg border text-sm ${
                      contactStatus.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border-red-200 text-red-700'
                    }`}
                  >
                    {contactStatus.text}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={contactSubmitting}
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg transition-colors"
                >
                  {contactSubmitting ? 'Submitting...' : 'Send Inquiry'}
                </button>
              </form>
            </div>
          </section>
        )}
      </main>

      {/* Quiet Institutional Footer */}
      <footer className="bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <p className="font-display font-bold text-slate-900">Veloce</p>
            <p className="text-xs text-slate-500 mt-1">
              Nigerian Digital Banking &amp; Peer Clearing · NIBSS NIP &amp; NUBAN Ready
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs text-slate-600">
            <button type="button" onClick={() => onNavigatePublic('home')} className="hover:text-slate-900">
              Overview
            </button>
            <button type="button" onClick={() => onNavigatePublic('plans')} className="hover:text-slate-900">
              Plans
            </button>
            <button type="button" onClick={() => onNavigatePublic('security')} className="hover:text-slate-900">
              Security
            </button>
            <button type="button" onClick={() => onNavigatePublic('contact')} className="hover:text-slate-900">
              Contact
            </button>
            <button type="button" onClick={() => onNavigateAuth('login')} className="hover:text-slate-900">
              Sign In
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
