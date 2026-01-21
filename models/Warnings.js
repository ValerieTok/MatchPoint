const db = require('../db');

const Warnings = {
  createWarning({ userId, targetRole, comment, createdBy }, callback) {
    const sql = `
      INSERT INTO user_warnings (user_id, target_role, comment, created_by)
      VALUES (?, ?, ?, ?)
    `;
    const params = [userId, targetRole, comment, createdBy || null];
    db.query(sql, params, (err, result) => callback(err, result));
  },

  getRecentWarnings(userId, limit, callback) {
    const capped = Number.isFinite(Number(limit)) ? Number(limit) : 3;
    const sql = `
      SELECT id, comment, created_at
      FROM user_warnings
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `;
    db.query(sql, [userId, capped], (err, rows) => callback(err, rows || []));
  }
};

module.exports = Warnings;
