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
      db.query(orderSql, [userId, address || null, total, 'accepted'], (orderErr, result) => {
        if (orderErr) {
          return db.rollback(() => callback(orderErr));
        }
        const orderId = result.insertId;
        const itemSql = `
          INSERT INTO booking_items (booking_id, listing_id, coach_id, listing_title, sport, price, listPrice, discountPercentage, offerMessage, image, duration_minutes, skill_level, session_location, session_date, session_time, slot_id, quantity)
          VALUES ?
        `;
    const values = items.map((item) => {
      // Convert session_date to DATE format (YYYY-MM-DD) without timezone shifts
      let sessionDate = item.session_date || null;
      if (sessionDate instanceof Date && !Number.isNaN(sessionDate.getTime())) {
        const year = sessionDate.getFullYear();
        const month = String(sessionDate.getMonth() + 1).padStart(2, '0');
        const day = String(sessionDate.getDate()).padStart(2, '0');
        sessionDate = `${year}-${month}-${day}`;
      } else if (sessionDate && typeof sessionDate === 'string') {
        const raw = sessionDate.trim();
        if (raw.includes('T')) {
          sessionDate = raw.split('T')[0];
        } else if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
          sessionDate = raw.slice(0, 10);
        }
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
        item.slot_id || null,
        Number(item.quantity || 0)
      ];
    });
        db.query(itemSql, [values], (itemsErr) => {
          if (itemsErr) {
            return db.rollback(() => callback(itemsErr));
          }
          const slotIds = items.map((item) => Number(item.slot_id)).filter((id) => Number.isFinite(id));
          const reserveNext = (index) => {
            if (index >= slotIds.length) {
              return db.commit((commitErr) => {
                if (commitErr) {
                  return db.rollback(() => callback(commitErr));
                }
                return callback(null, { orderId, total });
              });
            }
            const slotId = slotIds[index];
            const reserveSql = 'UPDATE coach_slots SET is_available = 0 WHERE id = ? AND is_available = 1';
            return db.query(reserveSql, [slotId], (reserveErr, reserveResult) => {
              if (reserveErr) {
                return db.rollback(() => callback(reserveErr));
              }
              if (!reserveResult || reserveResult.affectedRows === 0) {
                return db.rollback(() => callback(new Error('Selected slot is no longer available.')));
              }
              return reserveNext(index + 1);
            });
          };
          return reserveNext(0);
        });
      });
    });
  },

  getOrdersByUser(userId, callback) {
    const sql = `
      SELECT b.id, b.total, b.session_location, b.created_at, b.completed_at, b.status, b.user_completed_at, b.coach_completed_at, u.username
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
        COUNT(DISTINCT CASE WHEN b.completed_at IS NOT NULL THEN b.id END) AS completed_count,
        COUNT(DISTINCT CASE WHEN b.completed_at IS NULL THEN b.id END) AS upcoming_count
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
        b.user_completed_at,
        b.coach_completed_at,
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
      SELECT DISTINCT b.id, b.total, b.session_location, b.created_at, b.completed_at, b.status, b.user_completed_at, b.coach_completed_at,
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
      SELECT DISTINCT b.id, b.total, b.session_location, b.created_at, b.completed_at, b.status, b.user_completed_at, b.coach_completed_at,
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
          bi.slot_id,
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
      SELECT b.id, b.user_id, b.total, b.session_location, b.created_at, b.completed_at, b.status, b.user_completed_at, b.coach_completed_at,
             u.username, u.email AS user_email, u.contact AS user_contact
      FROM bookings b
      JOIN users u ON u.id = b.user_id
      WHERE b.id = ?
      LIMIT 1
    `;
    db.query(sql, [orderId], (err, rows) => callback(err, rows && rows[0] ? rows[0] : null));
  },

  markOrderDelivered(orderId, callback) {
    const updateSql = 'UPDATE bookings SET user_completed_at = CURRENT_TIMESTAMP WHERE id = ? AND user_completed_at IS NULL';
    db.query(updateSql, [orderId], (err) => {
      if (err) return callback(err);
      const checkSql = 'SELECT user_completed_at, coach_completed_at, completed_at FROM bookings WHERE id = ? LIMIT 1';
      db.query(checkSql, [orderId], (checkErr, rows) => {
        if (checkErr) return callback(checkErr);
        const row = rows && rows[0] ? rows[0] : {};
        if (row.user_completed_at && row.coach_completed_at && !row.completed_at) {
          const completeSql = 'UPDATE bookings SET completed_at = CURRENT_TIMESTAMP WHERE id = ? AND completed_at IS NULL';
          return db.query(completeSql, [orderId], (finishErr, result) => callback(finishErr, result));
        }
        return callback(null, { affectedRows: 0 });
      });
    });
  },

  markOrderCompletedByCoach(orderId, callback) {
    const updateSql = 'UPDATE bookings SET coach_completed_at = CURRENT_TIMESTAMP WHERE id = ? AND coach_completed_at IS NULL';
    db.query(updateSql, [orderId], (err) => {
      if (err) return callback(err);
      const checkSql = 'SELECT user_completed_at, coach_completed_at, completed_at FROM bookings WHERE id = ? LIMIT 1';
      db.query(checkSql, [orderId], (checkErr, rows) => {
        if (checkErr) return callback(checkErr);
        const row = rows && rows[0] ? rows[0] : {};
        if (row.user_completed_at && row.coach_completed_at && !row.completed_at) {
          const completeSql = 'UPDATE bookings SET completed_at = CURRENT_TIMESTAMP WHERE id = ? AND completed_at IS NULL';
          return db.query(completeSql, [orderId], (finishErr, result) => callback(finishErr, result));
        }
        return callback(null, { affectedRows: 0 });
      });
    });
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
        AND b.completed_at IS NOT NULL
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

  getRecentCoachBookings(coachId, limit, callback) {
    const capped = Number.isFinite(Number(limit)) ? Number(limit) : 3;
    const sql = `
      SELECT
        b.id,
        b.status,
        b.completed_at,
        b.created_at,
        MIN(u.username) AS student_name,
        MIN(bi.listing_title) AS listing_title
      FROM bookings b
      JOIN booking_items bi ON bi.booking_id = b.id
      JOIN users u ON u.id = b.user_id
      WHERE bi.coach_id = ?
      GROUP BY b.id, b.status, b.completed_at, b.created_at
      ORDER BY b.created_at DESC
      LIMIT ?
    `;
    db.query(sql, [coachId, capped], (err, rows) => callback(err, rows || []));
  },

  getCoachRevenue(coachId, callback) {
    const sql = `
      SELECT
        COALESCE(SUM(CASE WHEN b.user_completed_at IS NOT NULL AND b.coach_completed_at IS NOT NULL THEN bi.price * bi.quantity ELSE 0 END), 0) AS totalEarnedGross,
        COALESCE(SUM(CASE WHEN b.user_completed_at IS NOT NULL AND b.coach_completed_at IS NOT NULL THEN bi.price * bi.quantity * 0.9 ELSE 0 END), 0) AS totalEarned,
        COALESCE(SUM(CASE WHEN b.user_completed_at IS NULL OR b.coach_completed_at IS NULL THEN bi.price * bi.quantity ELSE 0 END), 0) AS totalPendingGross,
        COALESCE(SUM(CASE WHEN b.user_completed_at IS NULL OR b.coach_completed_at IS NULL THEN bi.price * bi.quantity * 0.9 ELSE 0 END), 0) AS totalPending
      FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
      WHERE bi.coach_id = ?
    `;
    db.query(sql, [coachId], (err, rows) => {
      if (err) return callback(err);
      const row = rows && rows[0] ? rows[0] : {
        totalEarnedGross: 0,
        totalEarned: 0,
        totalPendingGross: 0,
        totalPending: 0
      };
      return callback(null, {
        totalEarnedGross: Number(row.totalEarnedGross || 0),
        totalEarned: Number(row.totalEarned || 0),
        totalPendingGross: Number(row.totalPendingGross || 0),
        totalPending: Number(row.totalPending || 0)
      });
    });
  }

  ,getCoachMonthlyRevenue(coachId, callback) {
    const sql = `
      SELECT
        COALESCE(SUM(bi.price * bi.quantity * 0.9), 0) AS monthEarned
      FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
      WHERE bi.coach_id = ?
        AND b.user_completed_at IS NOT NULL
        AND b.coach_completed_at IS NOT NULL
        AND (
          (bi.session_date IS NOT NULL AND DATE(bi.session_date) BETWEEN DATE_FORMAT(NOW(), '%Y-%m-01') AND LAST_DAY(NOW()))
          OR (bi.session_date IS NULL AND DATE(COALESCE(b.completed_at, b.coach_completed_at, b.user_completed_at)) BETWEEN DATE_FORMAT(NOW(), '%Y-%m-01') AND LAST_DAY(NOW()))
        )
    `;
    db.query(sql, [coachId], (err, rows) => {
      if (err) return callback(err);
      const row = rows && rows[0] ? rows[0] : { monthEarned: 0 };
      return callback(null, { monthEarned: Number(row.monthEarned || 0) });
    });
  }

  ,getCoachEarningsHistory(coachId, limit, filters, callback) {
    const capped = Number.isFinite(Number(limit)) ? Number(limit) : 10;
    const resolved = filters || {};
    const params = [coachId];
    const conditions = [
      'b.user_completed_at IS NOT NULL',
      'b.coach_completed_at IS NOT NULL'
    ];
    if (resolved.startDate) {
      conditions.push('DATE(bi.session_date) >= ?');
      params.push(resolved.startDate);
    }
    if (resolved.endDate) {
      conditions.push('DATE(bi.session_date) <= ?');
      params.push(resolved.endDate);
    }
    if (resolved.bookingId) {
      conditions.push('b.id = ?');
      params.push(resolved.bookingId);
    }
    if (resolved.sport) {
      conditions.push('(LOWER(bi.sport) LIKE ? OR LOWER(bi.listing_title) LIKE ?)');
      const term = `%${String(resolved.sport).toLowerCase()}%`;
      params.push(term, term);
    }
    const where = conditions.length ? `WHERE bi.coach_id = ? AND ${conditions.join(' AND ')}` : 'WHERE bi.coach_id = ?';
    const sql = `
      SELECT
        b.id AS booking_id,
        bi.session_date,
        bi.session_time,
        bi.listing_title,
        bi.sport,
        bi.price,
        bi.quantity,
        (bi.price * bi.quantity * 0.9) AS net_amount,
        u.username AS student_name,
        COALESCE(b.completed_at, b.coach_completed_at, b.user_completed_at) AS completed_at
      FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
      JOIN users u ON u.id = b.user_id
      ${where}
      ORDER BY completed_at DESC, b.id DESC
      LIMIT ?
    `;
    params.push(capped);
    db.query(sql, params, (err, rows) => callback(err, rows || []));
  }
};

module.exports = Booking;
