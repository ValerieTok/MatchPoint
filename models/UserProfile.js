const db = require('../db');

const UserProfile = {
  getByUserId(userId, callback) {
    const sql = `
      SELECT user_id, first_name, last_name, phone_number, bio, photo
      FROM user_profiles
      WHERE user_id = ?
      LIMIT 1
    `;
    db.query(sql, [userId], (err, rows) => {
      if (err) return callback(err);
      return callback(null, rows && rows[0] ? rows[0] : null);
    });
  },

  upsertDetails(userId, details, callback) {
    const sql = `
      INSERT INTO user_profiles (user_id, first_name, last_name, phone_number, bio)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        first_name = VALUES(first_name),
        last_name = VALUES(last_name),
        phone_number = VALUES(phone_number),
        bio = VALUES(bio)
    `;
    const params = [
      userId,
      details.first_name || null,
      details.last_name || null,
      details.phone || null,
      details.bio || null
    ];
    db.query(sql, params, (err, result) => callback(err, result));
  },

  upsertPhoto(userId, fileName, callback) {
    const sql = `
      INSERT INTO user_profiles (user_id, photo)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE
        photo = VALUES(photo)
    `;
    db.query(sql, [userId, fileName || null], (err, result) => callback(err, result));
  }
};

module.exports = UserProfile;
