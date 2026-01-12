const db = require('../db');

const baseSelect = `
  SELECT
    l.id,
    l.listing_title AS productName,
    l.available_slots AS quantity,
    l.price,
    l.image,
    l.discount_percentage AS discountPercentage,
    l.offer_message AS offerMessage,
    l.coach_id AS coachId,
    u.username AS coachName,
    l.sport,
    l.description,
    l.duration_minutes AS durationMinutes,
    l.is_active AS isActive
  FROM coach_listings l
  JOIN users u ON u.id = l.coach_id
`;

module.exports = {
  getAllProducts: function (callback) {
    const sql = `${baseSelect} ORDER BY l.created_at DESC, l.id DESC`;
    db.query(sql, (err, results) => callback(err, results));
  },

  getActiveProducts: function (callback) {
    const sql = `${baseSelect} WHERE l.is_active = 1 ORDER BY l.created_at DESC, l.id DESC`;
    db.query(sql, (err, results) => callback(err, results));
  },

  getProductsByCoach: function (coachId, callback) {
    const sql = `${baseSelect} WHERE l.coach_id = ? ORDER BY l.created_at DESC, l.id DESC`;
    db.query(sql, [coachId], (err, results) => callback(err, results));
  },

  getProductById: function (id, callback) {
    const sql = `${baseSelect} WHERE l.id = ? LIMIT 1`;
    db.query(sql, [id], (err, results) => callback(err, results && results[0] ? results[0] : null));
  },

  addProduct: function (productData, callback) {
    const sql = `
      INSERT INTO coach_listings
      (coach_id, listing_title, sport, description, available_slots, price, image, discount_percentage, offer_message, duration_minutes, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      productData.coachId,
      productData.productName,
      productData.sport || null,
      productData.description || null,
      typeof productData.quantity !== 'undefined' ? productData.quantity : 0,
      productData.price || 0,
      productData.image || null,
      typeof productData.discountPercentage === 'number' ? productData.discountPercentage : 0,
      productData.offerMessage || null,
      typeof productData.durationMinutes !== 'undefined' ? productData.durationMinutes : null,
      typeof productData.isActive !== 'undefined' ? productData.isActive : 1
    ];
    db.query(sql, params, (err, result) => callback(err, result));
  },

  updateProduct: function (id, updatedData, callback) {
    const sql = `
      UPDATE coach_listings
      SET listing_title = ?,
          sport = ?,
          description = ?,
          available_slots = ?,
          price = ?,
          image = ?,
          discount_percentage = ?,
          offer_message = ?,
          duration_minutes = ?,
          is_active = ?
      WHERE id = ?
    `;
    const params = [
      updatedData.productName,
      typeof updatedData.sport !== 'undefined' ? updatedData.sport : null,
      typeof updatedData.description !== 'undefined' ? updatedData.description : null,
      typeof updatedData.quantity !== 'undefined' ? updatedData.quantity : null,
      typeof updatedData.price !== 'undefined' ? updatedData.price : null,
      typeof updatedData.image !== 'undefined' ? updatedData.image : null,
      typeof updatedData.discountPercentage !== 'undefined' ? updatedData.discountPercentage : 0,
      typeof updatedData.offerMessage !== 'undefined' ? updatedData.offerMessage : null,
      typeof updatedData.durationMinutes !== 'undefined' ? updatedData.durationMinutes : null,
      typeof updatedData.isActive !== 'undefined' ? updatedData.isActive : 1,
      id
    ];
    db.query(sql, params, (err, result) => callback(err, result));
  },

  deleteProduct: function (id, callback) {
    db.beginTransaction((txErr) => {
      if (txErr) return callback(txErr);

      const cleanupSteps = [
        { sql: 'DELETE FROM booking_items WHERE listing_id = ?', params: [id] },
        { sql: 'DELETE FROM booking_cart_items WHERE listing_id = ?', params: [id] },
        { sql: 'DELETE FROM coach_listings WHERE id = ?', params: [id] }
      ];

      const runStep = (index) => {
        if (index >= cleanupSteps.length) {
          return db.commit((commitErr) => {
            if (commitErr) {
              return db.rollback(() => callback(commitErr));
            }
            return callback(null);
          });
        }

        const step = cleanupSteps[index];
        db.query(step.sql, step.params, (err) => {
          if (err) {
            return db.rollback(() => callback(err));
          }
          runStep(index + 1);
        });
      };

      runStep(0);
    });
  },

  searchProducts: function (term, callback) {
    return this.searchListings(term, {}, callback);
  },

  searchListings: function (term, options, callback) {
    const resolvedOptions = typeof options === 'function' ? {} : (options || {});
    const resolvedCallback = typeof options === 'function' ? options : callback;
    const like = `%${term}%`;
    let sql = `${baseSelect} WHERE (l.listing_title LIKE ? OR l.sport LIKE ?)`;
    const params = [like, like];
    if (resolvedOptions.activeOnly) {
      sql += ' AND l.is_active = 1';
    }
    if (resolvedOptions.coachId) {
      sql += ' AND l.coach_id = ?';
      params.push(resolvedOptions.coachId);
    }
    sql += ' ORDER BY l.created_at DESC, l.id DESC';
    db.query(sql, params, (err, results) => resolvedCallback(err, results));
  },

  // deduct stock for each cart item within a transaction
  deductStock: function (cartItems, callback) {
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return callback(null);
    }

    db.beginTransaction(async (txErr) => {
      if (txErr) return callback(txErr);

      try {
        // process items sequentially so locks are respected
        for (const item of cartItems) {
          await new Promise((resolve, reject) => {
            db.query(
              'SELECT listing_title AS productName, available_slots AS quantity FROM coach_listings WHERE id = ? FOR UPDATE',
              [item.productId],
              (selectErr, rows) => {
                if (selectErr) return reject(selectErr);
                const row = rows && rows[0];
                if (!row) {
                  return reject(Object.assign(new Error('Listing not found'), {
                    code: 'PRODUCT_NOT_FOUND',
                    productId: item.productId
                  }));
                }
                if (row.quantity < item.quantity) {
                  return reject(Object.assign(new Error('Insufficient slots'), {
                    code: 'INSUFFICIENT_STOCK',
                    productId: item.productId,
                    productName: row.productName,
                    available: row.quantity,
                    requested: item.quantity
                  }));
                }
                const newQty = row.quantity - item.quantity;
                db.query(
                  'UPDATE coach_listings SET available_slots = ? WHERE id = ?',
                  [newQty, item.productId],
                  (updateErr) => (updateErr ? reject(updateErr) : resolve())
                );
              }
            );
          });
        }

        db.commit((commitErr) => {
          if (commitErr) {
            return db.rollback(() => callback(commitErr));
          }
          return callback(null);
        });
      } catch (err) {
        db.rollback(() => callback(err));
      }
    });
  }
};
