import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import {
  AuthenticatedRequest,
  mapUserRow,
  requireActiveAccount,
  requireAuth,
  requireRole,
  signToken,
  writeAuditLog,
} from './auth.ts';
import {
  db,
  generateAccountNumber,
  generateId,
  generateReferenceCode,
  hashPassword,
  initializeDatabase,
  verifyPassword,
} from './db.ts';
import {
  AccountPlan,
  AccountStatus,
  DisputeStatus,
  KycStatus,
  PaymentRequestStatus,
  SavingsPlan,
  TransactionType,
  UserRole,
} from '../src/types.ts';

initializeDatabase();

export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Security headers (preserve iframe embed compatibility)
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Lightweight in-memory sliding-window rate limiter for auth & public contact endpoints
const rateBuckets = new Map<string, number[]>();
function createRateLimiter(bucketName: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${bucketName}:${ip}`;
    const now = Date.now();
    const recent = (rateBuckets.get(key) || []).filter((ts) => now - ts < windowMs);
    if (recent.length >= maxRequests) {
      res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
      return;
    }
    recent.push(now);
    rateBuckets.set(key, recent);
    next();
  };
}

const authLimiter = createRateLimiter('auth', 40, 60_000);
const contactLimiter = createRateLimiter('contact', 15, 60_000);

function parsePositiveKobo(raw: unknown, maxKobo = 10_000_000_000): number | null {
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  const kobo = Math.round(num);
  if (!Number.isSafeInteger(kobo) || kobo <= 0 || kobo > maxKobo) return null;
  return kobo;
}

function mapPlanRow(row: any): AccountPlan {
  return {
    id: row.id,
    name: row.name,
    audience: row.audience,
    tagline: row.tagline,
    monthlyFeeCents: row.monthly_fee_cents,
    dailyTransferLimitCents: row.daily_transfer_limit_cents,
    singleTransferLimitCents: row.single_transfer_limit_cents,
    p2pFeeBps: row.p2p_fee_bps,
    savingsApyBps: row.savings_apy_bps,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  };
}

function mapSavingsPlanRow(row: any): SavingsPlan {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    bonusApyBps: row.bonus_apy_bps,
    minDepositCents: row.min_deposit_cents,
    lockDays: row.lock_days,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  };
}

function mapWalletRow(row: any) {
  return {
    userId: row.user_id,
    checkingBalanceCents: row.checking_balance_cents,
    savingsBalanceCents: row.savings_balance_cents,
    currency: row.currency,
    updatedAt: row.updated_at,
  };
}

function mapTransactionRow(row: any) {
  return {
    id: row.id,
    referenceCode: row.reference_code,
    type: row.type as TransactionType,
    senderId: row.sender_id,
    senderName: row.sender_name ?? null,
    senderHandle: row.sender_handle ?? null,
    recipientId: row.recipient_id,
    recipientName: row.recipient_name ?? null,
    recipientHandle: row.recipient_handle ?? null,
    amountCents: row.amount_cents,
    feeCents: row.fee_cents,
    status: row.status,
    note: row.note,
    relatedTxId: row.related_tx_id,
    disputeStatus: (row.dispute_status as DisputeStatus) ?? null,
    disputeId: row.dispute_id ?? null,
    createdAt: row.created_at,
  };
}

function normalizeHandle(raw: string): string {
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9._]/g, '');
  return cleaned.startsWith('@') ? cleaned : `@${cleaned}`;
}

function getDailySentCents(userId: string): number {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) as total
       FROM transactions
       WHERE sender_id = ? AND type = ? AND status != 'REVERSED' AND created_at >= ?`
    )
    .get(userId, TransactionType.P2P_TRANSFER, since) as { total: number };
  return row.total;
}

// ---------------------------------------------------------------------------
// Public Routes
// ---------------------------------------------------------------------------

app.get('/api/health', (_req: Request, res: Response) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ ok: true, database: 'connected', currency: 'NGN', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ ok: false, database: 'unavailable' });
  }
});

app.get('/api/public/plans', (_req: Request, res: Response) => {
  const accountPlans = db
    .prepare('SELECT * FROM account_plans WHERE is_active = 1 ORDER BY monthly_fee_cents ASC')
    .all()
    .map(mapPlanRow);
  const savingsPlans = db
    .prepare('SELECT * FROM savings_plans WHERE is_active = 1 ORDER BY bonus_apy_bps ASC')
    .all()
    .map(mapSavingsPlanRow);
  res.json({ accountPlans, savingsPlans });
});

app.post('/api/public/contact', contactLimiter, (req: Request, res: Response) => {
  const fullName = String(req.body?.fullName || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const topic = String(req.body?.topic || 'General Inquiry').trim();
  const message = String(req.body?.message || '').trim();

  if (fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 10) {
    res.status(400).json({ error: 'Please provide a valid name, email address, and message (at least 10 characters).' });
    return;
  }

  const id = generateId('inq');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO contact_inquiries (id, full_name, email, topic, message, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'NEW', ?)`
  ).run(id, fullName, email, topic, message, now);

  res.status(201).json({ id, message: 'Inquiry received. Our Lagos support desk will respond shortly.' });
});

// ---------------------------------------------------------------------------
// Authentication Routes
// ---------------------------------------------------------------------------

app.post('/api/auth/register', authLimiter, (req: Request, res: Response) => {
  const fullName = String(req.body?.fullName || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const rawHandle = String(req.body?.handle || fullName.split(' ')[0] || 'member');
  const requestedPlanId = String(req.body?.planId || 'plan_standard');

  if (fullName.length < 2) {
    res.status(400).json({ error: 'Full name must be at least 2 characters.' });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }

  const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existingEmail) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  let handle = normalizeHandle(rawHandle);
  if (handle.length < 4) {
    handle = `${handle}${Math.floor(100 + Math.random() * 900)}`;
  }
  const existingHandle = db.prepare('SELECT id FROM users WHERE handle = ?').get(handle);
  if (existingHandle) {
    handle = `${handle.slice(0, 16)}${Math.floor(100 + Math.random() * 900)}`;
  }

  const plan = db
    .prepare('SELECT * FROM account_plans WHERE id = ? AND is_active = 1')
    .get(requestedPlanId) as any;
  const planId = plan ? plan.id : 'plan_standard';

  const userId = generateId('usr');
  const accountNumber = generateAccountNumber();
  const now = new Date().toISOString();
  const welcomeBonusCents = 250000; // ₦2,500.00 starter Naira checking balance for immediate testing

  const createTx = db.transaction(() => {
    db.prepare(
      `INSERT INTO users (
        id, email, password_hash, full_name, handle, account_number,
        role, plan_id, kyc_status, account_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      email,
      hashPassword(password),
      fullName,
      handle,
      accountNumber,
      UserRole.USER,
      planId,
      KycStatus.PENDING,
      AccountStatus.ACTIVE,
      now
    );

    db.prepare(
      `INSERT INTO wallets (user_id, checking_balance_cents, savings_balance_cents, currency, updated_at)
       VALUES (?, ?, 0, 'NGN', ?)`
    ).run(userId, welcomeBonusCents, now);

    db.prepare(
      `INSERT INTO transactions (
        id, reference_code, type, sender_id, recipient_id, amount_cents, fee_cents, status, note, created_at
      ) VALUES (?, ?, ?, NULL, ?, ?, 0, 'COMPLETED', ?, ?)`
    ).run(
      generateId('tx'),
      generateReferenceCode(),
      TransactionType.DEPOSIT,
      userId,
      welcomeBonusCents,
      'Opening NUBAN account welcome liquidity',
      now
    );

    writeAuditLog({
      actorId: userId,
      actorEmail: email,
      actorRole: UserRole.USER,
      action: 'USER_REGISTERED',
      targetType: 'USER',
      targetId: userId,
      details: { planId, handle },
    });
  });

  createTx.immediate();

  const userRow = db
    .prepare(
      `SELECT u.*, p.name as plan_name FROM users u LEFT JOIN account_plans p ON u.plan_id = p.id WHERE u.id = ?`
    )
    .get(userId);
  const walletRow = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(userId);
  const user = mapUserRow(userRow);
  const token = signToken({ id: user.id, role: user.role, email: user.email });

  res.status(201).json({
    token,
    user,
    wallet: mapWalletRow(walletRow),
  });
});

