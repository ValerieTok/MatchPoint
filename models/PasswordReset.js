const db = require('../db');

const PasswordResetModel = {
  getUserById(id, callback) {
    const sql = `
      SELECT id, username, email, password, contact, role
      FROM users
      WHERE id = ?
      LIMIT 1
    `;
    db.query(sql, [id], (err, rows) => callback(err, rows && rows[0] ? rows[0] : null));
  },

  getUserByEmail(email, callback) {
    const sql = `
      SELECT id, username, email, password, contact, role
      FROM users
      WHERE email = ?
      LIMIT 1
    `;
    db.query(sql, [email], (err, rows) => callback(err, rows && rows[0] ? rows[0] : null));
  },

  updatePassword(id, password, callback) {
    const sql = 'UPDATE users SET password = ? WHERE id = ?';
    db.query(sql, [password, id], (err, result) => callback(err, result));
  }
};

module.exports = PasswordResetModel;
