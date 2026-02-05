const db = require('../db');

const Wallet = {
  ensureWallet(userId, callback) {
    const sql = `INSERT IGNORE INTO wallets (user_id, balance, points) VALUES (?, 0, 0)`;
    db.query(sql, [userId], (err) => callback(err));
  },

  getWalletByUserId(userId, callback) {
    const sql = 'SELECT user_id, balance, points, updated_at FROM wallets WHERE user_id = ? LIMIT 1';
    db.query(sql, [userId], (err, rows) => {
      if (err) return callback(err);
      return callback(null, rows && rows[0] ? rows[0] : null);
    });
  },

  getRecentTransactions(userId, limit, callback) {
    const capped = Number.isFinite(Number(limit)) ? Number(limit) : 10;
    const sql = `
      SELECT id, amount, method, type, status, order_id, created_at
      FROM wallet_transactions
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `;
    db.query(sql, [userId, capped], (err, rows) => callback(err, rows || []));
  },
  getBookingWalletDeduction(orderId, callback) {
    const sql = `
      SELECT COALESCE(ABS(SUM(amount)), 0) AS deduction
      FROM wallet_transactions
      WHERE order_id = ?
        AND method = 'wallet'
        AND type = 'DEBIT'
    `;
    db.query(sql, [orderId], (err, rows) => {
      if (err) return callback(err);
      const row = rows && rows[0] ? rows[0] : {};
      return callback(null, Number(row.deduction || 0));
    });
  },

  addTopUp(userId, amount, method, callback) {
    const points = Math.max(0, Math.round(amount));
    db.beginTransaction((txErr) => {
      if (txErr) return callback(txErr);

      const updateSql = `
        UPDATE wallets
        SET balance = balance + ?, points = points + ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `;
      db.query(updateSql, [amount, points, userId], (updateErr) => {
        if (updateErr) {
          return db.rollback(() => callback(updateErr));
        }

        const insertSql = `
          INSERT INTO wallet_transactions (user_id, amount, method, type, status, order_id, description)
          VALUES (?, ?, ?, 'TOPUP', 'completed', NULL, 'Wallet top up')
        `;
        db.query(insertSql, [userId, amount, method], (insertErr) => {
          if (insertErr) {
            return db.rollback(() => callback(insertErr));
          }
          return db.commit((commitErr) => {
            if (commitErr) {
              return db.rollback(() => callback(commitErr));
            }
            return callback(null);
          });
        });
      });
    });
  }
  ,
  deductForBooking(userId, amount, orderId, callback) {
    const amt = Number(amount) || 0;
    if (amt <= 0) return callback(new Error('Invalid amount'));
    db.beginTransaction((txErr) => {
      if (txErr) return callback(txErr);

      const updateSql = `
        UPDATE wallets
        SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND balance >= ?
      `;
      db.query(updateSql, [amt, userId, amt], (updateErr, result) => {
        if (updateErr) {
          return db.rollback(() => callback(updateErr));
        }
        if (!result || result.affectedRows === 0) {
          return db.rollback(() => callback(new Error('INSUFFICIENT_FUNDS')));
        }

        const insertSql = `
          INSERT INTO wallet_transactions (user_id, amount, method, type, status, order_id, description)
          VALUES (?, ?, 'wallet', 'DEBIT', 'completed', ?, 'Booking payment')
        `;
        db.query(insertSql, [userId, -amt, orderId || null], (insertErr) => {
          if (insertErr) {
            return db.rollback(() => callback(insertErr));
          }
          return db.commit((commitErr) => {
            if (commitErr) {
              return db.rollback(() => callback(commitErr));
            }
            return callback(null);
          });
        });
      });
    });
  }
};

module.exports = Wallet;
