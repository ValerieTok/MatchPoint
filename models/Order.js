const db = require('../db');

const Order = {
  createOrder(userId, items, address, callback) {
    if (!Array.isArray(items) || !items.length) {
      return callback(new Error('No items to order'));
    }

    const total = items.reduce((sum, item) => {
      const price = Number(item.price || 0);
      const qty = Number(item.quantity || 0);
      return sum + price * qty;
    }, 0);

    const orderSql = 'INSERT INTO orders (user_id, address, total) VALUES (?, ?, ?)';
    db.beginTransaction((txErr) => {
      if (txErr) return callback(txErr);
      db.query(orderSql, [userId, address || null, total], (orderErr, result) => {
        if (orderErr) {
          return db.rollback(() => callback(orderErr));
        }
        const orderId = result.insertId;
        const itemSql = `
          INSERT INTO order_items (order_id, product_id, productName, price, listPrice, discountPercentage, offerMessage, image, quantity)
          VALUES ?
        `;
        const values = items.map((item) => [
          orderId,
          item.productId,
          item.productName,
          Number(item.price || 0),
          Number(item.originalPrice || item.price || 0),
          Number(item.discountPercentage || 0),
          item.offerMessage || null,
          item.image || null,
          Number(item.quantity || 0)
        ]);
        db.query(itemSql, [values], (itemsErr) => {
          if (itemsErr) {
            return db.rollback(() => callback(itemsErr));
          }
          db.commit((commitErr) => {
            if (commitErr) {
              return db.rollback(() => callback(commitErr));
            }
            return callback(null, { orderId, total });
          });
        });
      });
    });
  },

  getOrdersByUser(userId, callback) {
    const sql = `
      SELECT o.id, o.total, o.address, o.created_at, o.delivered_at, u.username
      FROM orders o
      JOIN users u ON u.id = o.user_id
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC, o.id DESC
    `;
    db.query(sql, [userId], (err, rows) => callback(err, rows || []));
  },

  getAllOrders(searchTerm, callback) {
    let sql = `
      SELECT o.id, o.total, o.address, o.created_at, o.delivered_at, u.username
      FROM orders o
      JOIN users u ON u.id = o.user_id
    `;
    const params = [];
    if (searchTerm && searchTerm.trim()) {
      sql += ' WHERE u.username LIKE ?';
      params.push(`%${searchTerm.trim()}%`);
    }
    sql += ' ORDER BY o.created_at DESC, o.id DESC';
    db.query(sql, params, (err, rows) => callback(err, rows || []));
  },

  getOrderItems(orderId, callback) {
      const sql = `
        SELECT
          product_id AS productId,
          productName,
          price,
          quantity,
          COALESCE(listPrice, price) AS listPrice,
          COALESCE(discountPercentage, 0) AS discountPercentage,
          offerMessage,
          image
        FROM order_items
        WHERE order_id = ?
      `;
    db.query(sql, [orderId], (err, rows) => callback(err, rows || []));
  },

  getOrderById(orderId, callback) {
    const sql = `
      SELECT id, user_id AS userId, total, address, created_at, delivered_at
      FROM orders
      WHERE id = ?
      LIMIT 1
    `;
    db.query(sql, [orderId], (err, rows) => callback(err, rows && rows[0] ? rows[0] : null));
  },

  markOrderDelivered(orderId, callback) {
    const sql = 'UPDATE orders SET delivered_at = CURRENT_TIMESTAMP WHERE id = ?';
    db.query(sql, [orderId], (err, result) => callback(err, result));
  },

  createReview(reviewData, callback) {
    const sql = `
      INSERT INTO order_reviews (order_id, user_id, rating, comment)
      VALUES (?, ?, ?, ?)
    `;
    const params = [
      reviewData.order_id,
      reviewData.user_id,
      reviewData.rating,
      reviewData.comment || null
    ];
    db.query(sql, params, (err, result) => callback(err, result));
  },

  getReviewByOrderId(orderId, callback) {
    const sql = `
      SELECT id, order_id, user_id, rating, comment, created_at
      FROM order_reviews
      WHERE order_id = ?
      LIMIT 1
    `;
    db.query(sql, [orderId], (err, rows) => callback(err, rows && rows[0] ? rows[0] : null));
  }
,
  deleteReviewByOrder(orderId, callback) {
    const sql = 'DELETE FROM order_reviews WHERE order_id = ?';
    db.query(sql, [orderId], (err, result) => callback(err, result));
  }
};

module.exports = Order;