app.post('/api/auth/login', authLimiter, (req: Request, res: Response) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const userRow = db
    .prepare(
      `SELECT u.*, p.name as plan_name
       FROM users u
       LEFT JOIN account_plans p ON u.plan_id = p.id
       WHERE u.email = ?`
    )
    .get(email) as any;

  if (!userRow || !verifyPassword(password, userRow.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const user = mapUserRow(userRow);
  const walletRow = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(user.id);
  const token = signToken({ id: user.id, role: user.role, email: user.email });

  writeAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: 'USER_SIGNED_IN',
    targetType: 'USER',
    targetId: user.id,
    details: { accountStatus: user.accountStatus },
  });

  res.json({
    token,
    user,
    wallet: mapWalletRow(walletRow),
  });
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.authUser!;
  const walletRow = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(user.id);
  const planRow = db.prepare('SELECT * FROM account_plans WHERE id = ?').get(user.planId);
  res.json({
    user,
    wallet: mapWalletRow(walletRow),
    plan: mapPlanRow(planRow),
  });
});

app.post('/api/auth/change-password', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');

  if (newPassword.length < 8) {
    res.status(400).json({ error: 'New password must be at least 8 characters.' });
    return;
  }

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.authUser!.id) as any;
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    res.status(400).json({ error: 'Current password is incorrect.' });
    return;
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    hashPassword(newPassword),
    req.authUser!.id
  );

  writeAuditLog({
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    actorRole: req.authUser!.role,
    action: 'PASSWORD_CHANGED',
    targetType: 'USER',
    targetId: req.authUser!.id,
    details: {},
  });

  res.json({ ok: true, message: 'Password updated successfully.' });
});

// ---------------------------------------------------------------------------
// User Banking Routes
// ---------------------------------------------------------------------------

app.get('/api/banking/overview', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.authUser!;
  const wallet = mapWalletRow(db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(user.id));
  const plan = mapPlanRow(db.prepare('SELECT * FROM account_plans WHERE id = ?').get(user.planId));
  const dailySentCents = getDailySentCents(user.id);

  const vaults = db
    .prepare(
      `SELECT v.*, sp.name as plan_name, sp.bonus_apy_bps, sp.lock_days
       FROM savings_vaults v
       JOIN savings_plans sp ON v.savings_plan_id = sp.id
       WHERE v.user_id = ?
       ORDER BY v.created_at DESC`
    )
    .all(user.id)
    .map((v: any) => ({
      id: v.id,
      userId: v.user_id,
      savingsPlanId: v.savings_plan_id,
      planName: v.plan_name,
      bonusApyBps: v.bonus_apy_bps,
      lockDays: v.lock_days,
      name: v.name,
      targetCents: v.target_cents,
      balanceCents: v.balance_cents,
      createdAt: v.created_at,
    }));

  const recentTransactions = db
    .prepare(
      `SELECT t.*,
              s.full_name as sender_name, s.handle as sender_handle,
              r.full_name as recipient_name, r.handle as recipient_handle,
              d.status as dispute_status, d.id as dispute_id
       FROM transactions t
       LEFT JOIN users s ON t.sender_id = s.id
       LEFT JOIN users r ON t.recipient_id = r.id
       LEFT JOIN disputes d ON d.transaction_id = t.id
       WHERE t.sender_id = ? OR t.recipient_id = ?
       ORDER BY t.created_at DESC
       LIMIT 12`
    )
    .all(user.id, user.id)
    .map(mapTransactionRow);

  const pendingReqRow = db
    .prepare(
      `SELECT COUNT(*) as count FROM payment_requests WHERE payer_id = ? AND status = 'PENDING'`
    )
    .get(user.id) as { count: number };

  res.json({
    user,
    wallet,
    plan,
    dailySentCents,
    vaults,
    recentTransactions,
    pendingIncomingRequests: pendingReqRow.count,
  });
});

app.get('/api/banking/recipient-lookup', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) {
    res.json({ recipients: [] });
    return;
  }

  const pattern = `%${q}%`;
  const rows = db
    .prepare(
      `SELECT id, full_name, email, handle, account_number, kyc_status, account_status
       FROM users
       WHERE id != ?
         AND (LOWER(email) LIKE ? OR LOWER(handle) LIKE ? OR account_number LIKE ? OR LOWER(full_name) LIKE ?)
       ORDER BY full_name ASC
       LIMIT 8`
    )
    .all(req.authUser!.id, pattern, pattern, pattern, pattern) as any[];

  res.json({
    recipients: rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      email: r.email,
      handle: r.handle,
      accountNumber: r.account_number,
      kycStatus: r.kyc_status,
      accountStatus: r.account_status,
    })),
  });
});

app.post(
  '/api/banking/transfer',
  requireAuth,
  requireActiveAccount,
  (req: AuthenticatedRequest, res: Response) => {
    const sender = req.authUser!;
    if (sender.kycStatus === KycStatus.REJECTED) {
      res.status(403).json({ error: 'Transfers are blocked because your BVN/NIN KYC verification was rejected.' });
      return;
    }
    const recipientIdentifier = String(req.body?.recipientIdentifier || '').trim().toLowerCase();
    const amountCents = parsePositiveKobo(req.body?.amountCents);
    const note = String(req.body?.note || '').trim().slice(0, 140);

    if (!recipientIdentifier || amountCents === null) {
      res.status(400).json({ error: 'Valid recipient and positive transfer amount are required.' });
      return;
    }

    try {
      const executeTransfer = db.transaction(() => {
        const recipient = db
          .prepare(
            `SELECT * FROM users
             WHERE LOWER(email) = ? OR LOWER(handle) = ? OR account_number = ? OR id = ?`
          )
          .get(recipientIdentifier, recipientIdentifier, recipientIdentifier, recipientIdentifier) as any;

        if (!recipient) {
          throw Object.assign(new Error('Recipient account not found. Verify email, @handle, or NUBAN.'), {
            status: 404,
          });
        }
        if (recipient.id === sender.id) {
          throw Object.assign(new Error('Cannot send a peer transfer to your own account.'), { status: 400 });
        }
        if (recipient.account_status === AccountStatus.FROZEN) {
          throw Object.assign(new Error('Recipient account is currently frozen and cannot receive transfers.'), {
            status: 403,
          });
        }

        const plan = db.prepare('SELECT * FROM account_plans WHERE id = ?').get(sender.planId) as any;
        if (amountCents > plan.single_transfer_limit_cents) {
          throw Object.assign(
            new Error(
              `Amount exceeds your ${plan.name} single-transfer limit of ₦${(plan.single_transfer_limit_cents / 100).toLocaleString('en-NG')}.`
            ),
            { status: 400 }
          );
        }

        const dailySent = getDailySentCents(sender.id);
        if (dailySent + amountCents > plan.daily_transfer_limit_cents) {
          const remaining = Math.max(0, plan.daily_transfer_limit_cents - dailySent);
          throw Object.assign(
            new Error(
              `Daily transfer limit exceeded. Remaining 24h allowance on ${plan.name}: ₦${(remaining / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}.`
            ),
            { status: 400 }
          );
        }

        const feeCents = Math.round((amountCents * plan.p2p_fee_bps) / 10000);
        const totalDebitCents = amountCents + feeCents;
        const senderWallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(sender.id) as any;

        if (!senderWallet || senderWallet.checking_balance_cents < totalDebitCents) {
          throw Object.assign(new Error('Insufficient checking balance for transfer and applicable fee.'), {
            status: 400,
          });
        }

        const now = new Date().toISOString();
        const txId = generateId('tx');
        const referenceCode = generateReferenceCode();

        db.prepare(
          `UPDATE wallets SET checking_balance_cents = checking_balance_cents - ?, updated_at = ? WHERE user_id = ?`
        ).run(totalDebitCents, now, sender.id);

        db.prepare(
          `UPDATE wallets SET checking_balance_cents = checking_balance_cents + ?, updated_at = ? WHERE user_id = ?`
        ).run(amountCents, now, recipient.id);

        db.prepare(
          `INSERT INTO transactions (
            id, reference_code, type, sender_id, recipient_id, amount_cents, fee_cents, status, note, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?)`
        ).run(
          txId,
          referenceCode,
          TransactionType.P2P_TRANSFER,
          sender.id,
          recipient.id,
          amountCents,
          feeCents,
          note || `Transfer to ${recipient.handle}`,
          now
        );

        return { txId, referenceCode, feeCents };
      });

      const result = executeTransfer.immediate();
      res.status(201).json({
        ok: true,
        ...result,
        message: 'Transfer settled instantly.',
      });
    } catch (err: any) {
      res.status(err.status || 500).json({ error: err.message || 'Transfer failed.' });
    }
  }
);

