const db = require('../db');

const AmlAlerts = {
  createAlert(data, callback) {
    const sql = `
      INSERT INTO aml_alerts (user_id, alert_type, reference_type, reference_id, amount, currency, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.user_id,
      data.alert_type,
      data.reference_type,
      data.reference_id || null,
      Number(data.amount || 0),
      data.currency || 'SGD',
      data.reason || null
    ];
    db.query(sql, params, (err, result) => callback(err, result));
  },

  listAlerts(options, callback) {
    const resolved = options || {};
    const limit = Number.isFinite(Number(resolved.limit)) ? Number(resolved.limit) : 20;
    const offset = Number.isFinite(Number(resolved.offset)) ? Number(resolved.offset) : 0;
    const params = [];
    const conditions = [];

    if (resolved.status && resolved.status !== 'all') {
      conditions.push('a.status = ?');
      params.push(resolved.status);
    }
    if (resolved.alertType && resolved.alertType !== 'all') {
      conditions.push('a.alert_type = ?');
      params.push(resolved.alertType);
    }
    if (resolved.search) {
      conditions.push('(u.username LIKE ? OR u.email LIKE ? OR a.reason LIKE ?)');
      const term = `%${resolved.search}%`;
      params.push(term, term, term);
    }
    if (Number.isFinite(Number(resolved.days)) && Number(resolved.days) > 0) {
      conditions.push('a.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)');
      params.push(Number(resolved.days));
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(*) AS total
      FROM aml_alerts a
      JOIN users u ON u.id = a.user_id
      ${where}
    `;

    const dataSql = `
      SELECT
        a.id,
        a.user_id,
        u.username,
        u.email,
        a.alert_type,
        a.reference_type,
        a.reference_id,
        a.amount,
        a.currency,
        a.reason,
        a.status,
        a.review_note,
        a.reviewed_by,
        a.reviewed_at,
        a.created_at
      FROM aml_alerts a
      JOIN users u ON u.id = a.user_id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `;

    db.query(countSql, params, (countErr, countRows) => {
      if (countErr) return callback(countErr);
      const total = countRows && countRows[0] ? Number(countRows[0].total || 0) : 0;
      db.query(dataSql, [...params, limit, offset], (dataErr, rows) => {
        if (dataErr) return callback(dataErr);
        return callback(null, { rows: rows || [], total });
      });
    });
  },

  markReviewed(alertId, adminId, note, callback) {
    const sql = `
      UPDATE aml_alerts
      SET status = 'reviewed',
          reviewed_by = ?,
          reviewed_at = NOW(),
          review_note = ?
      WHERE id = ?
    `;
    db.query(sql, [adminId, note || null, alertId], (err, result) => callback(err, result));
  },

  getSummary(days, callback) {
    const span = Number.isFinite(Number(days)) && Number(days) > 0 ? Number(days) : 30;
    const sql = `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN status = 'reviewed' THEN 1 ELSE 0 END) AS reviewed_count
      FROM aml_alerts
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
    `;
    db.query(sql, [span], (err, rows) => {
      if (err) return callback(err);
      const row = rows && rows[0] ? rows[0] : {};
      return callback(null, {
        total: Number(row.total || 0),
        open: Number(row.open_count || 0),
        reviewed: Number(row.reviewed_count || 0),
        days: span
      });
    });
  }
};

module.exports = AmlAlerts;
