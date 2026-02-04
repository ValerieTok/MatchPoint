const db = require('../db');

const addOrIncrement = (userId, listingId, quantity, slotId, sessionDate, sessionTime, callback) => {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return callback(new Error('Invalid quantity.'));
  }

  const findSql = 'SELECT id, quantity FROM booking_cart_items WHERE user_id = ? AND slot_id = ? LIMIT 1';
  db.query(findSql, [userId, slotId], (findErr, rows) => {
    if (findErr) {
      return callback(findErr);
    }

    if (rows.length) {
      const updateSql = 'UPDATE booking_cart_items SET quantity = ?, slot_id = ?, session_date = ?, session_time = ? WHERE id = ?';
      return db.query(updateSql, [1, slotId || null, sessionDate || null, sessionTime || null, rows[0].id], callback);
    }

    const insertSql = 'INSERT INTO booking_cart_items (user_id, listing_id, quantity, slot_id, session_date, session_time) VALUES (?, ?, ?, ?, ?, ?)';
    return db.query(insertSql, [userId, listingId, qty, slotId || null, sessionDate || null, sessionTime || null], callback);
  });
};

const getCart = (userId, callback) => {
  const sql = `
        SELECT
            c.id AS cart_item_id,
            c.listing_id,
            c.quantity,
            l.listing_title,
            l.price,
            l.discount_percentage,
            l.offer_message,
            l.image,
            l.coach_id,
            COALESCE(u.full_name, u.username) AS username,
            l.duration_minutes,
            l.sport,
            l.skill_level,
            l.session_location,
            c.slot_id,
            c.session_date,
            c.session_time
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
      cart_item_id: row.cart_item_id,
      listing_id: row.listing_id,
      quantity: Number(row.quantity) || 0,
      listing_title: row.listing_title,
      price: Number(row.price || 0),
      discount_percentage: Number(row.discount_percentage || 0),
      offer_message: row.offer_message ? String(row.offer_message).trim() : null,
      image: row.image,
      coach_id: row.coach_id,
      username: row.username,
      duration_minutes: row.duration_minutes,
      sport: row.sport,
      skill_level: row.skill_level,
      session_location: row.session_location,
      slot_id: row.slot_id,
      session_date: row.session_date,
      session_time: row.session_time
    }));
    return callback(null, items);
  });
};

const updateQuantity = (userId, cartItemId, quantity, callback) => {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    const deleteSql = 'DELETE FROM booking_cart_items WHERE user_id = ? AND id = ?';
    return db.query(deleteSql, [userId, cartItemId], callback);
  }

  const normalizedQty = qty > 1 ? 1 : qty;
  const sql = 'UPDATE booking_cart_items SET quantity = ? WHERE user_id = ? AND id = ?';
  db.query(sql, [normalizedQty, userId, cartItemId], (err, result) => {
    if (err) {
      return callback(err);
    }
    if (result.affectedRows === 0) {
      return callback(new Error('Cart item not found.'));
    }
    return callback(null, result);
  });
};

const removeItem = (userId, cartItemId, callback) => {
  const sql = 'DELETE FROM booking_cart_items WHERE user_id = ? AND id = ?';
  db.query(sql, [userId, cartItemId], callback);
};

const clearCart = (userId, callback) => {
  const sql = 'DELETE FROM booking_cart_items WHERE user_id = ?';
  db.query(sql, [userId], callback);
};

const getItem = (userId, cartItemId, callback) => {
  const sql = 'SELECT quantity FROM booking_cart_items WHERE user_id = ? AND id = ? LIMIT 1';
  db.query(sql, [userId, cartItemId], (err, rows) => callback(err, rows && rows[0] ? rows[0] : null));
};

module.exports = {
  addOrIncrement,
  getCart,
  getItem,
  updateQuantity,
  removeItem,
  clearCart
};