app.post(
  '/api/banking/deposit',
  requireAuth,
  requireActiveAccount,
  (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    const amountCents = parsePositiveKobo(req.body?.amountCents, 500_000_000);
    const sourceLabel = String(req.body?.source || 'NIBSS Instant Payment (NIP)').trim().slice(0, 80);

    if (amountCents === null || amountCents < 100) {
      res.status(400).json({ error: 'Deposit must be between ₦1.00 and ₦5,000,000.00 per funding instruction.' });
      return;
    }

    const now = new Date().toISOString();
    const txId = generateId('tx');
    const referenceCode = generateReferenceCode();

    const runDeposit = db.transaction(() => {
      db.prepare(
        `UPDATE wallets SET checking_balance_cents = checking_balance_cents + ?, updated_at = ? WHERE user_id = ?`
      ).run(amountCents, now, user.id);

      db.prepare(
        `INSERT INTO transactions (
          id, reference_code, type, sender_id, recipient_id, amount_cents, fee_cents, status, note, created_at
        ) VALUES (?, ?, ?, NULL, ?, ?, 0, 'COMPLETED', ?, ?)`
      ).run(txId, referenceCode, TransactionType.DEPOSIT, user.id, amountCents, sourceLabel, now);
    });

    runDeposit.immediate();

    const wallet = mapWalletRow(db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(user.id));
    res.status(201).json({ ok: true, txId, referenceCode, wallet });
  }
);

