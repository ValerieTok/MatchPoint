const db = require('../db');

const Favorite = {
  add(userId, productId, callback) {
    const sql = 'INSERT IGNORE INTO favorites (userId, productId) VALUES (?, ?)';
    db.query(sql, [userId, productId], (err, result) => callback(err, result));
  },
  remove(userId, productId, callback) {
    const sql = 'DELETE FROM favorites WHERE userId = ? AND productId = ?';
    db.query(sql, [userId, productId], (err, result) => callback(err, result));
  },
  isFavorited(userId, productId, callback) {
    const sql = 'SELECT 1 FROM favorites WHERE userId = ? AND productId = ? LIMIT 1';
    db.query(sql, [userId, productId], (err, rows) => {
      if (err) return callback(err);
      return callback(null, Boolean(rows && rows.length));
    });
  },
  toggle(userId, productId, callback) {
    Favorite.isFavorited(userId, productId, (err, exists) => {
      if (err) return callback(err);
      if (exists) {
        return Favorite.remove(userId, productId, (removeErr) => callback(removeErr, { action: 'removed' }));
      }
      return Favorite.add(userId, productId, (addErr) => callback(addErr, { action: 'added' }));
    });
  },
  getFavoritesMap(userId, productIds, callback) {
    if (!Array.isArray(productIds) || !productIds.length) {
      return callback(null, new Map());
    }
    const ids = productIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    if (!ids.length) return callback(null, new Map());
    const sql = `
      SELECT productId
      FROM favorites
      WHERE userId = ? AND productId IN (?)
    `;
    db.query(sql, [userId, ids], (err, rows) => {
      if (err) return callback(err);
      const map = new Map();
      (rows || []).forEach((row) => {
        map.set(Number(row.productId), true);
      });
      return callback(null, map);
    });
  }
};

module.exports = Favorite;
