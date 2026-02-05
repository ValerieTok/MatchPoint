const db = require('../db');

const baseActivitySql = `
  SELECT u.username AS user, 'Booked session' AS action, b.created_at AS event_time, 0 AS is_important, NULL AS detail
  FROM bookings b
  JOIN users u ON u.id = b.user_id

  UNION ALL

  SELECT u.username AS user, 'Session completed' AS action, b.completed_at AS event_time, 0 AS is_important, NULL AS detail
  FROM bookings b
  JOIN users u ON u.id = b.user_id
  WHERE b.completed_at IS NOT NULL

  UNION ALL

  SELECT u.username AS user, 'Left a coach review' AS action, r.created_at AS event_time, 0 AS is_important, NULL AS detail
  FROM coach_reviews r
  JOIN users u ON u.id = r.user_id

  UNION ALL

  SELECT u.username AS user, 'New listing posted' AS action, l.created_at AS event_time, 0 AS is_important, NULL AS detail
  FROM coach_listings l
  JOIN users u ON u.id = l.coach_id

  UNION ALL

  SELECT u.username AS user,
         CONCAT('AML Alert - ', a.alert_type) AS action,
         a.created_at AS event_time,
         1 AS is_important,
         CONCAT('$', a.amount, ' ', a.currency) AS detail
  FROM aml_alerts a
  JOIN users u ON u.id = a.user_id
`;

const buildActivityWhere = (filters) => {
  const resolved = filters || {};
  let where = ' WHERE event_time IS NOT NULL';
  const params = [];
  if (resolved.action) {
    where += ' AND action = ?';
    params.push(resolved.action);
  }
  if (resolved.search) {
    where += ' AND user LIKE ?';
    params.push(`%${resolved.search}%`);
  }
  return { where, params };
};

const AdminDashboard = {
  getStats(callback) {
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'user') AS total_students,
        (SELECT COUNT(*) FROM users WHERE role = 'coach') AS total_coaches,
        (SELECT COALESCE(SUM(total), 0) FROM bookings) AS total_revenue
    `;
    db.query(sql, (err, rows) => {
      if (err) return callback(err);
      const row = rows && rows[0] ? rows[0] : {};
      return callback(null, {
        totalStudents: Number(row.total_students || 0),
        totalCoaches: Number(row.total_coaches || 0),
        totalRevenue: Number(row.total_revenue || 0)
      });
    });
  },

  getActivity(options, callback) {
    const resolved = options || {};
    const limit = Number.isFinite(Number(resolved.limit)) ? Number(resolved.limit) : 5;
    const offset = Number.isFinite(Number(resolved.offset)) ? Number(resolved.offset) : 0;
    const sortOrder = resolved.sort === 'oldest' ? 'ASC' : 'DESC';
    const { where, params } = buildActivityWhere({
      action: resolved.action,
      search: resolved.search
    });

    const countSql = `
      SELECT COUNT(*) AS count
      FROM (${baseActivitySql}) activity
      ${where}
    `;

    const dataSql = `
      SELECT user, action, event_time, is_important, detail
      FROM (${baseActivitySql}) activity
      ${where}
      ORDER BY event_time ${sortOrder}
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

  getActionOptions(callback) {
    const sql = `
      SELECT DISTINCT action
      FROM (${baseActivitySql}) activity
      WHERE event_time IS NOT NULL
      ORDER BY action ASC
    `;
    db.query(sql, (err, rows) => {
      if (err) return callback(err);
      const actions = (rows || []).map((row) => row.action).filter(Boolean);
      return callback(null, actions);
    });
  }
};

module.exports = AdminDashboard;
