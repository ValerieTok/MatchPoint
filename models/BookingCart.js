const db = require('../db');

const addOrIncrement = (userId, listingId, quantity, callback) => {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return callback(new Error('Invalid quantity.'));
  }

  const findSql = 'SELECT id, quantity FROM booking_cart_items WHERE user_id = ? AND listing_id = ? LIMIT 1';
  db.query(findSql, [userId, listingId], (findErr, rows) => {
    if (findErr) {
      return callback(findErr);
    }

    if (rows.length) {
      const currentQty = Number(rows[0].quantity) || 0;
      const updateSql = 'UPDATE booking_cart_items SET quantity = ? WHERE id = ?';
      return db.query(updateSql, [currentQty + qty, rows[0].id], callback);
    }

    const insertSql = 'INSERT INTO booking_cart_items (user_id, listing_id, quantity) VALUES (?, ?, ?)';
    return db.query(insertSql, [userId, listingId, qty], callback);
  });
};

const getCart = (userId, callback) => {
  const sql = `
        SELECT
            c.listing_id,
            c.quantity,
            l.listing_title,
            l.price,
            l.discount_percentage,
            l.offer_message,
            l.image,
            l.available_slots,
            l.coach_id,
            u.username,
            l.duration_minutes,
            l.sport
        FROM booking_cart_items c
        JOIN coach_listings l ON l.id = c.listing_id
        JOIN users u ON u.id = l.coach_id
        WHERE c.user_id = ?
        ORDER BY l.listing_title ASC
    `;
  db.query(sql, [userId], (err, rows) => {
    if (err) {
      return callback(err);
    }

    const items = (rows || []).map((row) => ({
      listing_id: row.listing_id,
      quantity: Number(row.quantity) || 0,
      listing_title: row.listing_title,
      price: Number(row.price || 0),
      discount_percentage: Number(row.discount_percentage || 0),
      offer_message: row.offer_message ? String(row.offer_message).trim() : null,
      image: row.image,
      available_slots: Number(row.available_slots),
      coach_id: row.coach_id,
      username: row.username,
      duration_minutes: row.duration_minutes,
      sport: row.sport
    }));
    return callback(null, items);
  });
};

const updateQuantity = (userId, listingId, quantity, callback) => {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    const deleteSql = 'DELETE FROM booking_cart_items WHERE user_id = ? AND listing_id = ?';
    return db.query(deleteSql, [userId, listingId], callback);
  }

  const sql = 'UPDATE booking_cart_items SET quantity = ? WHERE user_id = ? AND listing_id = ?';
  db.query(sql, [qty, userId, listingId], (err, result) => {
    if (err) {
      return callback(err);
    }
    if (result.affectedRows === 0) {
      const insertSql = 'INSERT INTO booking_cart_items (user_id, listing_id, quantity) VALUES (?, ?, ?)';
      return db.query(insertSql, [userId, listingId, qty], callback);
    }
    return callback(null, result);
  });
};

const removeItem = (userId, listingId, callback) => {
  const sql = 'DELETE FROM booking_cart_items WHERE user_id = ? AND listing_id = ?';
  db.query(sql, [userId, listingId], callback);
};

const clearCart = (userId, callback) => {
  const sql = 'DELETE FROM booking_cart_items WHERE user_id = ?';
  db.query(sql, [userId], callback);
};

const getItem = (userId, listingId, callback) => {
  const sql = 'SELECT quantity FROM booking_cart_items WHERE user_id = ? AND listing_id = ? LIMIT 1';
  db.query(sql, [userId, listingId], (err, rows) => callback(err, rows && rows[0] ? rows[0] : null));
};

module.exports = {
  addOrIncrement,
  getCart,
  getItem,
  updateQuantity,
  removeItem,
  clearCart
};
