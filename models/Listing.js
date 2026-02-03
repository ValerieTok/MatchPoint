const db = require('../db');

const baseSelect = `
  SELECT
    l.id,
    l.listing_title,
    l.price,
    l.image,
    l.discount_percentage,
    l.offer_message,
    l.coach_id,
    COALESCE(u.full_name, u.username) AS username,
    up.photo AS coach_photo,
    u.coach_status,
    l.sport,
    l.description,
    l.duration_minutes,
    l.skill_level,
    l.session_location,
    l.is_active,
    (
      SELECT ROUND(AVG(r.rating), 1)
      FROM coach_reviews r
      JOIN booking_items bi ON bi.booking_id = r.booking_id
      WHERE bi.listing_id = l.id
        AND r.review_status = 'approved'
    ) AS rating
  FROM coach_listings l
  JOIN users u ON u.id = l.coach_id
  LEFT JOIN user_profiles up ON up.user_id = u.id
`;

module.exports = {
  getAllProducts: function (callback) {
    const sql = `${baseSelect} ORDER BY l.created_at DESC, l.id DESC`;
    db.query(sql, (err, results) => callback(err, results));
  },

  getActiveProducts: function (callback) {
    const sql = `${baseSelect} WHERE l.is_active = 1 AND u.coach_status = 'approved' ORDER BY l.created_at DESC, l.id DESC`;
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

  getFavoritesByUser: function (userId, callback) {
    const sql = `${baseSelect} JOIN favorites f ON f.productId = l.id WHERE f.userId = ? AND l.is_active = 1 AND u.coach_status = 'approved' ORDER BY l.created_at DESC, l.id DESC`;
    db.query(sql, [userId], (err, results) => callback(err, results || []));
  },

  addProduct: function (productData, callback) {
    const sql = `
      INSERT INTO coach_listings
      (coach_id, listing_title, sport, description, price, image, discount_percentage, offer_message, duration_minutes, skill_level, session_location, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      productData.coach_id,
      productData.listing_title,
      productData.sport || null,
      productData.description || null,
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
      sql += " AND l.is_active = 1 AND u.coach_status = 'approved'";
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
    return callback(null);
  }
};
