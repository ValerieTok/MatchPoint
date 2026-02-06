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
  if (!Number.isFinite(amount) || amount < AML_HIGH_VALUE_THRESHOLD) return false;
  return new Promise((resolve) => {
    AmlAlerts.createAlert({
      user_id: data.user_id,
      alert_type: data.alert_type,
      reference_type: data.reference_type,
      reference_id: data.reference_id,
      amount,
      currency: data.currency || 'SGD',
      reason: data.reason || `High value transaction >= ${AML_HIGH_VALUE_THRESHOLD}`
    }, () => resolve(true));
  });
};

const maybeFlagTopUpThreshold = async (userId, amount) => {
  if (!AML_ENABLED) return false;
  const numericAmount = Number(amount || 0);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return false;
  const isNew = await isNewAccount(userId);
  if (isNew && Number.isFinite(AML_NEW_ACCOUNT_TOPUP_MONTHLY_CAP) && AML_NEW_ACCOUNT_TOPUP_MONTHLY_CAP > 0) {
    const monthlyTotal = await new Promise((resolve, reject) => {
      Wallet.getTopUpTotalSince(
        userId,
        AML_NEW_ACCOUNT_TOPUP_MONTHLY_DAYS,
        (err, total) => (err ? reject(err) : resolve(total))
      );
    });
    const total = Number(monthlyTotal || 0);
    const previous = Math.max(0, total - numericAmount);
    if (previous < AML_NEW_ACCOUNT_TOPUP_MONTHLY_CAP && total >= AML_NEW_ACCOUNT_TOPUP_MONTHLY_CAP) {
      return maybeFlagHighValue({
        user_id: userId,
        alert_type: 'topup',
        reference_type: 'wallet_topup',
        reference_id: null,
        amount: total,
        currency: 'SGD',
        reason: `Monthly top up total reached ${AML_NEW_ACCOUNT_TOPUP_MONTHLY_CAP}`
      });
    }
    return false;
  }

  if (!isNew && Number.isFinite(AML_EXISTING_ACCOUNT_TOPUP_WEEKLY_CAP) && AML_EXISTING_ACCOUNT_TOPUP_WEEKLY_CAP > 0) {
    const weeklyTotal = await new Promise((resolve, reject) => {
      Wallet.getTopUpTotalSince(
        userId,
        AML_EXISTING_ACCOUNT_TOPUP_WEEKLY_DAYS,
        (err, total) => (err ? reject(err) : resolve(total))
      );
    });
    const total = Number(weeklyTotal || 0);
    const previous = Math.max(0, total - numericAmount);
    if (previous < AML_EXISTING_ACCOUNT_TOPUP_WEEKLY_CAP && total >= AML_EXISTING_ACCOUNT_TOPUP_WEEKLY_CAP) {
      return maybeFlagHighValue({
        user_id: userId,
        alert_type: 'topup',
        reference_type: 'wallet_topup',
        reference_id: null,
        amount: total,
        currency: 'SGD',
        reason: `Weekly top up total reached ${AML_EXISTING_ACCOUNT_TOPUP_WEEKLY_CAP}`
      });
    }
  }
  return false;
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
  isNewAccount,
  maybeFlagTopUpThreshold,
  maybeFlagHighValue
};
