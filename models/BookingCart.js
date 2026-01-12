const db = require('../db');

const normalisePrice = (value) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Number(parsed.toFixed(2));
};

const buildPricing = (productRow) => {
  const basePrice = normalisePrice(productRow.price);
  const discountPercentage = Math.min(
    100,
    Math.max(0, Number.parseFloat(productRow.discountPercentage) || 0)
  );
  const hasDiscount = discountPercentage > 0;
  const effectivePrice = hasDiscount
    ? normalisePrice(basePrice * (1 - discountPercentage / 100))
    : basePrice;

  return {
    basePrice,
    discountPercentage,
    offerMessage: productRow.offerMessage ? String(productRow.offerMessage).trim() : null,
    hasDiscount,
    effectivePrice
  };
};

const addOrIncrement = (userId, productId, quantity, callback) => {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return callback(new Error('Invalid quantity.'));
  }

  const findSql = 'SELECT id, quantity FROM booking_cart_items WHERE user_id = ? AND listing_id = ? LIMIT 1';
  db.query(findSql, [userId, productId], (findErr, rows) => {
    if (findErr) {
      return callback(findErr);
    }

    if (rows.length) {
      const currentQty = Number(rows[0].quantity) || 0;
      const updateSql = 'UPDATE booking_cart_items SET quantity = ? WHERE id = ?';
      return db.query(updateSql, [currentQty + qty, rows[0].id], callback);
    }

    const insertSql = 'INSERT INTO booking_cart_items (user_id, listing_id, quantity) VALUES (?, ?, ?)';
    return db.query(insertSql, [userId, productId, qty], callback);
  });
};

const getCart = (userId, callback) => {
  const sql = `
        SELECT
            c.listing_id AS product_id,
            c.quantity,
            l.listing_title AS productName,
            l.price,
            l.discount_percentage AS discountPercentage,
            l.offer_message AS offerMessage,
            l.image,
            l.available_slots AS stockAvailable,
            l.coach_id AS coachId,
            u.username AS coachName,
            l.duration_minutes AS durationMinutes,
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

    const items = (rows || []).map((row) => {
      const pricing = buildPricing(row);
      return {
        productId: row.product_id,
        productName: row.productName,
        quantity: Number(row.quantity) || 0,
        price: pricing.effectivePrice,
        originalPrice: pricing.basePrice,
        discountPercentage: pricing.discountPercentage,
        offerMessage: pricing.offerMessage,
        hasDiscount: pricing.hasDiscount,
        image: row.image,
        availableStock: Number(row.stockAvailable),
        coachId: row.coachId,
        coachName: row.coachName,
        durationMinutes: row.durationMinutes,
        sport: row.sport
      };
    });
    return callback(null, items);
  });
};

const updateQuantity = (userId, productId, quantity, callback) => {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    const deleteSql = 'DELETE FROM booking_cart_items WHERE user_id = ? AND listing_id = ?';
    return db.query(deleteSql, [userId, productId], callback);
  }

  const sql = 'UPDATE booking_cart_items SET quantity = ? WHERE user_id = ? AND listing_id = ?';
  db.query(sql, [qty, userId, productId], (err, result) => {
    if (err) {
      return callback(err);
    }
    if (result.affectedRows === 0) {
      const insertSql = 'INSERT INTO booking_cart_items (user_id, listing_id, quantity) VALUES (?, ?, ?)';
      return db.query(insertSql, [userId, productId, qty], callback);
    }
    return callback(null, result);
  });
};

const removeItem = (userId, productId, callback) => {
  const sql = 'DELETE FROM booking_cart_items WHERE user_id = ? AND listing_id = ?';
  db.query(sql, [userId, productId], callback);
};

const clearCart = (userId, callback) => {
  const sql = 'DELETE FROM booking_cart_items WHERE user_id = ?';
  db.query(sql, [userId], callback);
};

const getCartItems = (userId, callback) => {
  const sql = `
        SELECT c.listing_id AS productId,
               c.quantity,
               l.listing_title AS productName,
               l.price,
               l.image
        FROM booking_cart_items c
        JOIN coach_listings l ON l.id = c.listing_id
        WHERE c.user_id = ?
    `;
  db.query(sql, [userId], (err, rows) => callback(err, rows || []));
};

const getItem = (userId, productId, callback) => {
  const sql = 'SELECT quantity FROM booking_cart_items WHERE user_id = ? AND listing_id = ? LIMIT 1';
  db.query(sql, [userId, productId], (err, rows) => callback(err, rows && rows[0] ? rows[0] : null));
};

const setQuantity = (userId, productId, quantity, callback) => {
  const rawQty = Number(quantity);
  const qty = Number.isFinite(rawQty) ? rawQty : 0;
  const sql = `
        INSERT INTO booking_cart_items (user_id, listing_id, quantity)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)
    `;
  db.query(sql, [userId, productId, qty], (err, result) => callback(err, result));
};

const deleteItem = (userId, productId, callback) => {
  removeItem(userId, productId, callback);
};

module.exports = {
  addOrIncrement,
  getCart,
  getCartItems,
  getItem,
  updateQuantity,
  setQuantity,
  removeItem,
  deleteItem,
  clearCart
};
