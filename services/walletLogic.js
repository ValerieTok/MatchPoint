const isValidTopUpAmount = (amount) => {
  const amt = Number(amount);
  if (!Number.isFinite(amt)) return false;
  if (!Number.isInteger(amt)) return false;
  return amt > 0 && amt % 10 === 0;
};

const clampWalletDeduction = (raw, walletBalance, totalDue) => {
  let amt = Number(raw);
  if (!Number.isFinite(amt)) amt = 0;
  amt = Math.max(0, amt);
  const max = Math.max(0, Math.min(Number(walletBalance || 0), Number(totalDue || 0)));
  return Number(Math.min(amt, max).toFixed(2));
};

const getWalletTier = (points) => {
  const pts = Number(points) || 0;
  if (pts >= 1000) return 'Gold';
  if (pts >= 500) return 'Silver';
  if (pts >= 100) return 'Bronze';
  return 'Starter';
};

module.exports = { isValidTopUpAmount, clampWalletDeduction, getWalletTier };
