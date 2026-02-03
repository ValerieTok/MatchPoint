const db = require('../db');

const Booking = {
  createOrder(userId, items, address, callback) {
    if (!Array.isArray(items) || !items.length) {
      return callback(new Error('No items to order'));
    }

    const total = items.reduce((sum, item) => {
      const price = Number(item.price || 0);
      const qty = Number(item.quantity || 0);
      return sum + price * qty;
    }, 0);

    const orderSql = 'INSERT INTO bookings (user_id, session_location, total, status) VALUES (?, ?, ?, ?)';
    db.beginTransaction((txErr) => {
      if (txErr) return callback(txErr);
      db.query(orderSql, [userId, address || null, total, 'pending'], (orderErr, result) => {
        if (orderErr) {
          return db.rollback(() => callback(orderErr));
        }
        const orderId = result.insertId;
        const itemSql = `
          INSERT INTO booking_items (booking_id, listing_id, coach_id, listing_title, sport, price, listPrice, discountPercentage, offerMessage, image, duration_minutes, skill_level, session_location, session_date, session_time, quantity)
          VALUES ?
        `;
    const values = items.map((item) => {
      // Convert session_date to DATE format (YYYY-MM-DD) if it's a timestamp
      let sessionDate = item.session_date || null;
      if (sessionDate && typeof sessionDate === 'string' && sessionDate.includes('T')) {
        sessionDate = sessionDate.split('T')[0]; // Extract only the date part
      }
      
      return [
        orderId,
        item.listing_id,
        item.coach_id,
        item.listing_title,
        item.sport || null,
        Number(item.price || 0),
        Number(item.listPrice || item.price || 0),
        Number(item.discountPercentage || 0),
        item.offerMessage || null,
        item.image || null,
        Number(item.duration_minutes || 0),
        item.skill_level || null,
        item.session_location || null,
        sessionDate,
        item.session_time || null,
        Number(item.quantity || 0)
      ];
    });
        db.query(itemSql, [values], (itemsErr) => {
          if (itemsErr) {
            return db.rollback(() => callback(itemsErr));
          }
          db.commit((commitErr) => {
            if (commitErr) {
              return db.rollback(() => callback(commitErr));
            }
            return callback(null, { orderId, total });
          });
        });
      });
    });
  },

  getOrdersByUser(userId, callback) {
    const sql = `
      SELECT b.id, b.total, b.session_location, b.created_at, b.completed_at, b.status, u.username
      FROM bookings b
      JOIN users u ON u.id = b.user_id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC, b.id DESC
    `;
    db.query(sql, [userId], (err, rows) => callback(err, rows || []));
  },

  getUserDashboardStats(userId, callback) {
    const sql = `
      SELECT
        SUM(
          CASE
            WHEN bi.session_date IS NOT NULL
              AND TIMESTAMP(bi.session_date, IFNULL(bi.session_time, '00:00:00')) <= NOW()
            THEN 1 ELSE 0
          END
        ) AS completed_count,
        SUM(
          CASE
            WHEN bi.session_date IS NULL
              OR TIMESTAMP(bi.session_date, IFNULL(bi.session_time, '00:00:00')) > NOW()
            THEN 1 ELSE 0
          END
        ) AS upcoming_count
      FROM bookings b
      JOIN booking_items bi ON bi.booking_id = b.id
      WHERE b.user_id = ?
    `;
    db.query(sql, [userId], (err, rows) => {
      if (err) return callback(err);
      const row = rows && rows[0] ? rows[0] : {};
      return callback(null, {
        upcomingCount: Number(row.upcoming_count || 0),
        completedCount: Number(row.completed_count || 0)
      });
    });
  },

  getUserDashboardSessions(userId, callback) {
    const sql = `
      SELECT
        b.id,
        bi.id AS booking_item_id,
        bi.session_date,
        bi.session_time,
        bi.sport,
        bi.listing_title,
        bi.session_location,
        b.session_location AS booking_location,
        COALESCE(u.full_name, u.username) AS coach_name,
        u.email AS coach_email,
        u.contact AS coach_contact,
        b.completed_at,
        b.status AS booking_status,
        b.created_at,
        TIMESTAMP(bi.session_date, IFNULL(bi.session_time, '00:00:00')) AS session_at,
        CASE
          WHEN bi.session_date IS NOT NULL
            AND TIMESTAMP(bi.session_date, IFNULL(bi.session_time, '00:00:00')) <= NOW()
          THEN 1 ELSE 0
        END AS session_completed
      FROM bookings b
      JOIN booking_items bi ON bi.booking_id = b.id
      JOIN users u ON u.id = bi.coach_id
      WHERE b.user_id = ?
      ORDER BY
        CASE
          WHEN bi.session_date IS NOT NULL
            AND TIMESTAMP(bi.session_date, IFNULL(bi.session_time, '00:00:00')) > NOW()
          THEN 0 ELSE 1
        END,
        session_at DESC,
        b.created_at DESC,
        b.id DESC
    `;
    db.query(sql, [userId], (err, rows) => callback(err, rows || []));
  },

  getAllOrders(searchTerm, statusFilter, callback) {
    let sql = `
      SELECT DISTINCT b.id, b.total, b.session_location, b.created_at, b.completed_at, b.status,
             u.username, u.email AS user_email, u.contact AS user_contact
      FROM bookings b
      JOIN users u ON u.id = b.user_id
      JOIN booking_items bi ON bi.booking_id = b.id
      LEFT JOIN coach_listings l ON l.id = bi.listing_id
    `;
    const params = [];
    const conditions = [];
    if (searchTerm && searchTerm.trim()) {
      conditions.push('(u.username LIKE ? OR u.email LIKE ? OR bi.sport LIKE ? OR bi.listing_title LIKE ? OR l.description LIKE ?)');
      const term = `%${searchTerm.trim()}%`;
      params.push(term, term, term, term, term);
    }
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'completed') {
        conditions.push('b.completed_at IS NOT NULL');
      } else if (statusFilter === 'approved') {
        conditions.push("b.status = 'accepted' AND b.completed_at IS NULL");
      } else if (statusFilter === 'pending') {
        conditions.push("(b.status IS NULL OR b.status = '' OR b.status = 'pending') AND b.completed_at IS NULL");
      } else {
        conditions.push('b.status = ?');
        params.push(statusFilter);
      }
    }
    if (conditions.length) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ' ORDER BY b.created_at DESC, b.id DESC';
    db.query(sql, params, (err, rows) => callback(err, rows || []));
  },

  getBookingsByCoach(coachId, searchTerm, statusFilter, callback) {
    let sql = `
      SELECT DISTINCT b.id, b.total, b.session_location, b.created_at, b.completed_at, b.status,
             u.username, u.email AS user_email, u.contact AS user_contact
      FROM bookings b
      JOIN booking_items bi ON bi.booking_id = b.id
      JOIN users u ON u.id = b.user_id
      LEFT JOIN coach_listings l ON l.id = bi.listing_id
      WHERE bi.coach_id = ?
    `;
    const params = [coachId];
    const conditions = [];
    if (searchTerm && searchTerm.trim()) {
      conditions.push('(u.username LIKE ? OR u.email LIKE ? OR bi.sport LIKE ? OR bi.listing_title LIKE ? OR l.description LIKE ?)');
      const term = `%${searchTerm.trim()}%`;
      params.push(term, term, term, term, term);
    }
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'completed') {
        conditions.push('b.completed_at IS NOT NULL');
      } else if (statusFilter === 'approved') {
        conditions.push("b.status = 'accepted' AND b.completed_at IS NULL");
      } else if (statusFilter === 'pending') {
        conditions.push("(b.status IS NULL OR b.status = '' OR b.status = 'pending') AND b.completed_at IS NULL");
      } else {
        conditions.push('b.status = ?');
        params.push(statusFilter);
      }
    }
    if (conditions.length) {
      sql += ` AND ${conditions.join(' AND ')}`;
    }
    sql += ' ORDER BY b.created_at DESC, b.id DESC';
    db.query(sql, params, (err, rows) => callback(err, rows || []));
  },

  getOrderItems(orderId, coachId, callback) {
    const sql = `
        SELECT
          bi.id AS booking_item_id,
          bi.listing_id,
          bi.listing_title,
          bi.price,
          bi.quantity,
          COALESCE(bi.listPrice, bi.price) AS listPrice,
          COALESCE(bi.discountPercentage, 0) AS discountPercentage,
          bi.offerMessage,
          bi.image,
          bi.duration_minutes,
          bi.skill_level,
          bi.session_location,
          bi.session_date,
          bi.session_time,
          bi.coach_id,
          COALESCE(u.full_name, u.username) AS username,
          bi.sport
        FROM booking_items bi
        JOIN users u ON u.id = bi.coach_id
        WHERE bi.booking_id = ?
      `;
    const params = [orderId];
    let filteredSql = sql;
    if (coachId) {
      filteredSql += ' AND bi.coach_id = ?';
      params.push(coachId);
    }
    db.query(filteredSql, params, (err, rows) => callback(err, rows || []));
  },

  getOrderById(orderId, callback) {
    const sql = `
      SELECT id, user_id, total, session_location, created_at, completed_at, status
      FROM bookings
      WHERE id = ?
      LIMIT 1
    `;
    db.query(sql, [orderId], (err, rows) => callback(err, rows && rows[0] ? rows[0] : null));
  },

  markOrderDelivered(orderId, callback) {
    const sql = 'UPDATE bookings SET completed_at = CURRENT_TIMESTAMP WHERE id = ?';
    db.query(sql, [orderId], (err, result) => callback(err, result));
  },

  updateOrderStatus(orderId, status, callback) {
    const sql = 'UPDATE bookings SET status = ? WHERE id = ?';
    db.query(sql, [status, orderId], (err, result) => callback(err, result));
  },

  getReviewByOrderId(orderId, callback) {
    const sql = `
      SELECT id, booking_id, user_id, rating, comment, review_status, created_at
      FROM coach_reviews
      WHERE booking_id = ?
      LIMIT 1
    `;
    db.query(sql, [orderId], (err, rows) => callback(err, rows && rows[0] ? rows[0] : null));
  },

  deleteReviewByOrder(orderId, callback) {
    const sql = 'DELETE FROM coach_reviews WHERE booking_id = ?';
    db.query(sql, [orderId], (err, result) => callback(err, result));
  },

  getCoachReviews(coachId, callback) {
    const sql = `
      SELECT
        r.id,
        r.rating,
        r.comment,
        r.created_at,
        r.booking_id,
        u.username AS student_name,
        u.email AS student_email,
        u.contact AS student_contact,
        MIN(bi.listing_title) AS listing_title,
        MIN(bi.sport) AS sport,
        MIN(bi.session_date) AS session_date,
        MIN(bi.session_time) AS session_time
      FROM coach_reviews r
      JOIN users u ON u.id = r.user_id
      JOIN booking_items bi ON bi.booking_id = r.booking_id AND bi.coach_id = ?
      WHERE r.review_status = 'approved'
      GROUP BY r.id, r.rating, r.comment, r.created_at, r.booking_id, u.username, u.email, u.contact
      ORDER BY r.created_at DESC
    `;
    db.query(sql, [coachId], (err, rows) => callback(err, rows || []));
  },

  getRecentUserInbox(userId, limit, callback) {
    const capped = Number.isFinite(Number(limit)) ? Number(limit) : 3;
    const sql = `
      SELECT
        b.id,
        b.status,
        b.completed_at,
        b.created_at,
        MIN(u.username) AS coach_name
      FROM bookings b
      JOIN booking_items bi ON bi.booking_id = b.id
      JOIN users u ON u.id = bi.coach_id
      WHERE b.user_id = ?
        AND (b.status = 'accepted' OR b.status = 'rejected')
      GROUP BY b.id, b.status, b.completed_at, b.created_at
      ORDER BY b.created_at DESC
      LIMIT ?
    `;
    db.query(sql, [userId, capped], (err, rows) => callback(err, rows || []));
  },

  getRecentCoachInbox(coachId, limit, callback) {
    const capped = Number.isFinite(Number(limit)) ? Number(limit) : 3;
    const sql = `
      SELECT
        r.id AS review_id,
        r.booking_id,
        r.review_status,
        r.created_at,
        u.username AS student_name
      FROM coach_reviews r
      JOIN users u ON u.id = r.user_id
      JOIN booking_items bi ON bi.booking_id = r.booking_id AND bi.coach_id = ?
      WHERE r.review_status = 'pending'
      ORDER BY r.created_at DESC
      LIMIT ?
    `;
    db.query(sql, [coachId, capped], (err, rows) => callback(err, rows || []));
  },

  getCoachRevenue(coachId, callback) {
    const sql = `
      SELECT
        COALESCE(SUM(CASE WHEN b.completed_at IS NOT NULL THEN bi.price * bi.quantity ELSE 0 END), 0) AS totalEarned,
        COALESCE(SUM(CASE WHEN b.completed_at IS NULL THEN bi.price * bi.quantity ELSE 0 END), 0) AS totalPending
      FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
      WHERE bi.coach_id = ?
    `;
    db.query(sql, [coachId], (err, rows) => {
      if (err) return callback(err);
      const row = rows && rows[0] ? rows[0] : { totalEarned: 0, totalPending: 0 };
      return callback(null, {
        totalEarned: Number(row.totalEarned || 0),
        totalPending: Number(row.totalPending || 0)
      });
    });
  }

  ,getCoachMonthlyRevenue(coachId, callback) {
    const sql = `
      SELECT
        COALESCE(SUM(bi.price * bi.quantity), 0) AS monthEarned
      FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
      WHERE bi.coach_id = ?
        AND b.completed_at IS NOT NULL
        AND (
          (bi.session_date IS NOT NULL AND DATE(bi.session_date) BETWEEN DATE_FORMAT(NOW(), '%Y-%m-01') AND LAST_DAY(NOW()))
          OR (bi.session_date IS NULL AND DATE(b.completed_at) BETWEEN DATE_FORMAT(NOW(), '%Y-%m-01') AND LAST_DAY(NOW()))
        )
    `;
    db.query(sql, [coachId], (err, rows) => {
      if (err) return callback(err);
      const row = rows && rows[0] ? rows[0] : { monthEarned: 0 };
      return callback(null, { monthEarned: Number(row.monthEarned || 0) });
    });
  }
};

module.exports = Booking;
