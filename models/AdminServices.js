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
        id,
        listing_title,
        sport,
        duration_minutes,
        price,
        is_active,
        created_at
      FROM coach_listings
      ${where}
      ORDER BY created_at ${sortOrder}, id ${sortOrder}
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
