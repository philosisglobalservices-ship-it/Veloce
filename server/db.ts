import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import {
  AccountStatus,
  DisputeStatus,
  KycStatus,
  PaymentRequestStatus,
  TransactionType,
  UserRole,
} from '../src/types.ts';

const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || './data/veloce.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export function generateAccountNumber(): string {
  const rand = crypto.randomInt(1000000, 9999999);
  return `012${rand}`;
}

export function generateReferenceCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'VLC-';
  for (let i = 0; i < 8; i++) {
    out += chars[crypto.randomInt(0, chars.length)];
  }
  return out;
}

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS account_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      audience TEXT NOT NULL,
      tagline TEXT NOT NULL,
      monthly_fee_cents INTEGER NOT NULL CHECK (monthly_fee_cents >= 0),
      daily_transfer_limit_cents INTEGER NOT NULL CHECK (daily_transfer_limit_cents > 0),
      single_transfer_limit_cents INTEGER NOT NULL CHECK (single_transfer_limit_cents > 0),
      p2p_fee_bps INTEGER NOT NULL CHECK (p2p_fee_bps >= 0),
      savings_apy_bps INTEGER NOT NULL CHECK (savings_apy_bps >= 0),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      handle TEXT NOT NULL UNIQUE,
      account_number TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'USER',
      plan_id TEXT NOT NULL REFERENCES account_plans(id),
      kyc_status TEXT NOT NULL DEFAULT 'PENDING',
      account_status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wallets (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      checking_balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (checking_balance_cents >= 0),
      savings_balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (savings_balance_cents >= 0),
      currency TEXT NOT NULL DEFAULT 'NGN',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS savings_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      bonus_apy_bps INTEGER NOT NULL DEFAULT 0 CHECK (bonus_apy_bps >= 0),
      min_deposit_cents INTEGER NOT NULL DEFAULT 0 CHECK (min_deposit_cents >= 0),
      lock_days INTEGER NOT NULL DEFAULT 0 CHECK (lock_days >= 0),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS savings_vaults (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      savings_plan_id TEXT NOT NULL REFERENCES savings_plans(id),
      name TEXT NOT NULL,
      target_cents INTEGER NOT NULL CHECK (target_cents > 0),
      balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      reference_code TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      sender_id TEXT REFERENCES users(id),
      recipient_id TEXT REFERENCES users(id),
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
      status TEXT NOT NULL DEFAULT 'COMPLETED',
      note TEXT NOT NULL DEFAULT '',
      related_tx_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_requests (
      id TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL REFERENCES users(id),
      payer_id TEXT NOT NULL REFERENCES users(id),
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS disputes (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL UNIQUE REFERENCES transactions(id),
      opened_by_user_id TEXT NOT NULL REFERENCES users(id),
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      resolution_note TEXT,
      resolved_by_admin_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT REFERENCES users(id),
      actor_email TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contact_inquiries (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      topic TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'NEW',
      created_at TEXT NOT NULL
    );

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
  `);

  const now = new Date().toISOString();
  const insertMigration = db.prepare(
    `INSERT OR IGNORE INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)`
  );
  insertMigration.run('2026_01_ngn_core_tables', 'Create core banking, NUBAN wallet, vault, dispute, and RBAC audit tables', now);
  insertMigration.run('2026_02_indexes_and_checks', 'Ensure performance indexes across users, vaults, transactions, requests, disputes, and inquiries', now);

  // Upgrade legacy pre-Nigeria USD seed if present so existing preview DB transitions cleanly
  const legacyUsdWallet = db
    .prepare(`SELECT COUNT(*) as count FROM wallets WHERE currency = 'USD'`)
    .get() as { count: number };
  if (legacyUsdWallet.count > 0) {
    db.exec(`
      DELETE FROM contact_inquiries;
      DELETE FROM audit_logs;
      DELETE FROM disputes;
      DELETE FROM payment_requests;
      DELETE FROM transactions;
      DELETE FROM savings_vaults;
      DELETE FROM wallets;
      DELETE FROM users;
      DELETE FROM savings_plans;
      DELETE FROM account_plans;
    `);
  }

  const planCount = db.prepare('SELECT COUNT(*) as count FROM account_plans').get() as { count: number };
  if (planCount.count === 0) {
    seedInitialData();
  }
}

export function getDatabaseSchemaSummary() {
  const tableRows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .all() as { name: string }[];

  const tables = tableRows.map((t) => {
    const countRow = db.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get() as { count: number };
    return { name: t.name, rows: countRow.count };
  });

  const indexRows = db
    .prepare(`SELECT name, tbl_name as tableName FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .all() as { name: string; tableName: string }[];

  const integrity = db.pragma('integrity_check') as { integrity_check: string }[];
  const fkViolations = db.pragma('foreign_key_check') as unknown[];

  return {
    dbPath,
    tables,
    indexes: indexRows,
    integrityOk: integrity.length === 1 && integrity[0].integrity_check === 'ok',
    foreignKeyViolations: fkViolations.length,
  };
}

function seedInitialData(): void {
  const now = new Date().toISOString();
  const earlier = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();

  const insertPlan = db.prepare(`
    INSERT INTO account_plans (
      id, name, audience, tagline, monthly_fee_cents,
      daily_transfer_limit_cents, single_transfer_limit_cents,
      p2p_fee_bps, savings_apy_bps, is_active, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);

  const insertSavingsPlan = db.prepare(`
    INSERT INTO savings_plans (
      id, name, description, bonus_apy_bps, min_deposit_cents, lock_days, is_active, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `);

  const insertUser = db.prepare(`
    INSERT INTO users (
      id, email, password_hash, full_name, handle, account_number,
      role, plan_id, kyc_status, account_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertWallet = db.prepare(`
    INSERT INTO wallets (user_id, checking_balance_cents, savings_balance_cents, currency, updated_at)
    VALUES (?, ?, ?, 'NGN', ?)
  `);

  const insertVault = db.prepare(`
    INSERT INTO savings_vaults (id, user_id, savings_plan_id, name, target_cents, balance_cents, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertTx = db.prepare(`
    INSERT INTO transactions (
      id, reference_code, type, sender_id, recipient_id, amount_cents,
      fee_cents, status, note, related_tx_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRequest = db.prepare(`
    INSERT INTO payment_requests (id, requester_id, payer_id, amount_cents, note, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDispute = db.prepare(`
    INSERT INTO disputes (id, transaction_id, opened_by_user_id, reason, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertAudit = db.prepare(`
    INSERT INTO audit_logs (id, actor_id, actor_email, actor_role, action, target_type, target_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const runSeed = db.transaction(() => {
    // CBN-aligned Nigerian Naira account tiers (stored in kobo: 1 NGN = 100 kobo)
    insertPlan.run(
      'plan_standard',
      'Standard',
      'For everyday personal Naira banking',
      'Zero-fee NIBSS NIP & Veloce peer transfers with a NUBAN wallet and liquid savings vaults.',
      0,
      50000000, // ₦500,000 daily
      20000000, // ₦200,000 single
      0,
      1250, // 12.50% p.a.
      now
    );
    insertPlan.run(
      'plan_plus',
      'Plus',
      'For creators & growing SMEs',
      'Tier-2/3 clearing limits up to ₦5M daily, priority BVN/NIN verification, and boosted Naira yield.',
      250000, // ₦2,500/mo
      500000000, // ₦5,000,000 daily
      100000000, // ₦1,000,000 single
      0,
      1550, // 15.50% p.a.
      now
    );
    insertPlan.run(
      'plan_private',
      'Private',
      'For corporate & treasury operations',
      'High-volume Naira settlement up to ₦25M daily, dedicated compliance desk, and maximum reserve yield.',
      1500000, // ₦15,000/mo
      2500000000, // ₦25,000,000 daily
      1000000000, // ₦10,000,000 single
      0,
      1800, // 18.00% p.a.
      now
    );

    insertSavingsPlan.run(
      'sp_emergency',
      'Flex Naira Vault',
      'Liquid Naira cushion with instant withdrawal access back to your spending wallet.',
      100, // +1.00% p.a.
      500000, // ₦5,000 min
      0,
      now
    );
    insertSavingsPlan.run(
      'sp_goal',
      'Target Save (30-Day)',
      'Structured milestone plan for rent, inventory, or tuition with bonus Naira yield.',
      200, // +2.00% p.a.
      2500000, // ₦25,000 min
      30,
      now
    );
    insertSavingsPlan.run(
      'sp_treasury',
      'Fixed Naira Lock (90-Day)',
      'High-yield 90-day treasury allocation protecting purchasing power.',
      350, // +3.50% p.a.
      10000000, // ₦100,000 min
      90,
      now
    );

    const demoPassHash = hashPassword('Veloce2026!');

    const adminId = 'usr_superadmin_01';
    const opsId = 'usr_opsadmin_02';
    const amakaId = 'usr_amaka_03';
    const chidiId = 'usr_chidi_04';
    const zainabId = 'usr_zainab_05';

    insertUser.run(
      adminId,
      'admin@veloce.ng',
      demoPassHash,
      'Tunde Adeyemi',
      '@tunde.admin',
      '0120000001',
      UserRole.SUPER_ADMIN,
      'plan_private',
      KycStatus.VERIFIED,
      AccountStatus.ACTIVE,
      earlier(720)
    );
    insertWallet.run(adminId, 1500000000, 2500000000, earlier(720)); // ₦15M checking, ₦25M savings

    insertUser.run(
      opsId,
      'ops@veloce.ng',
      demoPassHash,
      'Ngozi Okafor',
      '@ngozi.ops',
      '0120000002',
      UserRole.ADMIN,
      'plan_plus',
      KycStatus.VERIFIED,
      AccountStatus.ACTIVE,
      earlier(480)
    );
    insertWallet.run(opsId, 245000000, 600000000, earlier(480)); // ₦2.45M checking, ₦6M savings

    insertUser.run(
      amakaId,
      'amaka@veloce.ng',
      demoPassHash,
      'Amaka Nwosu',
      '@amaka.n',
      '0124892015',
      UserRole.USER,
      'plan_plus',
      KycStatus.VERIFIED,
      AccountStatus.ACTIVE,
      earlier(360)
    );
    insertWallet.run(amakaId, 148205000, 325000000, earlier(4)); // ₦1,482,050.00 checking, ₦3,250,000 savings

    insertUser.run(
      chidiId,
      'chidi@veloce.ng',
      demoPassHash,
      'Chidi Okonkwo',
      '@chidi.o',
      '0125138429',
      UserRole.USER,
      'plan_standard',
      KycStatus.VERIFIED,
      AccountStatus.ACTIVE,
      earlier(300)
    );
    insertWallet.run(chidiId, 64100000, 82000000, earlier(8)); // ₦641,000 checking, ₦820,000 savings

    insertUser.run(
      zainabId,
      'zainab@veloce.ng',
      demoPassHash,
      'Zainab Bello',
      '@zainab.b',
      '0129941273',
      UserRole.USER,
      'plan_standard',
      KycStatus.PENDING,
      AccountStatus.ACTIVE,
      earlier(72)
    );
    insertWallet.run(zainabId, 21500000, 15000000, earlier(12)); // ₦215,000 checking, ₦150,000 savings

    insertVault.run(
      'vlt_amaka_01',
      amakaId,
      'sp_emergency',
      'Emergency Naira Buffer',
      200000000,
      145000000,
      earlier(240)
    );
    insertVault.run(
      'vlt_amaka_02',
      amakaId,
      'sp_treasury',
      'Lagos Rent & Tax Reserve',
      300000000,
      180000000,
      earlier(120)
    );
    insertVault.run(
      'vlt_chidi_01',
      chidiId,
      'sp_goal',
      'Solar Inverter & Studio Upgrade',
      150000000,
      82000000,
      earlier(100)
    );

    insertTx.run(
      'tx_seed_01',
      'VLC-84K2M9PQ',
      TransactionType.DEPOSIT,
      null,
      amakaId,
      200000000,
      0,
      'COMPLETED',
      'NIBSS NIP funding from GTBank NUBAN',
      null,
      earlier(200)
    );
    insertTx.run(
      'tx_seed_02',
      'VLC-39L7N2WX',
      TransactionType.P2P_TRANSFER,
      amakaId,
      chidiId,
      18500000,
      0,
      'COMPLETED',
      'Victoria Island design retainer',
      null,
      earlier(72)
    );
    insertTx.run(
      'tx_seed_03',
      'VLC-55P8R1ZT',
      TransactionType.P2P_TRANSFER,
      chidiId,
      amakaId,
      4250000,
      0,
      'COMPLETED',
      'Shared Lekki workspace fiber & power',
      null,
      earlier(24)
    );
    insertTx.run(
      'tx_seed_04',
      'VLC-91T4C6YN',
      TransactionType.P2P_TRANSFER,
      amakaId,
      zainabId,
      9500000,
      0,
      'COMPLETED',
      'Abuja logistics settlement #1042',
      null,
      earlier(12)
    );
    insertTx.run(
      'tx_seed_05',
      'VLC-62B9V3MD',
      TransactionType.SAVINGS_MOVE,
      amakaId,
      amakaId,
      25000000,
      0,
      'COMPLETED',
      'Allocation to Lagos Rent & Tax Reserve',
      null,
      earlier(6)
    );

    insertRequest.run(
      'req_seed_01',
      chidiId,
      amakaId,
      3400000,
      'Invoice #208 — Ikeja print run',
      PaymentRequestStatus.PENDING,
      earlier(5),
      earlier(5)
    );

    insertDispute.run(
      'dsp_seed_01',
      'tx_seed_04',
      amakaId,
      'Duplicate NIP settlement sent for invoice #1042; requesting compliance review and reversal.',
      DisputeStatus.OPEN,
      earlier(3)
    );

    insertAudit.run(
      'aud_seed_01',
      adminId,
      'admin@veloce.ng',
      UserRole.SUPER_ADMIN,
      'SYSTEM_INITIALIZED',
      'ACCOUNT_PLAN',
      'plan_private',
      JSON.stringify({ region: 'NG', currency: 'NGN', plansSeeded: 3 }),
      earlier(720)
    );
    insertAudit.run(
      'aud_seed_02',
      opsId,
      'ops@veloce.ng',
      UserRole.ADMIN,
      'KYC_BVN_VERIFIED',
      'USER',
      amakaId,
      JSON.stringify({ previousStatus: 'PENDING', newStatus: 'VERIFIED' }),
      earlier(350)
    );
    insertAudit.run(
      'aud_seed_03',
      amakaId,
      'amaka@veloce.ng',
      UserRole.USER,
      'DISPUTE_OPENED',
      'TRANSACTION',
      'tx_seed_04',
      JSON.stringify({ disputeId: 'dsp_seed_01', amountKobo: 9500000 }),
      earlier(3)
    );
  });

  runSeed();
}
