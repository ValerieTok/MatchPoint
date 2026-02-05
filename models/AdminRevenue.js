const db = require('../db');

const AdminRevenue = {
  getTotals(callback) {
    const sql = `
      SELECT
        COALESCE(SUM(CASE WHEN b.user_completed_at IS NOT NULL AND b.coach_completed_at IS NOT NULL THEN bi.price * bi.quantity ELSE 0 END), 0) AS gross_revenue,
        COALESCE(SUM(CASE WHEN b.user_completed_at IS NOT NULL AND b.coach_completed_at IS NOT NULL THEN bi.price * bi.quantity * 0.1 ELSE 0 END), 0) AS admin_revenue,
        COALESCE(SUM(CASE WHEN b.user_completed_at IS NOT NULL AND b.coach_completed_at IS NOT NULL THEN bi.price * bi.quantity * 0.9 ELSE 0 END), 0) AS coach_revenue
      FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
    `;
    db.query(sql, (err, rows) => {
      if (err) return callback(err);
      const row = rows && rows[0] ? rows[0] : {};
      return callback(null, {
        grossRevenue: Number(row.gross_revenue || 0),
        adminRevenue: Number(row.admin_revenue || 0),
        coachRevenue: Number(row.coach_revenue || 0)
      });
    });
  },

  getMonthlyTotals(monthKey, callback) {
    const raw = String(monthKey || '').trim();
    if (!/^\d{4}-\d{2}$/.test(raw)) {
      return callback(new Error('Invalid month format'));
    }
    const [year, month] = raw.split('-').map((part) => Number(part));
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(year, month, 0);
    const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

    const sql = `
      SELECT
        COALESCE(SUM(bi.price * bi.quantity), 0) AS gross_revenue,
        COALESCE(SUM(bi.price * bi.quantity * 0.1), 0) AS admin_revenue,
        COALESCE(SUM(bi.price * bi.quantity * 0.9), 0) AS coach_revenue
      FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
      WHERE b.user_completed_at IS NOT NULL
        AND b.coach_completed_at IS NOT NULL
        AND (
          (bi.session_date IS NOT NULL AND DATE(bi.session_date) BETWEEN ? AND ?)
          OR (bi.session_date IS NULL AND DATE(COALESCE(b.completed_at, b.coach_completed_at, b.user_completed_at)) BETWEEN ? AND ?)
        )
    `;
    db.query(sql, [start, endDate, start, endDate], (err, rows) => {
      if (err) return callback(err);
      const row = rows && rows[0] ? rows[0] : {};
      return callback(null, {
        grossRevenue: Number(row.gross_revenue || 0),
        adminRevenue: Number(row.admin_revenue || 0),
        coachRevenue: Number(row.coach_revenue || 0)
      });
    });
  },

  getMonthlyRevenueSeries(monthKey, callback) {
    const raw = String(monthKey || '').trim();
    const hasMonth = /^\d{4}-\d{2}$/.test(raw);
    const now = new Date();
    const year = hasMonth ? Number(raw.slice(0, 4)) : now.getFullYear();
    const month = hasMonth ? Number(raw.slice(5, 7)) : now.getMonth() + 1;
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(year, month, 0);
    const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

    const sql = `
      SELECT
        DATE(COALESCE(bi.session_date, b.completed_at, b.coach_completed_at, b.user_completed_at)) AS period,
        COALESCE(SUM(bi.price * bi.quantity), 0) AS gross_amount
      FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
      WHERE b.user_completed_at IS NOT NULL
        AND b.coach_completed_at IS NOT NULL
        AND DATE(COALESCE(bi.session_date, b.completed_at, b.coach_completed_at, b.user_completed_at)) BETWEEN ? AND ?
      GROUP BY period
      ORDER BY period ASC
    `;
    db.query(sql, [start, endDate], (err, rows) => callback(err, rows || []));
  },

  getRecentMonthlyRevenueSeries(monthKey, callback) {
    const raw = String(monthKey || '').trim();
    const hasMonth = /^\d{4}-\d{2}$/.test(raw);
    const now = new Date();
    const year = hasMonth ? Number(raw.slice(0, 4)) : now.getFullYear();
    const month = hasMonth ? Number(raw.slice(5, 7)) : now.getMonth() + 1;
    const end = new Date(year, month, 0);
    const start = new Date(year, month - 5, 1);
    const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;
    const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

    const sql = `
      SELECT
        DATE_FORMAT(DATE(COALESCE(bi.session_date, b.completed_at, b.coach_completed_at, b.user_completed_at)), '%Y-%m') AS period,
        COALESCE(SUM(bi.price * bi.quantity), 0) AS gross_amount
      FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
      WHERE b.user_completed_at IS NOT NULL
        AND b.coach_completed_at IS NOT NULL
        AND DATE(COALESCE(bi.session_date, b.completed_at, b.coach_completed_at, b.user_completed_at)) BETWEEN ? AND ?
      GROUP BY period
      ORDER BY period ASC
    `;
    db.query(sql, [startDate, endDate], (err, rows) => callback(err, rows || []));
  },

  getRevenueBySport(monthKey, callback) {
    const raw = String(monthKey || '').trim();
    const hasMonth = /^\d{4}-\d{2}$/.test(raw);
    const now = new Date();
    const year = hasMonth ? Number(raw.slice(0, 4)) : now.getFullYear();
    const month = hasMonth ? Number(raw.slice(5, 7)) : now.getMonth() + 1;
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(year, month, 0);
    const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

    const sql = `
      SELECT
        COALESCE(NULLIF(TRIM(bi.sport), ''), bi.listing_title, 'Unknown') AS sport_label,
        COALESCE(SUM(bi.price * bi.quantity), 0) AS gross_amount
      FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
      WHERE b.user_completed_at IS NOT NULL
        AND b.coach_completed_at IS NOT NULL
        AND DATE(COALESCE(bi.session_date, b.completed_at, b.coach_completed_at, b.user_completed_at)) BETWEEN ? AND ?
      GROUP BY sport_label
      ORDER BY gross_amount DESC
      LIMIT 10
    `;
    db.query(sql, [start, endDate], (err, rows) => callback(err, rows || []));
  },

  getRevenueByCoach(monthKey, callback) {
    const raw = String(monthKey || '').trim();
    const hasMonth = /^\d{4}-\d{2}$/.test(raw);
    const now = new Date();
    const year = hasMonth ? Number(raw.slice(0, 4)) : now.getFullYear();
    const month = hasMonth ? Number(raw.slice(5, 7)) : now.getMonth() + 1;
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(year, month, 0);
    const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

    const sql = `
      SELECT
        coach.username AS coach_label,
        COALESCE(SUM(bi.price * bi.quantity), 0) AS gross_amount
      FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
      JOIN users coach ON coach.id = bi.coach_id
      WHERE b.user_completed_at IS NOT NULL
        AND b.coach_completed_at IS NOT NULL
        AND (
          (bi.session_date IS NOT NULL AND DATE(bi.session_date) BETWEEN ? AND ?)
          OR (bi.session_date IS NULL AND DATE(COALESCE(b.completed_at, b.coach_completed_at, b.user_completed_at)) BETWEEN ? AND ?)
        )
      GROUP BY coach_label
      ORDER BY gross_amount DESC
      LIMIT 10
    `;
    db.query(sql, [start, endDate, start, endDate], (err, rows) => callback(err, rows || []));
  },

  getMonthlyReport(monthKey, callback) {
    const raw = String(monthKey || '').trim();
    if (!/^\d{4}-\d{2}$/.test(raw)) {
      return callback(new Error('Invalid month format'));
    }
    const [year, month] = raw.split('-').map((part) => Number(part));
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(year, month, 0);
    const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

    const sql = `
      SELECT
        b.id AS booking_id,
        bi.session_date,
        bi.session_time,
        bi.listing_title,
        bi.sport,
        bi.price,
        bi.quantity,
        (bi.price * bi.quantity) AS gross_amount,
        (bi.price * bi.quantity * 0.1) AS admin_amount,
        (bi.price * bi.quantity * 0.9) AS coach_amount,
        coach.username AS coach_name,
        student.username AS student_name,
        COALESCE(b.completed_at, b.coach_completed_at, b.user_completed_at) AS completed_at
      FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
      JOIN users coach ON coach.id = bi.coach_id
      JOIN users student ON student.id = b.user_id
      WHERE b.user_completed_at IS NOT NULL
        AND b.coach_completed_at IS NOT NULL
        AND (
          (bi.session_date IS NOT NULL AND DATE(bi.session_date) BETWEEN ? AND ?)
          OR (bi.session_date IS NULL AND DATE(COALESCE(b.completed_at, b.coach_completed_at, b.user_completed_at)) BETWEEN ? AND ?)
        )
      ORDER BY completed_at DESC, b.id DESC
    `;
    db.query(sql, [start, endDate, start, endDate], (err, rows) => callback(err, rows || []));
  }
};

module.exports = AdminRevenue;
