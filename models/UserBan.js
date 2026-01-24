const db = require('../db');

const UserBan = {
  getActiveBan(userId, callback) {
    const sql = `
      SELECT id, comment, created_at, created_by
      FROM user_bans
      WHERE user_id = ? AND is_active = 1
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `;
    db.query(sql, [userId], (err, rows) => {
      if (err) return callback(err);
      return callback(null, rows && rows[0] ? rows[0] : null);
    });
  },

  getActiveBans(userIds, callback) {
    if (!Array.isArray(userIds) || !userIds.length) {
      return callback(null, new Map());
    }
    const ids = userIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    if (!ids.length) return callback(null, new Map());
    const sql = `
      SELECT user_id, comment, created_at
      FROM user_bans
      WHERE is_active = 1 AND user_id IN (?)
    `;
    db.query(sql, [ids], (err, rows) => {
      if (err) return callback(err);
      const map = new Map();
      (rows || []).forEach((row) => {
        map.set(Number(row.user_id), {
          comment: row.comment || '',
          created_at: row.created_at
        });
      });
      return callback(null, map);
    });
  },

  banUser(userId, comment, createdBy, callback) {
    const clearSql = 'UPDATE user_bans SET is_active = 0 WHERE user_id = ? AND is_active = 1';
    const insertSql = `
      INSERT INTO user_bans (user_id, comment, created_by, is_active)
      VALUES (?, ?, ?, 1)
    `;
    db.query(clearSql, [userId], (clearErr) => {
      if (clearErr) return callback(clearErr);
      db.query(insertSql, [userId, comment, createdBy || null], (insertErr, result) => callback(insertErr, result));
    });
  },

  unbanUser(userId, callback) {
    const sql = 'UPDATE user_bans SET is_active = 0 WHERE user_id = ? AND is_active = 1';
    db.query(sql, [userId], (err, result) => callback(err, result));
  }
};

module.exports = UserBan;