app.get('/api/banking/requests', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUser!.id;
  const rows = db
    .prepare(
      `SELECT pr.*,
              req_u.full_name as requester_name, req_u.handle as requester_handle,
              pay_u.full_name as payer_name, pay_u.handle as payer_handle
       FROM payment_requests pr
       JOIN users req_u ON pr.requester_id = req_u.id
       JOIN users pay_u ON pr.payer_id = pay_u.id
       WHERE pr.requester_id = ? OR pr.payer_id = ?
       ORDER BY pr.created_at DESC`
    )
    .all(userId, userId) as any[];

  res.json({
    requests: rows.map((r) => ({
      id: r.id,
      requesterId: r.requester_id,
      requesterName: r.requester_name,
      requesterHandle: r.requester_handle,
      payerId: r.payer_id,
      payerName: r.payer_name,
      payerHandle: r.payer_handle,
      amountCents: r.amount_cents,
      note: r.note,
      status: r.status as PaymentRequestStatus,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

app.post(
  '/api/banking/requests',
  requireAuth,
  requireActiveAccount,
  (req: AuthenticatedRequest, res: Response) => {
    const requester = req.authUser!;
    const payerIdentifier = String(req.body?.payerIdentifier || '').trim().toLowerCase();
    const amountCents = parsePositiveKobo(req.body?.amountCents);
    const note = String(req.body?.note || '').trim().slice(0, 140);

    if (!payerIdentifier || amountCents === null) {
      res.status(400).json({ error: 'Valid payer and positive amount are required.' });
      return;
    }

    const payer = db
      .prepare(
        `SELECT * FROM users
         WHERE LOWER(email) = ? OR LOWER(handle) = ? OR account_number = ? OR id = ?`
      )
      .get(payerIdentifier, payerIdentifier, payerIdentifier, payerIdentifier) as any;

    if (!payer) {
      res.status(404).json({ error: 'Payer account not found.' });
      return;
    }
    if (payer.id === requester.id) {
      res.status(400).json({ error: 'Cannot request payment from yourself.' });
      return;
    }

    const id = generateId('req');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO payment_requests (id, requester_id, payer_id, amount_cents, note, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)`
    ).run(id, requester.id, payer.id, amountCents, note || 'Payment request', now, now);

    res.status(201).json({ ok: true, id, message: `Request sent to ${payer.handle}.` });
  }
);

app.post(
  '/api/banking/requests/:id/respond',
  requireAuth,
  requireActiveAccount,
  (req: AuthenticatedRequest, res: Response) => {
    const actor = req.authUser!;
    const requestId = req.params.id;
    const action = String(req.body?.action || '').toUpperCase(); // ACCEPT | DECLINE | CANCEL

    try {
      const result = db.transaction(() => {
        const pr = db.prepare('SELECT * FROM payment_requests WHERE id = ?').get(requestId) as any;
        if (!pr) {
          throw Object.assign(new Error('Payment request not found.'), { status: 404 });
        }
        if (pr.status !== PaymentRequestStatus.PENDING) {
          throw Object.assign(new Error(`Payment request is already ${pr.status.toLowerCase()}.`), { status: 400 });
        }

        const now = new Date().toISOString();

        if (action === 'CANCEL') {
          if (pr.requester_id !== actor.id) {
            throw Object.assign(new Error('Only the requester can cancel this request.'), { status: 403 });
          }
          db.prepare('UPDATE payment_requests SET status = ?, updated_at = ? WHERE id = ?').run(
            PaymentRequestStatus.CANCELLED,
            now,
            requestId
          );
          return { status: PaymentRequestStatus.CANCELLED };
        }

        if (pr.payer_id !== actor.id) {
          throw Object.assign(new Error('Only the designated payer can accept or decline this request.'), {
            status: 403,
          });
        }

        if (action === 'DECLINE') {
          db.prepare('UPDATE payment_requests SET status = ?, updated_at = ? WHERE id = ?').run(
            PaymentRequestStatus.DECLINED,
            now,
            requestId
          );
          return { status: PaymentRequestStatus.DECLINED };
        }

        if (action !== 'ACCEPT') {
          throw Object.assign(new Error('Action must be ACCEPT, DECLINE, or CANCEL.'), { status: 400 });
        }

        const requester = db.prepare('SELECT * FROM users WHERE id = ?').get(pr.requester_id) as any;
        if (!requester || requester.account_status === AccountStatus.FROZEN) {
          throw Object.assign(new Error('Requester account cannot receive funds at this time.'), { status: 403 });
        }

        const plan = db.prepare('SELECT * FROM account_plans WHERE id = ?').get(actor.planId) as any;
        if (pr.amount_cents > plan.single_transfer_limit_cents) {
          throw Object.assign(new Error('Amount exceeds your single-transfer limit.'), { status: 400 });
        }
        const dailySent = getDailySentCents(actor.id);
        if (dailySent + pr.amount_cents > plan.daily_transfer_limit_cents) {
          throw Object.assign(new Error('Amount exceeds your 24-hour transfer limit.'), { status: 400 });
        }

        const feeCents = Math.round((pr.amount_cents * plan.p2p_fee_bps) / 10000);
        const totalDebit = pr.amount_cents + feeCents;
        const payerWallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(actor.id) as any;
        if (!payerWallet || payerWallet.checking_balance_cents < totalDebit) {
          throw Object.assign(new Error('Insufficient checking balance to fulfill request.'), { status: 400 });
        }

        db.prepare(
          `UPDATE wallets SET checking_balance_cents = checking_balance_cents - ?, updated_at = ? WHERE user_id = ?`
        ).run(totalDebit, now, actor.id);

        db.prepare(
          `UPDATE wallets SET checking_balance_cents = checking_balance_cents + ?, updated_at = ? WHERE user_id = ?`
        ).run(pr.amount_cents, now, requester.id);

        db.prepare(
          `INSERT INTO transactions (
            id, reference_code, type, sender_id, recipient_id, amount_cents, fee_cents, status, note, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?)`
        ).run(
          generateId('tx'),
          generateReferenceCode(),
          TransactionType.P2P_TRANSFER,
          actor.id,
          requester.id,
          pr.amount_cents,
          feeCents,
          pr.note ? `Request paid: ${pr.note}` : `Payment request to ${requester.handle}`,
          now
        );

        db.prepare('UPDATE payment_requests SET status = ?, updated_at = ? WHERE id = ?').run(
          PaymentRequestStatus.PAID,
          now,
          requestId
        );

        return { status: PaymentRequestStatus.PAID };
      }).immediate();

      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(err.status || 500).json({ error: err.message || 'Failed to process request.' });
    }
  }
);

app.get('/api/banking/vaults', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const vaults = db
    .prepare(
      `SELECT v.*, sp.name as plan_name, sp.bonus_apy_bps, sp.lock_days
       FROM savings_vaults v
       JOIN savings_plans sp ON v.savings_plan_id = sp.id
       WHERE v.user_id = ?
       ORDER BY v.created_at DESC`
    )
    .all(req.authUser!.id)
    .map((v: any) => ({
      id: v.id,
      userId: v.user_id,
      savingsPlanId: v.savings_plan_id,
      planName: v.plan_name,
      bonusApyBps: v.bonus_apy_bps,
      lockDays: v.lock_days,
      name: v.name,
      targetCents: v.target_cents,
      balanceCents: v.balance_cents,
      createdAt: v.created_at,
    }));

  const savingsPlans = db
    .prepare('SELECT * FROM savings_plans WHERE is_active = 1 ORDER BY bonus_apy_bps ASC')
    .all()
    .map(mapSavingsPlanRow);

  res.json({ vaults, savingsPlans });
});

app.post(
  '/api/banking/vaults',
  requireAuth,
  requireActiveAccount,
  (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    const name = String(req.body?.name || '').trim().slice(0, 60);
    const savingsPlanId = String(req.body?.savingsPlanId || '');
    const targetCents = Math.round(Number(req.body?.targetCents || 0));
    const initialDepositCents = Math.round(Number(req.body?.initialDepositCents || 0));

    if (name.length < 2 || !Number.isFinite(targetCents) || targetCents < 100000) {
      res.status(400).json({ error: 'Vault name and target (at least ₦1,000.00) are required.' });
      return;
    }
    if (!Number.isFinite(initialDepositCents) || initialDepositCents < 0) {
      res.status(400).json({ error: 'Initial allocation cannot be negative.' });
      return;
    }

    try {
      const vaultId = db.transaction(() => {
        const plan = db
          .prepare('SELECT * FROM savings_plans WHERE id = ? AND is_active = 1')
          .get(savingsPlanId) as any;
        if (!plan) {
          throw Object.assign(new Error('Selected savings plan is invalid or inactive.'), { status: 400 });
        }
        if (initialDepositCents > 0 && initialDepositCents < plan.min_deposit_cents) {
          throw Object.assign(
            new Error(`Initial deposit must meet plan minimum of ₦${(plan.min_deposit_cents / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}.`),
            { status: 400 }
          );
        }

        const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(user.id) as any;
        if (initialDepositCents > wallet.checking_balance_cents) {
          throw Object.assign(new Error('Insufficient checking balance for initial vault allocation.'), {
            status: 400,
          });
        }

        const id = generateId('vlt');
        const now = new Date().toISOString();

        db.prepare(
          `INSERT INTO savings_vaults (id, user_id, savings_plan_id, name, target_cents, balance_cents, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(id, user.id, plan.id, name, targetCents, initialDepositCents, now);

        if (initialDepositCents > 0) {
          db.prepare(
            `UPDATE wallets
             SET checking_balance_cents = checking_balance_cents - ?,
                 savings_balance_cents = savings_balance_cents + ?,
                 updated_at = ?
             WHERE user_id = ?`
          ).run(initialDepositCents, initialDepositCents, now, user.id);

          db.prepare(
            `INSERT INTO transactions (
              id, reference_code, type, sender_id, recipient_id, amount_cents, fee_cents, status, note, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 0, 'COMPLETED', ?, ?)`
          ).run(
            generateId('tx'),
            generateReferenceCode(),
            TransactionType.SAVINGS_MOVE,
            user.id,
            user.id,
            initialDepositCents,
            `Initial allocation to vault: ${name}`,
            now
          );
        }

        return id;
      }).immediate();

      res.status(201).json({ ok: true, id: vaultId });
    } catch (err: any) {
      res.status(err.status || 500).json({ error: err.message || 'Could not create savings vault.' });
    }
  }
);

app.post(
  '/api/banking/vaults/:id/move',
  requireAuth,
  requireActiveAccount,
  (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    const vaultId = req.params.id;
    const direction = String(req.body?.direction || 'TO_VAULT'); // TO_VAULT | TO_CHECKING
    const amountCents = parsePositiveKobo(req.body?.amountCents);

    if (amountCents === null) {
      res.status(400).json({ error: 'Amount must be greater than zero.' });
      return;
    }

    try {
      db.transaction(() => {
        const vault = db
          .prepare('SELECT * FROM savings_vaults WHERE id = ? AND user_id = ?')
          .get(vaultId, user.id) as any;
        if (!vault) {
          throw Object.assign(new Error('Savings vault not found.'), { status: 404 });
        }

        const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(user.id) as any;
        const now = new Date().toISOString();

        if (direction === 'TO_VAULT') {
          if (wallet.checking_balance_cents < amountCents) {
            throw Object.assign(new Error('Insufficient checking balance.'), { status: 400 });
          }
          db.prepare('UPDATE savings_vaults SET balance_cents = balance_cents + ? WHERE id = ?').run(
            amountCents,
            vaultId
          );
          db.prepare(
            `UPDATE wallets
             SET checking_balance_cents = checking_balance_cents - ?,
                 savings_balance_cents = savings_balance_cents + ?,
                 updated_at = ?
             WHERE user_id = ?`
          ).run(amountCents, amountCents, now, user.id);
        } else if (direction === 'TO_CHECKING') {
          if (vault.balance_cents < amountCents) {
            throw Object.assign(new Error('Insufficient balance in this savings vault.'), { status: 400 });
          }
          db.prepare('UPDATE savings_vaults SET balance_cents = balance_cents - ? WHERE id = ?').run(
            amountCents,
            vaultId
          );
          db.prepare(
            `UPDATE wallets
             SET checking_balance_cents = checking_balance_cents + ?,
                 savings_balance_cents = savings_balance_cents - ?,
                 updated_at = ?
             WHERE user_id = ?`
          ).run(amountCents, amountCents, now, user.id);
        } else {
          throw Object.assign(new Error('Invalid move direction.'), { status: 400 });
        }

        db.prepare(
          `INSERT INTO transactions (
            id, reference_code, type, sender_id, recipient_id, amount_cents, fee_cents, status, note, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, 'COMPLETED', ?, ?)`
        ).run(
          generateId('tx'),
          generateReferenceCode(),
          TransactionType.SAVINGS_MOVE,
          user.id,
          user.id,
          amountCents,
          direction === 'TO_VAULT' ? `Deposit to vault: ${vault.name}` : `Withdrawal from vault: ${vault.name}`,
          now
        );
      }).immediate();

      res.json({ ok: true });
    } catch (err: any) {
      res.status(err.status || 500).json({ error: err.message || 'Vault transfer failed.' });
    }
  }
);

app.get('/api/banking/transactions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUser!.id;
  const filterType = String(req.query.type || 'ALL').toUpperCase();
  const q = String(req.query.q || '').trim().toLowerCase();

  let rows = db
    .prepare(
      `SELECT t.*,
              s.full_name as sender_name, s.handle as sender_handle,
              r.full_name as recipient_name, r.handle as recipient_handle,
              d.status as dispute_status, d.id as dispute_id
       FROM transactions t
       LEFT JOIN users s ON t.sender_id = s.id
       LEFT JOIN users r ON t.recipient_id = r.id
       LEFT JOIN disputes d ON d.transaction_id = t.id
       WHERE t.sender_id = ? OR t.recipient_id = ?
       ORDER BY t.created_at DESC
       LIMIT 200`
    )
    .all(userId, userId)
    .map(mapTransactionRow);

  if (filterType !== 'ALL') {
    if (filterType === 'SENT') {
      rows = rows.filter((t) => t.senderId === userId && t.recipientId !== userId);
    } else if (filterType === 'RECEIVED') {
      rows = rows.filter((t) => t.recipientId === userId && t.senderId !== userId);
    } else {
      rows = rows.filter((t) => t.type === filterType);
    }
  }

  if (q) {
    rows = rows.filter(
      (t) =>
        t.referenceCode.toLowerCase().includes(q) ||
        t.note.toLowerCase().includes(q) ||
        (t.senderName && t.senderName.toLowerCase().includes(q)) ||
        (t.recipientName && t.recipientName.toLowerCase().includes(q)) ||
        (t.senderHandle && t.senderHandle.toLowerCase().includes(q)) ||
        (t.recipientHandle && t.recipientHandle.toLowerCase().includes(q))
    );
  }

  res.json({ transactions: rows });
});

app.post('/api/banking/disputes', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.authUser!;
  const transactionId = String(req.body?.transactionId || '');
  const reason = String(req.body?.reason || '').trim();

  if (!transactionId || reason.length < 10) {
    res.status(400).json({ error: 'Provide a clear dispute reason (at least 10 characters).' });
    return;
  }

  try {
    const disputeId = db.transaction(() => {
      const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(transactionId) as any;
      if (!tx) {
        throw Object.assign(new Error('Transaction not found.'), { status: 404 });
      }
      if (tx.sender_id !== user.id) {
        throw Object.assign(new Error('You can only dispute outgoing transfers you initiated.'), { status: 403 });
      }
      if (tx.type !== TransactionType.P2P_TRANSFER || tx.status === 'REVERSED') {
        throw Object.assign(new Error('Only completed peer transfers can be disputed.'), { status: 400 });
      }
      const existing = db.prepare('SELECT id FROM disputes WHERE transaction_id = ?').get(transactionId);
      if (existing) {
        throw Object.assign(new Error('A dispute is already filed for this transaction.'), { status: 409 });
      }

      const id = generateId('dsp');
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO disputes (id, transaction_id, opened_by_user_id, reason, status, created_at)
         VALUES (?, ?, ?, ?, 'OPEN', ?)`
      ).run(id, transactionId, user.id, reason, now);

      writeAuditLog({
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'DISPUTE_OPENED',
        targetType: 'TRANSACTION',
        targetId: transactionId,
        details: { disputeId: id, amountCents: tx.amount_cents },
      });

      return id;
    }).immediate();

    res.status(201).json({ ok: true, id: disputeId });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Could not open dispute.' });
  }
});

app.post('/api/banking/plan', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.authUser!;
  const planId = String(req.body?.planId || '');
  const plan = db.prepare('SELECT * FROM account_plans WHERE id = ? AND is_active = 1').get(planId) as any;

  if (!plan) {
    res.status(400).json({ error: 'Selected plan is unavailable.' });
    return;
  }

  db.prepare('UPDATE users SET plan_id = ? WHERE id = ?').run(plan.id, user.id);

  writeAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: 'USER_CHANGED_PLAN',
    targetType: 'USER',
    targetId: user.id,
    details: { previousPlanId: user.planId, newPlanId: plan.id },
  });

  res.json({ ok: true, plan: mapPlanRow(plan) });
});

app.post('/api/banking/kyc', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.authUser!;
  const fullName = String(req.body?.fullName || user.fullName).trim();

  if (fullName.length < 2) {
    res.status(400).json({ error: 'Full legal name is required.' });
    return;
  }

  const nextStatus = user.kycStatus === KycStatus.VERIFIED ? KycStatus.VERIFIED : KycStatus.PENDING;
  db.prepare('UPDATE users SET full_name = ?, kyc_status = ? WHERE id = ?').run(fullName, nextStatus, user.id);

  writeAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: 'KYC_SUBMISSION_UPDATED',
    targetType: 'USER',
    targetId: user.id,
    details: { fullName, kycStatus: nextStatus },
  });

  res.json({ ok: true, kycStatus: nextStatus });
});

// ---------------------------------------------------------------------------
// Admin Governance Routes (RBAC: ADMIN or SUPER_ADMIN)
// ---------------------------------------------------------------------------

app.get(
  '/api/admin/overview',
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  (_req: AuthenticatedRequest, res: Response) => {
    const walletAgg = db
      .prepare(
        `SELECT COALESCE(SUM(checking_balance_cents), 0) as checking,
                COALESCE(SUM(savings_balance_cents), 0) as savings
         FROM wallets`
      )
      .get() as { checking: number; savings: number };

    const userAgg = db
      .prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN account_status = 'ACTIVE' THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN account_status = 'FROZEN' THEN 1 ELSE 0 END) as frozen,
                SUM(CASE WHEN kyc_status = 'PENDING' THEN 1 ELSE 0 END) as pending_kyc
         FROM users`
      )
      .get() as any;

    const openDisputes = db
      .prepare(`SELECT COUNT(*) as count FROM disputes WHERE status = 'OPEN'`)
      .get() as { count: number };

    const openInquiries = db
      .prepare(`SELECT COUNT(*) as count FROM contact_inquiries WHERE status = 'NEW'`)
      .get() as { count: number };

    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const volRow = db
      .prepare(
        `SELECT COALESCE(SUM(amount_cents), 0) as volume
         FROM transactions
         WHERE created_at >= ? AND status != 'REVERSED'`
      )
      .get(since24h) as { volume: number };

    const recentAuditLogs = db
      .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 8')
      .all()
      .map((a: any) => ({
        id: a.id,
        actorId: a.actor_id,
        actorEmail: a.actor_email,
        actorRole: a.actor_role,
        action: a.action,
        targetType: a.target_type,
        targetId: a.target_id,
        detailsJson: a.details_json,
        createdAt: a.created_at,
      }));

    res.json({
      totalLiquidityCents: walletAgg.checking + walletAgg.savings,
      totalCheckingCents: walletAgg.checking,
      totalSavingsCents: walletAgg.savings,
      totalUsers: userAgg.total,
      activeUsers: userAgg.active,
      frozenUsers: userAgg.frozen,
      pendingKycCount: userAgg.pending_kyc,
      openDisputesCount: openDisputes.count,
      volume24hCents: volRow.volume,
      recentAuditLogs,
      openInquiriesCount: openInquiries.count,
    });
  }
);

app.get(
  '/api/admin/users',
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  (req: AuthenticatedRequest, res: Response) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const roleFilter = String(req.query.role || 'ALL').toUpperCase();
    const statusFilter = String(req.query.status || 'ALL').toUpperCase();

    let rows = db
      .prepare(
        `SELECT u.*, p.name as plan_name, w.checking_balance_cents, w.savings_balance_cents
         FROM users u
         LEFT JOIN account_plans p ON u.plan_id = p.id
         LEFT JOIN wallets w ON u.id = w.user_id
         ORDER BY u.created_at DESC`
      )
      .all() as any[];

    if (q) {
      rows = rows.filter(
        (r) =>
          r.full_name.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.handle.toLowerCase().includes(q) ||
          r.account_number.includes(q)
      );
    }
    if (roleFilter !== 'ALL') {
      rows = rows.filter((r) => r.role === roleFilter);
    }
    if (statusFilter !== 'ALL') {
      rows = rows.filter((r) => r.account_status === statusFilter || r.kyc_status === statusFilter);
    }

    res.json({
      users: rows.map((r) => ({
        ...mapUserRow(r),
        checkingBalanceCents: r.checking_balance_cents ?? 0,
        savingsBalanceCents: r.savings_balance_cents ?? 0,
      })),
    });
  }
);

app.post(
  '/api/admin/users',
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  (req: AuthenticatedRequest, res: Response) => {
    const actor = req.authUser!;
    const fullName = String(req.body?.fullName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const rawHandle = String(req.body?.handle || fullName.split(' ')[0] || 'member');
    const role = String(req.body?.role || UserRole.USER).toUpperCase() as UserRole;
    const planId = String(req.body?.planId || 'plan_standard');
    const kycStatus = String(req.body?.kycStatus || KycStatus.VERIFIED).toUpperCase() as KycStatus;
    const initialBalanceCents = Math.max(0, Math.round(Number(req.body?.initialBalanceCents || 0)));

    if (fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
      res.status(400).json({ error: 'Valid full name, email, and password (min 8 chars) are required.' });
      return;
    }

    if (!Object.values(UserRole).includes(role)) {
      res.status(400).json({ error: 'Invalid role specified.' });
      return;
    }

    if (role !== UserRole.USER && actor.role !== UserRole.SUPER_ADMIN) {
      res.status(403).json({ error: 'Only SUPER_ADMIN may provision ADMIN or SUPER_ADMIN accounts.' });
      return;
    }

    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingEmail) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    let handle = normalizeHandle(rawHandle);
    if (db.prepare('SELECT id FROM users WHERE handle = ?').get(handle)) {
      handle = `${handle.slice(0, 16)}${Math.floor(100 + Math.random() * 900)}`;
    }

    const plan = db.prepare('SELECT * FROM account_plans WHERE id = ?').get(planId) as any;
    if (!plan) {
      res.status(400).json({ error: 'Selected account plan does not exist.' });
      return;
    }

    const userId = generateId('usr');
    const accountNumber = generateAccountNumber();
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(
        `INSERT INTO users (
          id, email, password_hash, full_name, handle, account_number,
          role, plan_id, kyc_status, account_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`
      ).run(
        userId,
        email,
        hashPassword(password),
        fullName,
        handle,
        accountNumber,
        role,
        plan.id,
        kycStatus,
        now
      );

      db.prepare(
        `INSERT INTO wallets (user_id, checking_balance_cents, savings_balance_cents, currency, updated_at)
         VALUES (?, ?, 0, 'NGN', ?)`
      ).run(userId, initialBalanceCents, now);

      if (initialBalanceCents > 0) {
        db.prepare(
          `INSERT INTO transactions (
            id, reference_code, type, sender_id, recipient_id, amount_cents, fee_cents, status, note, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, 'COMPLETED', ?, ?)`
        ).run(
          generateId('tx'),
          generateReferenceCode(),
          TransactionType.ADMIN_CREDIT,
          actor.id,
          userId,
          initialBalanceCents,
          `Opening balance provisioned by ${actor.email}`,
          now
        );
      }

      writeAuditLog({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'ADMIN_CREATED_ACCOUNT',
        targetType: 'USER',
        targetId: userId,
        details: { email, role, planId: plan.id, kycStatus, initialBalanceCents },
      });
    }).immediate();

    res.status(201).json({ ok: true, id: userId, accountNumber, handle });
  }
);

app.patch(
  '/api/admin/users/:id',
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  (req: AuthenticatedRequest, res: Response) => {
    const actor = req.authUser!;
    const targetId = req.params.id;
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as any;

    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const nextRole = req.body?.role ? (String(req.body.role).toUpperCase() as UserRole) : (target.role as UserRole);
    const nextKyc = req.body?.kycStatus
      ? (String(req.body.kycStatus).toUpperCase() as KycStatus)
      : (target.kyc_status as KycStatus);
    const nextStatus = req.body?.accountStatus
      ? (String(req.body.accountStatus).toUpperCase() as AccountStatus)
      : (target.account_status as AccountStatus);
    const nextPlanId = req.body?.planId ? String(req.body.planId) : target.plan_id;

    if (
      !Object.values(UserRole).includes(nextRole) ||
      !Object.values(KycStatus).includes(nextKyc) ||
      !Object.values(AccountStatus).includes(nextStatus)
    ) {
      res.status(400).json({ error: 'Invalid role, KYC status, or account status value.' });
      return;
    }

    if (nextRole !== target.role) {
      if (actor.role !== UserRole.SUPER_ADMIN) {
        res.status(403).json({ error: 'Only SUPER_ADMIN may modify user RBAC roles.' });
        return;
      }
      if (target.id === actor.id) {
        res.status(400).json({ error: 'You cannot alter your own administrative role.' });
        return;
      }
    }

    if (nextStatus !== target.account_status && target.id === actor.id) {
      res.status(400).json({ error: 'You cannot freeze your own administrative account.' });
      return;
    }

    const plan = db.prepare('SELECT id FROM account_plans WHERE id = ?').get(nextPlanId);
    if (!plan) {
      res.status(400).json({ error: 'Invalid account plan.' });
      return;
    }

    db.transaction(() => {
      db.prepare(
        `UPDATE users SET role = ?, kyc_status = ?, account_status = ?, plan_id = ? WHERE id = ?`
      ).run(nextRole, nextKyc, nextStatus, nextPlanId, targetId);

      writeAuditLog({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'ADMIN_UPDATED_USER',
        targetType: 'USER',
        targetId,
        details: {
          before: {
            role: target.role,
            kycStatus: target.kyc_status,
            accountStatus: target.account_status,
            planId: target.plan_id,
          },
          after: {
            role: nextRole,
            kycStatus: nextKyc,
            accountStatus: nextStatus,
            planId: nextPlanId,
          },
        },
      });
    }).immediate();

    res.json({ ok: true });
  }
);

app.post(
  '/api/admin/users/:id/adjust-balance',
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  (req: AuthenticatedRequest, res: Response) => {
    const actor = req.authUser!;
    const targetId = req.params.id;
    const type = String(req.body?.type || 'CREDIT').toUpperCase(); // CREDIT | DEBIT
    const amountCents = parsePositiveKobo(req.body?.amountCents);
    const reason = String(req.body?.reason || '').trim();

    if (amountCents === null || reason.length < 5) {
      res.status(400).json({ error: 'Positive amount and a clear reason (at least 5 chars) are required.' });
      return;
    }

    try {
      db.transaction(() => {
        const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as any;
        const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(targetId) as any;
        if (!target || !wallet) {
          throw Object.assign(new Error('Target user wallet not found.'), { status: 404 });
        }

        const now = new Date().toISOString();
        if (type === 'DEBIT') {
          if (wallet.checking_balance_cents < amountCents) {
            throw Object.assign(new Error('Debit exceeds user checking balance.'), { status: 400 });
          }
          db.prepare(
            `UPDATE wallets SET checking_balance_cents = checking_balance_cents - ?, updated_at = ? WHERE user_id = ?`
          ).run(amountCents, now, targetId);

          db.prepare(
            `INSERT INTO transactions (
              id, reference_code, type, sender_id, recipient_id, amount_cents, fee_cents, status, note, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 0, 'COMPLETED', ?, ?)`
          ).run(
            generateId('tx'),
            generateReferenceCode(),
            TransactionType.ADMIN_DEBIT,
            targetId,
            actor.id,
            amountCents,
            `Admin debit: ${reason}`,
            now
          );
        } else if (type === 'CREDIT') {
          db.prepare(
            `UPDATE wallets SET checking_balance_cents = checking_balance_cents + ?, updated_at = ? WHERE user_id = ?`
          ).run(amountCents, now, targetId);

          db.prepare(
            `INSERT INTO transactions (
              id, reference_code, type, sender_id, recipient_id, amount_cents, fee_cents, status, note, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 0, 'COMPLETED', ?, ?)`
          ).run(
            generateId('tx'),
            generateReferenceCode(),
            TransactionType.ADMIN_CREDIT,
            actor.id,
            targetId,
            amountCents,
            `Admin credit: ${reason}`,
            now
          );
        } else {
          throw Object.assign(new Error('Adjustment type must be CREDIT or DEBIT.'), { status: 400 });
        }

        writeAuditLog({
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          action: type === 'CREDIT' ? 'ADMIN_BALANCE_CREDIT' : 'ADMIN_BALANCE_DEBIT',
          targetType: 'WALLET',
          targetId,
          details: { amountCents, reason, targetEmail: target.email },
        });
      }).immediate();

      res.json({ ok: true });
    } catch (err: any) {
      res.status(err.status || 500).json({ error: err.message || 'Balance adjustment failed.' });
    }
  }
);

app.get(
  '/api/admin/users/:id/transactions',
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  (req: AuthenticatedRequest, res: Response) => {
    const userId = req.params.id;
    const transactions = db
      .prepare(
        `SELECT t.*,
                s.full_name as sender_name, s.handle as sender_handle,
                r.full_name as recipient_name, r.handle as recipient_handle,
                d.status as dispute_status, d.id as dispute_id
         FROM transactions t
         LEFT JOIN users s ON t.sender_id = s.id
         LEFT JOIN users r ON t.recipient_id = r.id
         LEFT JOIN disputes d ON d.transaction_id = t.id
         WHERE t.sender_id = ? OR t.recipient_id = ?
         ORDER BY t.created_at DESC
         LIMIT 50`
      )
      .all(userId, userId)
      .map(mapTransactionRow);

    res.json({ transactions });
  }
);

app.get(
  '/api/admin/plans',
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  (_req: AuthenticatedRequest, res: Response) => {
    const accountPlans = db
      .prepare('SELECT * FROM account_plans ORDER BY monthly_fee_cents ASC')
      .all()
      .map(mapPlanRow);
    const savingsPlans = db
      .prepare('SELECT * FROM savings_plans ORDER BY bonus_apy_bps ASC')
      .all()
      .map(mapSavingsPlanRow);
    res.json({ accountPlans, savingsPlans });
  }
);

app.post(
  '/api/admin/plans',
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  (req: AuthenticatedRequest, res: Response) => {
    const actor = req.authUser!;
    const name = String(req.body?.name || '').trim();
    const audience = String(req.body?.audience || '').trim();
    const tagline = String(req.body?.tagline || '').trim();
    const monthlyFeeCents = Math.max(0, Math.round(Number(req.body?.monthlyFeeCents || 0)));
    const dailyTransferLimitCents = Math.max(1000, Math.round(Number(req.body?.dailyTransferLimitCents || 100000)));
    const singleTransferLimitCents = Math.max(1000, Math.round(Number(req.body?.singleTransferLimitCents || 50000)));
    const p2pFeeBps = Math.max(0, Math.round(Number(req.body?.p2pFeeBps || 0)));
    const savingsApyBps = Math.max(0, Math.round(Number(req.body?.savingsApyBps || 200)));

    if (!name || !audience || !tagline) {
      res.status(400).json({ error: 'Plan name, audience, and tagline are required.' });
      return;
    }
    if (singleTransferLimitCents > dailyTransferLimitCents) {
      res.status(400).json({ error: 'Single transfer limit cannot exceed 24-hour daily transfer limit.' });
      return;
    }

    const id = generateId('plan');
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO account_plans (
        id, name, audience, tagline, monthly_fee_cents, daily_transfer_limit_cents,
        single_transfer_limit_cents, p2p_fee_bps, savings_apy_bps, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      id,
      name,
      audience,
      tagline,
      monthlyFeeCents,
      dailyTransferLimitCents,
      singleTransferLimitCents,
      p2pFeeBps,
      savingsApyBps,
      now
    );

    writeAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'ADMIN_CREATED_PLAN',
      targetType: 'ACCOUNT_PLAN',
      targetId: id,
      details: { name, dailyTransferLimitCents, p2pFeeBps, savingsApyBps },
    });

    res.status(201).json({ ok: true, id });
  }
);

