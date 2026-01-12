const db = require('../db');

const Booking = {
  createOrder(userId, items, address, callback) {
    if (!Array.isArray(items) || !items.length) {
      return callback(new Error('No items to order'));
    }

    const total = items.reduce((sum, item) => {
      const price = Number(item.price || 0);
      const qty = Number(item.quantity || 0);
      return sum + price * qty;
    }, 0);

    const orderSql = 'INSERT INTO bookings (user_id, session_location, total) VALUES (?, ?, ?)';
    db.beginTransaction((txErr) => {
      if (txErr) return callback(txErr);
      db.query(orderSql, [userId, address || null, total], (orderErr, result) => {
        if (orderErr) {
          return db.rollback(() => callback(orderErr));
        }
        const orderId = result.insertId;
        const itemSql = `
          INSERT INTO booking_items (booking_id, listing_id, coach_id, listing_title, sport, price, listPrice, discountPercentage, offerMessage, image, duration_minutes, quantity)
          VALUES ?
        `;
        const values = items.map((item) => [
          orderId,
          item.productId,
          item.coachId,
          item.productName,
          item.sport || null,
          Number(item.price || 0),
          Number(item.originalPrice || item.price || 0),
          Number(item.discountPercentage || 0),
          item.offerMessage || null,
          item.image || null,
          Number(item.durationMinutes || 0),
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
      SELECT b.id, b.total, b.session_location AS address, b.created_at, b.completed_at AS delivered_at, u.username
      FROM bookings b
      JOIN users u ON u.id = b.user_id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC, b.id DESC
    `;
    db.query(sql, [userId], (err, rows) => callback(err, rows || []));
  },

  getAllOrders(searchTerm, callback) {
    let sql = `
      SELECT b.id, b.total, b.session_location AS address, b.created_at, b.completed_at AS delivered_at, u.username
      FROM bookings b
      JOIN users u ON u.id = b.user_id
    `;
    const params = [];
    if (searchTerm && searchTerm.trim()) {
      sql += ' WHERE u.username LIKE ?';
      params.push(`%${searchTerm.trim()}%`);
    }
    sql += ' ORDER BY b.created_at DESC, b.id DESC';
    db.query(sql, params, (err, rows) => callback(err, rows || []));
  },

  getBookingsByCoach(coachId, searchTerm, callback) {
    let sql = `
      SELECT DISTINCT b.id, b.total, b.session_location AS address, b.created_at, b.completed_at AS delivered_at, u.username
      FROM bookings b
      JOIN booking_items bi ON bi.booking_id = b.id
      JOIN users u ON u.id = b.user_id
      WHERE bi.coach_id = ?
    `;
    const params = [coachId];
    if (searchTerm && searchTerm.trim()) {
      sql += ' AND u.username LIKE ?';
      params.push(`%${searchTerm.trim()}%`);
    }
    sql += ' ORDER BY b.created_at DESC, b.id DESC';
    db.query(sql, params, (err, rows) => callback(err, rows || []));
  },

  getOrderItems(orderId, coachId, callback) {
    const sql = `
        SELECT
          bi.listing_id AS productId,
          bi.listing_title AS productName,
          bi.price,
          bi.quantity,
          COALESCE(bi.listPrice, bi.price) AS listPrice,
          COALESCE(bi.discountPercentage, 0) AS discountPercentage,
          bi.offerMessage,
          bi.image,
          bi.duration_minutes AS durationMinutes,
          bi.coach_id AS coachId,
          u.username AS coachName,
          bi.sport
        FROM booking_items bi
        JOIN users u ON u.id = bi.coach_id
        WHERE bi.booking_id = ?
      `;
    const params = [orderId];
    let filteredSql = sql;
    if (coachId) {
      filteredSql += ' AND bi.coach_id = ?';
      params.push(coachId);
    }
    db.query(filteredSql, params, (err, rows) => callback(err, rows || []));
  },

  getOrderById(orderId, callback) {
    const sql = `
      SELECT id, user_id AS userId, total, session_location AS address, created_at, completed_at AS delivered_at
      FROM bookings
      WHERE id = ?
      LIMIT 1
    `;
    db.query(sql, [orderId], (err, rows) => callback(err, rows && rows[0] ? rows[0] : null));
  },

  markOrderDelivered(orderId, callback) {
    const sql = 'UPDATE bookings SET completed_at = CURRENT_TIMESTAMP WHERE id = ?';
    db.query(sql, [orderId], (err, result) => callback(err, result));
  },

  createReview(reviewData, callback) {
    const sql = `
      INSERT INTO coach_reviews (booking_id, user_id, rating, comment)
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
      SELECT id, booking_id AS order_id, user_id, rating, comment, created_at
      FROM coach_reviews
      WHERE booking_id = ?
      LIMIT 1
    `;
    db.query(sql, [orderId], (err, rows) => callback(err, rows && rows[0] ? rows[0] : null));
  }
,
  deleteReviewByOrder(orderId, callback) {
    const sql = 'DELETE FROM coach_reviews WHERE booking_id = ?';
    db.query(sql, [orderId], (err, result) => callback(err, result));
  }
};

module.exports = Booking;
