const db = require('../db');

module.exports = {
  getByUserId: function (userId, callback) {
    const sql = 'SELECT user_id, first_name, last_name, email, phone_number, bio, photo FROM user_profiles WHERE user_id = ? LIMIT 1';
    db.query(sql, [userId], (err, results) => {
      return callback(err, results && results[0] ? results[0] : null);
    });
  },

  upsert: function (userId, profileData, callback) {
    const sql = `
      INSERT INTO user_profiles (user_id, first_name, last_name, email, phone_number, bio, photo)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        first_name = VALUES(first_name),
        last_name = VALUES(last_name),
        email = VALUES(email),
        phone_number = VALUES(phone_number),
        bio = VALUES(bio),
        photo = VALUES(photo)
    `;
    const params = [
      userId,
      profileData.first_name || null,
      profileData.last_name || null,
      profileData.email || null,
      profileData.phone_number || null,
      profileData.bio || null,
      profileData.photo || null
    ];
    db.query(sql, params, (err, result) => callback(err, result));
  }
};