app.patch(
  '/api/admin/plans/:id',
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  (req: AuthenticatedRequest, res: Response) => {
    const actor = req.authUser!;
    const planId = req.params.id;
    const existing = db.prepare('SELECT * FROM account_plans WHERE id = ?').get(planId) as any;

    if (!existing) {
      res.status(404).json({ error: 'Account plan not found.' });
      return;
    }

    const name = String(req.body?.name ?? existing.name).trim();
    const audience = String(req.body?.audience ?? existing.audience).trim();
    const tagline = String(req.body?.tagline ?? existing.tagline).trim();
    const monthlyFeeCents = Math.max(0, Math.round(Number(req.body?.monthlyFeeCents ?? existing.monthly_fee_cents)));
    const dailyTransferLimitCents = Math.max(
      1000,
      Math.round(Number(req.body?.dailyTransferLimitCents ?? existing.daily_transfer_limit_cents))
    );
    const singleTransferLimitCents = Math.max(
      1000,
      Math.round(Number(req.body?.singleTransferLimitCents ?? existing.single_transfer_limit_cents))
    );
    const p2pFeeBps = Math.max(0, Math.round(Number(req.body?.p2pFeeBps ?? existing.p2p_fee_bps)));
    const savingsApyBps = Math.max(0, Math.round(Number(req.body?.savingsApyBps ?? existing.savings_apy_bps)));
    const isActive = req.body?.isActive !== undefined ? (req.body.isActive ? 1 : 0) : existing.is_active;

    if (!name || !audience || !tagline) {
      res.status(400).json({ error: 'Plan name, audience, and tagline cannot be empty.' });
      return;
    }
    if (singleTransferLimitCents > dailyTransferLimitCents) {
      res.status(400).json({ error: 'Single transfer limit cannot exceed 24-hour daily transfer limit.' });
      return;
    }

    db.prepare(
      `UPDATE account_plans
       SET name = ?, audience = ?, tagline = ?, monthly_fee_cents = ?,
           daily_transfer_limit_cents = ?, single_transfer_limit_cents = ?,
           p2p_fee_bps = ?, savings_apy_bps = ?, is_active = ?
       WHERE id = ?`
    ).run(
      name,
      audience,
      tagline,
      monthlyFeeCents,
      dailyTransferLimitCents,
      singleTransferLimitCents,
      p2pFeeBps,
      savingsApyBps,
      isActive,
      planId
    );

    writeAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'ADMIN_UPDATED_PLAN',
      targetType: 'ACCOUNT_PLAN',
      targetId: planId,
      details: { name, monthlyFeeCents, dailyTransferLimitCents, singleTransferLimitCents, p2pFeeBps, savingsApyBps },
    });

    res.json({ ok: true });
  }
);

