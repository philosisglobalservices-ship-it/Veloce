export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum KycStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  FROZEN = 'FROZEN',
}

export enum TransactionType {
  P2P_TRANSFER = 'P2P_TRANSFER',
  DEPOSIT = 'DEPOSIT',
  SAVINGS_MOVE = 'SAVINGS_MOVE',
  ADMIN_CREDIT = 'ADMIN_CREDIT',
  ADMIN_DEBIT = 'ADMIN_DEBIT',
  REVERSAL = 'REVERSAL',
}

export enum PaymentRequestStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  DECLINED = 'DECLINED',
  CANCELLED = 'CANCELLED',
}

export enum DisputeStatus {
  OPEN = 'OPEN',
  REVERSED = 'REVERSED',
  DISMISSED = 'DISMISSED',
}

export interface AccountPlan {
  id: string;
  name: string;
  audience: string;
  tagline: string;
  monthlyFeeCents: number;
  dailyTransferLimitCents: number;
  singleTransferLimitCents: number;
  p2pFeeBps: number;
  savingsApyBps: number;
  isActive: boolean;
  createdAt: string;
}

export interface SavingsPlan {
  id: string;
  name: string;
  description: string;
  bonusApyBps: number;
  minDepositCents: number;
  lockDays: number;
  isActive: boolean;
  createdAt: string;
}

export interface Wallet {
  userId: string;
  checkingBalanceCents: number;
  savingsBalanceCents: number;
  currency: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  handle: string;
  accountNumber: string;
  role: UserRole;
  planId: string;
  planName?: string;
  kycStatus: KycStatus;
  accountStatus: AccountStatus;
  createdAt: string;
}

export interface AdminUserRecord extends UserProfile {
  checkingBalanceCents: number;
  savingsBalanceCents: number;
}

export interface SavingsVault {
  id: string;
  userId: string;
  savingsPlanId: string;
  planName: string;
  bonusApyBps: number;
  lockDays: number;
  name: string;
  targetCents: number;
  balanceCents: number;
  createdAt: string;
}

export interface TransactionRecord {
  id: string;
  referenceCode: string;
  type: TransactionType;
  senderId: string | null;
  senderName: string | null;
  senderHandle: string | null;
  recipientId: string | null;
  recipientName: string | null;
  recipientHandle: string | null;
  amountCents: number;
  feeCents: number;
  status: string;
  note: string;
  relatedTxId: string | null;
  disputeStatus: DisputeStatus | null;
  disputeId: string | null;
  createdAt: string;
}

export interface PaymentRequestRecord {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterHandle: string;
  payerId: string;
  payerName: string;
  payerHandle: string;
  amountCents: number;
  note: string;
  status: PaymentRequestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DisputeRecord {
  id: string;
  transactionId: string;
  referenceCode: string;
  amountCents: number;
  transactionNote: string;
  openedByUserId: string;
  openedByName: string;
  openedByEmail: string;
  recipientId: string | null;
  recipientName: string | null;
  reason: string;
  status: DisputeStatus;
  resolutionNote: string | null;
  resolvedByAdminId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AuditLogRecord {
  id: string;
  actorId: string | null;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  detailsJson: string;
  createdAt: string;
}

export interface ContactInquiryRecord {
  id: string;
  fullName: string;
  email: string;
  topic: string;
  message: string;
  status: string;
  createdAt: string;
}

export interface BankingOverview {
  user: UserProfile;
  wallet: Wallet;
  plan: AccountPlan;
  dailySentCents: number;
  vaults: SavingsVault[];
  recentTransactions: TransactionRecord[];
  pendingIncomingRequests: number;
}

export interface AdminOverview {
  totalLiquidityCents: number;
  totalCheckingCents: number;
  totalSavingsCents: number;
  totalUsers: number;
  activeUsers: number;
  frozenUsers: number;
  pendingKycCount: number;
  openDisputesCount: number;
  volume24hCents: number;
  recentAuditLogs: AuditLogRecord[];
  openInquiriesCount: number;
}
