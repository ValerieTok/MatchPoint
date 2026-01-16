const db = require('../db');

const Feedback = {
  create(userId, feedbackData, callback) {
    const sql = `
      INSERT INTO coach_reviews (user_id, booking_id, rating, comment, review_status, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
    `;
    const params = [
      userId,
      feedbackData.booking_id || null,
      feedbackData.rating || null,
      feedbackData.message || null,
      'pending'
    ];
    db.query(sql, params, (err, result) => {
      if (err) {
        console.error('Feedback insert error:', err);
        return callback(err);
      }
      return callback(null, result);
    });
  },

  getByUserId(userId, callback) {
    const sql = `
      SELECT id, user_id, rating, comment, review_status, created_at
      FROM coach_reviews
      WHERE user_id = ?
      ORDER BY created_at DESC
    `;
    db.query(sql, [userId], (err, rows) => callback(err, rows || []));
  },

  getAll(callback) {
    const sql = `
      SELECT cr.id, cr.user_id, cr.rating, cr.comment, cr.review_status, cr.created_at, u.email, u.full_name
      FROM coach_reviews cr
      LEFT JOIN users u ON cr.user_id = u.id
      ORDER BY cr.created_at DESC
    `;
    db.query(sql, (err, rows) => callback(err, rows || []));
  }
};

module.exports = Feedback;
