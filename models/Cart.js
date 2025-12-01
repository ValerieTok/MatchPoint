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

  const findSql = 'SELECT id, quantity FROM user_cart_items WHERE user_id = ? AND product_id = ? LIMIT 1';
  db.query(findSql, [userId, productId], (findErr, rows) => {
    if (findErr) {
      return callback(findErr);
    }

    if (rows.length) {
      const currentQty = Number(rows[0].quantity) || 0;
      const updateSql = 'UPDATE user_cart_items SET quantity = ? WHERE id = ?';
      return db.query(updateSql, [currentQty + qty, rows[0].id], callback);
    }

    const insertSql = 'INSERT INTO user_cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)';
    return db.query(insertSql, [userId, productId, qty], callback);
  });
};

const getCart = (userId, callback) => {
  const sql = `
        SELECT
            c.product_id,
            c.quantity,
            p.productName,
            p.price,
            p.discountPercentage,
            p.offerMessage,
            p.image,
            p.quantity AS stockAvailable
        FROM user_cart_items c
        JOIN products p ON p.id = c.product_id
        WHERE c.user_id = ?
        ORDER BY p.productName ASC
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
        availableStock: Number(row.stockAvailable)
      };
    });
    return callback(null, items);
  });
};

const updateQuantity = (userId, productId, quantity, callback) => {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    const deleteSql = 'DELETE FROM user_cart_items WHERE user_id = ? AND product_id = ?';
    return db.query(deleteSql, [userId, productId], callback);
  }

  const sql = 'UPDATE user_cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?';
  db.query(sql, [qty, userId, productId], (err, result) => {
    if (err) {
      return callback(err);
    }
    if (result.affectedRows === 0) {
      const insertSql = 'INSERT INTO user_cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)';
      return db.query(insertSql, [userId, productId, qty], callback);
    }
    return callback(null, result);
  });
};

const removeItem = (userId, productId, callback) => {
  const sql = 'DELETE FROM user_cart_items WHERE user_id = ? AND product_id = ?';
  db.query(sql, [userId, productId], callback);
};

const clearCart = (userId, callback) => {
  const sql = 'DELETE FROM user_cart_items WHERE user_id = ?';
  db.query(sql, [userId], callback);
};

module.exports = {
  addOrIncrement,
  getCart,
  updateQuantity,
  removeItem,
  clearCart
};
