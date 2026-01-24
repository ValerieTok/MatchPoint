const db = require('../db');

const Inbox = {
  getStatuses(userId, callback) {
    const sql = `
      SELECT item_type, item_id, is_read, is_deleted
      FROM user_inbox_status
      WHERE user_id = ?
    `;
    db.query(sql, [userId], (err, rows) => callback(err, rows || []));
  },

  markRead(userId, itemType, itemId, callback) {
    const sql = `
      INSERT INTO user_inbox_status (user_id, item_type, item_id, is_read, is_deleted)
      VALUES (?, ?, ?, 1, 0)
      ON DUPLICATE KEY UPDATE
        is_read = VALUES(is_read),
        is_deleted = VALUES(is_deleted),
        updated_at = CURRENT_TIMESTAMP
    `;
    db.query(sql, [userId, itemType, itemId], (err, result) => callback(err, result));
  },

  deleteItem(userId, itemType, itemId, callback) {
    const sql = `
      INSERT INTO user_inbox_status (user_id, item_type, item_id, is_read, is_deleted)
      VALUES (?, ?, ?, 1, 1)
      ON DUPLICATE KEY UPDATE
        is_read = VALUES(is_read),
        is_deleted = VALUES(is_deleted),
        updated_at = CURRENT_TIMESTAMP
    `;
    db.query(sql, [userId, itemType, itemId], (err, result) => callback(err, result));
  }
};

module.exports = Inbox;
