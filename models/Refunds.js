const db = require('../db');

const toMoney = (value) => Number(Math.max(0, Number(value || 0)).toFixed(2));

const Refunds = {
  getUserRefunds(userId, callback) {
    const sql = `
      SELECT id, booking_id, booking_item_id, requested_amount, approved_amount, status, reason, requested_at, decided_at
      FROM refund_requests
      WHERE user_id = ?
    `;
    db.query(sql, [userId], (err, rows) => callback(err, rows || []));
  },

  getRefundByItemId(bookingItemId, callback) {
    const sql = `
      SELECT id, booking_id, booking_item_id, user_id, requested_amount, approved_amount, status, reason, requested_at
      FROM refund_requests
      WHERE booking_item_id = ?
      LIMIT 1
    `;
    db.query(sql, [bookingItemId], (err, rows) => callback(err, rows && rows[0] ? rows[0] : null));
  },

  requestRefund({ bookingId, bookingItemId, userId, requestedAmount, reason }, callback) {
    const amount = toMoney(requestedAmount);
    if (!bookingId || !bookingItemId || !userId || !reason || amount <= 0) {
      const err = new Error('INVALID_REQUEST');
      err.code = 'INVALID_REQUEST';
      return callback(err);
    }
    Refunds.getRefundByItemId(bookingItemId, (err, existing) => {
      if (err) return callback(err);
      if (existing && (existing.status === 'pending' || existing.status === 'approved')) {
        const busy = new Error('REFUND_EXISTS');
        busy.code = 'REFUND_EXISTS';
        return callback(busy);
      }
      if (existing && existing.status === 'rejected') {
        const updateSql = `
          UPDATE refund_requests
          SET requested_amount = ?, reason = ?, status = 'pending',
              approved_amount = NULL, decided_at = NULL, decided_by = NULL, requested_at = NOW()
          WHERE id = ?
        `;
        return db.query(updateSql, [amount, reason, existing.id], (updateErr) => callback(updateErr));
      }
      const insertSql = `
        INSERT INTO refund_requests
          (booking_id, booking_item_id, user_id, requested_amount, reason, status, requested_at)
        VALUES (?, ?, ?, ?, ?, 'pending', NOW())
      `;
      return db.query(insertSql, [bookingId, bookingItemId, userId, amount, reason], (insertErr) => callback(insertErr));
    });
  },

  getAdminRefunds(options, callback) {
    const resolved = options || {};
    const limit = Number.isFinite(Number(resolved.limit)) ? Number(resolved.limit) : 8;
    const offset = Number.isFinite(Number(resolved.offset)) ? Number(resolved.offset) : 0;
    const sort = resolved.sort || 'newest';
    const params = [];
    let where = 'WHERE 1=1';

    if (resolved.search) {
      where += ` AND (
        LOWER(student.username) LIKE ?
        OR LOWER(coach.username) LIKE ?
        OR LOWER(bi.listing_title) LIKE ?
        OR LOWER(COALESCE(bi.sport, '')) LIKE ?
      )`;
      const term = `%${String(resolved.search).toLowerCase()}%`;
      params.push(term, term, term, term);
    }

    if (resolved.status) {
      where += ' AND rr.status = ?';
      params.push(resolved.status);
    }

    const orderBy = (() => {
      if (sort === 'oldest') return 'rr.requested_at ASC';
      if (sort === 'highest') return 'rr.requested_amount DESC, rr.requested_at DESC';
      if (sort === 'lowest') return 'rr.requested_amount ASC, rr.requested_at DESC';
      return 'rr.requested_at DESC';
    })();

    const countSql = `
      SELECT COUNT(*) AS count
      FROM refund_requests rr
      JOIN users student ON student.id = rr.user_id
      JOIN booking_items bi ON bi.id = rr.booking_item_id
      JOIN users coach ON coach.id = bi.coach_id
      ${where}
    `;

    const dataSql = `
      SELECT
        rr.id,
        rr.booking_id,
        rr.booking_item_id,
        rr.user_id,
        rr.requested_amount,
        rr.approved_amount,
        rr.status,
        rr.reason,
        rr.requested_at,
        rr.decided_at,
        student.username AS student_name,
        student.email AS student_email,
        coach.username AS coach_name,
        bi.listing_title,
        bi.sport,
        bi.session_date,
        bi.session_time,
        (bi.price * bi.quantity) AS item_total
      FROM refund_requests rr
      JOIN users student ON student.id = rr.user_id
      JOIN booking_items bi ON bi.id = rr.booking_item_id
      JOIN users coach ON coach.id = bi.coach_id
      ${where}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;

    db.query(countSql, params, (countErr, countRows) => {
      if (countErr) return callback(countErr);
      const total = countRows && countRows[0] ? Number(countRows[0].count || 0) : 0;
      db.query(dataSql, [...params, limit, offset], (dataErr, rows) => {
        if (dataErr) return callback(dataErr);
        return callback(null, { rows: rows || [], total });
      });
    });
  },

  approveRefund(refundId, adminId, approvedAmount, callback) {
    const amount = toMoney(approvedAmount);
    if (!refundId || amount <= 0) {
      const err = new Error('INVALID_AMOUNT');
      err.code = 'INVALID_AMOUNT';
      return callback(err);
    }

    db.beginTransaction((txErr) => {
      if (txErr) return callback(txErr);
      const selectSql = `
        SELECT id, user_id, booking_id, requested_amount, status
        FROM refund_requests
        WHERE id = ?
        FOR UPDATE
      `;
      db.query(selectSql, [refundId], (selectErr, rows) => {
        if (selectErr) return db.rollback(() => callback(selectErr));
        const refund = rows && rows[0] ? rows[0] : null;
        if (!refund || refund.status !== 'pending') {
          return db.rollback(() => {
            const err = new Error('NOT_PENDING');
            err.code = 'NOT_PENDING';
            return callback(err);
          });
        }
        const max = toMoney(refund.requested_amount);
        if (amount > max) {
          return db.rollback(() => {
            const err = new Error('AMOUNT_TOO_HIGH');
            err.code = 'AMOUNT_TOO_HIGH';
            return callback(err);
          });
        }

        const ensureWalletSql = `
          INSERT IGNORE INTO wallets (user_id, balance, points)
          VALUES (?, 0, 0)
        `;
        db.query(ensureWalletSql, [refund.user_id], (ensureErr) => {
          if (ensureErr) return db.rollback(() => callback(ensureErr));

          const updateRefundSql = `
            UPDATE refund_requests
            SET status = 'approved',
                approved_amount = ?,
                decided_at = NOW(),
                decided_by = ?
            WHERE id = ?
              AND status = 'pending'
          `;
          db.query(updateRefundSql, [amount, adminId || null, refundId], (updateErr, result) => {
            if (updateErr) return db.rollback(() => callback(updateErr));
            if (!result || result.affectedRows === 0) {
              return db.rollback(() => {
                const err = new Error('NOT_PENDING');
                err.code = 'NOT_PENDING';
                return callback(err);
              });
            }

            const updateWalletSql = `
              UPDATE wallets
              SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
              WHERE user_id = ?
            `;
            db.query(updateWalletSql, [amount, refund.user_id], (walletErr) => {
              if (walletErr) return db.rollback(() => callback(walletErr));

              const insertTxnSql = `
                INSERT INTO wallet_transactions
                  (user_id, amount, method, type, status, order_id, description)
                VALUES (?, ?, 'refund', 'REFUND', 'completed', ?, 'Refund approved')
              `;
              db.query(insertTxnSql, [refund.user_id, amount, refund.booking_id], (txnErr) => {
                if (txnErr) return db.rollback(() => callback(txnErr));
                return db.commit((commitErr) => {
                  if (commitErr) return db.rollback(() => callback(commitErr));
                  return callback(null);
                });
              });
            });
          });
        });
      });
    });
  },

  rejectRefund(refundId, adminId, callback) {
    const sql = `
      UPDATE refund_requests
      SET status = 'rejected',
          approved_amount = 0,
          decided_at = NOW(),
          decided_by = ?
      WHERE id = ?
        AND status = 'pending'
    `;
    db.query(sql, [adminId || null, refundId], (err, result) => {
      if (err) return callback(err);
      if (!result || result.affectedRows === 0) {
        const noRow = new Error('NOT_PENDING');
        noRow.code = 'NOT_PENDING';
        return callback(noRow);
      }
      return callback(null);
    });
  }
};

module.exports = Refunds;
