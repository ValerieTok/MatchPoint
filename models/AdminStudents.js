const db = require('../db');

const AdminStudents = {
  getStats(callback) {
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'user') AS total_students,
        (
          SELECT COUNT(*)
          FROM booking_items bi
          JOIN bookings b ON b.id = bi.booking_id
          WHERE b.completed_at IS NOT NULL
        ) AS completed_sessions
    `;
    db.query(sql, (err, rows) => {
      if (err) return callback(err);
      const row = rows && rows[0] ? rows[0] : {};
      return callback(null, {
        totalStudents: Number(row.total_students || 0),
        completedSessions: Number(row.completed_sessions || 0)
      });
    });
  },

  getStudents(options, callback) {
    const resolved = options || {};
    const limit = Number.isFinite(Number(resolved.limit)) ? Number(resolved.limit) : 8;
    const offset = Number.isFinite(Number(resolved.offset)) ? Number(resolved.offset) : 0;
    const sortOrder = resolved.sort === 'oldest' ? 'ASC' : 'DESC';
    const params = [];
    let where = `WHERE u.role = 'user'`;

    if (resolved.search) {
      where += ' AND LOWER(u.username) LIKE ?';
      params.push(`%${String(resolved.search).toLowerCase()}%`);
    }

    const countSql = `
      SELECT COUNT(*) AS count
      FROM users u
      ${where}
    `;

    const dataSql = `
      SELECT
        u.id,
        u.username,
        u.created_at,
        (
          SELECT COUNT(*)
          FROM bookings b
          WHERE b.user_id = u.id
        ) AS sessions,
        (
          SELECT MAX(b.created_at)
          FROM bookings b
          WHERE b.user_id = u.id
        ) AS last_booking
      FROM users u
      ${where}
      ORDER BY u.created_at ${sortOrder}, u.id ${sortOrder}
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
  }
};

module.exports = AdminStudents;
