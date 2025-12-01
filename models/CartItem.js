const db = require('../db');

module.exports = {
  getCartItems(userId, callback) {
    const sql = `
      SELECT c.product_id AS productId,
             c.quantity,
             p.productName,
             p.price,
             p.image
      FROM user_cart_items c
      JOIN products p ON p.id = c.product_id
      WHERE c.user_id = ?
    `;
    db.query(sql, [userId], (err, rows) => callback(err, rows || []));
  },

  getItem(userId, productId, callback) {
    const sql = 'SELECT quantity FROM user_cart_items WHERE user_id = ? AND product_id = ? LIMIT 1';
    db.query(sql, [userId, productId], (err, rows) => callback(err, rows && rows[0] ? rows[0] : null));
  },

  setQuantity(userId, productId, quantity, callback) {
    const sql = `
      INSERT INTO user_cart_items (user_id, product_id, quantity)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)
    `;
    db.query(sql, [userId, productId, quantity], (err, result) => callback(err, result));
  },

  deleteItem(userId, productId, callback) {
    const sql = 'DELETE FROM user_cart_items WHERE user_id = ? AND product_id = ?';
    db.query(sql, [userId, productId], (err, result) => callback(err, result));
  },

  clearCart(userId, callback) {
    const sql = 'DELETE FROM user_cart_items WHERE user_id = ?';
    db.query(sql, [userId], (err, result) => callback(err, result));
  }
};