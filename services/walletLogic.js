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

module.exports = { isValidTopUpAmount, clampWalletDeduction };
