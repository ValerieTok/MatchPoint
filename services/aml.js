const Account = require('../models/Account');
const AmlAlerts = require('../models/AmlAlerts');
const Wallet = require('../models/Wallet');

const readNumber = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const AML_ENABLED = String(process.env.AML_ENABLED || '').toLowerCase() !== 'false';
const AML_NEW_ACCOUNT_DAYS = readNumber(process.env.AML_NEW_ACCOUNT_DAYS, 30);
const AML_HIGH_VALUE_THRESHOLD = readNumber(process.env.AML_HIGH_VALUE_THRESHOLD, 999);
const AML_NEW_ACCOUNT_PAYOUT_CAP = readNumber(process.env.AML_NEW_ACCOUNT_PAYOUT_CAP, 999);
const AML_NEW_ACCOUNT_TOPUP_CAP = readNumber(process.env.AML_NEW_ACCOUNT_TOPUP_CAP, 999);
const AML_NEW_ACCOUNT_TOPUP_MONTHLY_CAP = readNumber(process.env.AML_NEW_ACCOUNT_TOPUP_MONTHLY_CAP, 999);
const AML_NEW_ACCOUNT_TOPUP_MONTHLY_DAYS = readNumber(process.env.AML_NEW_ACCOUNT_TOPUP_MONTHLY_DAYS, 30);
const AML_EXISTING_ACCOUNT_TOPUP_WEEKLY_CAP = readNumber(process.env.AML_EXISTING_ACCOUNT_TOPUP_WEEKLY_CAP, 999);
const AML_EXISTING_ACCOUNT_TOPUP_WEEKLY_DAYS = readNumber(process.env.AML_EXISTING_ACCOUNT_TOPUP_WEEKLY_DAYS, 7);
const AML_BLOCK_SECONDS = readNumber(process.env.AML_BLOCK_SECONDS, 30);
const amlBlockUntilByUser = new Map();

const isNewAccountByDate = (createdAt) => {
  if (!createdAt) return false;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  const days = AML_NEW_ACCOUNT_DAYS;
  if (!Number.isFinite(days) || days <= 0) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return created.getTime() >= cutoff;
};

const getUserCreatedAt = (userId) =>
  new Promise((resolve, reject) => {
    Account.getUserCreatedAt(userId, (err, row) => (err ? reject(err) : resolve(row ? row.created_at : null)));
  });

const isNewAccount = async (userId) => {
  if (!AML_ENABLED) return false;
  const createdAt = await getUserCreatedAt(userId);
  return isNewAccountByDate(createdAt);
};

const maybeFlagHighValue = async (data) => {
  if (!AML_ENABLED) return false;
  const amount = Number(data.amount || 0);
  if (!Number.isFinite(amount) || amount <= AML_HIGH_VALUE_THRESHOLD) return false;
  return new Promise((resolve) => {
    AmlAlerts.createAlert({
      user_id: data.user_id,
      alert_type: data.alert_type,
      reference_type: data.reference_type,
      reference_id: data.reference_id,
      amount,
      currency: data.currency || 'SGD',
      reason: data.reason || `High value transaction > ${AML_HIGH_VALUE_THRESHOLD}`
    }, () => resolve(true));
  });
};

const enforceNewAccountCap = async (userId, capType, amount) => {
  if (!AML_ENABLED) return { ok: true };
  const numericAmount = Number(amount || 0);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return { ok: true };
  const isNew = await isNewAccount(userId);
  let cap = null;
  if (capType === 'payout') {
    if (!isNew) return { ok: true };
    cap = AML_NEW_ACCOUNT_PAYOUT_CAP;
    if (!Number.isFinite(cap) || cap <= 0) return { ok: true };
    if (numericAmount > cap) {
      return { ok: false, cap, reason: 'per_transaction' };
    }
    return { ok: true };
  }

  if (capType === 'topup') {
    if (isNew) {
      cap = AML_NEW_ACCOUNT_TOPUP_CAP;
      if (Number.isFinite(cap) && cap > 0 && numericAmount > cap) {
        return { ok: false, cap, reason: 'per_transaction' };
      }
    }
    if (isNew && Number.isFinite(AML_NEW_ACCOUNT_TOPUP_MONTHLY_CAP) && AML_NEW_ACCOUNT_TOPUP_MONTHLY_CAP > 0) {
      const monthlyTotal = await new Promise((resolve, reject) => {
        Wallet.getTopUpTotalSince(
          userId,
          AML_NEW_ACCOUNT_TOPUP_MONTHLY_DAYS,
          (err, total) => (err ? reject(err) : resolve(total))
        );
      });
      if (Number(monthlyTotal || 0) + numericAmount > AML_NEW_ACCOUNT_TOPUP_MONTHLY_CAP) {
        return { ok: false, cap: AML_NEW_ACCOUNT_TOPUP_MONTHLY_CAP, reason: 'monthly' };
      }
    }
    if (!isNew && Number.isFinite(AML_EXISTING_ACCOUNT_TOPUP_WEEKLY_CAP) && AML_EXISTING_ACCOUNT_TOPUP_WEEKLY_CAP > 0) {
      const weeklyTotal = await new Promise((resolve, reject) => {
        Wallet.getTopUpTotalSince(
          userId,
          AML_EXISTING_ACCOUNT_TOPUP_WEEKLY_DAYS,
          (err, total) => (err ? reject(err) : resolve(total))
        );
      });
      if (Number(weeklyTotal || 0) + numericAmount > AML_EXISTING_ACCOUNT_TOPUP_WEEKLY_CAP) {
        return { ok: false, cap: AML_EXISTING_ACCOUNT_TOPUP_WEEKLY_CAP, reason: 'weekly' };
      }
    }
  }
  return { ok: true };
};

const blockPaymentIfHighValue = (userId, amount) => {
  if (!AML_ENABLED) return { blocked: false, remainingMs: 0 };
  if (!Number.isFinite(AML_BLOCK_SECONDS) || AML_BLOCK_SECONDS <= 0) {
    return { blocked: false, remainingMs: 0 };
  }
  const numericAmount = Number(amount || 0);
  if (!Number.isFinite(numericAmount) || numericAmount < AML_HIGH_VALUE_THRESHOLD) {
    return { blocked: false, remainingMs: 0 };
  }
  const now = Date.now();
  const existing = amlBlockUntilByUser.get(userId);
  if (existing && existing > now) {
    return { blocked: true, remainingMs: existing - now };
  }
  const seconds = AML_BLOCK_SECONDS;
  const until = now + seconds * 1000;
  amlBlockUntilByUser.set(userId, until);
  return { blocked: true, remainingMs: until - now };
};

module.exports = {
  AML_ENABLED,
  AML_NEW_ACCOUNT_DAYS,
  AML_HIGH_VALUE_THRESHOLD,
  AML_NEW_ACCOUNT_PAYOUT_CAP,
  AML_NEW_ACCOUNT_TOPUP_CAP,
  AML_NEW_ACCOUNT_TOPUP_MONTHLY_CAP,
  AML_NEW_ACCOUNT_TOPUP_MONTHLY_DAYS,
  AML_EXISTING_ACCOUNT_TOPUP_WEEKLY_CAP,
  AML_EXISTING_ACCOUNT_TOPUP_WEEKLY_DAYS,
  AML_BLOCK_SECONDS,
  isNewAccount,
  enforceNewAccountCap,
  maybeFlagHighValue,
  blockPaymentIfHighValue
};
