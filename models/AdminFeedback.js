const db = require('../db');

const AdminFeedback = {
  getStats(callback) {
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'user') AS total_students,
        (SELECT COUNT(*) FROM users WHERE role = 'coach') AS total_coaches
    `;
    db.query(sql, (err, rows) => {
      if (err) return callback(err);
      const row = rows && rows[0] ? rows[0] : {};
      return callback(null, {
        totalStudents: Number(row.total_students || 0),
        totalCoaches: Number(row.total_coaches || 0)
      });
    });
  },

  getFeedback(options, callback) {
    const resolved = options || {};
    const limit = Number.isFinite(Number(resolved.limit)) ? Number(resolved.limit) : 6;
    const offset = Number.isFinite(Number(resolved.offset)) ? Number(resolved.offset) : 0;
    const sort = resolved.sort || 'newest';
    const params = [];
    let where = 'WHERE 1=1';

    if (resolved.search) {
      where += ' AND (LOWER(student.username) LIKE ? OR LOWER(coach.username) LIKE ? OR LOWER(bi.listing_title) LIKE ?)';
      const term = `%${String(resolved.search).toLowerCase()}%`;
      params.push(term, term, term);
    }

    if (resolved.status) {
      where += ' AND COALESCE(r.review_status, \'pending\') = ?';
      params.push(resolved.status);
    }

    const orderBy = (() => {
      if (sort === 'highest') return 'r.rating DESC, r.created_at DESC';
      if (sort === 'lowest') return 'r.rating ASC, r.created_at DESC';
      if (sort === 'oldest') return 'r.created_at ASC';
      return 'r.created_at DESC';
    })();

    const countSql = `
      SELECT COUNT(DISTINCT r.id) AS count
      FROM coach_reviews r
      JOIN users student ON student.id = r.user_id
      JOIN booking_items bi ON bi.booking_id = r.booking_id
      JOIN users coach ON coach.id = bi.coach_id
      ${where}
    `;

    const dataSql = `
      SELECT
        r.id,
        r.rating,
        r.comment,
        r.created_at,
        COALESCE(r.review_status, 'pending') AS review_status,
        student.username AS student_name,
        MIN(coach.username) AS coach_name,
        MIN(bi.listing_title) AS listing_title,
        MIN(bi.sport) AS sport
      FROM coach_reviews r
      JOIN users student ON student.id = r.user_id
      JOIN booking_items bi ON bi.booking_id = r.booking_id
      JOIN users coach ON coach.id = bi.coach_id
      ${where}
      GROUP BY r.id, r.rating, r.comment, r.created_at, COALESCE(r.review_status, 'pending'), student.username
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;

    db.query(countSql, params, (countErr, countRows) => {
      if (countErr) return callback(countErr);
      const total = countRows && countRows[0] ? Number(countRows[0].count || 0) : 0;
      db.query(dataSql, [...params, limit, offset], (dataErr, rows) => {
        if (dataErr) return callback(dataErr);
        return callback(null, { rows: rows || [], total });
      });
    });
  },

  updateStatus(id, status, callback) {
    const sql = 'UPDATE coach_reviews SET review_status = ? WHERE id = ?';
    db.query(sql, [status, id], (err, result) => callback(err, result));
  }
};

module.exports = AdminFeedback;
