const db = require('../db');

const AdminServices = {
  getStats(callback) {
    const sql = `
      SELECT COUNT(*) AS total_services
      FROM coach_listings
    `;
    db.query(sql, (err, rows) => {
      if (err) return callback(err);
      const row = rows && rows[0] ? rows[0] : {};
      return callback(null, {
        totalServices: Number(row.total_services || 0)
      });
    });
  },

  getServices(options, callback) {
    const resolved = options || {};
    const limit = Number.isFinite(Number(resolved.limit)) ? Number(resolved.limit) : 8;
    const offset = Number.isFinite(Number(resolved.offset)) ? Number(resolved.offset) : 0;
    const sortOrder = resolved.sort === 'oldest' ? 'ASC' : 'DESC';
    const params = [];
    let where = 'WHERE 1=1';

    if (resolved.search) {
      where += ' AND (LOWER(listing_title) LIKE ? OR LOWER(sport) LIKE ?)';
      const term = `%${String(resolved.search).toLowerCase()}%`;
      params.push(term, term);
    }

    const countSql = `
      SELECT COUNT(*) AS count
      FROM coach_listings
      ${where}
    `;

    const dataSql = `
      SELECT
        l.id,
        l.listing_title,
        l.sport,
        l.duration_minutes,
        l.price,
        l.is_active,
        l.created_at,
        COALESCE(SUM(CASE WHEN cs.id IS NOT NULL THEN 1 ELSE 0 END), 0) AS available_slots
      FROM coach_listings l
      LEFT JOIN coach_slots cs
        ON cs.listing_id = l.id
        AND cs.is_available = 1
        AND cs.slot_date >= CURDATE()
      ${where}
      GROUP BY l.id, l.listing_title, l.sport, l.duration_minutes, l.price, l.is_active, l.created_at
      ORDER BY l.created_at ${sortOrder}, l.id ${sortOrder}
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

  setServiceActive(id, isActive, callback) {
    const sql = 'UPDATE coach_listings SET is_active = ? WHERE id = ?';
    db.query(sql, [isActive ? 1 : 0, id], (err, result) => callback(err, result));
  }
};

module.exports = AdminServices;
