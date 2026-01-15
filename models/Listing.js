const db = require('../db');

const baseSelect = `
  SELECT
    l.id,
    l.listing_title,
    l.available_slots,
    l.price,
    l.image,
    l.discount_percentage,
    l.offer_message,
    l.coach_id,
    COALESCE(u.full_name, u.username) AS username,
    l.sport,
    l.description,
    l.duration_minutes,
    l.skill_level,
    l.session_location,
    l.is_active
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
      (coach_id, listing_title, sport, description, available_slots, price, image, discount_percentage, offer_message, duration_minutes, skill_level, session_location, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      productData.coach_id,
      productData.listing_title,
      productData.sport || null,
      productData.description || null,
      typeof productData.available_slots !== 'undefined' ? productData.available_slots : 0,
      productData.price || 0,
      productData.image || null,
      typeof productData.discount_percentage === 'number' ? productData.discount_percentage : 0,
      productData.offer_message || null,
      typeof productData.duration_minutes !== 'undefined' ? productData.duration_minutes : null,
      productData.skill_level || 'beginner',
      productData.session_location || null,
      typeof productData.is_active !== 'undefined' ? productData.is_active : 1
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
          skill_level = ?,
          session_location = ?,
          is_active = ?
      WHERE id = ?
    `;
    const params = [
      updatedData.listing_title,
      typeof updatedData.sport !== 'undefined' ? updatedData.sport : null,
      typeof updatedData.description !== 'undefined' ? updatedData.description : null,
      typeof updatedData.available_slots !== 'undefined' ? updatedData.available_slots : null,
      typeof updatedData.price !== 'undefined' ? updatedData.price : null,
      typeof updatedData.image !== 'undefined' ? updatedData.image : null,
      typeof updatedData.discount_percentage !== 'undefined' ? updatedData.discount_percentage : 0,
      typeof updatedData.offer_message !== 'undefined' ? updatedData.offer_message : null,
      typeof updatedData.duration_minutes !== 'undefined' ? updatedData.duration_minutes : null,
      typeof updatedData.skill_level !== 'undefined' ? updatedData.skill_level : 'beginner',
      typeof updatedData.session_location !== 'undefined' ? updatedData.session_location : null,
      typeof updatedData.is_active !== 'undefined' ? updatedData.is_active : 1,
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
    let sql = `${baseSelect} WHERE (l.listing_title LIKE ? OR l.sport LIKE ? OR l.description LIKE ? OR l.skill_level LIKE ? OR l.session_location LIKE ?)`;
    const params = [like, like, like, like, like];
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
              'SELECT listing_title, available_slots FROM coach_listings WHERE id = ? FOR UPDATE',
              [item.listing_id],
              (selectErr, rows) => {
                if (selectErr) return reject(selectErr);
                const row = rows && rows[0];
                if (!row) {
                  return reject(Object.assign(new Error('Listing not found'), {
                    code: 'PRODUCT_NOT_FOUND',
                    productId: item.listing_id
                  }));
                }
                if (row.available_slots < item.quantity) {
                  return reject(Object.assign(new Error('Insufficient slots'), {
                    code: 'INSUFFICIENT_STOCK',
                    productId: item.listing_id,
                    listing_title: row.listing_title,
                    available: row.available_slots,
                    requested: item.quantity
                  }));
                }
                const newQty = row.available_slots - item.quantity;
                db.query(
                  'UPDATE coach_listings SET available_slots = ? WHERE id = ?',
                  [newQty, item.listing_id],
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
