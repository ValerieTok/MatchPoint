const db = require('../db');

const PasswordResetModel = {
  getUserByEmail(email, callback) {
    const sql = `
      SELECT id, username, email, password, address, contact, role
      FROM users
      WHERE email = ?
      LIMIT 1
    `;
    db.query(sql, [email], (err, rows) => callback(err, rows && rows[0] ? rows[0] : null));
  },

  updatePassword(id, password, callback) {
    const sql = 'UPDATE users SET password = SHA1(?) WHERE id = ?';
    db.query(sql, [password, id], (err, result) => callback(err, result));
  }
};

module.exports = PasswordResetModel;
