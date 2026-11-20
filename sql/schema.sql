-- Veloce Nigeria Fintech Platform — PostgreSQL Schema & Seed Script
-- Compatible with PostgreSQL 14+ (Supabase SQL Editor, Neon, Cloud SQL, RDS, psql).
-- All monetary amounts are stored in Nigerian Kobo (1 NGN = 100 kobo) using BIGINT.

BEGIN;

-- 1. Schema Migrations Tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Account Tiers (Standard, Plus, Private)
CREATE TABLE IF NOT EXISTS account_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  audience TEXT NOT NULL,
  tagline TEXT NOT NULL,
  monthly_fee_cents BIGINT NOT NULL CHECK (monthly_fee_cents >= 0),
  daily_transfer_limit_cents BIGINT NOT NULL CHECK (daily_transfer_limit_cents > 0),
  single_transfer_limit_cents BIGINT NOT NULL CHECK (single_transfer_limit_cents > 0),
  p2p_fee_bps INTEGER NOT NULL CHECK (p2p_fee_bps >= 0),
  savings_apy_bps INTEGER NOT NULL CHECK (savings_apy_bps >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (single_transfer_limit_cents <= daily_transfer_limit_cents)
);

-- 3. Users & RBAC Accounts
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE,
  account_number TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN', 'SUPER_ADMIN')),
  plan_id TEXT NOT NULL REFERENCES account_plans(id),
  kyc_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (kyc_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  account_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('ACTIVE', 'FROZEN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. NGN Wallets (Checking + Savings totals in kobo)
CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  checking_balance_cents BIGINT NOT NULL DEFAULT 0 CHECK (checking_balance_cents >= 0),
  savings_balance_cents BIGINT NOT NULL DEFAULT 0 CHECK (savings_balance_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'NGN',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Savings Plan Templates
CREATE TABLE IF NOT EXISTS savings_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  bonus_apy_bps INTEGER NOT NULL DEFAULT 0 CHECK (bonus_apy_bps >= 0),
  min_deposit_cents BIGINT NOT NULL DEFAULT 0 CHECK (min_deposit_cents >= 0),
  lock_days INTEGER NOT NULL DEFAULT 0 CHECK (lock_days >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. User Savings Vaults
CREATE TABLE IF NOT EXISTS savings_vaults (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  savings_plan_id TEXT NOT NULL REFERENCES savings_plans(id),
  name TEXT NOT NULL,
  target_cents BIGINT NOT NULL CHECK (target_cents > 0),
  balance_cents BIGINT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Ledger Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  reference_code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('DEPOSIT', 'P2P_TRANSFER', 'SAVINGS_MOVE', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'REVERSAL')),
  sender_id TEXT REFERENCES users(id),
  recipient_id TEXT REFERENCES users(id),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  fee_cents BIGINT NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'REVERSED')),
  note TEXT NOT NULL DEFAULT '',
  related_tx_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Peer Payment Requests
CREATE TABLE IF NOT EXISTS payment_requests (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES users(id),
  payer_id TEXT NOT NULL REFERENCES users(id),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'DECLINED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Transaction Disputes
CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL UNIQUE REFERENCES transactions(id),
  opened_by_user_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REVERSED', 'DISMISSED')),
  resolution_note TEXT,
  resolved_by_admin_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- 10. Immutable Administrative & Compliance Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id),
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Public Contact Inquiries
CREATE TABLE IF NOT EXISTS contact_inquiries (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  topic TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'REVIEWED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan_id);
CREATE INDEX IF NOT EXISTS idx_vaults_user ON savings_vaults(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_sender ON transactions(sender_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tx_recipient ON transactions(recipient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tx_type_status ON transactions(sender_id, type, status, created_at);
CREATE INDEX IF NOT EXISTS idx_req_payer ON payment_requests(payer_id, status);
CREATE INDEX IF NOT EXISTS idx_req_requester ON payment_requests(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON contact_inquiries(status, created_at DESC);

-- Record Migrations
INSERT INTO schema_migrations (version, description) VALUES
  ('2026_01_ngn_core_tables', 'Create core banking, NUBAN wallet, vault, dispute, and RBAC audit tables'),
  ('2026_02_indexes_and_checks', 'Ensure performance indexes across users, vaults, transactions, requests, disputes, and inquiries')
ON CONFLICT (version) DO NOTHING;

-- Seed CBN-Aligned Nigerian Account Tiers
INSERT INTO account_plans (
  id, name, audience, tagline, monthly_fee_cents,
  daily_transfer_limit_cents, single_transfer_limit_cents,
  p2p_fee_bps, savings_apy_bps, is_active
) VALUES
  ('plan_standard', 'Standard', 'For everyday personal Naira banking', 'Zero-fee NIBSS NIP & Veloce peer transfers with a NUBAN wallet and liquid savings vaults.', 0, 50000000, 20000000, 0, 1250, TRUE),
  ('plan_plus', 'Plus', 'For creators & growing SMEs', 'Tier-2/3 clearing limits up to ₦5M daily, priority BVN/NIN verification, and boosted Naira yield.', 250000, 500000000, 100000000, 0, 1550, TRUE),
  ('plan_private', 'Private', 'For corporate & treasury operations', 'High-volume Naira settlement up to ₦25M daily, dedicated compliance desk, and maximum reserve yield.', 1500000, 2500000000, 1000000000, 0, 1800, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Seed Nigerian Savings Plan Templates
INSERT INTO savings_plans (
  id, name, description, bonus_apy_bps, min_deposit_cents, lock_days, is_active
) VALUES
  ('sp_emergency', 'Flex Naira Vault', 'Liquid Naira cushion with instant withdrawal access back to your spending wallet.', 100, 500000, 0, TRUE),
  ('sp_goal', 'Target Save (30-Day)', 'Structured milestone plan for rent, inventory, or tuition with bonus Naira yield.', 200, 2500000, 30, TRUE),
  ('sp_treasury', 'Fixed Naira Lock (90-Day)', 'High-yield 90-day treasury allocation protecting purchasing power.', 350, 10000000, 90, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Seed Demo Nigerian Accounts (Demo Password: Veloce2026!)
INSERT INTO users (
  id, email, password_hash, full_name, handle, account_number,
  role, plan_id, kyc_status, account_status, created_at
) VALUES
  ('usr_superadmin_01', 'admin@veloce.ng', '45522533cc6a7330b90de0f7d83b7bfc:57c077bc3d18a4c5b6b6ea8d9d6fb8502b3bb4c17ba21a44f0e351cf849cc5019dd0472d5071dad342a398670dbffa2c310d6c2581d07585dec103756ef69493', 'Tunde Adeyemi', '@tunde.admin', '0120000001', 'SUPER_ADMIN', 'plan_private', 'VERIFIED', 'ACTIVE', NOW() - INTERVAL '30 days'),
  ('usr_opsadmin_02', 'ops@veloce.ng', '45522533cc6a7330b90de0f7d83b7bfc:57c077bc3d18a4c5b6b6ea8d9d6fb8502b3bb4c17ba21a44f0e351cf849cc5019dd0472d5071dad342a398670dbffa2c310d6c2581d07585dec103756ef69493', 'Ngozi Okafor', '@ngozi.ops', '0120000002', 'ADMIN', 'plan_plus', 'VERIFIED', 'ACTIVE', NOW() - INTERVAL '20 days'),
  ('usr_amaka_03', 'amaka@veloce.ng', '45522533cc6a7330b90de0f7d83b7bfc:57c077bc3d18a4c5b6b6ea8d9d6fb8502b3bb4c17ba21a44f0e351cf849cc5019dd0472d5071dad342a398670dbffa2c310d6c2581d07585dec103756ef69493', 'Amaka Nwosu', '@amaka.n', '0124892015', 'USER', 'plan_plus', 'VERIFIED', 'ACTIVE', NOW() - INTERVAL '15 days'),
  ('usr_chidi_04', 'chidi@veloce.ng', '45522533cc6a7330b90de0f7d83b7bfc:57c077bc3d18a4c5b6b6ea8d9d6fb8502b3bb4c17ba21a44f0e351cf849cc5019dd0472d5071dad342a398670dbffa2c310d6c2581d07585dec103756ef69493', 'Chidi Okonkwo', '@chidi.o', '0125138429', 'USER', 'plan_standard', 'VERIFIED', 'ACTIVE', NOW() - INTERVAL '12 days'),
  ('usr_zainab_05', 'zainab@veloce.ng', '45522533cc6a7330b90de0f7d83b7bfc:57c077bc3d18a4c5b6b6ea8d9d6fb8502b3bb4c17ba21a44f0e351cf849cc5019dd0472d5071dad342a398670dbffa2c310d6c2581d07585dec103756ef69493', 'Zainab Bello', '@zainab.b', '0129941273', 'USER', 'plan_standard', 'PENDING', 'ACTIVE', NOW() - INTERVAL '3 days')
ON CONFLICT (id) DO NOTHING;

-- Seed NGN Wallets
INSERT INTO wallets (user_id, checking_balance_cents, savings_balance_cents, currency, updated_at) VALUES
  ('usr_superadmin_01', 1500000000, 2500000000, 'NGN', NOW() - INTERVAL '30 days'),
  ('usr_opsadmin_02', 245000000, 600000000, 'NGN', NOW() - INTERVAL '20 days'),
  ('usr_amaka_03', 148205000, 325000000, 'NGN', NOW() - INTERVAL '4 hours'),
  ('usr_chidi_04', 64100000, 82000000, 'NGN', NOW() - INTERVAL '8 hours'),
  ('usr_zainab_05', 21500000, 15000000, 'NGN', NOW() - INTERVAL '12 hours')
ON CONFLICT (user_id) DO NOTHING;

-- Seed Savings Vaults
INSERT INTO savings_vaults (id, user_id, savings_plan_id, name, target_cents, balance_cents, created_at) VALUES
  ('vlt_amaka_01', 'usr_amaka_03', 'sp_emergency', 'Emergency Naira Buffer', 200000000, 145000000, NOW() - INTERVAL '10 days'),
  ('vlt_amaka_02', 'usr_amaka_03', 'sp_treasury', 'Lagos Rent & Tax Reserve', 300000000, 180000000, NOW() - INTERVAL '5 days'),
  ('vlt_chidi_01', 'usr_chidi_04', 'sp_goal', 'Solar Inverter & Studio Upgrade', 150000000, 82000000, NOW() - INTERVAL '4 days')
ON CONFLICT (id) DO NOTHING;

-- Seed Transactions
INSERT INTO transactions (id, reference_code, type, sender_id, recipient_id, amount_cents, fee_cents, status, note, related_tx_id, created_at) VALUES
  ('tx_seed_01', 'VLC-84K2M9PQ', 'DEPOSIT', NULL, 'usr_amaka_03', 200000000, 0, 'COMPLETED', 'NIBSS NIP funding from GTBank NUBAN', NULL, NOW() - INTERVAL '8 days'),
  ('tx_seed_02', 'VLC-39L7N2WX', 'P2P_TRANSFER', 'usr_amaka_03', 'usr_chidi_04', 18500000, 0, 'COMPLETED', 'Victoria Island design retainer', NULL, NOW() - INTERVAL '3 days'),
  ('tx_seed_03', 'VLC-55P8R1ZT', 'P2P_TRANSFER', 'usr_chidi_04', 'usr_amaka_03', 4250000, 0, 'COMPLETED', 'Shared Lekki workspace fiber & power', NULL, NOW() - INTERVAL '1 day'),
  ('tx_seed_04', 'VLC-91T4C6YN', 'P2P_TRANSFER', 'usr_amaka_03', 'usr_zainab_05', 9500000, 0, 'COMPLETED', 'Abuja logistics settlement #1042', NULL, NOW() - INTERVAL '12 hours'),
  ('tx_seed_05', 'VLC-62B9V3MD', 'SAVINGS_MOVE', 'usr_amaka_03', 'usr_amaka_03', 25000000, 0, 'COMPLETED', 'Allocation to Lagos Rent & Tax Reserve', NULL, NOW() - INTERVAL '6 hours')
ON CONFLICT (id) DO NOTHING;

-- Seed Payment Requests
INSERT INTO payment_requests (id, requester_id, payer_id, amount_cents, note, status, created_at, updated_at) VALUES
  ('req_seed_01', 'usr_chidi_04', 'usr_amaka_03', 3400000, 'Invoice #208 — Ikeja print run', 'PENDING', NOW() - INTERVAL '5 hours', NOW() - INTERVAL '5 hours')
ON CONFLICT (id) DO NOTHING;

-- Seed Disputes
INSERT INTO disputes (id, transaction_id, opened_by_user_id, reason, status, created_at) VALUES
  ('dsp_seed_01', 'tx_seed_04', 'usr_amaka_03', 'Duplicate NIP settlement sent for invoice #1042; requesting compliance review and reversal.', 'OPEN', NOW() - INTERVAL '3 hours')
ON CONFLICT (id) DO NOTHING;

-- Seed Audit Logs
INSERT INTO audit_logs (id, actor_id, actor_email, actor_role, action, target_type, target_id, details_json, created_at) VALUES
  ('aud_seed_01', 'usr_superadmin_01', 'admin@veloce.ng', 'SUPER_ADMIN', 'SYSTEM_INITIALIZED', 'ACCOUNT_PLAN', 'plan_private', '{"region":"NG","currency":"NGN","plansSeeded":3}', NOW() - INTERVAL '30 days'),
  ('aud_seed_02', 'usr_opsadmin_02', 'ops@veloce.ng', 'ADMIN', 'KYC_BVN_VERIFIED', 'USER', 'usr_amaka_03', '{"previousStatus":"PENDING","newStatus":"VERIFIED"}', NOW() - INTERVAL '14 days'),
  ('aud_seed_03', 'usr_amaka_03', 'amaka@veloce.ng', 'USER', 'DISPUTE_OPENED', 'TRANSACTION', 'tx_seed_04', '{"disputeId":"dsp_seed_01","amountKobo":9500000}', NOW() - INTERVAL '3 hours')
ON CONFLICT (id) DO NOTHING;

COMMIT;
