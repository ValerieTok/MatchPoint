const db = require('../db');

module.exports = {
  async getSlotsByCoach(coachId) {
    return new Promise((resolve, reject) => {
      const sql = coachId
        ? `
          SELECT cs.id, cs.coach_id, cs.listing_id, cs.slot_date, cs.slot_time, cs.duration_minutes,
                 cs.location, cs.note, cs.is_available, cs.created_at,
                 l.listing_title
          FROM coach_slots cs
          LEFT JOIN coach_listings l ON l.id = cs.listing_id
          WHERE cs.coach_id = ?
          ORDER BY cs.slot_date, cs.slot_time
        `
        : `
          SELECT cs.id, cs.coach_id, cs.listing_id, cs.slot_date, cs.slot_time, cs.duration_minutes,
                 cs.location, cs.note, cs.is_available, cs.created_at,
                 l.listing_title
          FROM coach_slots cs
          LEFT JOIN coach_listings l ON l.id = cs.listing_id
          ORDER BY cs.slot_date, cs.slot_time
        `;
      const params = coachId ? [coachId] : [];
      db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });
  },

  async getAvailableSlotsByCoach(coachId) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, coach_id, listing_id, slot_date, slot_time, duration_minutes, location, note
        FROM coach_slots
        WHERE coach_id = ?
          AND is_available = 1
          AND slot_date >= CURDATE()
        ORDER BY slot_date, slot_time
      `;
      db.query(sql, [coachId], (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });
  },

  async getAvailableSlotsByListing(listingId) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, coach_id, listing_id, slot_date, slot_time, duration_minutes, location, note, is_available
        FROM coach_slots
        WHERE listing_id = ?
          AND is_available = 1
          AND slot_date >= CURDATE()
        ORDER BY slot_date, slot_time
      `;
      db.query(sql, [listingId], (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });
  },

  async getAvailableListingIds(listingIds) {
    return new Promise((resolve, reject) => {
      const hasFilter = Array.isArray(listingIds) && listingIds.length;
      const placeholders = hasFilter ? listingIds.map(() => '?').join(',') : '';
      const sql = hasFilter
        ? `
          SELECT DISTINCT listing_id
          FROM coach_slots
          WHERE is_available = 1
            AND slot_date >= CURDATE()
            AND listing_id IN (${placeholders})
        `
        : `
          SELECT DISTINCT listing_id
          FROM coach_slots
          WHERE is_available = 1
            AND slot_date >= CURDATE()
        `;
      const params = hasFilter ? listingIds : [];
      db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });
  },

  async getAvailableSlotsByListingAll(listingId) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, coach_id, listing_id, slot_date, slot_time, duration_minutes, location, note, is_available
        FROM coach_slots
        WHERE listing_id = ?
          AND is_available = 1
        ORDER BY slot_date, slot_time
      `;
      db.query(sql, [listingId], (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });
  },

  async getSlotsByListing(listingId) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, coach_id, listing_id, slot_date, slot_time, duration_minutes, location, note, is_available
        FROM coach_slots
        WHERE listing_id = ?
        ORDER BY slot_date, slot_time
      `;
      db.query(sql, [listingId], (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });
  },

  async getSlotById(slotId) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, coach_id, listing_id, slot_date, slot_time, duration_minutes, location, note, is_available
        FROM coach_slots
        WHERE id = ?
        LIMIT 1
      `;
      db.query(sql, [slotId], (err, rows) => (err ? reject(err) : resolve(rows && rows[0] ? rows[0] : null)));
    });
  },

  async reserveSlot(slotId, coachId) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE coach_slots
        SET is_available = 0
        WHERE id = ?
          AND coach_id = ?
          AND is_available = 1
      `;
      db.query(sql, [slotId, coachId], (err, result) => {
        if (err) return reject(err);
        return resolve(result && result.affectedRows > 0);
      });
    });
  },

  async createSlot(data) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO coach_slots (coach_id, listing_id, slot_date, slot_time, duration_minutes, location, note, is_available) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`;
      const params = [
        data.coach_id,
        data.listing_id || null,
        data.slot_date,
        data.slot_time,
        data.duration_minutes || null,
        data.location || null,
        data.note || null
      ];
      db.query(sql, params, (err, result) => (err ? reject(err) : resolve(result)));
    });
  },

  async deleteSlot(id, coachId) {
    return new Promise((resolve, reject) => {
      const sql = coachId
        ? 'DELETE FROM coach_slots WHERE id = ? AND coach_id = ?'
        : 'DELETE FROM coach_slots WHERE id = ?';
      const params = coachId ? [id, coachId] : [id];
      db.query(sql, params, (err, result) => (err ? reject(err) : resolve(result)));
    });
  },

  async getSlotsByCoachAndDate(coachId, slotDate) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, coach_id, listing_id, slot_date, slot_time, duration_minutes, is_available
        FROM coach_slots
        WHERE coach_id = ?
          AND slot_date = ?
        ORDER BY slot_time
      `;
      db.query(sql, [coachId, slotDate], (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });
  }
};
