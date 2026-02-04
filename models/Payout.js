const db = require('../db');

const Payout = {
  createRequest(data, callback) {
    const sql = `
      INSERT INTO payout_requests (coach_id, amount, currency, paypal_email, status)
      VALUES (?, ?, ?, ?, 'requested')
    `;
    db.query(sql, [data.coach_id, data.amount, data.currency, data.paypal_email], (err, result) => callback(err, result));
  },

  listRequests(filters, callback) {
    const status = filters && filters.status ? String(filters.status).toLowerCase() : '';
    const params = [];
    let sql = `
      SELECT pr.id, pr.coach_id, pr.amount, pr.currency, pr.paypal_email, pr.status,
             pr.created_at, pr.approved_at, pr.approved_by, pr.payout_batch_id, pr.payout_item_id, pr.failure_reason,
             u.username, u.full_name, u.email
      FROM payout_requests pr
      JOIN users u ON u.id = pr.coach_id
    `;
    if (status) {
      sql += ' WHERE pr.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY pr.created_at DESC, pr.id DESC';
    db.query(sql, params, (err, rows) => callback(err, rows || []));
  },

  listRequestsByCoach(coachId, callback) {
    const sql = `
      SELECT id, coach_id, amount, currency, paypal_email, status, created_at, approved_at, payout_batch_id, payout_item_id, failure_reason
      FROM payout_requests
      WHERE coach_id = ?
      ORDER BY created_at DESC, id DESC
    `;
    db.query(sql, [coachId], (err, rows) => callback(err, rows || []));
  },

  getRequestById(id, callback) {
    const sql = `
      SELECT pr.id, pr.coach_id, pr.amount, pr.currency, pr.paypal_email, pr.status,
             pr.created_at, pr.approved_at, pr.approved_by, pr.payout_batch_id, pr.payout_item_id, pr.failure_reason,
             u.username, u.full_name, u.email
      FROM payout_requests pr
      JOIN users u ON u.id = pr.coach_id
      WHERE pr.id = ?
      LIMIT 1
    `;
    db.query(sql, [id], (err, rows) => callback(err, rows && rows[0] ? rows[0] : null));
  },

  approveRequest(id, adminId, callback) {
    const sql = `
      UPDATE payout_requests
      SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'requested'
    `;
    db.query(sql, [adminId, id], (err, result) => callback(err, result));
  },

  markRequestStatus(id, status, fields, callback) {
    const updateFields = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [status];
    if (fields && fields.payout_batch_id !== undefined) {
      updateFields.push('payout_batch_id = ?');
      params.push(fields.payout_batch_id || null);
    }
    if (fields && fields.payout_item_id !== undefined) {
      updateFields.push('payout_item_id = ?');
      params.push(fields.payout_item_id || null);
    }
    if (fields && fields.failure_reason !== undefined) {
      updateFields.push('failure_reason = ?');
      params.push(fields.failure_reason || null);
    }
    params.push(id);
    const sql = `UPDATE payout_requests SET ${updateFields.join(', ')} WHERE id = ?`;
    db.query(sql, params, (err, result) => callback(err, result));
  },

  createPayoutRecord(data, callback) {
    const sql = `
      INSERT INTO payouts (request_id, coach_id, amount, currency, payout_batch_id, payout_item_id, payout_status, raw_response)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    db.query(sql, [
      data.request_id,
      data.coach_id,
      data.amount,
      data.currency,
      data.payout_batch_id || null,
      data.payout_item_id || null,
      data.payout_status,
      data.raw_response || null
    ], (err, result) => callback(err, result));
  },

  getLatestPayoutByRequest(requestId, callback) {
    const sql = `
      SELECT id, request_id, coach_id, amount, currency, payout_batch_id, payout_item_id, payout_status, raw_response, created_at
      FROM payouts
      WHERE request_id = ?
      ORDER BY id DESC
      LIMIT 1
    `;
    db.query(sql, [requestId], (err, rows) => callback(err, rows && rows[0] ? rows[0] : null));
  },

  updatePayoutStatus(id, status, rawResponse, callback) {
    const sql = `
      UPDATE payouts
      SET payout_status = ?, raw_response = ?
      WHERE id = ?
    `;
    db.query(sql, [status, rawResponse || null, id], (err, result) => callback(err, result));
  },

  getTotalPaidForCoach(coachId, callback) {
    const sql = `
      SELECT COALESCE(SUM(amount), 0) AS totalPaid
      FROM payouts
      WHERE coach_id = ?
        AND payout_status IN ('SUCCESS', 'COMPLETED')
    `;
    db.query(sql, [coachId], (err, rows) => {
      if (err) return callback(err);
      const row = rows && rows[0] ? rows[0] : {};
      return callback(null, Number(row.totalPaid || 0));
    });
  }
};

module.exports = Payout;
