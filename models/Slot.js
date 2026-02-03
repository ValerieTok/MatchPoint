const db = require('../db');

module.exports = {
  async getSlotsByCoach(coachId) {
    return new Promise((resolve, reject) => {
      const sql = coachId
        ? 'SELECT id, coach_id, slot_date, slot_time, duration_minutes, location, note, is_available, created_at FROM coach_slots WHERE coach_id = ? ORDER BY slot_date, slot_time'
        : 'SELECT id, coach_id, slot_date, slot_time, duration_minutes, location, note, is_available, created_at FROM coach_slots ORDER BY slot_date, slot_time';
      const params = coachId ? [coachId] : [];
      db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });
  },

  async createSlot(data) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO coach_slots (coach_id, slot_date, slot_time, duration_minutes, location, note, is_available) VALUES (?, ?, ?, ?, ?, ?, 1)`;
      const params = [
        data.coach_id,
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
      const sql = coachId ? 'DELETE FROM coach_slots WHERE id = ? AND coach_id = ?' : 'DELETE FROM coach_slots WHERE id = ?';
      const params = coachId ? [id, coachId] : [id];
      db.query(sql, params, (err, result) => (err ? reject(err) : resolve(result)));
    });
  }
};