app.post(
  '/api/admin/savings-plans',
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  (req: AuthenticatedRequest, res: Response) => {
    const actor = req.authUser!;
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    const bonusApyBps = Math.max(0, Math.round(Number(req.body?.bonusApyBps || 0)));
    const minDepositCents = Math.max(0, Math.round(Number(req.body?.minDepositCents || 0)));
    const lockDays = Math.max(0, Math.round(Number(req.body?.lockDays || 0)));

    if (!name || !description) {
      res.status(400).json({ error: 'Savings plan name and description are required.' });
      return;
    }

    const id = generateId('sp');
    db.prepare(
      `INSERT INTO savings_plans (id, name, description, bonus_apy_bps, min_deposit_cents, lock_days, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(id, name, description, bonusApyBps, minDepositCents, lockDays, new Date().toISOString());

    writeAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'ADMIN_CREATED_SAVINGS_PLAN',
      targetType: 'SAVINGS_PLAN',
      targetId: id,
      details: { name, bonusApyBps, minDepositCents, lockDays },
    });

    res.status(201).json({ ok: true, id });
  }
);

app.patch(
  '/api/admin/savings-plans/:id',
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  (req: AuthenticatedRequest, res: Response) => {
    const actor = req.authUser!;
    const id = req.params.id;
    const existing = db.prepare('SELECT * FROM savings_plans WHERE id = ?').get(id) as any;

    if (!existing) {
      res.status(404).json({ error: 'Savings plan not found.' });
      return;
    }

    const name = String(req.body?.name ?? existing.name).trim();
    const description = String(req.body?.description ?? existing.description).trim();
    const bonusApyBps = Math.max(0, Math.round(Number(req.body?.bonusApyBps ?? existing.bonus_apy_bps)));
    const minDepositCents = Math.max(0, Math.round(Number(req.body?.minDepositCents ?? existing.min_deposit_cents)));
    const lockDays = Math.max(0, Math.round(Number(req.body?.lockDays ?? existing.lock_days)));
    const isActive = req.body?.isActive !== undefined ? (req.body.isActive ? 1 : 0) : existing.is_active;

    db.prepare(
      `UPDATE savings_plans
       SET name = ?, description = ?, bonus_apy_bps = ?, min_deposit_cents = ?, lock_days = ?, is_active = ?
       WHERE id = ?`
    ).run(name, description, bonusApyBps, minDepositCents, lockDays, isActive, id);

    writeAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'ADMIN_UPDATED_SAVINGS_PLAN',
      targetType: 'SAVINGS_PLAN',
      targetId: id,
      details: { name, bonusApyBps, minDepositCents, lockDays, isActive: Boolean(isActive) },
    });

    res.json({ ok: true });
  }
);

app.get(
  '/api/admin/disputes',
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  (_req: AuthenticatedRequest, res: Response) => {
    const rows = db
      .prepare(
        `SELECT d.*,
                t.reference_code, t.amount_cents, t.note as tx_note, t.recipient_id,
                u.full_name as opened_by_name, u.email as opened_by_email,
                r.full_name as recipient_name
         FROM disputes d
         JOIN transactions t ON d.transaction_id = t.id
         JOIN users u ON d.opened_by_user_id = u.id
         LEFT JOIN users r ON t.recipient_id = r.id
         ORDER BY CASE WHEN d.status = 'OPEN' THEN 0 ELSE 1 END, d.created_at DESC`
      )
      .all() as any[];

    res.json({
      disputes: rows.map((d) => ({
        id: d.id,
        transactionId: d.transaction_id,
        referenceCode: d.reference_code,
        amountCents: d.amount_cents,
        transactionNote: d.tx_note,
        openedByUserId: d.opened_by_user_id,
        openedByName: d.opened_by_name,
        openedByEmail: d.opened_by_email,
        recipientId: d.recipient_id,
        recipientName: d.recipient_name,
        reason: d.reason,
        status: d.status as DisputeStatus,
        resolutionNote: d.resolution_note,
        resolvedByAdminId: d.resolved_by_admin_id,
        createdAt: d.created_at,
        resolvedAt: d.resolved_at,
      })),
    });
  }
);

app.post(
  '/api/admin/disputes/:id/resolve',
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  (req: AuthenticatedRequest, res: Response) => {
    const actor = req.authUser!;
    const disputeId = req.params.id;
    const decision = String(req.body?.decision || '').toUpperCase(); // REVERSE | DISMISS
    const resolutionNote = String(req.body?.resolutionNote || '').trim();

    if (!resolutionNote || resolutionNote.length < 5) {
      res.status(400).json({ error: 'Resolution note (at least 5 characters) is required.' });
      return;
    }

    try {
      db.transaction(() => {
        const dispute = db.prepare('SELECT * FROM disputes WHERE id = ?').get(disputeId) as any;
        if (!dispute) {
          throw Object.assign(new Error('Dispute not found.'), { status: 404 });
        }
        if (dispute.status !== DisputeStatus.OPEN) {
          throw Object.assign(new Error('Dispute has already been resolved.'), { status: 400 });
        }

        const now = new Date().toISOString();

        if (decision === 'DISMISS') {
          db.prepare(
            `UPDATE disputes SET status = 'DISMISSED', resolution_note = ?, resolved_by_admin_id = ?, resolved_at = ? WHERE id = ?`
          ).run(resolutionNote, actor.id, now, disputeId);

          writeAuditLog({
            actorId: actor.id,
            actorEmail: actor.email,
            actorRole: actor.role,
            action: 'DISPUTE_DISMISSED',
            targetType: 'DISPUTE',
            targetId: disputeId,
            details: { transactionId: dispute.transaction_id, resolutionNote },
          });
          return;
        }

        if (decision !== 'REVERSE') {
          throw Object.assign(new Error('Decision must be REVERSE or DISMISS.'), { status: 400 });
        }

        const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(dispute.transaction_id) as any;
        if (!tx || tx.status === 'REVERSED') {
          throw Object.assign(new Error('Transaction cannot be reversed.'), { status: 400 });
        }

        const recipientWallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(tx.recipient_id) as any;
        if (!recipientWallet || recipientWallet.checking_balance_cents < tx.amount_cents) {
          throw Object.assign(
            new Error(
              'Recipient checking balance is insufficient for direct reversal. Adjust recipient balance or freeze account first.'
            ),
            { status: 409 }
          );
        }

        db.prepare(
          `UPDATE wallets SET checking_balance_cents = checking_balance_cents - ?, updated_at = ? WHERE user_id = ?`
        ).run(tx.amount_cents, now, tx.recipient_id);

        db.prepare(
          `UPDATE wallets SET checking_balance_cents = checking_balance_cents + ?, updated_at = ? WHERE user_id = ?`
        ).run(tx.amount_cents + tx.fee_cents, now, tx.sender_id);

        db.prepare(`UPDATE transactions SET status = 'REVERSED' WHERE id = ?`).run(tx.id);

        db.prepare(
          `INSERT INTO transactions (
            id, reference_code, type, sender_id, recipient_id, amount_cents, fee_cents, status, note, related_tx_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, 'COMPLETED', ?, ?, ?)`
        ).run(
          generateId('tx'),
          generateReferenceCode(),
          TransactionType.REVERSAL,
          tx.recipient_id,
          tx.sender_id,
          tx.amount_cents + tx.fee_cents,
          `Dispute reversal (${tx.reference_code}): ${resolutionNote}`,
          tx.id,
          now
        );

        db.prepare(
          `UPDATE disputes SET status = 'REVERSED', resolution_note = ?, resolved_by_admin_id = ?, resolved_at = ? WHERE id = ?`
        ).run(resolutionNote, actor.id, now, disputeId);

        writeAuditLog({
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          action: 'DISPUTE_REVERSED_FUNDS',
          targetType: 'DISPUTE',
          targetId: disputeId,
          details: { transactionId: tx.id, amountCents: tx.amount_cents, resolutionNote },
        });
      }).immediate();

      res.json({ ok: true });
    } catch (err: any) {
      res.status(err.status || 500).json({ error: err.message || 'Dispute resolution failed.' });
    }
  }
);

app.get(
  '/api/admin/audit-logs',
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  (req: AuthenticatedRequest, res: Response) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const actionFilter = String(req.query.action || 'ALL').toUpperCase();

    let rows = db
      .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 250')
      .all() as any[];

    if (actionFilter !== 'ALL') {
      rows = rows.filter((r) => r.action === actionFilter);
    }
    if (q) {
      rows = rows.filter(
        (r) =>
          r.actor_email.toLowerCase().includes(q) ||
          r.action.toLowerCase().includes(q) ||
          r.target_id.toLowerCase().includes(q) ||
          r.details_json.toLowerCase().includes(q)
      );
    }

    res.json({
      logs: rows.map((a) => ({
        id: a.id,
        actorId: a.actor_id,
        actorEmail: a.actor_email,
        actorRole: a.actor_role,
        action: a.action,
        targetType: a.target_type,
        targetId: a.target_id,
        detailsJson: a.details_json,
        createdAt: a.created_at,
      })),
    });
  }
);

app.get(
  '/api/admin/inquiries',
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  (_req: AuthenticatedRequest, res: Response) => {
    const rows = db.prepare('SELECT * FROM contact_inquiries ORDER BY created_at DESC').all() as any[];
    res.json({
      inquiries: rows.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        email: r.email,
        topic: r.topic,
        message: r.message,
        status: r.status,
        createdAt: r.created_at,
      })),
    });
  }
);

app.patch(
  '/api/admin/inquiries/:id',
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  (req: AuthenticatedRequest, res: Response) => {
    const actor = req.authUser!;
    const status = String(req.body?.status || 'REVIEWED').toUpperCase();
    if (status !== 'NEW' && status !== 'REVIEWED') {
      res.status(400).json({ error: 'Inquiry status must be NEW or REVIEWED.' });
      return;
    }
    const result = db.prepare('UPDATE contact_inquiries SET status = ? WHERE id = ?').run(status, req.params.id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Inquiry not found.' });
      return;
    }
    writeAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'ADMIN_UPDATED_INQUIRY',
      targetType: 'INQUIRY',
      targetId: req.params.id,
      details: { status },
    });
    res.json({ ok: true });
  }
);

app.all('/api/*', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Veloce Server Error]', err.message);
  if (!res.headersSent) {
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  }
});


export default app;
